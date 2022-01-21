/*
 * Created with @iobroker/create-adapter v1.33.0
 */

import * as utils from '@iobroker/adapter-core';
import * as fs from 'fs';
import * as path from 'path';
import IPDiscovery from 'hap-controller/lib/transport/ip/ip-discovery';
import { HapServiceIp } from 'hap-controller/lib/transport/ip/ip-discovery';
import { PairingData, PairMethods } from 'hap-controller/lib/protocol/pairing-protocol';
import HttpClient from 'hap-controller/lib/transport/ip/http-client';

import * as GattUtils from 'hap-controller/lib/transport/ble/gatt-utils';
import type { HapServiceBle } from 'hap-controller/lib/transport/ble/ble-discovery'
import type BLEDiscovery from 'hap-controller/lib/transport/ble/ble-discovery'
import type GattClient from 'hap-controller/lib/transport/ble/gatt-client'
let BLEDiscoveryConstructor: typeof BLEDiscovery | undefined;
let GattClientConstructor: typeof GattClient | undefined;

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

interface HapDeviceBase {
    connected: boolean;
    initInProgress: boolean;
    id: string;
    pairingData?: PairingData;
    clientQueue?: PQueue;
    dataPollingInterval?: NodeJS.Timeout;
    stateIdMap?: Map<string, string>;
}

interface SubscriptionCharacteristic {
    characteristicUuid: string;
    serviceUuid: string;
    iid: number;
    format?: string;
}

interface PollingCharacteristic extends SubscriptionCharacteristic {
    aid: number;
}

interface HapDeviceIp extends HapDeviceBase {
    serviceType: 'IP';
    service?: HapServiceIp;
    client?: HttpClient;
    dataPollingCharacteristics?: string[];
    subscriptionCharacteristics?: string[];
}

interface HapDeviceBle extends HapDeviceBase {
    serviceType: 'BLE';
    service?: HapServiceBle;
    client?: GattClient;
    dataPollingCharacteristics?: PollingCharacteristic[];
    subscriptionCharacteristics?: SubscriptionCharacteristic[];
}

export type HapDevice =
    | HapDeviceIp
    | HapDeviceBle;

const ignoredHapServices = [
    'public.hap.service.pairing',
    'public.hap.service.protocol.information.service',
];

interface StateFunctions {
    converter?: {
        read: (value: ioBroker.StateValue) => ioBroker.StateValue,
        write?: (value: ioBroker.StateValue) => ioBroker.StateValue,
    },
    stateChangeFunction?: (value: ioBroker.StateValue) => Promise<void>
}

interface SetCharacteristicResponse {
    characteristics: [
        {
            aid: number;
            iid: number;
            value?: unknown;
            // HapStatusCodes should be an enum and this should be of type HapStatusCodes
            status: number;
        }
    ]
}

const pairingErrorMessages = {
    1: 'Unknown Error',
    2: 'Setup code or signature verification failed.',
    3: 'Retry later',
    4: 'Device cannot accept any more pairings.',
    5: 'Device reached its maximum number of authentication attempts.',
    6: 'Pairing method is unavailable.',
    7: 'Device is busy and cannot accept a pairing request at this time. Retry later.',
}

function isSetCharacteristicErrorResponse(value: any): value is SetCharacteristicResponse {
    return value &&
    value.characteristics &&
    Array.isArray(value.characteristics) &&
    value.characteristics[0] &&
    value.characteristics[0].status
}

class HomekitController extends utils.Adapter {

    private devices = new Map<string, HapDevice>();

    private discoveryIp?: IPDiscovery;
    private discoveryBle?: BLEDiscovery;

    private isConnected?: boolean;

    private stateFunctionsForId = new Map<string, StateFunctions>();

    private lastValues: Record<string, ioBroker.StateValue> = {};

    private instanceDataDir: string;

    private bluetoothQueue: PQueue;

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

        this.instanceDataDir = utils.getAbsoluteInstanceDataDir(this);
        try {
            if (!fs.existsSync(this.instanceDataDir)) {
                fs.mkdirSync(this.instanceDataDir);
            }
        } catch (err) {
            this.log.info(`Can not create pairing data storage directory ${this.instanceDataDir}. Pairing data can not be persisted!`);
        }

