const templates: Record<string, ioBroker.Object> = {
    'device': {
        type: 'device',
        common: {
            name: 'Device',
        },
    } as ioBroker.DeviceObject,
    'channel': {
        type: 'channel',
        common: {
            name: 'Channel',
        },
    } as ioBroker.ChannelObject,
    'folder': {
        type: 'folder',
        common: {
            name: 'Folder',
        },
    } as ioBroker.FolderObject,
    'html': {
        type: 'state',
        common: {
            role: 'html',
            name: 'HTML code',
            type: 'string',
            read: true,
            write: true,
        },
    } as ioBroker.StateObject,
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
    } as ioBroker.StateObject,
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
    } as ioBroker.StateObject,
    'string': {
        type: 'state',
        common: {
            name: 'String',
            type: 'string',
            role: 'value',
            read: true,
            write: true,
        },
    } as ioBroker.StateObject,
    'number': {
        type: 'state',
        common: {
            name: 'String',
            type: 'string',
            role: 'value',
            read: true,
            write: true,
        },
    } as ioBroker.StateObject,
    'button': {
        type: 'state',
        common: {
            name: 'Button',
            type: 'boolean',
            role: 'button',
            read: false,
            write: true,
        },
    } as ioBroker.StateObject,
    'indicator': {
        type: 'state',
        common: {
            name: 'Indicator',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: false,
        },
    } as ioBroker.StateObject,
    'state': {
        type: 'state',
        common: {
            name: 'State',
        },
    } as ioBroker.StateObject,
};

function fixStateObject(obj: ioBroker.StateObject, value?: ioBroker.StateValue): ioBroker.StateObject {
    if (! obj.type) {
        obj.type = 'state';
    }
    if (! obj.common) {
        obj.common = {} as ioBroker.StateCommon;
    }
    if (! obj.native) {
        obj.native = {} ;
    }
    if (obj.common && obj.common.type === undefined) {
        if (value !== null && value !== undefined) {
            obj.common.type = typeof value as ioBroker.CommonType;
        }
        else if (obj.common.def !== undefined) {
            obj.common.type = typeof obj.common.def as ioBroker.CommonType;
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

export function buildObject(template: string, name: string, value?: ioBroker.StateValue, common?: Record<string, unknown>, native?: Record<string, unknown>): ioBroker.Object {
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

export function getFolderObject(name: string, common?: Record<string, unknown>, native?: Record<string, unknown>): ioBroker.Object {
    return buildObject('folder', name, undefined, common, native);
}

export function getDeviceObject(name: string, common?: Record<string, unknown>, native?: Record<string, unknown>): ioBroker.Object {
    return buildObject('device', name, undefined, common, native);
}

export function getChannelObject(name: string, common?: Record<string, unknown>, native?: Record<string, unknown>): ioBroker.Object {
    return buildObject('channel', name, undefined, common, native);
}

export function getStateObject(template: string, name: string, value?: ioBroker.StateValue, common?: Record<string, unknown>, native?: Record<string, unknown>): ioBroker.Object {
    return buildObject(template, name, value, common, native);
}
