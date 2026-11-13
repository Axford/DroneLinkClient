import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T } from './DroneLinkMsg';
import type { ChannelState, NodeState, ParameterState } from './DroneLinkState';
import { channelVisualization, moduleSummaries, PacketTelemetryRenderer } from './moduleVisualizations';
import type { VisualizationSetting } from './visualizationSettings';

const channel = (id: number, volts: number, type = 'INA219'): ChannelState => ({
    channel: id, lastHeard: 1000, params: {
        5: { param: 5, values: [type], msgType: DRONE_LINK_MSG_TYPE_CHAR, bytesPerValue: 1, numValues: type.length, writable: false },
        15: { param: 15, values: [volts], msgType: DRONE_LINK_MSG_TYPE_FLOAT, bytesPerValue: 4, numValues: 1,
            writable: false, lastHeard: 500, source: 'HTTP' }
    }
});
const thresholds = { redBelow: 3.25, amberBelow: 3.5 };
const record: VisualizationSetting = { nodeAddress: 7, channel: 6, moduleType: 'INA219', revision: 1, thresholds };

test.each([[3.2, 'danger'], [3.25, 'warning'], [3.49, 'warning'], [3.5, undefined], [NaN, undefined]])(
    'voltage %s uses the same boundary in the overlay and Inspector while other channels stay neutral',
    (volts, severity) => {
        const selected = channel(6, volts);
        const node: NodeState = { id: 7, lastHeard: 1000, channels: { 6: selected, 7: channel(7, 3.2) } };
        const [first, other] = moduleSummaries(node, target => target.channel === 6 && target.moduleType === 'INA219' ? record : undefined);
        expect(first.severity).toBe(severity);
        expect(first.reading?.lastHeard).toBe(500);
        expect(other.severity).toBeUndefined();
        const summary = channelVisualization(selected)?.inspector?.(selected, thresholds);
        const primary = summary && 'primary' in summary ? summary.primary[0] : undefined;
        expect(primary).toBeDefined();
        expect(primary?.severity).toBe(severity);
        expect(moduleSummaries(node, () => ({ ...record, thresholds: null }))[0].severity).toBeUndefined();
    }
);

test('saved INA219 thresholds only apply when a matching module is observed again', () => {
    const node: NodeState = { id: 7, observationGeneration: 1, lastHeard: 1000, channels: {} };
    expect(moduleSummaries(node, () => record)).toEqual([]);
    expect(moduleSummaries({ ...node, channels: { 6: channel(6, 3.2, 'NMEA') } }, () => record)[0].label).toBe('Satellites');
    expect(moduleSummaries({ ...node, channels: { 6: channel(6, 3.2) } }, () => record)[0].severity).toBe('danger');
});

test.each([
    ['SerialTelemetry', 9, 10],
    ['UDPTelemetry', 10, 11]
])('%s packet mapping keeps the count and rate facets independent', (type, countsParameter, ratesParameter) => {
    const renderer = new PacketTelemetryRenderer({ countsParameter, ratesParameter });
    const counts: ParameterState = { param: countsParameter, msgType: DRONE_LINK_MSG_TYPE_UINT32_T, bytesPerValue: 4,
        writable: false, numValues: 3, values: [4294967295, 2, 0], lastHeard: 700, source: 'Gateway 254' };
    const rates = { ...counts, param: ratesParameter, msgType: DRONE_LINK_MSG_TYPE_FLOAT,
        values: [12.4, 0, 2.5], lastHeard: 900, source: 'HTTP' };
    const observed: ChannelState = { channel: 4, type, lastHeard: 900, params: { [countsParameter]: counts, [ratesParameter]: rates } };

    expect(renderer.inspector(observed)).toMatchObject({
        columns: [
            { label: 'Sent', count: '4294967295', rate: '12.4/s' },
            { label: 'Received', count: '2', rate: '0.0/s' },
            { label: 'Rejected', count: '0', rate: '2.5/s' }
        ],
        details: [{ parameterId: countsParameter, reading: counts }, { parameterId: ratesParameter, reading: rates }]
    });

    const invalidRate = { ...rates, values: [12.4, NaN, 2.5] };
    const invalidCount = { ...counts, msgType: DRONE_LINK_MSG_TYPE_FLOAT };
    expect(renderer.inspector({ ...observed, params: { ...observed.params, [ratesParameter]: invalidRate } }).columns[0])
        .toEqual({ label: 'Sent', count: '4294967295', rate: undefined });
    expect(renderer.inspector({ ...observed, params: { ...observed.params, [countsParameter]: invalidCount } }).columns[0])
        .toEqual({ label: 'Sent', count: undefined, rate: '12.4/s' });
});

test.each([[72, '-72 dBm'], [0, '0 dBm'], [101, '—'], [-1, '—'], [NaN, '—']])(
    'RFM69 uses the same signed RSSI for the Inspector and node chip (%s)',
    (value, text) => {
        const observed = channel(4, 0, 'RFM69Telemetry');
        observed.params[8] = { ...observed.params[15], param: 8, values: [value] };
        const node: NodeState = { id: 7, lastHeard: 1000, channels: { 4: observed } };
        const signal = moduleSummaries(node)[0];
        const summary = channelVisualization(observed)?.inspector?.(observed);
        expect(signal.text).toBe(text);
        expect(signal.severity).toBeUndefined();
        expect(summary && 'columns' in summary && summary.signal).toEqual(signal);
    }
);

test.each([[0, 'Clear'], [1, 'Triggered'], [2, '—']])('INA219 keeps the device alarm %s independent of display thresholds', (alarm, text) => {
    const observed = channel(6, 0);
    observed.params[16] = { ...observed.params[15], param: 16, msgType: DRONE_LINK_MSG_TYPE_UINT8_T, bytesPerValue: 1, values: [alarm], source: 'Local' };
    observed.params[19] = { ...observed.params[15], param: 19, values: [0] };
    const summary = channelVisualization(observed)?.inspector?.(observed, thresholds);
    expect(summary).toMatchObject({
        primary: [{ voltageDial: 0, severity: 'danger' }],
        supporting: expect.arrayContaining([
            expect.objectContaining({ label: 'Device alarm', text, reading: observed.params[16] }),
            expect.objectContaining({ label: 'Usage', text: '0.00 Ah' })
        ])
    });
});
