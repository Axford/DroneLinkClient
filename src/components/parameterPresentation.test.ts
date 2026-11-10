import { presentParameter } from './parameterPresentation';
import { ParameterState, GlobalState } from '../dronelink/DroneLinkState';
const reading = (msgType: number, values: number[] | string[]): ParameterState => ({ param: 8, msgType, values, numValues: msgType === 1 ? values.length / 4 : values.length, bytesPerValue: msgType === 0 || msgType === 4 ? 1 : 4, writable: true });

test('formats typed values without losing exact decoded values, zero, empty text or nonfinite floats', () => {
    expect(presentParameter(reading(0, [0, 255])).values.map(v => v.display)).toEqual(['0', '255']);
    expect(presentParameter(reading(2, [4294967295])).values[0]).toEqual({ display: (4294967295).toLocaleString(), exact: '4294967295' });
    expect(presentParameter(reading(3, [0, -0, 1.23456789, NaN, Infinity])).values).toEqual([
        { display: '0.0000', exact: '0' }, { display: '-0.0000', exact: '-0' }, { display: '1.2346', exact: '1.23456789' }, { display: 'NaN', exact: 'NaN' }, { display: 'Infinity', exact: 'Infinity' }
    ]);
    expect(presentParameter(reading(4, [''])).values[0]).toEqual({ display: '""', exact: '""' });
    expect(presentParameter(reading(4, ['a\tb'])).values[0]).toEqual({ display: 'a\tb', exact: '"a\\tb"' });
});

test('renders all four ADDR entries, masks packed parameter bits and resolves only names from its supplied Domain', () => {
    const parameter = reading(1, [254, 7, 4, 200, 0, 8, 2, 1, 1, 9, 3, 63, 0, 10, 4, 0]);
    const state: GlobalState = { 7: { id: 7, name: 'Survey', lastHeard: 1, channels: { 4: { channel: 4, name: 'GPS', lastHeard: 1, params: { 8: { ...reading(3, [1, 2]), name: 'location' } } } } } };
    const values = presentParameter(parameter, state).values;
    expect(values).toHaveLength(4);
    expect(values[0]).toEqual({ display: '254:7>4.8', exact: '[254, 7, 4, 200]', name: 'Survey > GPS.location' });
    expect(values[1].display).toBe('0:8>2.1'); expect(values[1].name).toBeUndefined();
    expect(values[3].display).toBe('0:10>4.0');
    expect(presentParameter(parameter).values[0].name).toBeUndefined();
    expect(presentParameter(reading(1, [0, 7, 4])).values).toEqual([]);
});

test('unavailable and NAME-only values do not fabricate a type, zero or writability; a failed name retains valid values', () => {
    expect(presentParameter({ ...reading(0, []), name: 'Only a name' })).toEqual({ type: null, values: [] });
    expect(presentParameter({ ...reading(3, [123]), unavailable: { value: 'invalid-length' } })).toEqual({ type: null, values: [] });
    expect(presentParameter({ ...reading(3, [0]), unavailable: { name: 'invalid-input' } })).toMatchObject({ type: 'FLOAT', writable: true, values: [{ display: '0.0000' }] });
});
