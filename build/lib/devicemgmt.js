"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeKitDeviceManagement = void 0;
const dm_utils_1 = require("dm-utils");
class HomeKitDeviceManagement extends dm_utils_1.DeviceManagement {
    getInstanceInfo() {
        const data = {
            ...super.getInstanceInfo(),
            actions: [
                { id: 'refresh', icon: 'refresh', title: 'Refresh', description: 'Refresh device list' }
            ],
        };
        this.adapter.log.debug(`Send instance information: ${JSON.stringify(data)}`);
        return data;
    }
    async listDevices() {
        const devices = this.adapter.getDiscoveredDevices();
        const devList = [];
        devices.forEach(device => {
            const data = {
                id: device.id,
                name: `${device.id} - ${device.discoveredName} (${device.discoveredCategory})`,
                status: device.connected ? 'connected' : 'disconnected',
                hasDetails: device.pairedWithThisInstance,
                //type: icon ... a type column
                actions: []
            };
            if (device.pairedWithThisInstance) {
                data.actions.push({
                    id: 'unpairDevice',
                    icon: 'fa-solid fa-link-slash',
                    description: 'Unpair this device'
                });
            }
            else {
                if (device.availableToPair) {
                    data.actions.push({
                        id: 'identify',
                        icon: 'fa-solid fa-magnifying-glass-location',
                        description: 'Unpair this device'
                    });
                    data.actions.push({
                        id: 'pairDevice',
                        icon: 'fa-solid fa-link',
                        description: 'Pair this device'
                    });
                }
            }
            data.actions.push({
                id: 'delete',
                icon: 'fa-solid fa-trash',
                description: 'Delete this device',
                disabled: !(device.connected || device.discovered || device.pairedWithThisInstance)
            });
            devList.push(data);
        });
        this.adapter.log.debug(`Send device information: ${JSON.stringify(devList)}`);
        return devList;
    }
    async handleInstanceAction(actionId, context) {
        switch (actionId) {
            case 'refresh':
                this.log.info(`Refresh was pressed`);
                /*
                const progress = await context.openProgress('Searching...', { label: '0%' });
                await this.delay(500);
                for (let i = 10; i <= 100; i += 10) {
                    await this.delay(300);
                    this.log.info(`Progress at ${i}%`);
                    await progress.update({ value: i, label: `${i}%` });
                }
                await this.delay(1000);
                await progress.close();*/
                return { refresh: true };
            default:
                throw new Error(`Unknown action ${actionId}`);
        }
    }
    async handleDeviceAction(deviceId, actionId, context) {
        switch (actionId) {
            case 'pairDevice': {
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
                            sm: 6,
                            help: 'XXX-XX-XXX',
                            type: 'text',
                            maxLength: 10,
                            //validator: TODO
                            label: 'pin'
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
                    await this.adapter.pairDevice(pairingDevice, data.pin);
                    return { refresh: 'device' };
                }
                return { refresh: false };
            }
            case 'unpairDevice': {
                this.log.info(`unpairDevice was pressed on ${deviceId}`);
                const unpairingDevice = this.adapter.getDevice(deviceId);
                if (!unpairingDevice) {
                    throw new Error(`Unpair: Device with ID ${deviceId} not existing.`);
                }
                const confirm = await context.showConfirmation('Do you really want to Unpair this device?');
                if (confirm) {
                    await this.adapter.unpairDevice(unpairingDevice);
                    return { refresh: 'instance' };
                }
                return { refresh: false };
            }
            case 'identify': {
                this.log.info(`Identify was pressed on ${deviceId}`);
                const identifyingDevice = this.adapter.getDevice(deviceId);
                if (!identifyingDevice) {
                    throw new Error(`Identify: Device with ID ${deviceId} not existing.`);
                }
                await this.adapter.identifyDevice(identifyingDevice);
                await context.showMessage(`The device should now identify itself.`);
                return { refresh: false };
            }
            case 'deleteInactiveDevice': {
                this.log.info(`Identify was pressed on ${deviceId}`);
                const identifyingDevice = this.adapter.getDevice(deviceId);
                if (!identifyingDevice) {
                    throw new Error(`Identify: Device with ID ${deviceId} not existing.`);
                }
                await this.adapter.identifyDevice(identifyingDevice);
                return { refresh: false };
            }
            default:
                throw new Error(`Unknown action ${actionId}`);
        }
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