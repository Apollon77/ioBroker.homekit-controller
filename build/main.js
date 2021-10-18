"use strict";
/*
 * Created with @iobroker/create-adapter v1.33.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const hap_controller_1 = require("hap-controller");
const debug_1 = __importDefault(require("debug"));
const p_queue_1 = __importDefault(require("p-queue"));
const ObjectDefaults = __importStar(require("./lib/objectDefaults"));
const ObjectMapper = __importStar(require("./lib/objectMapper"));
const service_1 = require("hap-controller/lib/model/service");
const category_1 = require("hap-controller/lib/model/category");
const IPConstants = __importStar(require("hap-controller/lib/transport/ip/http-constants"));
const converter_1 = __importDefault(require("./lib/converter"));
const ignoredHapServices = [
    'public.hap.service.pairing',
    'public.hap.service.protocol.information.service'
];
class HomekitController extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'homekit-controller',
        });
        this.devices = new Map();
        this.discoveryIp = null;
        this.discoveryBle = null;
        this.isConnected = null;
        this.stateFunctionsForId = new Map();
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    setConnected(isConnected) {
        if (this.isConnected !== isConnected) {
            this.isConnected = isConnected;
            this.setState('info.connection', this.isConnected, true);
        }
    }
    setDeviceConnected(device, isConnected) {
        if (device.connected !== isConnected) {
            device.connected = isConnected;
            this.setState(`${device.id}.info.connected`, isConnected, true);
            let globalConnected = true;
            for (const id in Array.from(this.devices.keys())) {
                const hapDevice = this.devices.get(id);
                if (!hapDevice || !hapDevice.pairingData)
                    continue;
                globalConnected = globalConnected && hapDevice.connected;
            }
            this.setConnected(globalConnected);
        }
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        debug_1.default.enable('hap-controller:*');
        debug_1.default.log = this.log.debug.bind(this);
        if (this.config.discoverBle && this.config.dataPollingIntervalBle < 60) {
            this.log.info(`Data polling interval for BLE devices is less then 60s, set to 60s`);
            this.config.dataPollingIntervalBle = 60;
        }
        this.setConnected(false);
        if (this.config.discoverIp) {
            this.discoveryIp = new hap_controller_1.IPDiscovery();
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
            this.discoveryBle = new hap_controller_1.BLEDiscovery();
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
                        const hapDevice = {
                            serviceType: device.native.serviceType,
                            id: device.native.id,
                            connected: false,
                            service: device.native.lastService || undefined,
                            pairingData: device.native.pairingData,
                            initInProgress: false,
                        };
                        await this.initDevice(hapDevice);
                    }
                }
            }
        }
        catch (err) {
            this.log.error(`Could not initialize existing devices: ${err.message}`);
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    async onUnload(callback) {
        var _a;
        try {
            if (this.discoveryBle) {
                this.discoveryBle.stop();
            }
            if (this.discoveryIp) {
                this.discoveryIp.stop();
            }
            for (const id in Array.from(this.devices.keys())) {
                const hapDevice = this.devices.get(id);
                if (!hapDevice || !hapDevice.connected)
                    continue;
                if (hapDevice.serviceType === 'IP') {
                    try {
                        await ((_a = hapDevice.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = hapDevice.client) === null || _a === void 0 ? void 0 : _a.unsubscribeCharacteristics()); }));
                    }
                    catch {
                        // ignore
                    }
                }
            }
            callback();
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        var _a;
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
                    if ((_a = stateFunctions.converter) === null || _a === void 0 ? void 0 : _a.write) {
                        value = stateFunctions.converter.write(value);
                    }
                    stateFunctions.stateChangeFunction(value);
                }
            }
        }
        else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     */
    async onMessage(obj) {
        var _a, _b, _c, _d;
        if (typeof obj === 'object' && obj.command) {
            this.log.debug(`Message ${obj.command} received: ${JSON.stringify(obj)})`);
            let response = {
                success: true,
                error: false
            };
            try {
                switch (obj.command) {
                    case 'getDiscoveredDevices':
                        response.devices = [];
                        for (const id of Array.from(this.devices.keys())) {
                            const hapDevice = this.devices.get(id);
                            if (hapDevice) {
                                response.devices.push({
                                    id: hapDevice.id,
                                    serviceType: hapDevice.serviceType,
                                    connected: hapDevice.connected,
                                    discovered: !!hapDevice.service,
                                    availableToPair: (_a = hapDevice.service) === null || _a === void 0 ? void 0 : _a.availableToPair,
                                    discoveredName: (_b = hapDevice.service) === null || _b === void 0 ? void 0 : _b.name,
                                    discoveredCategory: ((_c = hapDevice.service) === null || _c === void 0 ? void 0 : _c.ci) ? (0, category_1.categoryFromId)((_d = hapDevice.service) === null || _d === void 0 ? void 0 : _d.ci) : 'Unknown',
                                    pairedWithThisInstance: !!hapDevice.pairingData,
                                });
                            }
                            else {
                                this.log.debug(`getDiscoveredDevices: ${id} not found`);
                            }
                        }
                        break;
                    case 'pairDevice':
                        if (typeof obj.message === 'string')
                            return;
                        const pairingDevice = this.devices.get(obj.message.deviceId);
                        if (!pairingDevice) {
                            throw new Error(`Pair: Device with ID ${obj.message.deviceId} not existing.`);
                        }
                        await this.pairDevice(pairingDevice, obj.message.pin);
                        break;
                    case 'unpairDevice':
                        if (typeof obj.message === 'string')
                            return;
                        const unpairingDevice = this.devices.get(obj.message.deviceId);
                        if (!unpairingDevice) {
                            throw new Error(`Unpair: Device with ID ${obj.message.deviceId} not existing.`);
                        }
                        await this.unpairDevice(unpairingDevice);
                        break;
                    case 'identify':
                        if (typeof obj.message === 'string')
                            return;
                        const identifyingDevice = this.devices.get(obj.message.deviceId);
                        if (!identifyingDevice) {
                            throw new Error(`Identify: Device with ID ${obj.message.deviceId} not existing.`);
                        }
                        await this.identifyDevice(identifyingDevice);
                        break;
                }
            }
            catch (err) {
                response = {
                    success: false,
                    error: err.message
                };
            }
            this.log.debug(`Response to Command ${obj.command}: ${JSON.stringify(response)}`);
            // Send response in callback if required
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, response, obj.callback);
            }
        }
    }
    async getKnownDevices() {
        const objs = await this.getObjectViewAsync('system', 'folder', {
            startkey: this.namespace + '.',
            endkey: this.namespace + '.\u9999'
        });
        const namespaceLength = this.namespace.length;
        const res = [];
        objs.rows.forEach(entry => {
            const obj = entry.value;
            if (!obj || !obj._id)
                return;
            const id = obj._id.substr(namespaceLength + 1);
            if (id.includes('.'))
                return; // only folders on first tree position are considered
            res.push(obj);
        });
        return res;
    }
    async handleDeviceDiscovery(serviceType, service) {
        const id = `${serviceType}-${service.id}`.toUpperCase();
        const hapDevice = this.devices.get(id) || {
            serviceType,
            id,
            connected: false,
            service,
            initInProgress: false,
        };
        if (this.devices.has(id) && hapDevice.connected) { // if service was existing before already
            if (serviceType === 'IP') {
                if (hapDevice.service &&
                    hapDevice.service['c#'] === service['c#']) {
                    this.log.debug(`${id} Discovery device update, unchanged config-number, ignore`);
                    return;
                }
            }
            else if (serviceType === 'BLE') {
                if (hapDevice.service &&
                    hapDevice.service['c#'] === service['c#'] &&
                    hapDevice.service.GSN === service.GSN) {
                    this.log.debug(`${id} Discovery device update, unchanged config-/GSN-number, ignore`);
                    return;
                }
                if (hapDevice.service &&
                    hapDevice.service['c#'] === service['c#'] &&
                    hapDevice.service.GSN !== service.GSN) {
                    this.log.debug(`${id} GSN updated for BLE device, update data in 500ms`);
                    this.scheduleCharacteristicsUpdate(hapDevice, 0.5);
                    return;
                }
            }
            this.log.debug(`${id} Device Discovery Update - reinitialize device`);
        }
        else {
            this.log.debug(`${id} Discovered ${serviceType} device: ${JSON.stringify(service, (key, value) => {
                return key === 'peripheral' ? undefined : value;
            })}`);
        }
        hapDevice.service = service;
        await this.initDevice(hapDevice);
    }
    async initDevice(device) {
        var _a, _b, _c;
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
                    await ((_a = device.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.unsubscribeCharacteristics()); }));
                }
                catch {
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
        }
        else {
            if (!device.pairingData) {
                if (device.service && !device.service.availableToPair) {
                    this.log.info(`${device.id} (${device.service.name}) found without known pairing data and already paired: ignoring`);
                }
                else {
                    this.log.info(`${device.id} (${(_b = device.service) === null || _b === void 0 ? void 0 : _b.name}) found without pairing data but available for pairing: Create basic objects`);
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
            const deviceData = await ((_c = device.clientQueue) === null || _c === void 0 ? void 0 : _c.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.getAccessories()); }));
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
            await this.initSubscriptions(device);
            this.scheduleCharacteristicsUpdate(device);
        }
        catch (err) {
            this.log.info(`${device.id} Could not initialize device: ${err.message} ${err.stack}`);
        }
        device.initInProgress = false;
    }
    initDeviceClient(device) {
        if (device.serviceType === 'IP') {
            const service = device.service;
            this.log.debug(`${device.id} Start Homekit Device Client initialization on ${service.address}:${service.port}`);
            device.client = device.client || new hap_controller_1.HttpClient(service.id, service.address, service.port, device.pairingData || undefined);
            device.clientQueue = new p_queue_1.default({ concurrency: 10, timeout: 120000, throwOnTimeout: true });
        }
        else {
            const service = device.service;
            if (!service.peripheral) {
                if (!this.config.discoverBle) {
                    this.log.warn(`${device.id} Can not initialize BLE device because BLE discovery is turned off!`);
                }
                else {
                    this.log.debug(`${device.id} Waiting for BLE discovery of this device for proper initialization`);
                }
                return false;
            }
            this.log.debug(`${device.id} Start Homekit Device Client initialization`);
            device.client = device.client || new hap_controller_1.GattClient(service.id, service.peripheral, device.pairingData);
            device.clientQueue = new p_queue_1.default({ concurrency: 1, timeout: 120000, throwOnTimeout: true });
        }
        return true;
    }
    initSupportingMaps(device, accessoryObjects) {
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
                }
                else {
                    const charData = {
                        characteristicUuid: obj.native.type,
                        serviceUuid: obj.native.serviceUuid,
                        iid: obj.native.iid,
                        aid: obj.native.aid,
                        format: obj.native.format
                    };
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
    async initSubscriptions(device) {
        var _a;
        if (!device.subscriptionCharacteristics.length ||
            !device.client ||
            device.serviceType === 'BLE') {
            this.log.debug(`Device ${device.id} Subscriptions not initialized`);
            return;
        }
        device.client.on('event', event => {
            if (event.characteristics && Array.isArray(event.characteristics)) {
                this.log.debug(`${device.id} IP device subscription event received: ${JSON.stringify(event)}`);
                this.setCharacteristicValues(device, event);
            }
            else {
                this.log.debug(`${device.id} Unknown IP device subscription event received: ${JSON.stringify(event)}`);
            }
        });
        device.client.on('event-disconnect', async (formerSubscribes) => {
            var _a;
            this.log.debug(`${device.id} Subscription Event connection disconnected, try to resubscribe`);
            try {
                await ((_a = device.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => await device.client.subscribeCharacteristics(formerSubscribes)));
            }
            catch (err) {
                this.log.info(`${device.id} Resubscribe not successful, reinitialize device`);
                await this.initDevice(device);
            }
        });
        try {
            await ((_a = device.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.subscribeCharacteristics(device.subscriptionCharacteristics)); }));
        }
        catch (err) {
            this.log.info(`Device ${device.id} subscribing for updates failed: ${err.message}`);
        }
    }
    scheduleCharacteristicsUpdate(device, delay, aid) {
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
                        requestedCharacteristics = requestedCharacteristics.filter(el => el.startsWith(`${aid}.`));
                    }
                    else {
                        requestedCharacteristics = requestedCharacteristics.filter(el => el.aid === aid);
                    }
                }
                try {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    const data = await device.clientQueue.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.getCharacteristics(requestedCharacteristics)); });
                    if (data) {
                        this.setCharacteristicValues(device, data);
                    }
                }
                catch (err) {
                    this.log.info(`Device ${device.id} data polling failed: ${err.message}`);
                }
            }
            this.scheduleCharacteristicsUpdate(device);
        }, delay * 1000);
    }
    setCharacteristicValues(device, values) {
        values.characteristics.forEach((characteristic) => {
            var _a, _b;
            const id = `${characteristic.aid}.${characteristic.iid}`;
            const stateId = (_a = device.stateIdMap) === null || _a === void 0 ? void 0 : _a.get(id);
            if (stateId) {
                let value = characteristic.value;
                const stateFunc = this.stateFunctionsForId.get(`${this.namespace}.${stateId}`);
                if ((_b = stateFunc === null || stateFunc === void 0 ? void 0 : stateFunc.converter) === null || _b === void 0 ? void 0 : _b.read) {
                    value = stateFunc.converter.read(value);
                }
                this.setState(stateId, value, true);
            }
            else {
                this.log.debug(`${device.id} No stateId found in map for ${JSON.stringify(characteristic)}`);
            }
        });
    }
    buildBasicDeviceObjects(device) {
        var _a, _b, _c;
        const objs = new Map();
        let lastService;
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
        this.log.debug(`Service: ${JSON.stringify(device.service, (key, value) => {
            return key === 'peripheral' ? undefined : value;
        })}`);
        objs.set(device.id, ObjectDefaults.getFolderObject(`HAP ${(_a = device.service) === null || _a === void 0 ? void 0 : _a.name} (${device.id})`, undefined, hapNative));
        objs.set(`${device.id}.info`, ObjectDefaults.getChannelObject('Information'));
        objs.set(`${device.id}.info.connectionType`, ObjectDefaults.getStateObject('string', 'Connection type', device.serviceType, { def: device.serviceType, write: false }));
        objs.set(`${device.id}.info.id`, ObjectDefaults.getStateObject('string', 'HAP ID', (_b = device.service) === null || _b === void 0 ? void 0 : _b.id, { write: false }));
        if (device.serviceType === 'IP') {
            objs.set(`${device.id}.info.address`, ObjectDefaults.getStateObject('string', 'IP Address', (_c = device.service) === null || _c === void 0 ? void 0 : _c.address, { write: false }));
        }
        objs.set(`${device.id}.info.connected`, ObjectDefaults.getStateObject('indicator', 'Connected', device.connected, { write: false }));
        objs.set(`${device.id}.admin`, ObjectDefaults.getChannelObject('Administration'));
        objs.set(`${device.id}.admin.isPaired`, ObjectDefaults.getStateObject('indicator', 'Paired with this Instance?', !!device.pairingData));
        return objs;
    }
    buildBasicUnpairedDeviceObjects(device) {
        const objs = this.buildBasicDeviceObjects(device);
        const pairId = `${device.id}.admin.pairWithPin`;
        objs.set(pairId, ObjectDefaults.getStateObject('string', 'Set Pin to Pair', undefined, { def: '' }));
        this.stateFunctionsForId.set(`${this.namespace}.${pairId}`, {
            stateChangeFunction: async (value) => {
                if (!value) {
                    return;
                }
                try {
                    await this.pairDevice(device, value.toString());
                }
                catch (err) {
                    this.log.info(err.message);
                }
            }
        });
        const identifyId = `${device.id}.admin.identify`;
        objs.set(identifyId, ObjectDefaults.getStateObject('button', 'Trigger to Identify Device', undefined, { def: false }));
        this.stateFunctionsForId.set(`${this.namespace}.${identifyId}`, {
            stateChangeFunction: async (value) => {
                if (value !== true) {
                    return;
                }
                try {
                    await this.identifyDevice(device);
                }
                catch (err) {
                    this.log.info(err.message);
                }
            }
        });
        return objs;
    }
    async buildBasicPairedDeviceObjects(device) {
        const objs = this.buildBasicDeviceObjects(device);
        const unpairId = `${device.id}.admin.unpair`;
        objs.set(unpairId, ObjectDefaults.getStateObject('button', 'Unpair', false, { def: false }, { execute: 'unpair' }));
        this.stateFunctionsForId.set(`${this.namespace}.${unpairId}`, {
            stateChangeFunction: async (value) => {
                if (value !== true) {
                    return;
                }
                try {
                    await this.unpairDevice(device);
                }
                catch (err) {
                    this.log.info(err.message);
                }
            }
        });
        await this.delObjectAsync(`${device.id}.admin.pairWithPin`);
        await this.delObjectAsync(`${device.id}.admin.identify`);
        return objs;
    }
    buildPairedDeviceAccessoryObjects(device, deviceData) {
        const objs = new Map();
        deviceData.accessories.forEach((accessory) => {
            accessory.services.forEach((service) => {
                const serviceType = (0, service_1.serviceFromUuid)(service.type);
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
    async createObjects(device, objs) {
        var _a, _b;
        for (const [objId, obj] of objs) {
            const stateId = `${this.namespace}.${objId}`;
            if (obj.type === 'state' && !this.stateFunctionsForId.get(stateId)) {
                const stateFuncs = {};
                if (objId.endsWith('accessory-information.identify')) {
                    continue;
                }
                if (obj.common.write) {
                    const convertLogic = obj.native.convertLogic;
                    if (converter_1.default[convertLogic]) {
                        stateFuncs.converter = converter_1.default[convertLogic];
                    }
                    if (obj.common.write) {
                        stateFuncs.stateChangeFunction = async (value) => {
                            var _a, _b, _c;
                            if (device.serviceType === 'IP') {
                                const hapId = `${obj.native.aid}.${obj.native.iid}`;
                                this.log.debug(`Device ${device.id}: Set Characteristic ${hapId} to ${JSON.stringify(value)}`);
                                try {
                                    const data = {};
                                    data[hapId] = value;
                                    const res = (await ((_a = device.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.setCharacteristics(data)); })));
                                    if (res.characteristics &&
                                        Array.isArray(res.characteristics) &&
                                        res.characteristics[0] &&
                                        res.characteristics[0].status) {
                                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                        // @ts-ignore
                                        this.log.info(`State update for ${objId} (${hapId}) failed with status ${res.characteristics[0].status}: ${IPConstants.HapStatusCodes[res.characteristics[0].status]}`);
                                        this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                                    }
                                    else {
                                        if (!((_b = device.subscriptionCharacteristics) === null || _b === void 0 ? void 0 : _b.includes(hapId))) {
                                            this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                                        }
                                    }
                                }
                                catch (err) {
                                    this.log.info(`Device ${device.id}: State update for ${objId} (${hapId}) failed with error ${err.statusCode} ${err.message}`);
                                    this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                                }
                            }
                            else {
                                const hapData = {
                                    characteristicUuid: obj.native.type,
                                    serviceUuid: obj.native.serviceUuid,
                                    iid: obj.native.iid,
                                    value: hap_controller_1.GattUtils.valueToBuffer(value, obj.native.format)
                                };
                                this.log.debug(`Device ${device.id}: Set Characteristic ${JSON.stringify(hapData)}`);
                                try {
                                    await ((_c = device.clientQueue) === null || _c === void 0 ? void 0 : _c.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.setCharacteristics([hapData])); }));
                                }
                                catch (err) {
                                    this.log.info(`State update for ${objId} (${JSON.stringify(hapData)}) failed with error ${err.statusCode} ${err.message}`);
                                }
                                this.scheduleCharacteristicsUpdate(device, 0.5, obj.native.aid);
                            }
                        };
                    }
                    else if ((_a = stateFuncs.converter) === null || _a === void 0 ? void 0 : _a.write) {
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
                if ((_b = stateFunc === null || stateFunc === void 0 ? void 0 : stateFunc.converter) === null || _b === void 0 ? void 0 : _b.read) {
                    valueToSet = stateFunc.converter.read(valueToSet);
                }
                await this.setStateAsync(objId, valueToSet, true);
            }
        }
    }
    async pairDevice(device, pin) {
        if (!device.service) {
            throw new Error(`Cannot pair with device ${device.id} because not yet discovered`);
        }
        let pairMethod;
        if (device.serviceType === 'IP') {
            if (this.discoveryIp) {
                try {
                    pairMethod = await this.discoveryIp.getPairMethod(device.service);
                }
                catch (err) {
                    throw new Error(`Cannot retrieve IP PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}`);
                }
            }
        }
        else {
            if (this.discoveryBle) {
                try {
                    pairMethod = await this.discoveryBle.getPairMethod(device.service);
                }
                catch (err) {
                    throw new Error(`Cannot retrieve BLE PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}`);
                }
            }
        }
        if (pairMethod === undefined) {
            this.log.info(`Could not retrieve PairMethod for device ${device.id}, try default`);
            pairMethod = hap_controller_1.PairMethods.PairSetup;
        }
        if (!this.initDeviceClient(device) || !device.client) {
            throw new Error(`Cannot pair with device ${device.id} because Client initialization not successful`);
        }
        try {
            await device.client.pairSetup(pin.toString(), pairMethod);
        }
        catch (err) {
            throw new Error(`Cannot pair with device ${device.id} because of error ${err.statusCode}: ${err.message}`);
        }
        const pairingData = device.client.getLongTermData();
        if (!pairingData) {
            throw new Error(`No pairing data retrieved after pair for device ${device.id}. Aborting.`);
        }
        device.pairingData = pairingData;
        await this.initDevice(device);
    }
    async unpairDevice(device) {
        var _a, _b;
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
                await ((_a = device.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.unsubscribeCharacteristics()); }));
            }
            await ((_b = device.clientQueue) === null || _b === void 0 ? void 0 : _b.add(async () => { var _a, _b; return ((_a = device.pairingData) === null || _a === void 0 ? void 0 : _a.iOSDevicePairingID) && await ((_b = device.client) === null || _b === void 0 ? void 0 : _b.removePairing(device.pairingData.iOSDevicePairingID)); }));
            this.log.info(`Unpairing from device ${device.id} successfully completed ...`);
        }
        catch (err) {
            throw new Error(`Cannot unpair from device ${device.id} because of error ${err.statusCode}: ${err.message}`);
        }
        device.pairingData = null;
        device.client.removeAllListeners('event');
        device.client.removeAllListeners('event-disconnect');
        delete device.client;
        await this.delObjectAsync(device.id, { recursive: true });
        await this.initDevice(device);
    }
    async identifyDevice(device) {
        if (!device.service) {
            throw new Error(`Cannot identify device ${device.id} because not yet discovered`);
        }
        this.log.debug(`Device ${device.id}: Identify triggered`);
        try {
            let client;
            if (device.serviceType === 'IP') {
                client = new hap_controller_1.HttpClient(device.service.id, device.service.address, device.service.port);
            }
            else {
                client = new hap_controller_1.GattClient(device.service.id, device.service.peripheral);
            }
            await client.identify();
        }
        catch (err) {
            throw new Error(`Cannot identify device ${device.id} because of error ${err.statusCode}: ${err.message}`);
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new HomekitController(options);
}
else {
    // otherwise start the instance directly
    (() => new HomekitController())();
}
//# sourceMappingURL=main.js.map