        this.bluetoothQueue = new PQueue({concurrency: 1, timeout: 45000, throwOnTimeout: true});
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
            for (const hapDevice of this.devices.values()) {
                if (!hapDevice.pairingData) continue;
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

        if (this.config.discoverBle) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                GattClientConstructor = require('hap-controller').GattClient;
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                BLEDiscoveryConstructor = require('hap-controller').BLEDiscovery;
            } catch (err) {
                this.config.discoverBle = false;
                this.log.info(`Could not initialize Bluetooth LE, turn off. Error: ${err.message} `);
            }

            if (this.config.dataPollingIntervalBle < 60) {
                this.log.info(`Data polling interval for BLE devices is less then 60s, set to 60s`);
                this.config.dataPollingIntervalBle = 60;
            }
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

        if (this.config.discoverBle && BLEDiscoveryConstructor) {
            this.discoveryBle = new BLEDiscoveryConstructor();

            this.discoveryBle.on('serviceUp', (service: HapServiceBle) => {
                this.log.debug(`Discovered BLE device up: ${service.id}/${service.name}`);
                this.handleDeviceDiscovery('BLE', service);
            });
            this.discoveryBle.on('serviceChanged', (service: HapServiceBle) => {
                this.log.debug(`Discovered BLE device changed: ${service.id}/${service.name}`);
                this.handleDeviceDiscovery('BLE', service);
            });
            this.discoveryBle.start();
        }

        this.subscribeStates('*');

