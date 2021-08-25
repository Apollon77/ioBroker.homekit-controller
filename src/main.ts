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
    GattClient
} from 'hap-controller';
import Debug from 'debug';
import HttpConnection from 'hap-controller/lib/transport/ip/http-connection';
import GattConnection from 'hap-controller/lib/transport/ble/gatt-connection';

type HapDevice =
    | {
        serviceType: 'IP';
        connected: boolean;
        id: string;
        service?: HapServiceIp;
        formerService?: HapServiceIp;
        pairingData?: PairingData;
        client?: HttpClient;
        subscriptionConnection?: HttpConnection;
        subscribedEntities?: string[];
    }
    | {
        serviceType: 'BLE';
        connected: boolean;
        id: string;
        service?: HapServiceBle;
        formerService?: HapServiceBle;
        pairingData?: PairingData;
        client?: GattClient;
        subscriptionConnection?: GattConnection;
        subscribedEntities?: { characteristicUuid: string; serviceUuid: string }[];
    };

class HomekitController extends utils.Adapter {

    private devices = new Map<string, HapDevice>();

    private discoveryIp: IPDiscovery | null = null;
    private discoveryBle: BLEDiscovery | null = null;

    private isConnected: boolean | null = null;

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

    setConnected(isConnected: boolean) {
        if (this.isConnected !== isConnected) {
            this.isConnected = isConnected;
            this.setState('info.connection', this.isConnected, true);
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        Debug.enable('hap-controller:*');
        Debug.log = this.log.debug.bind(this);

        this.setConnected(false);

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
                            formerService: device.native.lastService || undefined,
                            pairingData: device.native.pairingData,
                        }
                        await this.initDevice(hapDevice);
                    }
                }
            }
        } catch (err) {
            this.log.error(`Could not initialize existing devices: ${err.message}`);
        }

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
                if (!hapDevice || !hapDevice.connected) return;

                if (hapDevice.subscriptionConnection) {
                    if (hapDevice.serviceType === 'IP') {
                        hapDevice.subscriptionConnection.close();
                    } else {
                        if (hapDevice.subscribedEntities) {
                            await hapDevice.client?.unsubscribeCharacteristics(hapDevice.subscribedEntities);
                        }
                        await hapDevice.subscriptionConnection.disconnect().catch(() => {
                            // ignore
                        });
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
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     */
    private onMessage(obj: ioBroker.Message): void {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                // e.g. send email or pushover or whatever
                this.log.info('send command');

                // Send response in callback if required
                if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
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

    private async handleDeviceDiscovery(serviceType: 'IP' | 'BLE', service: HapServiceIp | HapServiceBle): Promise<void> {
        this.log.debug(`Discovered ${serviceType} device: ${JSON.stringify(service)}`);
        const id = `${serviceType}-${service.id}`;
        const hapDevice: HapDevice = this.devices.get(id) || {
            serviceType,
            id,
            connected: false,
            service,
        };
        if (this.devices.has(id) && hapDevice.connected) { // if service was existing before already
            if (hapDevice.service && hapDevice.service['c#'] === service['c#']) {
                this.log.debug(`Discovery device update, unchanged config-number, ignore`);
                return;
            }
        }
        await this.initDevice(hapDevice);
    }


    async initDevice(device: HapDevice): Promise<void> {
        if (device.connected) {
            this.log.debug(`${device.id} Re-Init requested ...`);
            //device.client.
        }
        this.log.debug(`Start PH803W Device initialization for ${device.id} on IP ${device.ip}`);

    }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HomekitController(options);
} else {
    // otherwise start the instance directly
    (() => new HomekitController())();
}
