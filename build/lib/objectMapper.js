"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCharacteristicObjects = exports.addServiceObjects = exports.addAccessoryObjects = void 0;
const category_1 = require("hap-controller/lib/model/category");
const service_1 = require("hap-controller/lib/model/service");
const characteristic_1 = require("hap-controller/lib/model/characteristic");
const objectDefaults_1 = require("./objectDefaults");
const HapDataTypeMap = {
    'bool': 'boolean',
    'uint8': 'number',
    'uint16': 'number',
    'uint32': 'number',
    'uint64': 'number',
    'int': 'number',
    'float': 'number',
    'string': 'string',
    'tlv8': 'string',
    'data': 'string',
};
const HapUnitMap = {
    'celsius': '°C',
    'percentage': '%',
    'arcdegrees': '°',
    'lux': 'lx',
    'seconds': 's',
};
const CharacteristicToIoBrokerMap = {
    'public.hap.characteristic.brightness': { role: 'level.dimmer' },
    'public.hap.characteristic.door-state.current': { states: { '0': 'Open', '1': 'Closed', '2': 'Opening', '3': 'Closing', '4': 'Stopped' } },
    'public.hap.characteristic.heating-cooling.current': { states: { '0': 'Off', '1': 'Heat', '2': 'Cool' } },
    'public.hap.characteristic.relative-humidity.current': { role: 'value.humidity' },
    'public.hap.characteristic.temperature.current': { role: 'value.temperature' },
    'public.hap.characteristic.hue': { role: 'level.color.hue' },
    'public.hap.characteristic.identify': {},
    'public.hap.characteristic.lock-management.control-point': { type: 'object' },
    'public.hap.characteristic.lock-management.auto-secure-timeout': { role: 'level.timer' },
    'public.hap.characteristic.lock-mechanism.last-known-action': { states: { '0': 'Secured using physical movement, interior', '1': 'Unsecured using physical movement, interior', '2': 'Secured using physical movement, exterior', '3': 'Unsecured using physical movement, exterior', '4': 'Secured with keypad', '5': 'Unsecured with keypad', '6': 'Secured remotely', '7': 'Unsecured remotely', '8': 'Secured with Automatic Secure timeout' } },
    'public.hap.characteristic.lock-mechanism.current-state': { role: 'value.lock', states: { '0': 'Unsecured', '1': 'Secured', '2': 'Jammed', '3': 'Unknown' } },
    'public.hap.characteristic.lock-mechanism.target-state': { role: 'sensor.lock', convert: 'number-to-boolean' /*states: {'0': 'Unsecured', '1': 'Secured'}*/ },
    'public.hap.characteristic.logs': { role: 'object' },
    'public.hap.characteristic.motion-detected': { roles: 'sensor.motion' },
    'public.hap.characteristic.obstruction-detected': { role: 'sensor.alarm' },
    'public.hap.characteristic.rotation.direction': { states: { '0': 'Clockwise', '1': 'Counter-clockwise' } },
    'public.hap.characteristic.saturation': { role: 'level.color.saturation' },
    'public.hap.characteristic.door-state.target': { role: 'switch.lock', convert: 'number-to-boolean-invert' /*states: {'0': 'Open', '1': 'Closed'}*/ },
    'public.hap.characteristic.heating-cooling.target': { states: { '0': 'Off', '1': 'Heat', '2': 'Cool', '3': 'Auto' } },
    'public.hap.characteristic.temperature.target': { role: 'level.temperature' },
    'public.hap.characteristic.temperature.units': { states: { '0': 'Celsius', '1': 'Fahrenheit' } },
    //[`0000004C${UuidSuffix}`]: 'public.hap.characteristic.pairing.pair-setup', // TODO IGNORE
    //[`0000004E${UuidSuffix}`]: 'public.hap.characteristic.pairing.pair-verify', // TODO IGNORE
    //[`0000004F${UuidSuffix}`]: 'public.hap.characteristic.pairing.features', // TODO IGNORE
    //'public.hap.characteristic.pairing.pairings': {type: 'object'}, // 50 // TODO IGNORE
    //[`0000005C${UuidSuffix}`]: 'public.hap.characteristic.relay-state', // TODO UNKNOWN
    'public.hap.characteristic.relay-control-point': { type: 'object' },
    'public.hap.characteristic.air-particulate.density': { unit: 'micrograms/m3' },
    'public.hap.characteristic.air-particulate.size': { states: { '0': '2.5 Micrometers', '1': '10 Micrometers' } },
    'public.hap.characteristic.security-system-state.current': { states: { '0': 'Stay Arm', '1': 'Away Arm', '2': 'Night Arm', '3': 'Disarmed', '4': 'Alarm Triggered' } },
    'public.hap.characteristic.security-system-state.target': { states: { '0': 'Stay Arm', '1': 'Away Arm', '2': 'Night Arm', '3': 'Disarmed' } },
    'public.hap.characteristic.battery-level': { role: 'value.battery' },
    'public.hap.characteristic.carbon-monoxide.detected': { convert: 'number-to-boolean' /*states: {'0': 'Carbon Monoxide levels are normal', '1': 'Carbon Monoxide levels are abnormal'}*/ },
    'public.hap.characteristic.contact-state': { convert: 'number-to-boolean' /*states: {'0': 'Contact is detected', '1': 'Contact is not detected'}*/ },
    'public.hap.characteristic.light-level.current': { role: 'value.brightness' },
    'public.hap.characteristic.horizontal-tilt.current': { role: 'value.tilt' },
    'public.hap.characteristic.vertical-tilt.current': { role: 'value.tilt' },
    'public.hap.characteristic.leak-detected': { role: 'sensor.alarm.flood', convert: 'number-to-boolean' /*states: {'0': 'Leak is not detected', '1': 'Leak is detected'}*/ },
    'public.hap.characteristic.occupancy-detected': { convert: 'number-to-boolean' /*states: {'0': 'Occupancy is not detected', '1': 'Occupancy is detected'}*/ },
    'public.hap.characteristic.position.state': { states: { '0': 'Decreasing', '1': 'Increasing', '2': 'Stopped' } },
    'public.hap.characteristic.input-event': { states: { '0': 'Single Press', '1': 'Double Press', '2': 'Long Press' } },
    //[`00000074${UuidSuffix}`]: 'public.hap.characteristic.programmable-switch-output-state', // TODO UNKNOWN
    'public.hap.characteristic.smoke-detected': { role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'Smoke is not detected', '1': 'Smoke is detected'}*/ },
    'public.hap.characteristic.status-fault': { role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'No Fault', '1': 'General Fault'}*/ },
    'public.hap.characteristic.status-jammed': { role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'Not Jammed', '1': 'Jammed'}*/ },
    'public.hap.characteristic.status-lo-batt': { role: 'indicator.lowbat', convert: 'number-to-boolean' /*states: {'0': 'Battery level is normal', '1': 'Battery level is low'}*/ },
    'public.hap.characteristic.status-tampered': { role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'Accessory is not tampered', '1': 'Accessory is tampered with'}*/ },
    'public.hap.characteristic.horizontal-tilt.target': { role: 'level.tilt' },
    'public.hap.characteristic.position.target': { role: 'value.position' },
    'public.hap.characteristic.vertical-tilt.target': { role: 'level.tilt' },
    'public.hap.characteristic.security-system.alarm-type': { role: 'sensor.alarm', convert: 'number-to-boolean' },
    'public.hap.characteristic.charging-state': { states: { '0': 'Not Charging', '1': 'Charging', '2': 'Not Chargeable' } },
    'public.hap.characteristic.carbon-monoxide.level': { unit: 'ppm' },
    'public.hap.characteristic.carbon-monoxide.peak-level': { unit: 'ppm' },
    'public.hap.characteristic.carbon-dioxide.detected': { convert: 'number-to-boolean' /*states: {'0': 'Carbon Dioxide levels are normal', '1': 'Carbon Dioxide levels are abnormal'}*/ },
    'public.hap.characteristic.carbon-dioxide.level': { unit: 'ppm' },
    'public.hap.characteristic.carbon-dioxide.peak-level': { unit: 'ppm' },
    'public.hap.characteristic.air-quality': { states: { '0': 'Unknown', '1': 'Excellent', '2': 'Good', '3': 'Fair', '4': 'Inferior', '5': 'Poor' } },
    'public.hap.characteristic.configure-bridged-accessory-status': { type: 'object' },
    'public.hap.characteristic.configure-bridged-accessory': { type: 'object' },
    'public.hap.characteristic.app-matching-identifier': { type: 'object' },
    'public.hap.characteristic.accessory-properties': { states: { '1': 'Requires additional setup' } },
    'public.hap.characteristic.lock-physical-controls': { convert: 'number-to-boolean' /*states: {'0': 'Control lock disabled', '1': 'Control lock enabled'}*/ },
    'public.hap.characteristic.air-purifier.state.target': { states: { '0': 'Manual', '1': 'Auto' } },
    'public.hap.characteristic.air-purifier.state.current': { states: { '0': 'Inactive', '1': 'Idle', '2': 'Purifying Air' } },
    'public.hap.characteristic.slat.state.current': { states: { '0': 'Fixed', '1': 'Jammed', '2': 'Swinging' } },
    'public.hap.characteristic.filter.change-indication': { convert: 'number-to-boolean' /*states: {'0': 'Filter does not need to be changed', '1': 'Filter needs to be changed'}*/ },
    'public.hap.characteristic.filter.reset-indication': { role: 'button', convert: 'number-to-boolean' },
    'public.hap.characteristic.air-quality.target': { states: { '0': 'Excellent', '1': 'Good', '2': 'Fair' } },
    'public.hap.characteristic.fan.state.current': { states: { '0': 'Inactive', '1': 'Idle', '2': 'Blowing Air' } },
    'public.hap.characteristic.active': { convert: 'number-to-boolean' /*states: {'0': 'Inactive', '1': 'Active'}*/ },
    'public.hap.characteristic.heater-cooler.state.current': { states: { '0': 'Inactive', '1': 'Idle', '2': 'Heating', '3': 'Cooling' } },
    'public.hap.characteristic.heater-cooler.state.target': { states: { '0': 'Auto', '1': 'Heat', '2': 'Cool' } },
    'public.hap.characteristic.humidifier-dehumidifier.state.current': { states: { '0': 'Inactive', '1': 'Idle', '2': 'Humidifying', '3': 'Dehumidifying' } },
    'public.hap.characteristic.humidifier-dehumidifier.state.target': { states: { '0': 'Auto', '1': 'Humidifier', '2': 'Dehumidifier' } },
    'public.hap.characteristic.water-level': { role: 'value.water' },
    'public.hap.characteristic.swing-mode': { convert: 'number-to-boolean' /*states: {'0': 'Swing disabled', '1': 'Swing enabled'}*/ },
    'public.hap.characteristic.slat.state.target': { states: { '0': 'Manual', '1': 'Auto' } },
    'public.hap.characteristic.fan.state.target': { states: { '0': 'Manual', '1': 'Auto' } },
    'public.hap.characteristic.type.slat': { states: { '0': 'Horizontal', '1': 'Vertical' } },
    'public.hap.characteristic.tilt.current': { role: 'level.tilt' },
    'public.hap.characteristic.tilt.target': { role: 'value.tilt' },
    'public.hap.characteristic.density.ozone': { unit: 'micrograms/m3' },
    'public.hap.characteristic.density.no2': { unit: 'micrograms/m3' },
    'public.hap.characteristic.density.so2': { unit: 'micrograms/m3' },
    'public.hap.characteristic.density.pm25': { unit: 'micrograms/m3' },
    'public.hap.characteristic.density.pm10': { unit: 'micrograms/m3' },
    'public.hap.characteristic.density.voc': { unit: 'micrograms/m3' },
    'public.hap.characteristic.service-label-namespace': { states: { '0': 'Dots', '1': 'Arabic numerals' } },
    //'public.hap.characteristic.color-temperature', // CE - special calculation? S. 168
    'public.hap.characteristic.program-mode': { states: { '0': 'No Programs Scheduled', '1': 'Program Scheduled', '2': 'Program Scheduled, currently overridden to manual mode' } },
    'public.hap.characteristic.in-use': { convert: 'number-to-boolean' /*states: {'0': 'Not in use', '1': 'In use'}*/ },
    'public.hap.characteristic.set-duration': { unit: 'sec' },
    'public.hap.characteristic.valve-type': { states: { '0': 'Generic valve', '1': 'Irrigation', '2': 'Shower head', '3': 'Water faucet' } },
    'public.hap.characteristic.is-configured': { convert: 'number-to-boolean' /*states: {'0': 'Not Configured', '1': 'Configured'}*/ },
    'public.hap.characteristic.input-source-type': { states: { '0': 'Other', '1': 'Home-Screen', '2': 'Tuner', '3': 'HDMI', '4': 'Composite Video', '5': 'S-Video', '6': 'Component Video', '7': 'DVI', '8': 'AirPlay', '9': 'USB', '10': 'Application' } },
    'public.hap.characteristic.input-device-type': { states: { '0': 'Other', '1': 'TV', '2': 'Recording', '3': 'Tuner', '4': 'Playback', '5': 'Audio-System', '6': '6' } },
    'public.hap.characteristic.closed-captions': { convert: 'number-to-boolean' /*states: {'0': 'Disabled', '1': 'Enabled'}*/ },
    'public.hap.characteristic.power-mode-selection': { states: { '0': 'Show', '1': 'Hide' } },
    'public.hap.characteristic.current-media-state': { role: 'media.state', states: { '0': 'Play', '1': 'Pause', '2': 'Stop', '4': 'Loading', '5': 'Interrupted' } },
    'public.hap.characteristic.remote-key': { states: { '0': 'Rewind', '1': 'Fast Forward', '2': 'Next Track', '3': 'Previous Track', '4': 'Arrow Up', '5': 'Arrow Down', '6': 'Arrow Left', '7': 'Arrow Right', '8': 'Select', '9': 'Back', '10': 'Exit', '11': 'Play/Pause', '12': '12', '13': '13', '14': '14', '15': 'Information', '16': '16', } },
    'public.hap.characteristic.picture-mode': { states: { '0': 'Other', '1': 'Standard', '2': 'Calibrated', '3': 'Calibrated Dark', '4': 'Vivid', '5': 'Game', '6': 'Computer', '7': 'Custom', '8': '8', '9': '9', '10': '10', '11': '11', '12': '12', '13': '13' } },
    'public.hap.characteristic.password-setting': { type: 'object' },
    'public.hap.characteristic.access-control-level': { states: { '0': '0', '1': '1', '2': '2' } },
    'public.hap.characteristic.sleep-discovery-mode': { states: { '0': 'Not Discoverable', '1': 'Discoverable' } },
    'public.hap.characteristic.volume-control-type': { states: { '0': 'None', '1': 'Relative', '2': 'Relative with Current', '3': 'Absolute' } },
    'public.hap.characteristic.volume-selector': { states: { '0': 'Increment', '1': 'Decrement' } },
    'public.hap.characteristic.supported-video-stream-configuration': { type: 'object' },
    'public.hap.characteristic.supported-audio-configuration': { type: 'object' },
    'public.hap.characteristic.supported-rtp-configuration': { type: 'object' },
    'public.hap.characteristic.selected-rtp-stream-configuration': { type: 'object' },
    'public.hap.characteristic.setup-endpoints': { type: 'object' },
    'public.hap.characteristic.volume': { role: 'level.volume' },
    'public.hap.characteristic.mute': { role: 'media.mute', convert: 'number-to-boolean' /*states: {'0': 'Mute is Off / Audio is On', '1': 'Mute is On / There is no Audio'}*/ },
    'public.hap.characteristic.image-rotation': { states: { '0': 'No rotation', '90': 'Rotated 90 degrees to the right', '180': 'Rotated 180 degrees to the right (flipped vertically)', '270': 'Rotated 270 degrees to the right' } },
    'public.hap.characteristic.image-mirror': { convert: 'number-to-boolean' /*states: {'0': 'Image is not mirrored', '1': 'Image is mirrored'}*/ },
    'public.hap.characteristic.streaming-status': { type: 'object' },
    'public.hap.characteristic.supported-target-configuration': { type: 'object' },
    'public.hap.characteristic.target-list': { type: 'object' },
    'public.hap.characteristic.button-event': { type: 'object' },
    'public.hap.characteristic.selected-audio-stream-configuration': { type: 'object' },
    'public.hap.characteristic.supported-data-stream-transport-configuration': { type: 'object' },
    'public.hap.characteristic.setup-data-stream-transport': { type: 'object' },
    'public.hap.characteristic.siri.input-type': { states: { '0': 'Push button triggered Apple TV' } },
    'public.hap.characteristic.target-visibility-state': { convert: 'number-to-boolean' /*states: {'0': 'Shown', '1': 'Hidden'}*/ },
    'public.hap.characteristic.current-visibility-state': { convert: 'number-to-boolean' /*states: {'0': 'Shown', '1': 'Hidden'}*/ },
    'public.hap.characteristic.display-order': { type: 'object' },
    'public.hap.characteristic.target-media-state': { states: { '0': 'Play', '1': 'Pause', '2': 'Stop' } },
    'public.hap.characteristic.data-stream.hap-transport': { type: 'object' },
    'public.hap.characteristic.data-stream.hap-transport-interrupt': { type: 'object' },
    //[`00000143${UuidSuffix}`]: 'public.hap.characteristic.characteristic-value-transition-control', // TODO UNKNOWN
    'public.hap.characteristic.supported-characteristic-value-transition-configuration': { type: 'object' },
    'public.hap.characteristic.setup-transfer-transport': { type: 'object' },
    'public.hap.characteristic.supported-transfer-transport-configuration': { type: 'object' },
    'public.hap.characteristic.supported-camera-recording-configuration': { type: 'object' },
    'public.hap.characteristic.supported-video-recording-configuration': { type: 'object' },
    'public.hap.characteristic.supported-audio-recording-configuration': { type: 'object' },
    'public.hap.characteristic.selected-camera-recording-configuration': { type: 'object' },
    'public.hap.characteristic.network-client-control': { type: 'object' },
    'public.hap.characteristic.network-client-status-control': { type: 'object' },
    'public.hap.characteristic.router-status': { states: { '0': 'Ready', '1': 'Not Ready' } },
    'public.hap.characteristic.supported-router-configuration': { type: 'object' },
    'public.hap.characteristic.wan-configuration-list': { type: 'object' },
    'public.hap.characteristic.wan-status-list': { type: 'object' },
    'public.hap.characteristic.managed-network-enable': { convert: 'number-to-boolean' /*states: {'0': 'Disabled', '1': 'Enabled'}*/ },
    'public.hap.characteristic.homekit-camera-active': { convert: 'number-to-boolean' /*states: {'0': 'Off', '1': 'On'}*/ },
    'public.hap.characteristic.third-party-camera-active': { convert: 'number-to-boolean' /*states: {'0': 'Off', '1': 'On'}*/ },
    //[`0000021D${UuidSuffix}`]: 'public.hap.characteristic.camera-operating-mode-indicator', Boolean default
    'public.hap.characteristic.wifi-satellite-status': { states: { '0': 'Unknown', '1': 'Connected', '2': 'Not Connected' } },
    'public.hap.characteristic.network-access-violation-control': { type: 'object' },
    'public.hap.characteristic.product-data': { type: 'string', convert: 'base64' },
    'public.hap.characteristic.wake-configuration': { type: 'object' },
    'public.hap.characteristic.event-snapshots-active': { convert: 'number-to-boolean' /*states: {'0': 'Disable', '1': 'Enable'}*/ },
    //[`00000224${UuidSuffix}`]: 'public.hap.characteristic.diagonal-field-of-view', // TODO UNKNOWN
    'public.hap.characteristic.periodic-snapshots-active': { convert: 'number-to-boolean' /*states: {'0': 'Disable', '1': 'Enable'}*/ },
    'public.hap.characteristic.recording-audio-active': { states: { '0': 'Disable', '1': 'Enable' } },
    'public.hap.characteristic.manually-disabled': { convert: 'number-to-boolean' /*states: {'0': 'Enabled', '1': 'Disabled'}*/ },
    'public.hap.characteristic.video-analysis-active': { convert: 'number-to-boolean' /*states: {'0': 'Enabled', '1': 'Disabled'}*/ },
    //[`0000022B${UuidSuffix}`]: 'public.hap.characteristic.current-transport', // TODO UNKNOWN
    //[`0000022C${UuidSuffix}`]: 'public.hap.characteristic.wifi-capabilities', // TODO UNKNOWN
    'public.hap.characteristic.wifi-configuration-control': { type: 'object' },
    'public.hap.characteristic.operating-state-response': { type: 'object' },
    'public.hap.characteristic.supported-firmware-update-configuration': { type: 'object' },
    'public.hap.characteristic.firmware-update-readiness': { type: 'object' },
    'public.hap.characteristic.firmware-update-status': { type: 'object' },
    'public.hap.characteristic.supported-diagnostics-snapshot': { type: 'object' },
    'public.hap.characteristic.activity-interval': { role: 'value.interval' },
    'public.hap.characteristic.ping': { type: 'string', convert: 'base64' },
    //[`0000023E${UuidSuffix}`]: 'public.hap.characteristic.event-transmission-counters', // TODO UNKNOWN
    //[`00000243${UuidSuffix}`]: 'public.hap.characteristic.maximum-transmit-power', // TODO UNKNOWN
    //[`00000247${UuidSuffix}`]: 'public.hap.characteristic.mac.retransmission-maximum', // TODO UNKNOWN
    'public.hap.characteristic.mac.transmission-counters': { type: 'string', convert: 'base64' },
    //[`0000024A${UuidSuffix}`]: 'public.hap.characteristic.heart-beat' // TODO UNKNOWN
    //[`0000024B${UuidSuffix}`]: 'public.hap.characteristic.characteristic-value-active-transition-count', // TODO UNKNOWN
    //[`0000024C${UuidSuffix}`]: 'public.hap.characteristic.supported-diagnostics-modes', // TODO UNKNOWN
    'public.hap.characteristic.siri.endpoint-session-status': { type: 'object' },
    'public.hap.characteristic.siri.enable': { convert: 'number-to-boolean' },
    'public.hap.characteristic.siri.listening': { convert: 'number-to-boolean' },
    'public.hap.characteristic.siri.touch-to-use': { convert: 'number-to-boolean' },
    'public.hap.characteristic.siri.light-on-use': { convert: 'number-to-boolean' },
    'public.hap.characteristic.air-play.enable': { convert: 'number-to-boolean' /*states: {'0': 'Disabled', '1': 'Enabled'}*/ },
    'public.hap.characteristic.access-code.supported-configuration': { type: 'object' },
    'public.hap.characteristic.access-code.control-point': { type: 'object' },
    'public.hap.characteristic.nfc-access-control-point': { type: 'object' },
    'public.hap.characteristic.nfc-access-supported-configuration': { type: 'object' },
    //[`00000269${UuidSuffix}`]: 'public.hap.characteristic.asset-update-readiness', // TODO UNKNOWN
    //[`0000026B${UuidSuffix}`]: 'public.hap.characteristic.multifunction-button', // TODO UNKNOWN
    'public.hap.characteristic.hardware.finish': { type: 'object' },
    //[`00000702${UuidSuffix}`]: 'public.hap.characteristic.thread.node-capabilities', // TODO UNKNOWN
    //[`00000703${UuidSuffix}`]: 'public.hap.characteristic.thread.status', // TODO UNKNOWN
    'public.hap.characteristic.thread.control-point': { type: 'object' }, // 704
};
function addAccessoryObjects(device, objs, accessory) {
    var _a;
    let accessoryName = `${accessory.aid}`;
    if ((_a = device.service) === null || _a === void 0 ? void 0 : _a.ci) {
        accessoryName = `${(0, category_1.categoryFromId)(device.service.ci)} ${accessoryName}`;
    }
    objs.set(`${device.id}.${accessory.aid}`, (0, objectDefaults_1.getDeviceObject)(accessoryName, undefined, { aid: accessory.aid }));
}
exports.addAccessoryObjects = addAccessoryObjects;
function addServiceObjects(device, objs, accessory, service) {
    let serviceName = (0, service_1.serviceFromUuid)(service.type);
    if (serviceName.startsWith('public.hap.service.')) {
        serviceName = serviceName.substr(19).replace(/\./g, '-'); // remove public.hap.service.
    }
    objs.set(`${device.id}.${accessory.aid}.${serviceName}`, (0, objectDefaults_1.getChannelObject)(`Service ${serviceName}`, undefined, { aid: accessory.aid, iid: service.iid, type: service.type }));
    objs.set(`${device.id}.${accessory.aid}.${serviceName}.serviceIsHidden`, (0, objectDefaults_1.getStateObject)('indicator', 'Is Hidden Service?', !!service.hidden));
    objs.set(`${device.id}.${accessory.aid}.${serviceName}.serviceIsPrimary`, (0, objectDefaults_1.getStateObject)('indicator', 'Is Primary Service?', !!service.primary));
    /* TODO
    const linkedServices = [];
    if (service.linked) {
        for (const serviceId of service.linked) {
            let linkedServiceName = serviceFromUuid(serviceId);
            if (linkedServiceName.startsWith('public.hap.service.')) {
                linkedServiceName = linkedServiceName.substr(19).replace(/\./, '-'); // remove public.hap.service.
            }
            linkedServices.push(linkedServiceName);
        }
    }
    objs.set(`${device.id}.${accessory.aid}.${serviceName}.serviceLinked`, getStateObject('array', 'Linked Services', linkedServices, {write: false}));
    */
}
exports.addServiceObjects = addServiceObjects;
function addCharacteristicObjects(device, objs, accessory, service, characteristic) {
    if (!characteristic.type) {
        return;
    }
    let serviceName = (0, service_1.serviceFromUuid)(service.type);
    if (serviceName.startsWith('public.hap.service.')) {
        serviceName = serviceName.substr(19).replace(/\./g, '-'); // remove public.hap.service.
    }
    let characteristicName = (0, characteristic_1.characteristicFromUuid)(characteristic.type);
    const iobrokerCommon = CharacteristicToIoBrokerMap[characteristicName] || {};
    if (characteristicName.startsWith('public.hap.characteristic.')) {
        characteristicName = characteristicName.substr(26).replace(/\./g, '-'); // remove public.hap.characteristic.
    }
    const convertLogic = iobrokerCommon.convert;
    delete iobrokerCommon.convert;
    const characteristicCommon = getCommonForCharacteristic(characteristic);
    if (characteristicCommon.states && iobrokerCommon.states) {
        const targetStates = {};
        for (const key of Object.keys(characteristicCommon.states)) {
            targetStates[key] = iobrokerCommon.states[key] || characteristicCommon.states[key];
        }
        delete iobrokerCommon.states;
        characteristicCommon.states = targetStates;
    }
    const objCommon = Object.assign(characteristicCommon, iobrokerCommon);
    switch (convertLogic) {
        case 'number-to-boolean':
        case 'number-to-boolean-invert':
            objCommon.type = 'boolean';
            break;
        case 'base64':
            objCommon.type = 'string';
            break;
    }
    const objNative = characteristic;
    objNative.convertLogic = convertLogic;
    if (!objCommon.role) {
        objCommon.role = getRole(objCommon);
    }
    objNative.aid = accessory.aid;
    objNative.serviceUuid = service.type;
    objs.set(`${device.id}.${accessory.aid}.${serviceName}.${characteristicName}`, (0, objectDefaults_1.getStateObject)('state', characteristicName, characteristic.value, objCommon, objNative));
}
exports.addCharacteristicObjects = addCharacteristicObjects;
function getCommonForCharacteristic(characteristic) {
    var _a, _b;
    const common = {
        read: !!((_a = characteristic.perms) === null || _a === void 0 ? void 0 : _a.includes('pr')),
        write: !!((_b = characteristic.perms) === null || _b === void 0 ? void 0 : _b.includes('pw')),
        desc: characteristic.description,
        type: characteristic.format ? HapDataTypeMap[characteristic.format] : 'mixed',
        unit: characteristic.unit ? HapUnitMap[characteristic.unit] : undefined,
        min: characteristic.minValue,
        max: characteristic.maxValue,
        step: characteristic.minStep,
        role: '',
        name: ''
    };
    if (characteristic['valid-values-range']) {
        common.min = characteristic['valid-values-range'][0];
        common.max = characteristic['valid-values-range'][1];
    }
    if (characteristic['valid-values']) {
        common.states = {};
        for (const vv of characteristic['valid-values']) {
            common.states[vv] = vv.toString();
        }
    }
    return common;
}
function getRole(common) {
    // Try to set roles
    let role = '';
    if (common.type === 'boolean') {
        if (common.read && !common.write) { // Boolean, read-only --> Sensor OR Indicator!
            role = 'sensor';
        }
        else if (common.write && !common.read) { // Boolean, write-only --> Button
            role = 'button';
        }
        else if (common.read && common.write) { // Boolean, read-write --> Switch
            role = 'switch';
        }
    }
    else if (common.type === 'number') {
        if (common.read && !common.write) { // Number, read-only --> Value
            role = 'value';
        }
        else if (common.write && !common.read) { // Boolean, write-only --> ?? Level?
            role = 'level';
        }
        else if (common.read && common.write) { // Number, read-write --> Level
            role = 'level';
        }
    }
    else if (common.type === 'string') {
        role = 'text';
    }
    if (!role) {
        role = 'state'; // Fallback is generic "state"
    }
    return role;
}
//# sourceMappingURL=objectMapper.js.map