        try {
            const devices = await this.getKnownDevices();
            if (devices.length) {
                this.log.debug('Init ' + devices.length + ' known devices without discovery ...');
                for (const device of devices) {
                    const hapDevice: HapDevice = {
                        serviceType: device.native.serviceType,
                        id: device.native.id,
                        connected: false,
                        service: device.native.lastService || undefined,
                        pairingData: device.native.pairingData,
                        initInProgress: false,
                    }
                    this.log.debug(`Init ${hapDevice.id} as known device`);
                    await this.initDevice(hapDevice);
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

            for (const hapDevice of this.devices.values()) {
                if (!hapDevice.connected) continue;

                if (hapDevice.serviceType === 'IP') {
                    try {
                        await hapDevice.clientQueue?.add(async () => await hapDevice.client?.unsubscribeCharacteristics());
                    } catch {
                        // ignore
                    }
                }
                hapDevice.client?.close();
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
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

            // Handle statechange if ack = true
            if (!state.ack) {
                // Cleanup last value to always update next value
                const stateIdNoNamespace = id.substring(this.namespace.length + 1);
                delete this.lastValues[stateIdNoNamespace];

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
            this.log.debug(`state ${id} deleted`);
        }
    }

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
                        const unavailableDevices = [];
                        const availableDevices = [];
                        const pairedDevices = [];
                        for (const hapDevice of this.devices.values()) {
                            const deviceData = {
                                id: hapDevice.id,
                                serviceType: hapDevice.serviceType,
                                connected: hapDevice.connected,
                                discovered: !!hapDevice.service,
                                availableToPair: hapDevice.service?.availableToPair,
                                discoveredName: hapDevice.service?.name,
                                discoveredCategory: hapDevice.service?.ci ? categoryFromId(hapDevice.service?.ci) : 'Unknown',
                                pairedWithThisInstance: !!hapDevice.pairingData,
                            };
                            if (deviceData.availableToPair) {
                                availableDevices.push(deviceData);
                            } else if (deviceData.pairedWithThisInstance) {
                                pairedDevices.push(deviceData);
                            } else {
                                unavailableDevices.push(deviceData);
                            }
                            response.devices = [...pairedDevices, ...availableDevices, ...unavailableDevices];
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
            if (hapDevice.serviceType === 'IP') {
                if (
                    hapDevice.service &&
                    hapDevice.service['c#'] === service['c#']
                ) {
                    this.log.debug(`${id} Discovery device update, unchanged config-number, ignore`);
                    return;
                }
            } else if (hapDevice.serviceType === 'BLE') {
                if (
                    hapDevice.service &&
                    hapDevice.service['c#'] === service['c#'] &&
                    hapDevice.service.GSN === (service as HapServiceBle).GSN
                ) {
                    this.log.debug(`${id} Discovery device update, unchanged config-/GSN-number, ignore`);
                    return;
                }

                if (
                    hapDevice.service &&
                    hapDevice.service['c#'] === service['c#'] &&
                    hapDevice.service.GSN !== (service as HapServiceBle).GSN
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

    private getPairingDataFilename(id: string): string {
        const fileName = `${id.replace(/:/g, '-')}.json`;
        return path.join(this.instanceDataDir, fileName);
    }

    private storePairingData(device: HapDevice): void {
        if (!device.pairingData) {
            return;
        }
        try {
            fs.writeFileSync(this.getPairingDataFilename(device.id), JSON.stringify(device.pairingData), 'utf-8');
        } catch (err) {
            this.log.info(`${device.id} Could not store pairing data to disk`);
        }
    }

    private loadPairingData(device: HapDevice): PairingData | undefined {
        try {
            const data = fs.readFileSync(this.getPairingDataFilename(device.id), 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            this.log.info(`${device.id} Could not load pairing data from disk`);
            return;
        }
    }

    private storedPairingDataExists(device: HapDevice): boolean {
        try {
            return fs.existsSync(this.getPairingDataFilename(device.id));
        } catch (err) {
            return false;
        }
    }

    private deleteStoredPairingData(device: HapDevice): void {
        try {
            fs.unlinkSync(this.getPairingDataFilename(device.id));
        } catch {
            // ignore
        }
    }

    private async initDevice(device: HapDevice): Promise<void> {
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
            this.setDeviceConnected(device, false);
        } else {
            if (!device.pairingData) {
                const pairingDataFileExists = this.storedPairingDataExists(device);
                if (device.service && !device.service!.availableToPair) {
                    if (pairingDataFileExists) {
                        device.pairingData = this.loadPairingData(device);
                    }
                    if (!device.pairingData) {
                        this.log.info(`${device.id} (${device.service.name}) found without known pairing data and already paired: ignoring`);
                        device.initInProgress = false;
                        return;
                    } else {
                        this.log.info(`${device.id} Found stored Pairing data, try it ...`);
                    }
                } else {
                    this.log.info(`${device.id} (${device.service?.name}) found without pairing data but available for pairing: Create basic objects`);
                    const objs = await this.buildBasicUnpairedDeviceObjects(device);
                    await this.createObjects(device, objs);
                    device.initInProgress = false;
                    return;
                }
            }
        }

        if (!this.initDeviceClient(device)) {
            device.initInProgress = false;
            return;
        }

        const baseObjects = await this.buildBasicPairedDeviceObjects(device);

        try {
            this.log.debug(`${device.id} Request Accessory information`);
            const deviceData = await device.clientQueue?.add(async () => await device.client?.getAccessories());

            if (!deviceData) {
                this.setDeviceConnected(device, false);
                this.log.info(`${device.id} Could not load device accessories ... TODO`);
                device.initInProgress = false;
                return;
            }

            this.log.debug(`${device.id} Accessory Structure: ${JSON.stringify(deviceData)}`);

            const accessoryObjects = this.buildPairedDeviceAccessoryObjects(device, deviceData);
            await this.createObjects(device, new Map([...baseObjects, ...accessoryObjects]));

            this.setDeviceConnected(device, true);

            this.initSupportingMaps(device, accessoryObjects);

            await this.initSubscriptions(device)

            this.scheduleCharacteristicsUpdate(device);

            this.storePairingData(device);
        } catch (err) {
            this.log.info(`${device.id} Could not initialize device: ${err.message} ${err.stack}`);
            this.setDeviceConnected(device, false);
        }
        device.initInProgress = false;
    }

    private initDeviceClient(device: HapDevice): boolean {
        if (device.serviceType === 'IP') {
            const service = device.service!;
            this.log.debug(`${device.id} Start Homekit Device Client initialization on ${service.address}:${service!.port}`);

            device.client = device.client || new HttpClient(
                service.id,
                service.address,
                service.port,
                device.pairingData || undefined,
                {
                    usePersistentConnections: true,
                }
            );
            device.clientQueue = new PQueue({concurrency: 10, timeout: 120000, throwOnTimeout: true});
        } else if (device.serviceType === 'BLE') {
            if (!this.config.discoverBle || !GattClientConstructor) {
                this.log.info(`Could not initialize device ${device.id} because BLE discovery is not activated. Skipping device`);
                return false;
            }

            // Don't use `as` to remove undefined from the type. Append `!` to do that, e.g.
            // const service = device.service!;
            // Or just assign and check:
            const service = device.service;
            if (!service?.peripheral) {
                if (!this.config.discoverBle) {
                    this.log.warn(`${device.id} Can not initialize BLE device because BLE discovery is turned off!`);
                } else {
                    this.log.debug(`${device.id} Waiting for BLE discovery of this device for proper initialization`)
                }
                return false;
            }

            this.log.debug(`${device.id} Start Homekit Device Client initialization`);

            device.client = device.client || new GattClientConstructor(service.id, service.peripheral, device.pairingData)
            device.clientQueue = this.bluetoothQueue;
        } else {
            return false;
        }
        return true;
    }

    private initSupportingMaps(device: HapDevice, accessoryObjects: Map<string, ioBroker.Object>): void {
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
            this.log.debug(`Device ${device.id} no subscriptions to initialize`);
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
                await device.clientQueue?.add(async () => await device.client?.subscribeCharacteristics(formerSubscribes));
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
                        // This should become better in TS 4.5, for now you actually need the `as` here.
                        requestedCharacteristics = (requestedCharacteristics as string[]).filter(el => el.startsWith(`${aid}.`));
                    } else {
                        requestedCharacteristics = (requestedCharacteristics as PollingCharacteristic[]).filter(el => el.aid === aid);
                    }
                }
                try {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    const data = await device.clientQueue.add(async () => await device.client?.getCharacteristics(requestedCharacteristics));
                    if (data) {
                        this.setCharacteristicValues(device, data);
                    }
                    this.setDeviceConnected(device, true);
                } catch (err) {
                    this.log.info(`Device ${device.id} data polling failed: ${err.message}`);
                    this.setDeviceConnected(device, false);
                }
            }
            this.scheduleCharacteristicsUpdate(device);
        }, delay * 1000)
    }

    private setCharacteristicValues(device: HapDevice, values: { characteristics: Characteristic.CharacteristicObject[] }): void {
        this.log.debug(`${device.id} Set Values to ioBroker: ${JSON.stringify(values.characteristics)}`);
        values.characteristics.forEach((characteristic) => {
            const id = `${characteristic.aid}.${characteristic.iid}`;

            const stateId = device.stateIdMap?.get(id);
            if (stateId) {
                let value = characteristic.value as ioBroker.StateValue;
                const stateFunc = this.stateFunctionsForId.get(`${this.namespace}.${stateId}`);
                if (stateFunc?.converter?.read) {
                    value = stateFunc.converter.read(value);
                }
                if (!this.config.updateOnlyChangedValues || (this.config.updateOnlyChangedValues && value !== this.lastValues[stateId])) {
                    this.setState(stateId, value, true);
                    this.lastValues[stateId] = value;
                }
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

        objs.set(device.id, ObjectDefaults.getFolderObject(`${device.service?.name} (${device.id})`, undefined, hapNative));

        objs.set(`${device.id}.info`, ObjectDefaults.getChannelObject('Information'));
        objs.set(`${device.id}.info.connectionType`, ObjectDefaults.getStateObject('string', 'Connection type', device.serviceType, {def: device.serviceType, write: false}));
        objs.set(`${device.id}.info.id`, ObjectDefaults.getStateObject('string', 'HAP ID', device.service?.id, {write: false}));
        if (device.serviceType === 'IP') {
            objs.set(`${device.id}.info.address`, ObjectDefaults.getStateObject('string', 'IP Address', device.service?.address, { role: 'info.ip', write: false }));
        }
        objs.set(`${device.id}.info.connected`, ObjectDefaults.getStateObject('indicator', 'Connected',  device.connected,{write: false}));

        objs.set(`${device.id}.admin`, ObjectDefaults.getChannelObject('Administration'));
        objs.set(`${device.id}.admin.isPaired`, ObjectDefaults.getStateObject('indicator', 'Paired with this Instance?', !!device.pairingData));
        objs.set(`${device.id}.info.lastDiscovered`, ObjectDefaults.getStateObject('timestamp', 'Last Discovered', Date.now()));

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

            let accessoryNameId;
            accessory.services.forEach((service) => {
                let serviceName = serviceFromUuid(service.type);
                if (ignoredHapServices.includes(serviceName) || !service.type) {
                    return;
                }
                if (serviceName.startsWith('public.hap.service.')) {
                    serviceName = serviceName.substr(19).replace(/\./g, '-'); // remove public.hap.service.
                }
                let nameId: string | undefined;
                let serviceObjName;

                service.characteristics.forEach((characteristic) => {
                    const id = ObjectMapper.addCharacteristicObjects(device, objs, accessory, service, characteristic);
                    if (id?.endsWith('.name') && id?.includes('.accessory-information')) {
                        accessoryNameId = id;
                    } else if (id?.endsWith('.name')) {
                        nameId = id;
                    }
                });

                if (nameId) {
                    serviceObjName = objs.get(nameId)?.native.value;
                } else {
                    serviceObjName = `${serviceName} ${service.iid}`;
                }
                objs.set(`${device.id}.${accessory.aid}.${serviceName}-${service.iid}`, ObjectDefaults.getChannelObject(serviceObjName));
            });

            let accessoryObjName: string | undefined;
            if (accessoryNameId) {
                accessoryObjName = objs.get(accessoryNameId)?.native.value;
            }
            if (!accessoryObjName) {
                accessoryObjName = `Accessory ${accessory.aid}`;
            }

            objs.set(`${device.id}.${accessory.aid}`, ObjectDefaults.getDeviceObject(accessoryObjName));
        });

        return objs;
    }

    private async createObjects(device: HapDevice, objs: Map<string, ioBroker.Object>): Promise<void> {
        for (const [objId, obj] of objs) {
            const stateId = `${this.namespace}.${objId}`;
            if (obj.type === 'state' && !this.stateFunctionsForId.get(stateId)) {
                const stateFuncs: StateFunctions = {};
                if (objId.endsWith('.identify') && objId.includes('.accessory-information-')) {
                    continue;
                }
                const convertLogic: keyof typeof Converters = obj.native.convertLogic;
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
                                const res = (await device.clientQueue?.add(
                                    async () =>
                                        await device.client?.setCharacteristics(data)
                                ));
                                if (isSetCharacteristicErrorResponse(res)) {
                                    this.log.info(
                                        `State update for ${objId} (${hapId}) failed with status ${
                                            res.characteristics[0].status
                                        }: ${
                                            // Converting the thing you're indexing into any allows you to access what you want without TypeScript screaming
                                            (IPConstants.HapStatusCodes as any)[
                                                res.characteristics[0].status
                                            ]
                                        }`
                                    );
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
                                await device.clientQueue?.add(async () => await device.client?.setCharacteristics([hapData]));
                            } catch (err) {
                                this.log.info(`State update for ${objId} (${JSON.stringify(hapData)}) failed with error ${err.statusCode} ${err.message}`);
                            }
                            this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                        }
                    };
                } else if (stateFuncs.converter?.write) {
                    delete stateFuncs.converter.write;
                }
                if (stateFuncs.converter || stateFuncs.stateChangeFunction) {
                    this.stateFunctionsForId.set(stateId, stateFuncs);
                    this.log.debug(`${device.id} initialize Object ${stateId} with Converter ${convertLogic}${stateFuncs.stateChangeFunction ? ' and stateChangeFunction' : ''}`);
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
                this.lastValues[objId] = valueToSet;
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
                    this.log.info(`Cannot retrieve IP PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}, try default`);
                    pairMethod = PairMethods.PairSetup;
                }
            }
        } else {
            if (this.discoveryBle) {
                try {
                    pairMethod = await this.discoveryBle.getPairMethod(device.service);
                } catch (err) {
                    this.log.info(`Cannot retrieve BLE PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}, try default`);
                    pairMethod = PairMethods.PairSetup;
                }
            }
        }

