import { expect } from 'chai';
import { AccessoryObject } from 'hap-controller/lib/model/accessory';
import { CharacteristicObject } from 'hap-controller/lib/model/characteristic';
import { ServiceObject } from 'hap-controller/lib/model/service';
import { HapDevice } from '../main';
import { addCharacteristicObjects } from './objectMapper';

describe('objectMapper => addCharacteristicObjects', () => {
    it('does not mutate characteristic mapping when converter metadata is removed', () => {
        const device = {id: 'homekit-controller.0.device'} as HapDevice;
        const accessory = {aid: 1} as AccessoryObject;
        const service = {
            iid: 2688,
            type: '00000086-0000-1000-8000-0026BB765291',
        } as ServiceObject;
        const characteristic = {
            iid: 10,
            type: '00000071-0000-1000-8000-0026BB765291',
            format: 'uint8',
            value: 1,
            perms: ['pr', 'ev'],
        } as CharacteristicObject;

        const firstObjects = new Map<string, ioBroker.Object>();
        const secondObjects = new Map<string, ioBroker.Object>();

        const firstId = addCharacteristicObjects(device, firstObjects, accessory, service, characteristic);
        const secondId = addCharacteristicObjects(device, secondObjects, accessory, service, characteristic);

        expect(firstId).to.equal('homekit-controller.0.device.1.sensor-occupancy-2688.occupancy-detected');
        expect(secondId).to.equal(firstId);
        expect((firstObjects.get(firstId!) as ioBroker.StateObject).common.type).to.equal('boolean');
        expect((secondObjects.get(secondId!) as ioBroker.StateObject).common.type).to.equal('boolean');
        expect((secondObjects.get(secondId!) as ioBroker.StateObject).native.convertLogic).to.equal('number-to-boolean');
    });
});
