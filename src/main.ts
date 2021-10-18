/*
 * Created with @iobroker/create-adapter v1.33.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import {
    BLEDiscovery,
    IPDiscovery,
    HapServiceBle,
    HapServiceIp,
    PairingData,
    HttpClient,
    GattClient,
    PairMethods,
    GattUtils
} from 'hap-controller';
import Debug from 'debug';
import { Accessories } from 'hap-controller/lib/model/accessory';
import * as Characteristic from 'hap-controller/lib/model/characteristic';
import PQueue from 'p-queue';
import * as ObjectDefaults from './lib/objectDefaults';
import * as ObjectMapper from './lib/objectMapper';
import { serviceFromUuid } from 'hap-controller/lib/model/service';
import { categoryFromId } from 'hap-controller/lib/model/category';
import * as IPConstants from 'hap-controller/lib/transport/ip/http-constants';
import Converters from './lib/converter';

type HapDeviceIp = {
    serviceType: 'IP';
    connected: boolean;
    initInProgress: boolean;
    id: string;
    service?: HapServiceIp;
    pairingData?: PairingData | null;
    client?: HttpClient;
    clientQueue?: PQueue;
    dataPollingInterval?: NodeJS.Timeout;
    dataPollingCharacteristics?: string[];
    subscriptionCharacteristics?: string[];
    stateIdMap?: Map<string, string>;
};

type PollingCharacteristicObject = {
    characteristicUuid: string;
    serviceUuid: string;
    iid: number;
    aid: number;
    format?: string;
};

type HapDeviceBle = {
    serviceType: 'BLE';
    connected: boolean;
    initInProgress: boolean;
    id: string;
    service?: HapServiceBle;
    pairingData?: PairingData;
    client?: GattClient;
    clientQueue?: PQueue;
    dataPollingInterval?: NodeJS.Timeout;
    dataPollingCharacteristics?: PollingCharacteristicObject[];
    subscriptionCharacteristics?: {
        characteristicUuid: string;
        serviceUuid: string;
        iid: number;
        format?: string;
    }[];
    stateIdMap?: Map<string, string>;
};

export type HapDevice =
    | HapDeviceIp
    | HapDeviceBle;

const ignoredHapServices = [
    'public.hap.service.pairing',
    'public.hap.service.protocol.information.service'
];

type StateFunctions = {
    converter?: {
        read: (value: ioBroker.StateValue) => ioBroker.StateValue,
        write?: (value: ioBroker.StateValue) => ioBroker.StateValue,
    },
    stateChangeFunction?: (value: ioBroker.StateValue) => Promise<void>
};

type SetCharacteristicResponse = {
    characteristics: [
        {
            aid: number;
            iid: number;
            value?: unknown;
            status?: number;
        }
    ]
}

class HomekitController extends utils.Adapter {

    private devices = new Map<string, HapDevice>();

    private discoveryIp: IPDiscovery | null = null;
    private discoveryBle: BLEDiscovery | null = null;

    private isConnected: boolean | null = null;

    private stateFunctionsForId = new Map<string, StateFunctions>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'homekit-controller',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    setConnected(isConnected: boolean): void {
        if (this.isConnected !== isConnected) {
            this.isConnected = isConnected;
            this.setState('info.connection', this.isConnected, true);
        }
    }

    setDeviceConnected(device: HapDevice, isConnected: boolean): void {
        if (device.connected !== isConnected) {
            device.connected = isConnected;
            this.setState(`${device.id}.info.connected`, isConnected, true);

            let globalConnected = true;
            for (const id in Array.from(this.devices.keys())) {
                const hapDevice: HapDevice = this.devices.get(id)!;
                if (!hapDevice || !hapDevice.pairingData) continue;
                globalConnected = globalConnected && hapDevice.connected;
            }
            this.setConnected(globalConnected);
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        Debug.enable('hap-controller:*');
        Debug.log = this.log.debug.bind(this);

        if (this.config.discoverBle && this.config.dataPollingIntervalBle < 60) {
            this.log.info(`Data polling interval for BLE devices is less then 60s, set to 60s`);
            this.config.dataPollingIntervalBle = 60;
        }

        this.setConnected(false);

        if (this.config.discoverIp) {
            this.discoveryIp = new IPDiscovery();

            this.discoveryIp.on('serviceUp', (service) => {
                this.log.debug(`Discovered IP device up: ${service.id}/${service.name}`);
                this.handleDeviceDiscovery('IP', service);
            });
            this.discoveryIp.on('serviceDown', (service) => {
                this.log.debug(`Discovered IP device down: ${service.id}/${service.name}`);
            });
            this.discoveryIp.on('serviceChanged', (service) => {
                this.log.debug(`Discovered IP device changed: ${service.id}/${service.name}`);
                this.handleDeviceDiscovery('IP', service);
            });
            this.discoveryIp.start();
        }

        if (this.config.discoverBle) {
            this.discoveryBle = new BLEDiscovery();

            this.discoveryBle.on('serviceUp', (service) => {
                this.log.debug(`Discovered BLE device up: ${service.id}/${service.name}`);
                this.handleDeviceDiscovery('BLE', service);
            });
            this.discoveryBle.on('serviceChanged', (service) => {
                this.log.debug(`Discovered BLE device changed: ${service.id}/${service.name}`);
                this.handleDeviceDiscovery('BLE', service);
            });
            this.discoveryBle.start();
        }

        this.subscribeStates('*');

        try {
            const devices = await this.getKnownDevices();
            if (devices && devices.length) {
                this.log.debug('Init ' + devices.length + ' known devices without discovery ...');
                for (const device of devices) {
                    if (device && device._id && device.native) {
                        const hapDevice: HapDevice = {
                            serviceType: device.native.serviceType,
                            id: device.native.id,
                            connected: false,
                            service: device.native.lastService || undefined,
                            pairingData: device.native.pairingData,
                            initInProgress: false,
                        }
                        await this.initDevice(hapDevice);
                    }
                }
            }
        } catch (err) {
            this.log.error(`Could not initialize existing devices: ${err.message}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private async onUnload(callback: () => void): Promise<void> {
        try {

            if (this.discoveryBle) {
                this.discoveryBle.stop();
            }
            if (this.discoveryIp) {
                this.discoveryIp.stop();
            }

            for (const id in Array.from(this.devices.keys())) {
                const hapDevice: HapDevice = this.devices.get(id)!;
                if (!hapDevice || !hapDevice.connected) continue;

                if (hapDevice.serviceType === 'IP') {
                    try {
                        await hapDevice.clientQueue?.add(async () => await hapDevice.client?.unsubscribeCharacteristics());
                    } catch {
                        // ignore
                    }
                }
            }
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            if (!state.ack) {
                let value = state.val;
                const stateFunctions = this.stateFunctionsForId.get(id);
                if (stateFunctions) {
                    if (!stateFunctions.stateChangeFunction) {
                        this.log.debug(`state ${id} changed but not writeable - ignore`);
                        return;
                    }
                    if (stateFunctions.converter?.write) {
                        value = stateFunctions.converter.write(value);
                    }
                    stateFunctions.stateChangeFunction(value);
                }
            }
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (typeof obj === 'object' && obj.command) {
            this.log.debug(`Message ${obj.command} received: ${JSON.stringify(obj)})`);
            let response: Record<string, any> = {
                success: true,
                error: false
            };
            try {
                switch (obj.command) {
                    case 'getDiscoveredDevices':
                        response.devices = [];
                        for (const id of Array.from(this.devices.keys())) {
                            const hapDevice: HapDevice = this.devices.get(id)!;
                            if (hapDevice) {
                                response.devices.push({
                                    id: hapDevice.id,
                                    serviceType: hapDevice.serviceType,
                                    connected: hapDevice.connected,
                                    discovered: !!hapDevice.service,
                                    availableToPair: hapDevice.service?.availableToPair,
                                    discoveredName: hapDevice.service?.name,
                                    discoveredCategory: hapDevice.service?.ci ? categoryFromId(hapDevice.service?.ci) : 'Unknown',
                                    pairedWithThisInstance: !!hapDevice.pairingData,
                                });
                            } else {
                                this.log.debug(`getDiscoveredDevices: ${id} not found`);
                            }
                        }
                        break;
                    case 'pairDevice':
                        if (typeof obj.message === 'string') return;
                        const pairingDevice = this.devices.get(obj.message.deviceId);
                        if (!pairingDevice) {
                            throw new Error(`Pair: Device with ID ${obj.message.deviceId} not existing.`);
                        }
                        await this.pairDevice(pairingDevice, obj.message.pin);
                        break;
                    case 'unpairDevice':
                        if (typeof obj.message === 'string') return;
                        const unpairingDevice = this.devices.get(obj.message.deviceId);
                        if (!unpairingDevice) {
                            throw new Error(`Unpair: Device with ID ${obj.message.deviceId} not existing.`);
                        }
                        await this.unpairDevice(unpairingDevice);
                        break;
                    case 'identify':
                        if (typeof obj.message === 'string') return;
                        const identifyingDevice = this.devices.get(obj.message.deviceId);
                        if (!identifyingDevice) {
                            throw new Error(`Identify: Device with ID ${obj.message.deviceId} not existing.`);
                        }
                        await this.identifyDevice(identifyingDevice);
                        break;
                }
            } catch (err) {
                response = {
                    success: false,
                    error: err.message
                }
            }
            this.log.debug(`Response to Command ${obj.command}: ${JSON.stringify(response)}`);
            // Send response in callback if required
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, response, obj.callback);
            }
        }
    }

    async getKnownDevices(): Promise<ioBroker.Object[]> {
        const objs = await this.getObjectViewAsync('system', 'folder', {
            startkey: this.namespace + '.',
            endkey: this.namespace + '.\u9999'
        });
        const namespaceLength = this.namespace.length;
        const res: ioBroker.Object[] = [];
        objs.rows.forEach(entry => {
            const obj = entry.value;
            if (!obj || !obj._id) return;
            const id = obj._id.substr(namespaceLength + 1);
            if (id.includes('.')) return; // only folders on first tree position are considered
            res.push(obj);
        })
        return res;
    }

    private async handleDeviceDiscovery(serviceType: 'IP', service: HapServiceIp): Promise<void>;
    private async handleDeviceDiscovery(serviceType: 'BLE', service: HapServiceBle): Promise<void>;

    private async handleDeviceDiscovery(serviceType: 'IP' | 'BLE', service: HapServiceIp | HapServiceBle): Promise<void> {
        const id = `${serviceType}-${service.id}`.toUpperCase();
        const hapDevice = this.devices.get(id) || {
            serviceType,
            id,
            connected: false,
            service,
            initInProgress: false,
        } as HapDevice;
        if (this.devices.has(id) && hapDevice.connected) { // if service was existing before already
            if (serviceType === 'IP') {
                if (
                    hapDevice.service &&
                    hapDevice.service['c#'] === service['c#']
                ) {
                    this.log.debug(`${id} Discovery device update, unchanged config-number, ignore`);
                    return;
                }
            } else if (serviceType === 'BLE') {
                if (
                    hapDevice.service &&
                    hapDevice.service['c#'] === service['c#'] &&
                    (hapDevice.service as HapServiceBle).GSN === (service as HapServiceBle).GSN
                ) {
                    this.log.debug(`${id} Discovery device update, unchanged config-/GSN-number, ignore`);
                    return;
                }

                if (
                    hapDevice.service &&
                    hapDevice.service['c#'] === service['c#'] &&
                    (hapDevice.service as HapServiceBle).GSN !== (service as HapServiceBle).GSN
                ) {
                    this.log.debug(`${id} GSN updated for BLE device, update data in 500ms`);
                    this.scheduleCharacteristicsUpdate(hapDevice, 0.5);
                    return;
                }
            }
            this.log.debug(`${id} Device Discovery Update - reinitialize device`);
        } else {
            this.log.debug(`${id} Discovered ${serviceType} device: ${JSON.stringify(service, (key, value) => {
                return key === 'peripheral' ? undefined : value;
            })}`);
        }
        hapDevice.service = service;
        await this.initDevice(hapDevice);
    }

    async initDevice(device: HapDevice): Promise<void> {
        if (device.initInProgress) {
            this.log.debug(`${device.id} Device initialization already in progress ... ignore call`);
            return;
        }
        device.initInProgress = true;

        this.devices.set(device.id, device);

        if (device.connected && device.client) {
            this.log.debug(`${device.id} Re-Init requested ...`);
            if (device.serviceType === 'IP') {
                try {
                    await device.clientQueue?.add(async () => await device.client?.unsubscribeCharacteristics());
                } catch {
                    // ignore
                }
                device.client.removeAllListeners('event');
                device.client.removeAllListeners('event-disconnect');
            }
            if (device.dataPollingInterval) {
                clearTimeout(device.dataPollingInterval);
                delete device.dataPollingInterval;
            }
            delete device.client;
        } else {
            if (!device.pairingData) {
                if (device.service && !device.service!.availableToPair) {
                    this.log.info(`${device.id} (${device.service.name}) found without known pairing data and already paired: ignoring`);
                } else {
                    this.log.info(`${device.id} (${device.service?.name}) found without pairing data but available for pairing: Create basic objects`);
                    const objs = await this.buildBasicUnpairedDeviceObjects(device);
                    await this.createObjects(device, objs);
                }
                device.initInProgress = false;
                return;
            }
        }

        if (!this.initDeviceClient(device)) {
            device.initInProgress = false;
            return;
        }

        const baseObjects = await this.buildBasicPairedDeviceObjects(device);

        try {
            const deviceData = await device.clientQueue?.add(async () => await device.client?.getAccessories());

            if (!deviceData) {
                this.log.info(`${device.id} Could not load device accessories ... TODO`);
                device.initInProgress = false;
                // TODO ERROR HANDLING
                return;
            }

            this.log.debug(`Accessory Structure: ${JSON.stringify(deviceData)}`);

            const accessoryObjects = this.buildPairedDeviceAccessoryObjects(device, deviceData);
            await this.createObjects(device, new Map([...baseObjects, ...accessoryObjects]));

            this.setDeviceConnected(device, true);

            this.initSupportingMaps(device, accessoryObjects);

            await this.initSubscriptions(device)

            this.scheduleCharacteristicsUpdate(device);
        } catch (err) {
            this.log.info(`${device.id} Could not initialize device: ${err.message} ${err.stack}`);
        }
        device.initInProgress = false;
    }

    private initDeviceClient(device: HapDevice): boolean {
        if (device.serviceType === 'IP') {
            const service = device.service as HapServiceIp;
            this.log.debug(`${device.id} Start Homekit Device Client initialization on ${service.address}:${service!.port}`);

            device.client = device.client as HttpClient || new HttpClient(service.id, service.address, service.port, device.pairingData || undefined);
            device.clientQueue = new PQueue({concurrency: 10, timeout: 120000, throwOnTimeout: true});
        } else {
            const service = device.service as HapServiceBle;
            if (!service.peripheral) {
                if (!this.config.discoverBle) {
                    this.log.warn(`${device.id} Can not initialize BLE device because BLE discovery is turned off!`);
                } else {
                    this.log.debug(`${device.id} Waiting for BLE discovery of this device for proper initialization`)
                }
                return false;
            }

            this.log.debug(`${device.id} Start Homekit Device Client initialization`);

            device.client = device.client || new GattClient(service.id, service.peripheral, device.pairingData)
            device.clientQueue = new PQueue({concurrency: 1, timeout: 120000, throwOnTimeout: true});
        }
        return true;
    }

    private initSupportingMaps(device: HapDevice, accessoryObjects: Map<string, ioBroker.Object>): void {
        // Initialize internal data structures for later usage
        device.stateIdMap = new Map();
        device.dataPollingCharacteristics = [];
        device.subscriptionCharacteristics = [];
        for (const [objId, obj] of accessoryObjects) {
            if (obj && obj.native && obj.native.aid && obj.native.iid && obj.type === 'state') {
                const id = `${obj.native.aid}.${obj.native.iid}`;
                device.stateIdMap.set(id, objId);

                if (device.serviceType === 'IP') {
                    if (!objId.includes('.accessory-information.') && obj.native.perms && obj.native.perms.includes('pr')) {
                        device.dataPollingCharacteristics.push(id);
                    }
                    if (obj.native.perms && obj.native.perms.includes('ev')) {
                        device.subscriptionCharacteristics.push(id);
                    }
                } else {
                    const charData = {
                        characteristicUuid: obj.native.type,
                        serviceUuid: obj.native.serviceUuid,
                        iid: obj.native.iid,
                        aid: obj.native.aid,
                        format: obj.native.format
                    }
                    if (!objId.includes('.accessory-information.') && obj.native.perms && obj.native.perms.includes('pr')) {
                        device.dataPollingCharacteristics.push(charData);
                    }
                    /*
                        No Subscribed characteristics for BLE devices
                        if (obj.native.perms && obj.native.perms.includes('ev')) {
                            device.subscriptionCharacteristics.push(id);
                        }
                     */
                }
            }
        }
        this.log.debug(`Device ${device.id} collected polling IDs: ${JSON.stringify(device.dataPollingCharacteristics)}`);
        this.log.debug(`Device ${device.id} collected subscription IDs: ${JSON.stringify(device.subscriptionCharacteristics)}`);
    }

    private async initSubscriptions(device: HapDevice): Promise<void> {
        if (
            !device.subscriptionCharacteristics!.length ||
            !device.client ||
            device.serviceType === 'BLE'
        ) {
            this.log.debug(`Device ${device.id} Subscriptions not initialized`);
            return;
        }

        device.client.on('event', event => {
            if (event.characteristics && Array.isArray(event.characteristics)) {
                this.log.debug(`${device.id} IP device subscription event received: ${JSON.stringify(event)}`);
                this.setCharacteristicValues(device, event);
            } else {
                this.log.debug(`${device.id} Unknown IP device subscription event received: ${JSON.stringify(event)}`);
            }
        });

        device.client.on('event-disconnect', async (formerSubscribes: string[]) => {
            this.log.debug(`${device.id} Subscription Event connection disconnected, try to resubscribe`);
            try {
                await device.clientQueue?.add(async () => await (device.client as HttpClient).subscribeCharacteristics(formerSubscribes));
            } catch (err) {
                this.log.info(`${device.id} Resubscribe not successful, reinitialize device`);
                await this.initDevice(device);
            }
        });

        try {
            await device.clientQueue?.add(async () => await device.client?.subscribeCharacteristics(device.subscriptionCharacteristics!));
        } catch (err) {
            this.log.info(`Device ${device.id} subscribing for updates failed: ${err.message}`);
        }
    }

    private scheduleCharacteristicsUpdate(device: HapDevice, delay?: number, aid?: number): void {
        if (device.dataPollingInterval) {
            clearTimeout(device.dataPollingInterval);
            delete device.dataPollingInterval;
        }
        if (delay === undefined) {
            delay = device.serviceType === 'IP' ? this.config.dataPollingIntervalIp : this.config.dataPollingIntervalBle;
        }
        device.dataPollingInterval = setTimeout(async () => {
            let requestedCharacteristics = device.dataPollingCharacteristics;
            if (requestedCharacteristics) {
                this.log.debug(`Device ${device.id} Scheduled Characteristic update started ...`);
                if (aid) {
                    if (device.serviceType === 'IP') {
                        requestedCharacteristics = (requestedCharacteristics as string[]).filter(el => el.startsWith(`${aid}.`));
                    } else {
                        requestedCharacteristics = (requestedCharacteristics as PollingCharacteristicObject[]).filter(el => el.aid === aid);
                    }
                }
                try {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    const data = await device.clientQueue.add(async () => await device.client?.getCharacteristics(requestedCharacteristics));
                    if (data) {
                        this.setCharacteristicValues(device, data);
                    }
                } catch (err) {
                    this.log.info(`Device ${device.id} data polling failed: ${err.message}`);
                }
            }
            this.scheduleCharacteristicsUpdate(device);
        }, delay * 1000)
    }

    private setCharacteristicValues(device: HapDevice, values: { characteristics: Characteristic.CharacteristicObject[] }): void {
        values.characteristics.forEach((characteristic) => {
            const id = `${characteristic.aid}.${characteristic.iid}`;

            const stateId = device.stateIdMap?.get(id);
            if (stateId) {
                let value: ioBroker.StateValue = characteristic.value as ioBroker.StateValue;
                const stateFunc = this.stateFunctionsForId.get(`${this.namespace}.${stateId}`);
                if (stateFunc?.converter?.read) {
                    value = stateFunc.converter.read(value);
                }
                this.setState(stateId, value, true);
            } else {
                this.log.debug(`${device.id} No stateId found in map for ${JSON.stringify(characteristic)}`);
            }
        })
    }

    private buildBasicDeviceObjects(device: HapDevice): Map<string, ioBroker.Object> {
        const objs = new Map();

        let lastService: Record<string, unknown> | undefined;
        if (device.service) {
            lastService = {};
            for (const key of Object.keys(device.service)) {
                if (key !== 'peripheral') {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    lastService[key] = device.service[key];
                }
            }
        }

        const hapNative = {
            serviceType: device.serviceType,
            id: device.id,
            pairingData: device.pairingData,
            lastService
        };

        this.log.debug(`Service: ${JSON.stringify(device.service,  (key, value) => {
            return key === 'peripheral' ? undefined : value;
        })}`);

        objs.set(device.id, ObjectDefaults.getFolderObject(`HAP ${device.service?.name} (${device.id})`, undefined, hapNative));

        objs.set(`${device.id}.info`, ObjectDefaults.getChannelObject('Information'));
        objs.set(`${device.id}.info.connectionType`, ObjectDefaults.getStateObject('string', 'Connection type', device.serviceType, {def: device.serviceType, write: false}));
        objs.set(`${device.id}.info.id`, ObjectDefaults.getStateObject('string', 'HAP ID', device.service?.id, {write: false}));
        if (device.serviceType === 'IP') {
            objs.set(`${device.id}.info.address`, ObjectDefaults.getStateObject('string', 'IP Address', device.service?.address, { write: false }));
        }
        objs.set(`${device.id}.info.connected`, ObjectDefaults.getStateObject('indicator', 'Connected',  device.connected,{write: false}));

        objs.set(`${device.id}.admin`, ObjectDefaults.getChannelObject('Administration'));
        objs.set(`${device.id}.admin.isPaired`, ObjectDefaults.getStateObject('indicator', 'Paired with this Instance?', !!device.pairingData));

        return objs;
    }

    private buildBasicUnpairedDeviceObjects(device: HapDevice): Map<string, ioBroker.Object> {
        const objs = this.buildBasicDeviceObjects(device);

        const pairId = `${device.id}.admin.pairWithPin`;
        objs.set(pairId, ObjectDefaults.getStateObject('string', 'Set Pin to Pair', undefined, {def: ''}));
        this.stateFunctionsForId.set(`${this.namespace}.${pairId}`, {
            stateChangeFunction: async (value) => {
                if (! value) {
                    return;
                }
                try {
                    await this.pairDevice(device, value.toString());
                } catch (err) {
                    this.log.info(err.message);
                }
            }
        });

        const identifyId = `${device.id}.admin.identify`;
        objs.set(identifyId, ObjectDefaults.getStateObject('button', 'Trigger to Identify Device', undefined, {def: false}));
        this.stateFunctionsForId.set(`${this.namespace}.${identifyId}`, {
            stateChangeFunction: async (value) => {
                if (value !== true) {
                    return;
                }
                try {
                    await this.identifyDevice(device);
                } catch (err) {
                    this.log.info(err.message);
                }
            }
        });
        return objs;
    }

    private async buildBasicPairedDeviceObjects(device: HapDevice): Promise<Map<string, ioBroker.Object>> {
        const objs = this.buildBasicDeviceObjects(device);

        const unpairId = `${device.id}.admin.unpair`;
        objs.set(unpairId, ObjectDefaults.getStateObject('button', 'Unpair', false, {def: false}, {execute: 'unpair'}));
        this.stateFunctionsForId.set(`${this.namespace}.${unpairId}`, {
            stateChangeFunction: async (value) => {
                if (value !== true) {
                    return;
                }

                try {
                    await this.unpairDevice(device);
                } catch (err) {
                    this.log.info(err.message);
                }
            }
        });
        await this.delObjectAsync(`${device.id}.admin.pairWithPin`);
        await this.delObjectAsync(`${device.id}.admin.identify`);

        return objs;
    }

    private buildPairedDeviceAccessoryObjects(device: HapDevice, deviceData: Accessories): Map<string, ioBroker.Object> {
        const objs = new Map();

        deviceData.accessories.forEach((accessory) => {

            accessory.services.forEach((service) => {
                const serviceType = serviceFromUuid(service.type);
                if (ignoredHapServices.includes(serviceType)) {
                    return;
                }

                service.characteristics.forEach((characteristic) => {
                    ObjectMapper.addCharacteristicObjects(device, objs, accessory, service, characteristic);
                });
            });
        });

        return objs;
    }

    private async createObjects(device: HapDevice, objs: Map<string, ioBroker.Object>): Promise<void> {
        for (const [objId, obj] of objs) {
            const stateId = `${this.namespace}.${objId}`;
            if (obj.type === 'state' && !this.stateFunctionsForId.get(stateId)) {
                const stateFuncs: StateFunctions = {};
                if (objId.endsWith('accessory-information.identify')) {
                    continue;
                }
                if (obj.common.write) {
                    const convertLogic = obj.native.convertLogic as keyof typeof Converters;
                    if (Converters[convertLogic]) {
                        stateFuncs.converter = Converters[convertLogic];
                    }
                    if (obj.common.write) {

                        stateFuncs.stateChangeFunction = async (value: ioBroker.StateValue): Promise<void> => {
                            if (device.serviceType === 'IP') {
                                const hapId = `${obj.native.aid}.${obj.native.iid}`;
                                this.log.debug(`Device ${device.id}: Set Characteristic ${hapId} to ${JSON.stringify(value)}`);
                                try {
                                    const data: Record<string, any> = {};
                                    data[hapId] = value;
                                    const res = (await device.clientQueue?.add(async () => await (device as HapDeviceIp).client?.setCharacteristics(data))) as SetCharacteristicResponse
                                    if (
                                        res.characteristics &&
                                        Array.isArray(res.characteristics) &&
                                        res.characteristics[0] &&
                                        res.characteristics[0].status
                                    ) {
                                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                        // @ts-ignore
                                        this.log.info(`State update for ${objId} (${hapId}) failed with status ${res.characteristics[0].status}: ${IPConstants.HapStatusCodes[res.characteristics[0].status]}`);
                                        this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                                    } else {
                                        if (!device.subscriptionCharacteristics?.includes(hapId)) {
                                            this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                                        }
                                    }
                                } catch (err) {
                                    this.log.info(`Device ${device.id}: State update for ${objId} (${hapId}) failed with error ${err.statusCode} ${err.message}`);
                                    this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                                }
                            } else {
                                const hapData = {
                                    characteristicUuid: obj.native.type,
                                    serviceUuid: obj.native.serviceUuid,
                                    iid: obj.native.iid,
                                    value: GattUtils.valueToBuffer(value, obj.native.format)
                                };
                                this.log.debug(`Device ${device.id}: Set Characteristic ${JSON.stringify(hapData)}`);
                                try {
                                    await device.clientQueue?.add(async () => await (device as HapDeviceBle).client?.setCharacteristics([hapData]));
                                } catch (err) {
                                    this.log.info(`State update for ${objId} (${JSON.stringify(hapData)}) failed with error ${err.statusCode} ${err.message}`);
                                }
                                this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                            }
                        };
                    } else if (stateFuncs.converter?.write) {
                        delete stateFuncs.converter.write;
                    }
                }
                if (stateFuncs.converter || stateFuncs.stateChangeFunction) {
                    this.stateFunctionsForId.set(stateId, stateFuncs);
                }
            }
            let valueToSet;
            if (obj.native.value !== undefined) {
                valueToSet = obj.native.value;
                delete obj.native.value;
            }
            await this.extendObjectAsync(objId, obj);
            if (valueToSet !== undefined) {
                const stateFunc = this.stateFunctionsForId.get(stateId);
                if (stateFunc?.converter?.read) {
                    valueToSet = stateFunc.converter.read(valueToSet);
                }
                await this.setStateAsync(objId, valueToSet, true);
            }
        }
    }

    private async pairDevice(device: HapDevice, pin: string): Promise<void> {
        if (!device.service) {
            throw new Error(`Cannot pair with device ${device.id} because not yet discovered`);
        }

        let pairMethod;
        if (device.serviceType === 'IP') {
            if (this.discoveryIp) {
                try {
                    pairMethod = await this.discoveryIp.getPairMethod(device.service);
                } catch (err) {
                    throw new Error(`Cannot retrieve IP PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}`);
                }
            }
        } else {
            if (this.discoveryBle) {
                try {
                    pairMethod = await this.discoveryBle.getPairMethod(device.service);
                } catch (err) {
                    throw new Error(`Cannot retrieve BLE PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}`);
                }
            }
        }

        if (pairMethod === undefined) {
            this.log.info(`Could not retrieve PairMethod for device ${device.id}, try default`);
            pairMethod = PairMethods.PairSetup;
        }

        if (!this.initDeviceClient(device) || !device.client) {
            throw new Error(`Cannot pair with device ${device.id} because Client initialization not successful`)
        }

        try {
            await device.client.pairSetup(pin.toString(), pairMethod);
        } catch (err) {
            throw new Error(`Cannot pair with device ${device.id} because of error ${err.statusCode}: ${err.message}`);
        }

        const pairingData = device.client.getLongTermData();
        if (!pairingData) {
            throw new Error(`No pairing data retrieved after pair for device ${device.id}. Aborting.`);
        }
        device.pairingData = pairingData;
        await this.initDevice(device);
    }

    private async unpairDevice(device: HapDevice): Promise<void> {
        if (!device.pairingData) {
            throw new Error(`Cannot unpair from device ${device.id} because no pairing data existing`);
        }
        if (!device.client) {
            throw new Error(`Cannot unpair from device ${device.id} because no client instance existing`);
        }

        if (device.dataPollingInterval) {
            clearTimeout(device.dataPollingInterval);
            delete device.dataPollingInterval;
        }

        try {
            if (device.serviceType === 'IP') {
                await device.clientQueue?.add(async () => await device.client?.unsubscribeCharacteristics());
            }
            await device.clientQueue?.add(async () => device.pairingData?.iOSDevicePairingID && await device.client?.removePairing(device.pairingData.iOSDevicePairingID));
            this.log.info(`Unpairing from device ${device.id} successfully completed ...`);
        } catch (err) {
            throw new Error(`Cannot unpair from device ${device.id} because of error ${err.statusCode}: ${err.message}`);
        }

        device.pairingData = null;
        device.client.removeAllListeners('event');
        device.client.removeAllListeners('event-disconnect');
        delete device.client;

        await this.delObjectAsync(device.id, {recursive: true});

        await this.initDevice(device);
    }

    private async identifyDevice(device: HapDevice): Promise<void> {
        if (!device.service) {
            throw new Error(`Cannot identify device ${device.id} because not yet discovered`);
        }

        this.log.debug(`Device ${device.id}: Identify triggered`);
        try {
            let client;
            if (device.serviceType === 'IP') {
                client = new HttpClient(device.service.id, device.service.address, device.service.port);
            } else {
                client = new GattClient(device.service.id, device.service.peripheral);
            }
            await client.identify();
        } catch (err) {
            throw new Error(`Cannot identify device ${device.id} because of error ${err.statusCode}: ${err.message}`);
        }
    }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HomekitController(options);
} else {
    // otherwise start the instance directly
    (() => new HomekitController())();
}
