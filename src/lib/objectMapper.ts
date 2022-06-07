import { AccessoryObject } from 'hap-controller/lib/model/accessory';
import { categoryFromId } from 'hap-controller/lib/model/category';
import { ServiceObject, serviceFromUuid } from 'hap-controller/lib/model/service';
import { characteristicFromUuid, CharacteristicObject } from 'hap-controller/lib/model/characteristic';
import { getChannelObject, getDeviceObject, getStateObject } from './objectDefaults';
import { HapDevice } from '../main';

const HapDataTypeMap: Record<string, string> = {
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

const HapUnitMap: Record<string, string> = {
    'celsius': '°C',
    'percentage': '%',
    'arcdegrees': '°',
    'lux': 'lx',
    'seconds': 's',
};

const CharacteristicToIoBrokerMap: Record<string, Record<string, unknown>> = {
    'public.hap.characteristic.brightness': {role: 'level.dimmer'}, // 08
    'public.hap.characteristic.door-state.current': {states: {'0': 'Open', '1': 'Closed', '2': 'Opening', '3': 'Closing', '4': 'Stopped'}}, // 0E
    'public.hap.characteristic.heating-cooling.current': {states: {'0': 'Off', '1': 'Heat', '2': 'Cool'}}, // 0F
    'public.hap.characteristic.relative-humidity.current': {role: 'value.humidity'}, // 10
    'public.hap.characteristic.temperature.current': {role: 'value.temperature'}, // 11
    'public.hap.characteristic.hue': {role: 'level.color.hue'}, // 13
    'public.hap.characteristic.identify': {}, // 14 - TODO Call identify routine
    'public.hap.characteristic.lock-management.control-point': {type: 'object'}, // 19
    'public.hap.characteristic.lock-management.auto-secure-timeout': {role: 'level.timer'}, // 1A
    'public.hap.characteristic.lock-mechanism.last-known-action': {states: {'0': 'Secured using physical movement, interior', '1': 'Unsecured using physical movement, interior', '2': 'Secured using physical movement, exterior', '3': 'Unsecured using physical movement, exterior', '4': 'Secured with keypad', '5': 'Unsecured with keypad', '6': 'Secured remotely', '7': 'Unsecured remotely', '8': 'Secured with Automatic Secure timeout'}}, // 1C
    'public.hap.characteristic.lock-mechanism.current-state': {role: 'value.lock', states: {'0': 'Unsecured', '1': 'Secured', '2': 'Jammed', '3': 'Unknown'}}, // 1D
    'public.hap.characteristic.lock-mechanism.target-state': {role: 'sensor.lock', convert: 'number-to-boolean' /*states: {'0': 'Unsecured', '1': 'Secured'}*/}, // 1E
    'public.hap.characteristic.logs': {role: 'object'}, // 1F
    'public.hap.characteristic.motion-detected': {roles: 'sensor.motion'}, // 22
    'public.hap.characteristic.obstruction-detected': {role: 'sensor.alarm'}, // 24
    'public.hap.characteristic.rotation.direction': {states: {'0': 'Clockwise', '1': 'Counter-clockwise'}}, // 28
    'public.hap.characteristic.saturation': {role: 'level.color.saturation'}, // 2F
    'public.hap.characteristic.serial-number': {role: 'info.serial'}, // 30
    'public.hap.characteristic.door-state.target': {role: 'switch.lock', convert: 'number-to-boolean-invert' /*states: {'0': 'Open', '1': 'Closed'}*/}, // 32
    'public.hap.characteristic.heating-cooling.target': {states: {'0': 'Off', '1': 'Heat', '2': 'Cool', '3': 'Auto'}}, // 33
    'public.hap.characteristic.temperature.target': {role: 'level.temperature'}, // 35
    'public.hap.characteristic.temperature.units': {states: {'0': 'Celsius', '1': 'Fahrenheit'}}, // 36
    //[`0000004C${UuidSuffix}`]: 'public.hap.characteristic.pairing.pair-setup', // TODO IGNORE
    //[`0000004E${UuidSuffix}`]: 'public.hap.characteristic.pairing.pair-verify', // TODO IGNORE
    //[`0000004F${UuidSuffix}`]: 'public.hap.characteristic.pairing.features', // TODO IGNORE
    //'public.hap.characteristic.pairing.pairings': {type: 'object'}, // 50 // TODO IGNORE
    //[`0000005C${UuidSuffix}`]: 'public.hap.characteristic.relay-state', // TODO UNKNOWN
    'public.hap.characteristic.firmware.revision': {role: 'info.firmware'}, // 52
    'public.hap.characteristic.hardware.revision': {role: 'info.hardware'}, // 53
    'public.hap.characteristic.relay-control-point': {type: 'object'}, // 5E
    'public.hap.characteristic.air-particulate.density': {unit: 'micrograms/m3'}, // 64
    'public.hap.characteristic.air-particulate.size': {states: {'0': '2.5 Micrometers', '1': '10 Micrometers'}}, // 65
    'public.hap.characteristic.security-system-state.current': {states: {'0': 'Stay Arm', '1': 'Away Arm', '2': 'Night Arm', '3': 'Disarmed', '4': 'Alarm Triggered'}}, // 66
    'public.hap.characteristic.security-system-state.target': {states: {'0': 'Stay Arm', '1': 'Away Arm', '2': 'Night Arm', '3': 'Disarmed'}}, // 67
    'public.hap.characteristic.battery-level': {role: 'value.battery'}, // 68
    'public.hap.characteristic.carbon-monoxide.detected': {convert: 'number-to-boolean' /*states: {'0': 'Carbon Monoxide levels are normal', '1': 'Carbon Monoxide levels are abnormal'}*/}, // 69
    'public.hap.characteristic.contact-state': {convert: 'number-to-boolean' /*states: {'0': 'Contact is detected', '1': 'Contact is not detected'}*/ }, // 6A
    'public.hap.characteristic.light-level.current': {role: 'value.brightness'}, // 6B
    'public.hap.characteristic.horizontal-tilt.current': {role: 'value.tilt'}, // 6C
    'public.hap.characteristic.vertical-tilt.current': {role: 'value.tilt'}, // 6E
    'public.hap.characteristic.leak-detected': {role: 'sensor.alarm.flood', convert: 'number-to-boolean' /*states: {'0': 'Leak is not detected', '1': 'Leak is detected'}*/}, // 70
    'public.hap.characteristic.occupancy-detected': {convert: 'number-to-boolean' /*states: {'0': 'Occupancy is not detected', '1': 'Occupancy is detected'}*/ }, // 71
    'public.hap.characteristic.position.state': {states: {'0': 'Decreasing', '1': 'Increasing', '2': 'Stopped'}}, // 72
    'public.hap.characteristic.input-event': {states: {'0': 'Single Press', '1': 'Double Press', '2': 'Long Press'}}, // 73
    //[`00000074${UuidSuffix}`]: 'public.hap.characteristic.programmable-switch-output-state', // TODO UNKNOWN
    'public.hap.characteristic.smoke-detected': {role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'Smoke is not detected', '1': 'Smoke is detected'}*/ }, // 76
    'public.hap.characteristic.status-fault': {role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'No Fault', '1': 'General Fault'}*/ }, // 77
    'public.hap.characteristic.status-jammed': {role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'Not Jammed', '1': 'Jammed'}*/ }, // 78
    'public.hap.characteristic.status-lo-batt': {role: 'indicator.lowbat', convert: 'number-to-boolean' /*states: {'0': 'Battery level is normal', '1': 'Battery level is low'}*/ }, // 79
    'public.hap.characteristic.status-tampered': {role: 'sensor.alarm', convert: 'number-to-boolean' /*states: {'0': 'Accessory is not tampered', '1': 'Accessory is tampered with'}*/ }, // 7A
    'public.hap.characteristic.horizontal-tilt.target': {role: 'level.tilt'}, // 7B
    'public.hap.characteristic.position.target': {role: 'value.position'}, // 7C
    'public.hap.characteristic.vertical-tilt.target': {role: 'level.tilt'}, // 7D
    'public.hap.characteristic.security-system.alarm-type': {role: 'sensor.alarm', convert: 'number-to-boolean'}, // 8E
    'public.hap.characteristic.charging-state': {states: {'0': 'Not Charging', '1': 'Charging', '2': 'Not Chargeable'}}, // 8F
    'public.hap.characteristic.carbon-monoxide.level': {unit: 'ppm'}, // 90
    'public.hap.characteristic.carbon-monoxide.peak-level': {unit: 'ppm'}, // 91
    'public.hap.characteristic.carbon-dioxide.detected': {convert: 'number-to-boolean' /*states: {'0': 'Carbon Dioxide levels are normal', '1': 'Carbon Dioxide levels are abnormal'}*/ }, // 92
    'public.hap.characteristic.carbon-dioxide.level': {unit: 'ppm'}, // 93
    'public.hap.characteristic.carbon-dioxide.peak-level': {unit: 'ppm'}, // 94
    'public.hap.characteristic.air-quality': {states: {'0': 'Unknown', '1': 'Excellent', '2': 'Good', '3': 'Fair', '4': 'Inferior', '5': 'Poor'}}, // 95
    'public.hap.characteristic.configure-bridged-accessory-status': {type: 'object'}, // 9D
    'public.hap.characteristic.configure-bridged-accessory': {type: 'object'}, // A0
    'public.hap.characteristic.app-matching-identifier': {type: 'object'}, // A4
    'public.hap.characteristic.accessory-properties': {states: {'1': 'Requires additional setup'}}, // A6
    'public.hap.characteristic.lock-physical-controls': {convert: 'number-to-boolean' /*states: {'0': 'Control lock disabled', '1': 'Control lock enabled'}*/ }, // A7
    'public.hap.characteristic.air-purifier.state.target': {states: {'0': 'Manual', '1': 'Auto'}}, // A8
    'public.hap.characteristic.air-purifier.state.current': {states: {'0': 'Inactive', '1': 'Idle', '2': 'Purifying Air'}}, // A9
    'public.hap.characteristic.slat.state.current': {states: {'0': 'Fixed', '1': 'Jammed', '2': 'Swinging'}}, // AA
    'public.hap.characteristic.filter.change-indication': {convert: 'number-to-boolean' /*states: {'0': 'Filter does not need to be changed', '1': 'Filter needs to be changed'}*/ }, // AC
    'public.hap.characteristic.filter.reset-indication': {role: 'button', convert: 'number-to-boolean'}, // AD
    'public.hap.characteristic.air-quality.target': {states: {'0': 'Excellent', '1': 'Good', '2': 'Fair'}}, // AE
    'public.hap.characteristic.fan.state.current': {states: {'0': 'Inactive', '1': 'Idle', '2': 'Blowing Air'}}, // AF
    'public.hap.characteristic.active': {convert: 'number-to-boolean' /*states: {'0': 'Inactive', '1': 'Active'}*/ }, // B0
    'public.hap.characteristic.heater-cooler.state.current': {states: {'0': 'Inactive', '1': 'Idle', '2': 'Heating', '3': 'Cooling'}}, // B1
    'public.hap.characteristic.heater-cooler.state.target': {states: {'0': 'Auto', '1': 'Heat', '2': 'Cool'}}, // B2
    'public.hap.characteristic.humidifier-dehumidifier.state.current': {states: {'0': 'Inactive', '1': 'Idle', '2': 'Humidifying', '3': 'Dehumidifying'}}, // B3
    'public.hap.characteristic.humidifier-dehumidifier.state.target': {states: {'0': 'Auto', '1': 'Humidifier', '2': 'Dehumidifier'}}, // B4
    'public.hap.characteristic.water-level': {role: 'value.water'}, // B5
    'public.hap.characteristic.swing-mode': {convert: 'number-to-boolean' /*states: {'0': 'Swing disabled', '1': 'Swing enabled'}*/ }, // B6
    'public.hap.characteristic.slat.state.target': {states: {'0': 'Manual', '1': 'Auto'}}, // BE
    'public.hap.characteristic.fan.state.target': {states: {'0': 'Manual', '1': 'Auto'}}, // BF
    'public.hap.characteristic.type.slat': {states: {'0': 'Horizontal', '1': 'Vertical'}}, // C0
    'public.hap.characteristic.tilt.current': {role: 'level.tilt'}, // C1
    'public.hap.characteristic.tilt.target': {role: 'value.tilt'}, // C2
    'public.hap.characteristic.density.ozone': {unit: 'micrograms/m3'}, // C3
    'public.hap.characteristic.density.no2': {unit: 'micrograms/m3'}, // C4
    'public.hap.characteristic.density.so2': {unit: 'micrograms/m3'}, // C5
    'public.hap.characteristic.density.pm25': {unit: 'micrograms/m3'}, // C6
    'public.hap.characteristic.density.pm10': {unit: 'micrograms/m3'}, // C7
    'public.hap.characteristic.density.voc': {unit: 'micrograms/m3'}, // C8
    'public.hap.characteristic.service-label-namespace': {states: {'0': 'Dots', '1': 'Arabic numerals'}}, // CD
    //'public.hap.characteristic.color-temperature', // CE - special calculation? S. 168
    'public.hap.characteristic.program-mode': {states: {'0': 'No Programs Scheduled', '1': 'Program Scheduled', '2': 'Program Scheduled, currently overridden to manual mode'}}, // D1
    'public.hap.characteristic.in-use': {convert: 'number-to-boolean' /*states: {'0': 'Not in use', '1': 'In use'}*/ }, // D2
    'public.hap.characteristic.set-duration': {unit: 'sec'}, // D3
    'public.hap.characteristic.valve-type': {states: {'0': 'Generic valve', '1': 'Irrigation', '2': 'Shower head', '3': 'Water faucet'}}, // D5
    'public.hap.characteristic.is-configured': {convert: 'number-to-boolean' /*states: {'0': 'Not Configured', '1': 'Configured'}*/ }, // D6
    'public.hap.characteristic.input-source-type': {states: {'0': 'Other', '1': 'Home-Screen', '2': 'Tuner', '3': 'HDMI', '4': 'Composite Video', '5': 'S-Video', '6': 'Component Video', '7': 'DVI', '8': 'AirPlay', '9': 'USB', '10': 'Application'}}, // DB
    'public.hap.characteristic.input-device-type': { states:{'0': 'Other', '1': 'TV', '2': 'Recording', '3': 'Tuner', '4': 'Playback', '5': 'Audio-System', '6': '6'}}, // DC
    'public.hap.characteristic.closed-captions': {convert: 'number-to-boolean' /*states: {'0': 'Disabled', '1': 'Enabled'}*/ }, // DD
    'public.hap.characteristic.power-mode-selection': {states: {'0': 'Show', '1': 'Hide'}}, // DF
    'public.hap.characteristic.current-media-state': {role: 'media.state', states: {'0': 'Play', '1': 'Pause', '2': 'Stop', '4': 'Loading', '5': 'Interrupted'}}, // E0 - TODO CHECK Role Definition!
    'public.hap.characteristic.remote-key': {states: {'0': 'Rewind', '1': 'Fast Forward', '2': 'Next Track', '3': 'Previous Track', '4': 'Arrow Up', '5': 'Arrow Down', '6': 'Arrow Left', '7': 'Arrow Right', '8': 'Select', '9': 'Back', '10': 'Exit', '11': 'Play/Pause', '12': '12', '13': '13', '14': '14', '15': 'Information', '16': '16', }}, // E1
    'public.hap.characteristic.picture-mode': {states: {'0': 'Other', '1': 'Standard', '2': 'Calibrated', '3': 'Calibrated Dark', '4': 'Vivid', '5': 'Game', '6': 'Computer', '7': 'Custom', '8': '8', '9': '9', '10': '10', '11': '11', '12': '12', '13': '13'}}, // E2
    'public.hap.characteristic.password-setting': {type: 'object'}, // E4
    'public.hap.characteristic.access-control-level': {states: {'0': '0', '1': '1', '2': '2'}}, // E5 TODO Value meanings Unknown
    'public.hap.characteristic.sleep-discovery-mode': {states: {'0': 'Not Discoverable', '1': 'Discoverable'}}, // E8
    'public.hap.characteristic.volume-control-type': {states: {'0': 'None', '1': 'Relative', '2': 'Relative with Current', '3': 'Absolute'}}, // E9
    'public.hap.characteristic.volume-selector': {states: {'0': 'Increment', '1': 'Decrement'}}, // EA
    'public.hap.characteristic.supported-video-stream-configuration': {type: 'object'}, // 114 - TODO Substates??
    'public.hap.characteristic.supported-audio-configuration': {type: 'object'}, // 115 - TODO Substates??
    'public.hap.characteristic.supported-rtp-configuration': {type: 'object'}, // 116 - TODO Substates??
    'public.hap.characteristic.selected-rtp-stream-configuration': {type: 'object'}, // 117 - TODO Substates??
    'public.hap.characteristic.setup-endpoints': {type: 'object'}, // 118 - TODO Substates??
    'public.hap.characteristic.volume': {role: 'level.volume'}, // 119
    'public.hap.characteristic.mute': {role: 'media.mute', convert: 'number-to-boolean' /*states: {'0': 'Mute is Off / Audio is On', '1': 'Mute is On / There is no Audio'}*/ }, // 11A
    'public.hap.characteristic.image-rotation': {states: {'0': 'No rotation', '90': 'Rotated 90 degrees to the right', '180': 'Rotated 180 degrees to the right (flipped vertically)', '270': 'Rotated 270 degrees to the right'}}, // 11E
    'public.hap.characteristic.image-mirror': {convert: 'number-to-boolean' /*states: {'0': 'Image is not mirrored', '1': 'Image is mirrored'}*/ }, // 11F - image-mirroring??
    'public.hap.characteristic.streaming-status': {type: 'object'}, // 120 - TODO Substates??
    'public.hap.characteristic.supported-target-configuration': {type: 'object'}, // 123 - TODO Substates??
    'public.hap.characteristic.target-list': {type: 'object'}, // 124 - TODO Substates??
    'public.hap.characteristic.button-event': {type: 'object'}, // 126 - TODO Substates??
    'public.hap.characteristic.selected-audio-stream-configuration': {type: 'object'}, // 128 - TODO Substates??
    'public.hap.characteristic.supported-data-stream-transport-configuration': {type: 'object'}, // 130 - TODO Substates??
    'public.hap.characteristic.setup-data-stream-transport': {type: 'object'}, // 131 - TODO Substates??
    'public.hap.characteristic.siri.input-type': {states: {'0': 'Push button triggered Apple TV'}}, // 132
    'public.hap.characteristic.target-visibility-state': {convert: 'number-to-boolean' /*states: {'0': 'Shown', '1': 'Hidden'}*/ }, // 134
    'public.hap.characteristic.current-visibility-state': {convert: 'number-to-boolean' /*states: {'0': 'Shown', '1': 'Hidden'}*/ }, // 135
    'public.hap.characteristic.display-order': {type: 'object'}, // 136 TODO UNKNOWN
    'public.hap.characteristic.target-media-state': {states: {'0': 'Play', '1': 'Pause', '2': 'Stop'}}, // 137
    'public.hap.characteristic.data-stream.hap-transport': {type: 'object'}, // 138 - TODO UNKNOWN
    'public.hap.characteristic.data-stream.hap-transport-interrupt': {type: 'object'}, // 139 - TODO UNKNOWN
    //[`00000143${UuidSuffix}`]: 'public.hap.characteristic.characteristic-value-transition-control', // TODO UNKNOWN
    'public.hap.characteristic.supported-characteristic-value-transition-configuration': {type: 'object'}, // 144
    'public.hap.characteristic.setup-transfer-transport': {type: 'object'}, // 201
    'public.hap.characteristic.supported-transfer-transport-configuration': {type: 'object'}, // 202
    'public.hap.characteristic.supported-camera-recording-configuration': {type: 'object'}, // 205
    'public.hap.characteristic.supported-video-recording-configuration': {type: 'object'}, // 206
    'public.hap.characteristic.supported-audio-recording-configuration': {type: 'object'}, // 207
    'public.hap.characteristic.selected-camera-recording-configuration': {type: 'object'}, // 209
    'public.hap.characteristic.network-client-control': {type: 'object'}, // 20C // network-client-profile-control??
    'public.hap.characteristic.network-client-status-control': {type: 'object'}, // 20D
    'public.hap.characteristic.router-status': {states:{'0': 'Ready', '1': 'Not Ready'}}, // 20E
    'public.hap.characteristic.supported-router-configuration': {type: 'object'}, // 210
    'public.hap.characteristic.wan-configuration-list': {type: 'object'}, // 211
    'public.hap.characteristic.wan-status-list': {type: 'object'}, // 212
    'public.hap.characteristic.managed-network-enable': {convert: 'number-to-boolean' /*states: {'0': 'Disabled', '1': 'Enabled'}*/ }, // 215
    'public.hap.characteristic.homekit-camera-active': {convert: 'number-to-boolean' /*states: {'0': 'Off', '1': 'On'}*/ }, // 21B
    'public.hap.characteristic.third-party-camera-active': {convert: 'number-to-boolean' /*states: {'0': 'Off', '1': 'On'}*/ }, // 21C
    //[`0000021D${UuidSuffix}`]: 'public.hap.characteristic.camera-operating-mode-indicator', Boolean default
    'public.hap.characteristic.wifi-satellite-status': {states: {'0': 'Unknown', '1': 'Connected', '2': 'Not Connected'}}, // 21E
    'public.hap.characteristic.network-access-violation-control': {type: 'object'}, // 21F
    'public.hap.characteristic.product-data': {type: 'string', convert: 'base64'}, // 220
    'public.hap.characteristic.wake-configuration': {type: 'object'}, // 222
    'public.hap.characteristic.event-snapshots-active': {convert: 'number-to-boolean' /*states: {'0': 'Disable', '1': 'Enable'}*/ }, // 223
    //[`00000224${UuidSuffix}`]: 'public.hap.characteristic.diagonal-field-of-view', // TODO UNKNOWN
    'public.hap.characteristic.periodic-snapshots-active': {convert: 'number-to-boolean' /*states: {'0': 'Disable', '1': 'Enable'}*/ }, // 225
    'public.hap.characteristic.recording-audio-active': {states: {'0': 'Disable', '1': 'Enable'}}, // 226
    'public.hap.characteristic.manually-disabled': {convert: 'number-to-boolean' /*states: {'0': 'Enabled', '1': 'Disabled'}*/ }, // 227
    'public.hap.characteristic.video-analysis-active': {convert: 'number-to-boolean' /*states: {'0': 'Enabled', '1': 'Disabled'}*/ }, // 229
    //[`0000022B${UuidSuffix}`]: 'public.hap.characteristic.current-transport', // TODO UNKNOWN
    //[`0000022C${UuidSuffix}`]: 'public.hap.characteristic.wifi-capabilities', // TODO UNKNOWN
    'public.hap.characteristic.wifi-configuration-control': {type: 'object'}, // 22D
    'public.hap.characteristic.operating-state-response': {type: 'object'}, // 232
    'public.hap.characteristic.supported-firmware-update-configuration': {type: 'object'}, // 233
    'public.hap.characteristic.firmware-update-readiness': {type: 'object'}, // 234
    'public.hap.characteristic.firmware-update-status': {type: 'object'}, // 235
    'public.hap.characteristic.supported-diagnostics-snapshot': {type: 'object'}, // 238
    'public.hap.characteristic.activity-interval': {role: 'value.interval'}, // 23B
    'public.hap.characteristic.ping': {type: 'string', convert: 'base64'}, // 23C
    //[`0000023E${UuidSuffix}`]: 'public.hap.characteristic.event-transmission-counters', // TODO UNKNOWN
    //[`00000243${UuidSuffix}`]: 'public.hap.characteristic.maximum-transmit-power', // TODO UNKNOWN
    //[`00000247${UuidSuffix}`]: 'public.hap.characteristic.mac.retransmission-maximum', // TODO UNKNOWN
    'public.hap.characteristic.mac.transmission-counters': {type: 'string', convert: 'base64'},
    //[`0000024A${UuidSuffix}`]: 'public.hap.characteristic.heart-beat' // TODO UNKNOWN
    //[`0000024B${UuidSuffix}`]: 'public.hap.characteristic.characteristic-value-active-transition-count', // TODO UNKNOWN
    //[`0000024C${UuidSuffix}`]: 'public.hap.characteristic.supported-diagnostics-modes', // TODO UNKNOWN
    'public.hap.characteristic.siri.endpoint-session-status': {type: 'object'}, // 254
    'public.hap.characteristic.siri.enable': {convert: 'number-to-boolean'}, // 255
    'public.hap.characteristic.siri.listening': {convert: 'number-to-boolean'}, // 256
    'public.hap.characteristic.siri.touch-to-use': {convert: 'number-to-boolean'}, // 257
    'public.hap.characteristic.siri.light-on-use': {convert: 'number-to-boolean'}, // 258
    'public.hap.characteristic.air-play.enable': {convert: 'number-to-boolean' /*states: {'0': 'Disabled', '1': 'Enabled'}*/ }, // 25B
    'public.hap.characteristic.access-code.supported-configuration': {type: 'object'}, // 261 - TODO Substates?? No PDF
    'public.hap.characteristic.access-code.control-point': {type: 'object'}, // 262 - TODO Substates?? No PDF
    'public.hap.characteristic.nfc-access-control-point': {type: 'object'}, // 264
    'public.hap.characteristic.nfc-access-supported-configuration': {type: 'object'}, // 234
    //[`00000269${UuidSuffix}`]: 'public.hap.characteristic.asset-update-readiness', // TODO UNKNOWN
    //[`0000026B${UuidSuffix}`]: 'public.hap.characteristic.multifunction-button', // TODO UNKNOWN
    'public.hap.characteristic.hardware.finish': {type: 'object'}, // 26C
    //[`00000702${UuidSuffix}`]: 'public.hap.characteristic.thread.node-capabilities', // TODO UNKNOWN
    //[`00000703${UuidSuffix}`]: 'public.hap.characteristic.thread.status', // TODO UNKNOWN
    'public.hap.characteristic.thread.control-point': {type: 'object'}, // 704

    // Elgato devices, from https://gist.github.com/simont77/3f4d4330fa55b83f8ca96388d9004e7d
    'E863F10A-079E-48FF-8F27-9C2605A29F52': {name: 'volt', unit: 'V', role: 'value.voltage'},
    'E863F126-079E-48FF-8F27-9C2605A29F52': {name: 'ampere', unit: 'A', role: 'value.current'},
    'E863F10D-079E-48FF-8F27-9C2605A29F52': {name: 'power', unit: 'W', role: 'value.power'},
    'E863F10C-079E-48FF-8F27-9C2605A29F52': {name: 'total-consumption', unit: 'kWh', role: 'value.power.consumption'},
    'E863F110-079E-48FF-8F27-9C2605A29F52': {name: 'volt-ampere', unit: 'VA', role: 'value.power'},
    'E863F127-079E-48FF-8F27-9C2605A29F52': {name: 'kVAh', unit: 'kVAh'},
    'E863F10B-079E-48FF-8F27-9C2605A29F52': {name: 'air-quality', unit: 'ppm'},
    'E863F129-079E-48FF-8F27-9C2605A29F52': {name: 'actions'}, // # opened is value/2 ... so actions open/close?
    'E863F11B-079E-48FF-8F27-9C2605A29F52': {name: 'battery', unit: '%', role: 'value.battery'},
    'E863F120-079E-48FF-8F27-9C2605A29F52': {name: 'sensitivity', desc: '0 = high, 4 = medium, 7 = low'},
    'E863F12D-079E-48FF-8F27-9C2605A29F52': {name: 'motion-indication-duration', unit: 'sec'},
    'E863F12E-079E-48FF-8F27-9C2605A29F52': {name: 'valve-position', unit: '%', role: 'value.valve'},
};