        this.log.info(`Use PairMethod ${pairMethod} to pair ${device.id}`);

        if (!this.initDeviceClient(device) || !device.client) {
            throw new Error(`Cannot pair with device ${device.id} because Client initialization not successful`)
        }

        try {
            await device.client.pairSetup(pin.toString(), pairMethod);
        } catch (err) {
            throw new Error(`Cannot pair with device ${device.id} because of error ${err.statusCode} (${pairingErrorMessages[err.statusCode as keyof typeof pairingErrorMessages]}): ${err.message}`);
        }

        const pairingData = device.client.getLongTermData();
        if (!pairingData) {
            throw new Error(`No pairing data retrieved after pair for device ${device.id}. Aborting.`);
        } else {
            this.log.info(`${device.id} Successfully paired to device: ${JSON.stringify(pairingData)}`);
        }
        device.pairingData = pairingData;
        device.service.availableToPair = false;

        this.storePairingData(device);

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

        delete device.pairingData;
        this.deleteStoredPairingData(device);
        if (device.service) {
            device.service.availableToPair = false;
        }
        device.client.removeAllListeners('event');
        device.client.removeAllListeners('event-disconnect');
        delete device.client;
        this.setDeviceConnected(device, false);

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
            } else if (GattClientConstructor) {
                client = new GattClientConstructor(device.service.id, device.service.peripheral);
            }
            await client?.identify();
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
