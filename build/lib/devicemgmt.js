"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeKitDeviceManagement = void 0;
const dm_utils_1 = require("dm-utils");
class HomeKitDeviceManagement extends dm_utils_1.DeviceManagement {
    getInstanceInfo() {
        const data = {
            ...super.getInstanceInfo(),
            actions: [
                {
                    id: 'refresh',
                    icon: 'fas fa-redo-alt',
                    title: 'Refresh',
                    description: 'Refresh device list',
                    handler: this.handleRefresh.bind(this)
                }
            ],
        };
        this.adapter.log.debug(`Send instance information: ${JSON.stringify(data)}`);
        return data;
    }
    async handleRefresh(_context) {
        this.log.info(`Refresh was pressed`);
        return { refresh: true };
    }
    async listDevices() {
        const devices = this.adapter.getDiscoveredDevices();
        const devList = [];
        devices.forEach(device => {
            const statusInfo = [
                {
                    icon: device
                        .serviceType === 'IP' ? (device.connected ? 'fa-solid fa-wifi' : 'fa-solid fa-wifi-slash') : (device.connected ? 'fa-solid fa-bluetooth' : 'data:image/svg+xml;utf8;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSJub25lIiBkPSJNMCAwaDI0djI0SDBWMHoiLz48cGF0aCBkPSJNMTMgNS44M2wxLjg4IDEuODgtMS42IDEuNiAxLjQxIDEuNDEgMy4wMi0zLjAyTDEyIDJoLTF2NS4wM2wyIDJ2LTMuMnpNNS40MSA0TDQgNS40MSAxMC41OSAxMiA1IDE3LjU5IDYuNDEgMTkgMTEgMTQuNDFWMjJoMWw0LjI5LTQuMjkgMi4zIDIuMjlMMjAgMTguNTkgNS40MSA0ek0xMyAxOC4xN3YtMy43NmwxLjg4IDEuODhMMTMgMTguMTd6Ii8+PC9zdmc+'),
                    description: 'Connection type and Status'
                },
                {
                    icon: device.discovered ? 'fas fa-eye' : '',
                    description: 'Discovered Status'
                }
            ];
            const data = {
                id: device.id,
                name: `${device.discoveredName} (${device.discoveredCategory})`,
                status: statusInfo,
                hasDetails: device.pairedWithThisInstance,
                //type: icon ... a type column
                actions: []
            };
            if (device.pairedWithThisInstance) {
                data.actions.push({
                    id: 'unpairDevice',
                    icon: 'fas fa-unlink',
                    description: 'Unpair this device',
                    handler: device.connected ? this.handleUnpairDevice.bind(this) : undefined
                });
            }
            else {
                if (device.availableToPair) {
                    data.actions.push({
                        id: 'identify',
                        icon: 'fas fa-search-location',
                        description: 'Identify this device',
                        handler: this.handleIdentify.bind(this)
                    });
                    data.actions.push({
                        id: 'pairDevice',
                        icon: 'fas fa-link',
                        description: 'Pair this device',
                        handler: this.handlePairDevice.bind(this)
                    });
                }
            }
            data.actions.push({
                id: 'delete',
                icon: 'fas fa-trash',
                description: 'Delete this device',
                handler: !(device.connected || device.discovered || device.pairedWithThisInstance) ? this.handleDeleteInactiveDevice.bind(this) : undefined
            });
            devList.push(data);
        });
        this.adapter.log.debug(`Send device information: ${JSON.stringify(devList)}`);
        return devList;
    }
    async handlePairDevice(deviceId, context) {
        this.log.info(`pairDevice was pressed on ${deviceId}`);
        const pairingDevice = this.adapter.getDevice(deviceId);
        if (!pairingDevice) {
            throw new Error(`Pair: Device with ID ${deviceId} not existing.`);
        }
        const data = await context.showForm({
            type: 'panel',
            i18n: true,
            items: {
                pin: {
                    help: 'Homekit PIN',
                    type: 'text',
                    maxLength: 10,
                    //validator: TODO
                    label: 'XXX-XX-XXX'
                },
            }
        }, {
            data: {
                pin: ''
            },
            title: 'Please enter the HomeKit PIN',
        });
        if (data) {
            this.log.info(`Pair with Pin: ${JSON.stringify(data)}`);
            try {
                await this.adapter.pairDevice(pairingDevice, data.pin);
                await context.showMessage(`Device successfully paired!`);
            }
            catch (err) {
                await context.showMessage(`Pairing was not successful: ${err.message}`);
            }
            return { refresh: 'instance' };
        }
        return { refresh: false };
    }
    async handleUnpairDevice(deviceId, context) {
        this.log.info(`unpairDevice was pressed on ${deviceId}`);
        const unpairingDevice = this.adapter.getDevice(deviceId);
        if (!unpairingDevice) {
            throw new Error(`Unpair: Device with ID ${deviceId} not existing.`);
        }
        const confirm = await context.showConfirmation('Do you really want to Unpair this device?');
        if (confirm) {
            try {
                await this.adapter.unpairDevice(unpairingDevice);
                await context.showMessage(`Device successfully unpaired!`);
            }
            catch (err) {
                await context.showMessage(`Unpairing was not successful: ${err.message}`);
            }
            return { refresh: 'instance' };
        }
        return { refresh: false };
    }
    async handleIdentify(deviceId, context) {
        this.log.info(`Identify was pressed on ${deviceId}`);
        const identifyingDevice = this.adapter.getDevice(deviceId);
        if (!identifyingDevice) {
            throw new Error(`Identify: Device with ID ${deviceId} not existing.`);
        }
        try {
            await this.adapter.identifyDevice(identifyingDevice);
        }
        catch (err) {
            await context.showMessage(`Identify was not successful: ${err.message}`);
        }
        await context.showMessage(`The device should now identify itself.`);
        return { refresh: false };
    }
    async handleDeleteInactiveDevice(deviceId, context) {
        this.log.info(`Delete was pressed on ${deviceId}`);
        const deletingDevice = this.adapter.getDevice(deviceId);
        if (!deletingDevice) {
            throw new Error(`Identify: Device with ID ${deviceId} not existing.`);
        }
        const confirm = await context.showConfirmation('Do you really want to Delete this device?');
        if (confirm) {
            // TODO
        }
        return { refresh: false };
    }
    async getDeviceDetails(id) {
        const device = this.adapter.getDevice(id);
        if (!device) {
            return { id, schema: {} };
        }
        const schema = {
            type: 'panel',
            items: {
                serviceType: {
                    type: 'serviceType',
                    text: device.serviceType,
                    sm: 12,
                },
            },
        };
        return { id, schema };
    }
}
exports.HomeKitDeviceManagement = HomeKitDeviceManagement;
//# sourceMappingURL=devicemgmt.js.map