import Base64Converter from './base64';
import NumberToBooleanConverter from './number-to-boolean';
import NumberToBooleanInvertConverter from './number-to-boolean-invert';

export interface ConverterType {
    read: (value: ioBroker.StateValue) => ioBroker.StateValue,
    write: (value: ioBroker.StateValue) => ioBroker.StateValue,
}

export default {
    'base64': Base64Converter,
    'number-to-boolean': NumberToBooleanConverter,
    'number-to-boolean-invert': NumberToBooleanInvertConverter
};
