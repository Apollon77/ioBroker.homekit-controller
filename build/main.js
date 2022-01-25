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
const utils = __importStar(require("@iobroker/adapter-core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ip_discovery_1 = __importDefault(require("hap-controller/lib/transport/ip/ip-discovery"));
const pairing_protocol_1 = require("hap-controller/lib/protocol/pairing-protocol");
const http_client_1 = __importDefault(require("hap-controller/lib/transport/ip/http-client"));
const GattUtils = __importStar(require("hap-controller/lib/transport/ble/gatt-utils"));
let BLEDiscoveryConstructor;
let GattClientConstructor;
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
    'public.hap.service.protocol.information.service',
];
const pairingErrorMessages = {
    1: 'Unknown Error',
    2: 'Setup code or signature verification failed.',
    3: 'Retry later',
    4: 'Device cannot accept any more pairings.',
    5: 'Device reached its maximum number of authentication attempts.',
    6: 'Pairing method is unavailable.',
    7: 'Device is busy and cannot accept a pairing request at this time. Retry later.',
};
function isSetCharacteristicErrorResponse(value) {
    return value &&
        value.characteristics &&
        Array.isArray(value.characteristics) &&
        value.characteristics[0] &&
        value.characteristics[0].status;
}
class HomekitController extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'homekit-controller',
        });
        this.devices = new Map();
        this.stateFunctionsForId = new Map();
        this.lastValues = {};
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
        }
        catch (err) {
            this.log.info(`Can not create pairing data storage directory ${this.instanceDataDir}. Pairing data can not be persisted!`);
        }
        this.bluetoothQueue = new p_queue_1.default({ concurrency: 1, timeout: 45000, throwOnTimeout: true });
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
            for (const hapDevice of this.devices.values()) {
                if (!hapDevice.pairingData)
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
        if (this.config.discoverBle) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                GattClientConstructor = require('hap-controller').GattClient;
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                BLEDiscoveryConstructor = require('hap-controller').BLEDiscovery;
            }
            catch (err) {
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
            this.discoveryIp = new ip_discovery_1.default();
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
            if (devices.length) {
                this.log.debug('Init ' + devices.length + ' known devices without discovery ...');
                for (const device of devices) {
                    const hapDevice = {
                        serviceType: device.native.serviceType,
                        id: device.native.id,
                        connected: false,
                        service: device.native.lastService || undefined,
                        pairingData: device.native.pairingData,
                        initInProgress: false,
                    };
                    this.log.debug(`Init ${hapDevice.id} as known device`);
                    await this.initDevice(hapDevice);
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
        var _a, _b;
        try {
            if (this.discoveryBle) {
                this.discoveryBle.stop();
            }
            if (this.discoveryIp) {
                this.discoveryIp.stop();
            }
            for (const hapDevice of this.devices.values()) {
                if (!hapDevice.connected)
                    continue;
                if (hapDevice.serviceType === 'IP') {
                    try {
                        await ((_a = hapDevice.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = hapDevice.client) === null || _a === void 0 ? void 0 : _a.unsubscribeCharacteristics()); }));
                    }
                    catch {
                        // ignore
                    }
                }
                (_b = hapDevice.client) === null || _b === void 0 ? void 0 : _b.close();
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
                    if ((_a = stateFunctions.converter) === null || _a === void 0 ? void 0 : _a.write) {
                        value = stateFunctions.converter.write(value);
                    }
                    stateFunctions.stateChangeFunction(value);
                }
            }
        }
        else {
            this.log.debug(`state ${id} deleted`);
        }
    }
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
                        const unavailableDevices = [];
                        const availableDevices = [];
                        const pairedDevices = [];
                        for (const hapDevice of this.devices.values()) {
                            const deviceData = {
                                id: hapDevice.id,
                                serviceType: hapDevice.serviceType,
                                connected: hapDevice.connected,
                                discovered: !!hapDevice.service,
                                availableToPair: (_a = hapDevice.service) === null || _a === void 0 ? void 0 : _a.availableToPair,
                                discoveredName: (_b = hapDevice.service) === null || _b === void 0 ? void 0 : _b.name,
                                discoveredCategory: ((_c = hapDevice.service) === null || _c === void 0 ? void 0 : _c.ci) ? (0, category_1.categoryFromId)((_d = hapDevice.service) === null || _d === void 0 ? void 0 : _d.ci) : 'Unknown',
                                pairedWithThisInstance: !!hapDevice.pairingData,
                            };
                            if (deviceData.availableToPair) {
                                availableDevices.push(deviceData);
                            }
                            else if (deviceData.pairedWithThisInstance) {
                                pairedDevices.push(deviceData);
                            }
                            else {
                                unavailableDevices.push(deviceData);
                            }
                            response.devices = [...pairedDevices, ...availableDevices, ...unavailableDevices];
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
            if (hapDevice.serviceType === 'IP') {
                if (hapDevice.service &&
                    hapDevice.service['c#'] === service['c#']) {
                    this.log.debug(`${id} Discovery device update, unchanged config-number, ignore`);
                    return;
                }
            }
            else if (hapDevice.serviceType === 'BLE') {
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
    getPairingDataFilename(id) {
        const fileName = `${id.replace(/:/g, '-')}.json`;
        return path.join(this.instanceDataDir, fileName);
    }
    storePairingData(device) {
        if (!device.pairingData) {
            return;
        }
        try {
            fs.writeFileSync(this.getPairingDataFilename(device.id), JSON.stringify(device.pairingData), 'utf-8');
        }
        catch (err) {
            this.log.info(`${device.id} Could not store pairing data to disk`);
        }
    }
    loadPairingData(device) {
        try {
            const data = fs.readFileSync(this.getPairingDataFilename(device.id), 'utf-8');
            return JSON.parse(data);
        }
        catch (err) {
            this.log.info(`${device.id} Could not load pairing data from disk`);
            return;
        }
    }
    storedPairingDataExists(device) {
        try {
            return fs.existsSync(this.getPairingDataFilename(device.id));
        }
        catch (err) {
            return false;
        }
    }
    deleteStoredPairingData(device) {
        try {
            fs.unlinkSync(this.getPairingDataFilename(device.id));
        }
        catch {
            // ignore
        }
    }
    async initDevice(device) {
        var _a, _b, _c, _d;
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
            (_b = device.client) === null || _b === void 0 ? void 0 : _b.close();
            delete device.client;
            this.setDeviceConnected(device, false);
        }
        else {
            if (!device.pairingData) {
                const pairingDataFileExists = this.storedPairingDataExists(device);
                if (device.service && !device.service.availableToPair) {
                    if (pairingDataFileExists) {
                        device.pairingData = this.loadPairingData(device);
                    }
                    if (!device.pairingData) {
                        this.log.info(`${device.id} (${device.service.name}) found without known pairing data and already paired: ignoring`);
                        device.initInProgress = false;
                        return;
                    }
                    else {
                        this.log.info(`${device.id} Found stored Pairing data, try it ...`);
                    }
                }
                else {
                    this.log.info(`${device.id} (${(_c = device.service) === null || _c === void 0 ? void 0 : _c.name}) found without pairing data but available for pairing: Create basic objects`);
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
            const deviceData = await ((_d = device.clientQueue) === null || _d === void 0 ? void 0 : _d.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.getAccessories()); }));
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
            await this.initSubscriptions(device);
            this.scheduleCharacteristicsUpdate(device);
            this.storePairingData(device);
        }
        catch (err) {
            this.log.info(`${device.id} Could not initialize device: ${err.message} ${err.stack}`);
            this.setDeviceConnected(device, false);
        }
        device.initInProgress = false;
    }
    initDeviceClient(device) {
        if (device.serviceType === 'IP') {
            const service = device.service;
            this.log.debug(`${device.id} Start Homekit Device Client initialization on ${service.address}:${service.port}`);
            device.client = device.client || new http_client_1.default(service.id, service.address, service.port, device.pairingData || undefined, {
                usePersistentConnections: true,
            });
            device.clientQueue = new p_queue_1.default({ concurrency: 10, timeout: 120000, throwOnTimeout: true });
        }
        else if (device.serviceType === 'BLE') {
            if (!this.config.discoverBle || !GattClientConstructor) {
                this.log.info(`Could not initialize device ${device.id} because BLE discovery is not activated. Skipping device`);
                return false;
            }
            // Don't use `as` to remove undefined from the type. Append `!` to do that, e.g.
            // const service = device.service!;
            // Or just assign and check:
            const service = device.service;
            if (!(service === null || service === void 0 ? void 0 : service.peripheral)) {
                if (!this.config.discoverBle) {
                    this.log.warn(`${device.id} Can not initialize BLE device because BLE discovery is turned off!`);
                }
                else {
                    this.log.debug(`${device.id} Waiting for BLE discovery of this device for proper initialization`);
                }
                return false;
            }
            this.log.debug(`${device.id} Start Homekit Device Client initialization`);
            device.client = device.client || new GattClientConstructor(service.id, service.peripheral, device.pairingData);
            device.clientQueue = this.bluetoothQueue;
        }
        else {
            return false;
        }
        return true;
    }
    initSupportingMaps(device, accessoryObjects) {
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
            this.log.debug(`Device ${device.id} no subscriptions to initialize`);
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
                await ((_a = device.clientQueue) === null || _a === void 0 ? void 0 : _a.add(async () => { var _a; return await ((_a = device.client) === null || _a === void 0 ? void 0 : _a.subscribeCharacteristics(formerSubscribes)); }));
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
            var _a;
            let requestedCharacteristics = device.dataPollingCharacteristics;
            if (requestedCharacteristics) {
                this.log.debug(`Device ${device.id} Scheduled Characteristic update started ...`);
                if (aid) {
                    if (device.serviceType === 'IP') {
                        // This should become better in TS 4.5, for now you actually need the `as` here.
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
                    this.setDeviceConnected(device, true);
                }
                catch (err) {
                    this.log.info(`Device ${device.id} data polling failed: ${(!err.message && err.name === 'TimeoutError') ? 'Timeout' : err.message}`);
                    if (device.serviceType === 'IP') {
                        (_a = device.client) === null || _a === void 0 ? void 0 : _a.closePersistentConnection();
                    }
                    this.setDeviceConnected(device, false);
                }
            }
            this.scheduleCharacteristicsUpdate(device);
        }, delay * 1000);
    }
    setCharacteristicValues(device, values) {
        this.log.debug(`${device.id} Set Values to ioBroker: ${JSON.stringify(values.characteristics)}`);
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
                if (!this.config.updateOnlyChangedValues || (this.config.updateOnlyChangedValues && value !== this.lastValues[stateId])) {
                    this.setState(stateId, value, true);
                    this.lastValues[stateId] = value;
                }
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
        objs.set(device.id, ObjectDefaults.getFolderObject(`${(_a = device.service) === null || _a === void 0 ? void 0 : _a.name} (${device.id})`, undefined, hapNative));
        objs.set(`${device.id}.info`, ObjectDefaults.getChannelObject('Information'));
        objs.set(`${device.id}.info.connectionType`, ObjectDefaults.getStateObject('string', 'Connection type', device.serviceType, { def: device.serviceType, write: false }));
        objs.set(`${device.id}.info.id`, ObjectDefaults.getStateObject('string', 'HAP ID', (_b = device.service) === null || _b === void 0 ? void 0 : _b.id, { write: false }));
        if (device.serviceType === 'IP') {
            objs.set(`${device.id}.info.address`, ObjectDefaults.getStateObject('string', 'IP Address', (_c = device.service) === null || _c === void 0 ? void 0 : _c.address, { role: 'info.ip', write: false }));
        }
        objs.set(`${device.id}.info.connected`, ObjectDefaults.getStateObject('indicator', 'Connected', device.connected, { write: false }));
        objs.set(`${device.id}.admin`, ObjectDefaults.getChannelObject('Administration'));
        objs.set(`${device.id}.admin.isPaired`, ObjectDefaults.getStateObject('indicator', 'Paired with this Instance?', !!device.pairingData));
        objs.set(`${device.id}.info.lastDiscovered`, ObjectDefaults.getStateObject('timestamp', 'Last Discovered', Date.now()));
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
            var _a;
            let accessoryNameId;
            accessory.services.forEach((service) => {
                var _a;
                let serviceName = (0, service_1.serviceFromUuid)(service.type);
                if (ignoredHapServices.includes(serviceName) || !service.type) {
                    return;
                }
                if (serviceName.startsWith('public.hap.service.')) {
                    serviceName = serviceName.substr(19).replace(/\./g, '-'); // remove public.hap.service.
                }
                let nameId;
                let serviceObjName;
                service.characteristics.forEach((characteristic) => {
                    const id = ObjectMapper.addCharacteristicObjects(device, objs, accessory, service, characteristic);
                    if ((id === null || id === void 0 ? void 0 : id.endsWith('.name')) && (id === null || id === void 0 ? void 0 : id.includes('.accessory-information'))) {
                        accessoryNameId = id;
                    }
                    else if (id === null || id === void 0 ? void 0 : id.endsWith('.name')) {
                        nameId = id;
                    }
                });
                if (nameId) {
                    serviceObjName = (_a = objs.get(nameId)) === null || _a === void 0 ? void 0 : _a.native.value;
                }
                else {
                    serviceObjName = `${serviceName} ${service.iid}`;
                }
                objs.set(`${device.id}.${accessory.aid}.${serviceName}-${service.iid}`, ObjectDefaults.getChannelObject(serviceObjName));
            });
            let accessoryObjName;
            if (accessoryNameId) {
                accessoryObjName = (_a = objs.get(accessoryNameId)) === null || _a === void 0 ? void 0 : _a.native.value;
            }
            if (!accessoryObjName) {
                accessoryObjName = `Accessory ${accessory.aid}`;
            }
            objs.set(`${device.id}.${accessory.aid}`, ObjectDefaults.getDeviceObject(accessoryObjName));
        });
        return objs;
    }
    async createObjects(device, objs) {
        var _a, _b;
        for (const [objId, obj] of objs) {
            const stateId = `${this.namespace}.${objId}`;
            if (obj.type === 'state' && !this.stateFunctionsForId.get(stateId)) {
                const stateFuncs = {};
                if (objId.endsWith('.identify') && objId.includes('.accessory-information-')) {
                    continue;
                }
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
                                if (isSetCharacteristicErrorResponse(res)) {
                                    this.log.info(`State update for ${objId} (${hapId}) failed with status ${res.characteristics[0].status}: ${
                                    // Converting the thing you're indexing into any allows you to access what you want without TypeScript screaming
                                    IPConstants.HapStatusCodes[res.characteristics[0].status]}`);
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
                                value: GattUtils.valueToBuffer(value, obj.native.format)
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
                if ((_b = stateFunc === null || stateFunc === void 0 ? void 0 : stateFunc.converter) === null || _b === void 0 ? void 0 : _b.read) {
                    valueToSet = stateFunc.converter.read(valueToSet);
                }
                await this.setStateAsync(objId, valueToSet, true);
                this.lastValues[objId] = valueToSet;
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
                    this.log.info(`Cannot retrieve IP PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}, try default`);
                    pairMethod = pairing_protocol_1.PairMethods.PairSetup;
                }
            }
        }
        else {
            if (this.discoveryBle) {
                try {
                    pairMethod = await this.discoveryBle.getPairMethod(device.service);
                }
                catch (err) {
                    this.log.info(`Cannot retrieve BLE PairMethod for device ${device.id} because of error ${err.statusCode}: ${err.message}, try default`);
                    pairMethod = pairing_protocol_1.PairMethods.PairSetup;
                }
            }
        }
        this.log.info(`Use PairMethod ${pairMethod} to pair ${device.id}`);
        if (!this.initDeviceClient(device) || !device.client) {
            throw new Error(`Cannot pair with device ${device.id} because Client initialization not successful`);
        }
        try {
            await device.client.pairSetup(pin.toString(), pairMethod);
        }
        catch (err) {
            throw new Error(`Cannot pair with device ${device.id} because of error ${err.statusCode} (${pairingErrorMessages[err.statusCode]}): ${err.message}`);
        }
        const pairingData = device.client.getLongTermData();
        if (!pairingData) {
            throw new Error(`No pairing data retrieved after pair for device ${device.id}. Aborting.`);
        }
        else {
            this.log.info(`${device.id} Successfully paired to device: ${JSON.stringify(pairingData)}`);
        }
        device.pairingData = pairingData;
        device.service.availableToPair = false;
        this.storePairingData(device);
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
        delete device.pairingData;
        this.deleteStoredPairingData(device);
        if (device.service) {
            device.service.availableToPair = false;
        }
        device.client.removeAllListeners('event');
        device.client.removeAllListeners('event-disconnect');
        delete device.client;
        this.setDeviceConnected(device, false);
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
                client = new http_client_1.default(device.service.id, device.service.address, device.service.port);
            }
            else if (GattClientConstructor) {
                client = new GattClientConstructor(device.service.id, device.service.peripheral);
            }
            await (client === null || client === void 0 ? void 0 : client.identify());
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