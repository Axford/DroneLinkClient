import { DroneLinkMsg } from '../../dronelink/DroneLinkMsg';
import { captureWindowMs, LiveCapture } from './capture';

const rudder = { node: 11, channel: 4, parameter: 9, component: 0 };
const voltage = { node: 12, channel: 8, parameter: 15, component: 1 };
const start = 1_700_000_000_000;
const ms = (offset: number) => start + offset;

function publish(capture: LiveCapture, address: typeof rudder, time: number, values: number[], transport: 'wifi' | 'serial' = 'wifi') {
    const packet = new DroneLinkMsg();
    Object.assign(packet, { node: address.node, source: address.node, channel: address.channel, param: address.parameter, priority: 3 });
    packet.setFloat(values);
    capture.record(packet.encodeUnframed(), packet, time, transport);
}

it('only captures after Start and retrieves earlier data for newly selected components', () => {
    const capture = new LiveCapture(20);
    capture.source(11, 'wifi');
    capture.source(12, 'wifi');
    publish(capture, rudder, ms(-1), [10]);
    capture.start(start);
    publish(capture, rudder, ms(10), [20]);
    publish(capture, voltage, ms(11), [12.5, 11.5]);
    publish(capture, voltage, ms(12), [12]);
    expect(capture.samples([voltage, rudder], capture.range(ms(50))!).map(series => series.map(sample => sample.value)))
        .toEqual([[11.5, null], [20]]);
    capture.stop(ms(50));
    publish(capture, rudder, ms(60), [40]);
    expect(capture.samples([rudder], capture.range(ms(60))!)[0].map(sample => sample.value)).toEqual([20]);
    capture.start(ms(70));
    expect(capture.samples([rudder], capture.range(ms(75))!)).toEqual([[]]);
});

it('holds frozen samples across time and capacity eviction, and stops on that view', () => {
    const capture = new LiveCapture(2, 100);
    capture.source(11, 'wifi');
    capture.start(start);
    publish(capture, rudder, ms(1), [1]);
    publish(capture, rudder, ms(10), [10]);
    capture.freeze(ms(15));
    publish(capture, rudder, ms(21), [21]);
    publish(capture, rudder, ms(25), [25]);
    capture.advance(ms(200));
    expect(capture.samples([rudder], capture.range(ms(200))!)[0].map(sample => sample.value)).toEqual([1, 10]);
    capture.stop(ms(200));
    expect(capture.range(ms(300))).toEqual([start, ms(15)]);
    expect(capture.samples([rudder], capture.range(ms(300))!)[0].map(sample => sample.value)).toEqual([1, 10]);
});

it('returns to a 15-minute rolling view and reports packet-limit truncation', () => {
    const capture = new LiveCapture(2);
    capture.source(11, 'wifi');
    capture.start(start);
    publish(capture, rudder, ms(1), [1]);
    capture.freeze(ms(2));
    publish(capture, rudder, ms(3), [3]);
    publish(capture, rudder, ms(4), [4]);
    capture.follow();
    expect(capture.availability(capture.range(ms(5))!)).toEqual({ earliest: ms(3), limited: true });
    capture.advance(ms(captureWindowMs + 4));
    expect(capture.samples([rudder], capture.range(ms(captureWindowMs + 4))!)[0].map(sample => sample.value)).toEqual([4]);
});

it('follows the current path and creates a new segment after a switch or disconnect', () => {
    const capture = new LiveCapture(20);
    capture.source(11, 'wifi');
    capture.start(start);
    publish(capture, rudder, ms(1), [1]);
    publish(capture, rudder, ms(2), [2], 'serial');
    capture.source(11, 'serial');
    publish(capture, rudder, ms(3), [3]);
    publish(capture, rudder, ms(4), [4], 'serial');
    capture.disconnect();
    publish(capture, rudder, ms(5), [5], 'serial');
    capture.source(11, 'serial');
    publish(capture, rudder, ms(6), [6], 'serial');
    const [samples] = capture.samples([rudder], capture.range(ms(7))!);
    expect(samples.map(sample => [sample.value, sample.transport])).toEqual([[1, 'wifi'], [4, 'serial'], [6, 'serial']]);
    expect(new Set(samples.map(sample => sample.segment)).size).toBe(3);
});
