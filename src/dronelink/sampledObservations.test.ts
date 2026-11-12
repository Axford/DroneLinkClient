import { DRONE_LINK_MSG_TYPE_FLOAT } from './DroneLinkMsg';
import type { ParameterState } from './DroneLinkState';
import { sampleObservation, traceSegments } from './sampledObservations';

function reading(param: number, value: number, lastHeard: number, source = 'HTTP'): ParameterState {
    return { param, msgType: DRONE_LINK_MSG_TYPE_FLOAT, bytesPerValue: 4, numValues: 1,
        writable: false, values: [value], lastHeard, source };
}

const rssi = (magnitude: number) => magnitude >= 0 && magnitude <= 100 ? -magnitude : undefined;
const wind = (knots: number) => knots >= 0 ? knots : undefined;

test('RFM69 keeps real receipts and breaks a trace at invalid samples and quiet intervals', () => {
    const scope = 'fleet/11/4/RFM69/8/1';
    let window: ReturnType<typeof sampleObservation>;
    for (const [time, value] of [[1000, 62], [6000, 62], [11000, NaN], [16000, 65], [36000, 70]]) {
        window = sampleObservation(window, scope, reading(8, value, time), time, rssi);
    }
    const same = sampleObservation(window, scope, reading(8, 70, 36000), 37000, rssi)!;
    expect(same.samples.map(sample => sample.value)).toEqual([-62, -62, null, -65, -70]);
    expect(traceSegments(same.samples, 15000).map(segment => segment.map(point => point.receivedAt)))
        .toEqual([[1000, 6000], [16000], [36000]]);
});

test('Anemometer windows retain zero and firmware knots within both bounds', () => {
    const scope = 'fleet/11/4/Anemometer/10/1';
    let window: ReturnType<typeof sampleObservation>;
    for (let index = 1; index <= 102; index++) {
        window = sampleObservation(window, scope, reading(10, index === 102 ? 0 : 12, index * 1000), index * 1000, wind);
    }
    expect(window?.samples).toHaveLength(100);
    expect(window?.samples[0]).toEqual({ receivedAt: 3000, value: 12 });
    expect(window?.samples[99]).toEqual({ receivedAt: 102000, value: 0 });
    const aged = sampleObservation(window, scope, reading(10, 0, 102000), 401999, wind);
    expect(aged?.samples).toEqual([{ receivedAt: 102000, value: 0 }]);
    expect(sampleObservation(aged, scope, reading(10, 0, 102000), 402001, wind)?.samples).toEqual([]);
});

test('source, reset and reconnect boundaries do not mix or replay windows', () => {
    const scope = 'fleet/11/4/RFM69/8/1';
    const first = sampleObservation(undefined, scope, reading(8, 60, 1000), 1000, rssi);
    const local = sampleObservation(first, scope, reading(8, 54, 2000, 'Local'), 2000, rssi);
    expect(local).toMatchObject({ source: 'Local', samples: [{ receivedAt: 2000, value: -54 }] });
    expect(sampleObservation(local, scope, reading(8, 60, 1000), 2500, rssi)).toEqual(local);
    expect(sampleObservation(local, scope, undefined, 2500, rssi)?.samples).toEqual([]);
    expect(sampleObservation(local, undefined, undefined, 2500, rssi)).toBeUndefined();
    const reset = sampleObservation(local, scope + '/reset', reading(8, 72, 3000), 3000, rssi);
    expect(reset?.samples).toEqual([{ receivedAt: 3000, value: -72 }]);
});

test('keeps valid Server receipts when the browser clock is behind', () => {
    const scope = 'fleet/11/4/RFM69/8/1';
    const first = sampleObservation(undefined, scope, reading(8, 62, 6000), 1000, rssi);
    const next = sampleObservation(first, scope, reading(8, 65, 11000), 6000, rssi);
    expect(next?.samples).toEqual([{ receivedAt: 6000, value: -62 }, { receivedAt: 11000, value: -65 }]);
});
