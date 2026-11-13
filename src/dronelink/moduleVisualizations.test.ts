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

test('Neopixel reads four ordered RGB triples after the header and requires a valid complete scene', () => {
    const observed = channel(6, 0, 'Neopixel');
    const values = [48, 2, 15, 30, 56, 169, 254, 41, 202, 128, 243, 113, 52, 0, 0, 0];
    const scene = { ...observed.params[15], param: 8, msgType: DRONE_LINK_MSG_TYPE_UINT8_T,
        bytesPerValue: 1, numValues: 16, values };
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    observed.params[8] = scene;
    expect(inspect()).toMatchObject({
        sceneColours: ['#38A9FE', '#29CA80', '#F37134', '#000000'],
        details: [{ parameterId: 8, reading: scene }]
    });
    for (const invalid of [
        { ...scene, values: values.slice(0, 15) },
        { ...scene, numValues: 15 },
        { ...scene, msgType: DRONE_LINK_MSG_TYPE_FLOAT },
        { ...scene, values: [...values.slice(0, 15), 256] },
        { ...scene, lastHeard: undefined }
    ]) {
        observed.params[8] = invalid;
        expect(inspect()).toMatchObject({
            sceneColours: [undefined, undefined, undefined, undefined],
            details: [{ unavailable: true }]
        });
    }
});

test('Joystick preserves signed axes, button state and per-parameter availability', () => {
    const observed = channel(6, 0, 'Joystick');
    const [x, y, z, button] = [0, -0.35, 0.42, 1].map((value, index) => ({
        ...observed.params[15], param: 10 + index, values: [value], lastHeard: 501 + index
    }));
    Object.assign(observed.params, { 10: x, 11: y, 12: z, 13: button });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);

    expect(inspect()).toMatchObject({
        joystick: { x: 0, y: -0.35, z: 0.42, pressed: true },
        details: [
            { text: '0.00', reading: x }, { text: '-0.35', reading: y },
            { text: '0.42', reading: z }, { text: 'Pressed', reading: button }
        ]
    });
    observed.params[11] = { ...y, values: [1.5] };
    observed.params[12] = { ...z, values: [-1] };
    observed.params[13] = { ...button, values: [-1] };
    expect(inspect()).toMatchObject({
        joystick: { x: 0, y: undefined, z: -1, pressed: false },
        details: [
            { unavailable: false }, { unavailable: true }, { text: '-1.00' }, { text: 'Released' }
        ]
    });
});

test('Receiver preserves signed output order, raw PWM units and the observed mode boundary', () => {
    const observed = channel(6, 0, 'Receiver');
    const scalar = observed.params[15];
    const output = (id: number, value: number) => ({ ...scalar, param: id, values: [value] });
    const raw = { ...scalar, param: 20, msgType: DRONE_LINK_MSG_TYPE_UINT8_T, bytesPerValue: 1, numValues: 6,
        values: [150, 170, 120, 0, 140, 160], source: 'Local' };
    Object.assign(observed.params, {
        11: output(11, 0.2), 12: output(12, -0.4), 13: output(13, 0), 14: output(14, 1.2),
        15: output(15, -0.25), 16: output(16, 0.7), 20: raw, 29: output(29, 0.5)
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        receiverOutputs: [{ value: 0.2 }, { value: -0.4 }, { value: 0 }, { value: 1.2 }],
        mode: { text: 'Active', reading: observed.params[29] },
        rawPwm: [1500, 1700, 1200, 0, 1400, 1600],
        details: expect.arrayContaining([
            expect.objectContaining({ parameterId: 16, text: '0.70' }),
            expect.objectContaining({ parameterId: 20, reading: raw })
        ])
    });
    observed.params[29] = output(29, 0.49);
    expect(inspect()).toMatchObject({ mode: { text: 'Passthrough' } });
    delete observed.params[29];
    observed.params[20] = { ...raw, values: raw.values.slice(1) };
    expect(inspect()).toMatchObject({ mode: { unavailable: true }, rawPwm: undefined });
});

test('Motor preserves input and provenance when the configured scale cannot be drawn', () => {
    const observed = channel(6, 0, 'Motor');
    const speed = { ...observed.params[15], param: 8 };
    const limits = { ...speed, param: 12, numValues: 2, values: [-0.75, 1], lastHeard: 600 };
    const deadband = { ...speed, param: 13, values: [-0.12], lastHeard: 700 };
    Object.assign(observed.params, { 8: speed, 12: limits, 13: deadband });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        mappedSpeed: 0.125, limits: { min: -0.75, max: 1 }, deadband: 0.12,
        details: [{ text: '0.00', reading: speed }, { reading: limits }, { text: '±0.12', reading: deadband }]
    });
    observed.params[8] = { ...speed, values: [1] };
    expect(inspect()).toMatchObject({ motorSpeed: { text: '1.00' }, mappedSpeed: 1 });
    observed.params[8] = speed;
    for (const values of [[0.4, 0.4], [1, -1], [NaN, 1], [0.3]]) {
        observed.params[12] = { ...limits, values };
        expect(inspect()).toMatchObject({ motorSpeed: { text: '0.00' }, mappedSpeed: undefined, limits: undefined, configuredLimits: { unavailable: true } });
    }
    delete observed.params[12];
    expect(inspect()).toMatchObject({ motorSpeed: { text: '0.00' }, mappedSpeed: undefined, limits: undefined });
});

test('Servo projects the configured map and keeps independently reported values', () => {
    const observed = channel(6, 0, 'Servo');
    const scalar = observed.params[15];
    const position = { ...scalar, param: 8 };
    const map = { ...scalar, param: 12, numValues: 4, values: [0, 60, 120, 180] };
    const centre = { ...scalar, param: 13, values: [-10] };
    const angle = { ...scalar, param: 14, values: [67.5], source: 'Local' };
    Object.assign(observed.params, { 8: position, 12: map, 13: centre, 14: angle });
    const inspect = () => {
        const summary = channelVisualization(observed)?.inspector?.(observed);
        if (!summary || !('servoPosition' in summary)) throw new Error('Servo summary unavailable');
        return summary;
    };
    const { curve, details } = inspect();
    expect([curve?.[0], curve?.[30], curve?.[60]]).toEqual([0, 80, 170]);
    expect(details).toMatchObject([{ reading: position }, { text: '67.5°', reading: angle }, { reading: map }, { reading: centre }]);
    observed.params[13] = { ...centre, values: [30] };
    expect(inspect().curve?.[60]).toBe(180);
    observed.params[12] = { ...map, values: [0, 0, 0, 0] };
    expect(inspect().curve).toEqual(Array(61).fill(30));
    observed.params[12] = { ...map, values: [0, 60, 120] };
    expect(inspect()).toMatchObject({ curve: undefined, position: 0, angle: 67.5 });
    observed.params[12] = map;
    delete observed.params[13];
    expect(inspect().curve).toBeUndefined();
});
