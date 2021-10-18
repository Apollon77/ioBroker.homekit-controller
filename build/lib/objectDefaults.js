"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStateObject = exports.getChannelObject = exports.getDeviceObject = exports.getFolderObject = exports.buildObject = void 0;
const templates = {
    'device': {
        type: 'device',
        common: {
            name: 'Device',
        },
    },
    'channel': {
        type: 'channel',
        common: {
            name: 'Channel',
        },
    },
    'folder': {
        type: 'folder',
        common: {
            name: 'Folder',
        },
    },
    'html': {
        type: 'state',
        common: {
            role: 'html',
            name: 'HTML code',
            type: 'string',
            read: true,
            write: true,
        },
    },
    'json': {
        type: 'state',
        common: {
            role: 'json',
            name: 'JSON',
            type: 'string',
            read: true,
            write: true,
            def: '{}',
        },
    },
    'array': {
        type: 'state',
        common: {
            role: 'array',
            name: 'Array',
            type: 'string',
            read: true,
            write: true,
            def: '[]',
        },
    },
    'string': {
        type: 'state',
        common: {
            name: 'String',
            type: 'string',
            role: 'value',
            read: true,
            write: true,
        },
    },
    'number': {
        type: 'state',
        common: {
            name: 'String',
            type: 'string',
            role: 'value',
            read: true,
            write: true,
        },
    },
    'button': {
        type: 'state',
        common: {
            name: 'Button',
            type: 'boolean',
            role: 'button',
            read: false,
            write: true,
        },
    },
    'indicator': {
        type: 'state',
        common: {
            name: 'Indicator',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
    },
    'state': {
        type: 'state',
        common: {
            name: 'State',
        },
    },
};
function fixStateObject(obj, value) {
    if (!obj.type) {
        obj.type = 'state';
    }
    if (!obj.common) {
        obj.common = {};
    }
    if (!obj.native) {
        obj.native = {};
    }
    if (obj.common && obj.common.type === undefined) {
        if (value !== null && value !== undefined) {
            obj.common.type = typeof value;
        }
        else if (obj.common.def !== undefined) {
            obj.common.type = typeof obj.common.def;
        }
        else if (obj.type === 'state') {
            obj.common.type = 'mixed';
        }
    }
    if (obj.common && obj.common.read === undefined) {
        obj.common.read = true; // !(obj.common.type === 'boolean' && !!stateChangeCallback);
    }
    if (obj.common && obj.common.write === undefined) {
        obj.common.write = true; // (!!stateChangeCallback || stateChangeTrigger[id]) ;
    }
    /*    if (obj.common && obj.common.def === undefined && value !== null && value !== undefined) {
            obj.common.def = value;
        }*/
    obj.native.value = value;
    return obj;
}
function buildObject(template, name, value, common, native) {
    if (!templates[template]) {
        throw new Error(`Invalid object type ${template} provided`);
    }
    const obj = JSON.parse(JSON.stringify(templates[template]));
    if (name) {
        obj.common.name = name;
    }
    obj.common = Object.assign(obj.common || {}, common || {});
    obj.native = Object.assign(obj.native || {}, native || {});
    if (obj.type === 'state') {
        return fixStateObject(obj, value);
    }
    return obj;
}
exports.buildObject = buildObject;
function getFolderObject(name, common, native) {
    return buildObject('folder', name, undefined, common, native);
}
exports.getFolderObject = getFolderObject;
function getDeviceObject(name, common, native) {
    return buildObject('device', name, undefined, common, native);
}
exports.getDeviceObject = getDeviceObject;
function getChannelObject(name, common, native) {
    return buildObject('channel', name, undefined, common, native);
}
exports.getChannelObject = getChannelObject;
function getStateObject(template, name, value, common, native) {
    return buildObject(template, name, value, common, native);
}
exports.getStateObject = getStateObject;
//# sourceMappingURL=objectDefaults.js.map