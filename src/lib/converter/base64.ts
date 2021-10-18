import { ConverterType } from './index';

export default {
    read: (value: ioBroker.StateValue): ioBroker.StateValue => {
        return value;
    },
    write: (value: ioBroker.StateValue): ioBroker.StateValue => {
        return value;
    }
} as ConverterType;