export function addAccessoryObjects(device: HapDevice, objs: Map<string, ioBroker.Object>, accessory: AccessoryObject): void {
    let accessoryName = `${accessory.aid}`;
    if (device.service?.ci) {
        accessoryName = `${categoryFromId(device.service.ci)} ${accessoryName}`;
    }
    objs.set(`${device.id}.${accessory.aid}`, getDeviceObject(accessoryName, undefined, {aid: accessory.aid}));
}

export function addServiceObjects(device: HapDevice, objs: Map<string, ioBroker.Object>, accessory: AccessoryObject, service: ServiceObject): void {
    let serviceName = serviceFromUuid(service.type);
    if (serviceName.startsWith('public.hap.service.')) {
        serviceName = serviceName.substr(19).replace(/\./g, '-'); // remove public.hap.service.
    }

    objs.set(`${device.id}.${accessory.aid}.${serviceName}`, getChannelObject(`Service ${serviceName}`, undefined, {aid: accessory.aid, iid: service.iid, type: service.type}));
    objs.set(`${device.id}.${accessory.aid}.${serviceName}.serviceIsHidden`, getStateObject('indicator', 'Is Hidden Service?', !!service.hidden));
    objs.set(`${device.id}.${accessory.aid}.${serviceName}.serviceIsPrimary`, getStateObject('indicator', 'Is Primary Service?', !!service.primary));

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

export function addCharacteristicObjects(device: HapDevice, objs: Map<string, ioBroker.Object>, accessory: AccessoryObject, service: ServiceObject, characteristic: CharacteristicObject): string | undefined {
    if (!characteristic.type) {
        return undefined;
    }

    let serviceName = serviceFromUuid(service.type);
    if (serviceName.startsWith('public.hap.service.')) {
        serviceName = serviceName.substr(19).replace(/\./g, '-'); // remove public.hap.service.
    }

    let characteristicName = characteristicFromUuid(characteristic.type);
    const iobrokerCommon = CharacteristicToIoBrokerMap[characteristicName] || {};
    if (typeof iobrokerCommon.name === 'string') {
        characteristicName = iobrokerCommon.name;
        delete iobrokerCommon.name;
    }
    if (characteristicName.startsWith('public.hap.characteristic.')) {
        characteristicName = characteristicName.substr(26).replace(/\./g, '-'); // remove public.hap.characteristic.
    }

    let convertLogic = iobrokerCommon.convert;
    delete iobrokerCommon.convert;

    const characteristicCommon = getCommonForCharacteristic(characteristic);
    if (characteristicCommon.states && iobrokerCommon.states) {
        const targetStates: Record<string, string> = {};
        for (const key of Object.keys(characteristicCommon.states)) {
            targetStates[key] = (iobrokerCommon.states as Record<string, string>)[key] || (characteristicCommon.states as Record<string, string>)[key];
        }
        delete iobrokerCommon.states;
        characteristicCommon.states = targetStates;
    }

    const objCommon = Object.assign(characteristicCommon, iobrokerCommon);

    console.log(`${device.id}.${accessory.aid}.${serviceName}-${service.iid}.${characteristicName}: BEFORE ${JSON.stringify(objCommon)} with ${convertLogic}`);
    if (!convertLogic && objCommon.type === 'boolean' && typeof characteristic.value === 'number') {
        convertLogic = 'number-to-boolean';
    }

    switch (convertLogic) {
        case 'number-to-boolean':
        case 'number-to-boolean-invert':
            objCommon.type = 'boolean';
            break;
        case 'base64':
            objCommon.type = 'string';
            break;
    }

    if (objCommon.type !== 'number') {
        delete objCommon.min;
        delete objCommon.max;
        delete objCommon.step;
    }

    console.log(`${device.id}.${accessory.aid}.${serviceName}-${service.iid}.${characteristicName}: AFTER ${JSON.stringify(objCommon)} with ${JSON.stringify(convertLogic)}`);

    const objNative: Record<string, unknown> = characteristic as Record<string, unknown>;
    objNative.convertLogic = convertLogic;

    if (!objCommon.role) {
        objCommon.role = getRole(objCommon);
    }

    objNative.aid = accessory.aid;
    objNative.serviceUuid = service.type;

    const id = `${device.id}.${accessory.aid}.${serviceName}-${service.iid}.${characteristicName}`;
    objs.set(id, getStateObject('state', characteristicName, characteristic.value as ioBroker.StateValue, objCommon as unknown as Record<string, unknown>, objNative));

    return id;
}

function getCommonForCharacteristic(characteristic: CharacteristicObject): ioBroker.StateCommon {
    const common: ioBroker.StateCommon = {
        read: !!characteristic.perms?.includes('pr'),
        write: !!characteristic.perms?.includes('pw'),
        desc: characteristic.description,
        type: characteristic.format ? HapDataTypeMap[characteristic.format] as ioBroker.CommonType : 'mixed',
        unit: characteristic.unit ? HapUnitMap[characteristic.unit] : undefined,
        min: characteristic.minValue,
        max: characteristic.maxValue,
        step: characteristic.minStep,
        role: '',
        name: ''
    };

    if (characteristic['valid-values-range']) {
        common.min =  characteristic['valid-values-range'][0];
        common.max =  characteristic['valid-values-range'][1];
    }
    if (characteristic['valid-values']) {
        common.states = {};
        for (const vv of characteristic['valid-values']) {
            common.states[vv] = vv.toString();
        }
    }

    return common;
}

function getRole(common: ioBroker.StateCommon): string {
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
