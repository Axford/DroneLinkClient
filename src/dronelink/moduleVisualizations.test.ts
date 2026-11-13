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

test('power telemetry rejects the wrong shape and preserves valid neighbouring input slots', () => {
    const single = channel(6, 3.2);
    const triple = channel(7, 3.2, 'INA3221');
    const scalar = single.params[15];
    const vector = { ...scalar, numValues: 3, values: [3.2, NaN, 3.8] };
    single.params[15] = vector;
    triple.params[15] = vector;
    triple.params[19] = { ...vector, param: 19, values: [100, 200, 300] };
    triple.params[20] = { ...vector, param: 20, values: [-2, 0, 3] };
    triple.params[16] = { ...vector, param: 16, values: [0, 1, 0] };

    expect(channelVisualization(single)?.inspector?.(single, thresholds)).toMatchObject({
        primary: [{ unavailable: true, reading: vector }]
    });
    const summary = channelVisualization(triple)?.inspector?.(triple, thresholds);
    expect(summary && 'inputs' in summary && summary.inputs.map(input => input.voltage)).toMatchObject([
        { text: '3.20 V', voltageDial: 3.2, reading: vector },
        { unavailable: true, reading: vector },
        { text: '3.80 V', voltageDial: 3.8, reading: vector }
    ]);
    if (!summary || !('inputs' in summary)) throw new Error('Expected three power inputs');
    ['-2.00 Ah', '0.00 Ah', '3.00 Ah'].forEach((usage, index) => {
        expect(summary.inputs[index].voltage.severity).toBeUndefined();
        expect(summary.inputs[index].readings).toEqual(expect.arrayContaining([
            expect.objectContaining({ parameterId: 20, text: usage }),
            expect.objectContaining({ parameterId: 16, unavailable: true })
        ]));
    });

    triple.params[15] = scalar;
    expect(channelVisualization(triple)?.inspector?.(triple)).toMatchObject({
        inputs: Array.from({ length: 3 }, () => ({ voltage: { unavailable: true, reading: scalar } }))
    });
});

test.each([
    [600, 0, 'Water 80%', 'warning'],
    [600, 1, 'Water alarm 80%', 'danger'],
    [600, 2, 'Water 80%', 'warning'],
    [480, 0, 'Water 100%', undefined],
    [960, 0, 'Water 50%', undefined],
    [0, 1, 'Water alarm 480', 'danger'],
    [undefined, 0, 'Water 480', undefined]
] as const)('WaterSensor threshold %s and alarm %s drive the node chip independently', (threshold, alarm, text, severity) => {
    const observed = channel(6, 480, 'WaterSensor');
    const raw = { ...observed.params[15], param: 11, msgType: DRONE_LINK_MSG_TYPE_UINT32_T };
    observed.params[11] = raw;
    if (threshold !== undefined) observed.params[12] = { ...raw, param: 12, values: [threshold] };
    observed.params[13] = { ...observed.params[15], param: 13, values: [alarm], source: 'Local' };
    const node: NodeState = { id: 7, channels: { 6: observed }, lastHeard: 1000 };
    expect(moduleSummaries(node)[0]).toMatchObject({ text, severity, reading: raw });
    expect(channelVisualization(observed)?.inspector?.(observed)).toMatchObject({
        threshold,
        alarm: { unavailable: alarm === 2, reading: observed.params[13] }
    });
});
