import { DRONE_LINK_MSG_TYPE_ADDR, DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T } from './DroneLinkMsg';
import type { ChannelState, NodeState, ParameterState } from './DroneLinkState';
import { channelVisualization, moduleSummaries, spatialSummaries, depthLogSample, PacketTelemetryRenderer } from './moduleVisualizations';
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

test('LSM9DS1 keeps its reported heading and suppresses invalid calibration geometry', () => {
    const compass = channel(6, 0, 'LSM9DS1');
    const gps = channel(4, 0, 'NMEA');
    const scalar = compass.params[15];
    const reading = (param: number, values: number[]) => ({ ...scalar, param, values, numValues: values.length });
    compass.params = { ...compass.params, 10: reading(10, [5, -10, 15]), 11: reading(11, [218]),
        13: reading(13, [-32, 2, 34]), 14: reading(14, [-29, 3, 31]), 18: reading(18, [31, 34, -29, -32]) };
    gps.params[10] = { ...reading(10, [70]), lastHeard: 8000 };
    const node: NodeState = { id: 7, lastHeard: 8000, channels: { 4: gps, 6: compass } };
    const inspect = () => channelVisualization(compass)?.inspector?.(compass);
    expect(spatialSummaries(node).find(summary => summary.binding?.role === 'heading')).toMatchObject({ channelId: 6, parameterId: 11 });
    expect(inspect()).toMatchObject({
        primary: [{ bearing: 218, reading: compass.params[11] }],
        magneticCalibration: { vector: { x: 5, y: -10, z: 15 }, limits: { minX: -32, maxX: 34, minY: -29, maxY: 31 } }
    });
    for (const values of [[0, 0, 0, 0], [31, -32, -29, 34], [31, -32, -29]]) {
        compass.params[18] = reading(18, values);
        expect(inspect()).toMatchObject({ magneticCalibration: { limits: undefined } });
    }
    delete compass.params[18];
    compass.params[13] = reading(13, [0, 0, 0]);
    expect(inspect()).toMatchObject({ magneticCalibration: { limits: undefined, xAxis: undefined } });
});

test('CMPS12 keeps the adjusted heading and reads pitch before roll', () => {
    const observed = channel(6, 0, 'CMPS12');
    const scalar = observed.params[15];
    Object.assign(observed.params, {
        10: { ...scalar, param: 10, values: [142] },
        12: { ...scalar, param: 12, values: [2] },
        13: { ...scalar, param: 13, numValues: 2, values: [14, -22] }
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        primary: [{ bearing: 142, reading: observed.params[10] }],
        attitude: { pitch: 14, roll: -22 },
        additionalDetails: [{ reading: observed.params[13] }, { text: '2.0°', reading: observed.params[12] }]
    });
    observed.params[12] = { ...scalar, param: 12, values: [-3] };
    expect(inspect()).toMatchObject({ primary: [{ bearing: 142 }], attitude: { pitch: 14, roll: -22 } });
    observed.params[13] = { ...observed.params[13], values: [0, 0] };
    expect(inspect()).toMatchObject({ attitude: { pitch: 0, roll: 0 } });
    observed.params[13] = { ...observed.params[13], values: [91, 0] };
    expect(inspect()).toMatchObject({ primary: [{ bearing: 142 }], attitude: undefined });
});

test.each([['NMEA', 10], ['LSM9DS1', 11], ['CMPS12', 10]] as const)(
    '%s validates the heading at its own parameter and preserves its provenance',
    (type, parameter) => {
        const observed = channel(6, 0, type);
        const heading = { ...observed.params[15], param: parameter, values: [360] };
        observed.params[parameter] = heading;
        observed.params[parameter === 10 ? 11 : 10] = { ...heading, values: [123] };
        const inspect = () => channelVisualization(observed)?.inspector?.(observed);
        expect(inspect()).toMatchObject({ primary: [{ bearing: 360, text: '360.0°', reading: heading }] });
        for (const invalid of [-1, 361, NaN]) {
            observed.params[parameter] = { ...heading, values: [invalid] };
            expect(inspect()).toMatchObject({ primary: [{ bearing: undefined, unavailable: true }] });
        }
    }
);

test('HMC5883L keeps raw vector origin separate from the calibration bounds', () => {
    const observed = channel(6, 0, 'HMC5883L');
    const scalar = observed.params[15];
    const reading = (param: number, values: number[]) => ({ ...scalar, param, values, numValues: values.length });
    Object.assign(observed.params, {
        10: reading(10, [0.2, 0.7, 0.5, 80]), 11: reading(11, [138]),
        13: reading(13, [-6, 2, 6]), 14: reading(14, [-3, 0, 3]), 15: reading(15, [-4, 0, 4]),
        21: reading(21, [1, -2, 3, 0]), 22: reading(22, [12]), 24: reading(24, [-17])
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        magneticHeading: { bearing: 138 }, pitchDegrees: 12, rollDegrees: -17, quality: { severity: 'warning' },
        scene: { vector: { from: [2, 0, 0], to: [1, -2, 3] }, calibration: { centre: [0, 0, 0], radii: [6, 3, 4] } }
    });
    observed.params[15] = reading(15, [4, 0, -4]);
    expect(inspect()).toMatchObject({ scene: { calibration: undefined, vector: { from: undefined, to: [1, -2, 3] } } });
});

test('MPU6050 uses signed independent angles and calibrated acceleration from the origin', () => {
    const observed = channel(6, 0, 'MPU6050');
    const scalar = observed.params[15];
    const reading = (param: number, values: number[]) => ({ ...scalar, param, values, numValues: values.length });
    Object.assign(observed.params, {
        10: reading(10, [2, -3, 6]), 13: reading(13, [14]), 14: { ...reading(14, [-19]), source: 'Local', lastHeard: 600 },
        15: reading(15, [9, 9, 9, 0]), 16: reading(16, [-8, 2, 12]), 17: reading(17, [-10, 0, 10]), 18: reading(18, [-6, 1, 8])
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        pitch: { text: '14.0°', reading: observed.params[13] },
        roll: { text: '-19.0°', reading: observed.params[14] },
        scene: { vector: { from: [0, 0, 0], to: [2, -3, 6] }, calibration: { centre: [2, 0, 1], radii: [10, 10, 7] } },
        diagnosticReadings: expect.arrayContaining([
            expect.objectContaining({ parameterId: 10, reading: observed.params[10], text: 'X 2.0 · Y -3.0 · Z 6.0 · Magnitude 7.0 m/s²' })
        ])
    });
    observed.params[18] = reading(18, [8, 1, -6]);
    expect(inspect()).toMatchObject({ scene: { calibration: undefined, vector: { from: [0, 0, 0], to: [2, -3, 6] } } });
    observed.params[10] = reading(10, [2, NaN, 6]);
    expect(inspect()).toMatchObject({ scene: { vector: undefined } });
});

test.each([[0, undefined], [30, undefined], [30.01, 'warning'], [40, 'warning'], [40.01, 'danger'], [NaN, undefined]])(
    'MPU6050 temperature %s uses the unrounded reading in the node chip and Inspector',
    (value, severity) => {
        const observed = channel(6, 0, 'MPU6050');
        const temperature = { ...observed.params[15], param: 12, values: [value] };
        observed.params[12] = temperature;
        const node: NodeState = { id: 7, channels: { 6: observed }, lastHeard: 1000 };
        const valid = Number.isFinite(value);
        const chip = moduleSummaries(node)[0];
        const inspector = channelVisualization(observed)?.inspector?.(observed);
        const summary = inspector && 'temperature' in inspector ? inspector.temperature : undefined;
        expect(chip.severity).toBe(severity);
        expect(summary?.severity).toBe(severity);
        expect(chip).toMatchObject({ reading: temperature, unavailable: !valid,
            text: valid ? value.toFixed(0) + ' °C' : '—' });
        expect(summary).toMatchObject({
            reading: temperature, unavailable: !valid, text: valid ? value.toFixed(1) + ' °C' : '—'
        });
    }
);


test('Depth keeps current depth separate from the log vector and treats zero as no echo', () => {
    const observed = channel(6, 0, 'Depth');
    const reading = (param: number, values: number[]) => ({
        ...observed.params[15], param, values, numValues: values.length
    });
    observed.params[13] = reading(13, [0]);
    observed.params[14] = { ...reading(14, [-1, 51, 4.25]), lastHeard: 750 };
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        measuredDepth: { text: 'No echo', unavailable: true, reading: observed.params[13] },
        details: [
            { parameterId: 13, text: 'No echo' },
            { parameterId: 14, text: '4.25 m', reading: observed.params[14] }
        ]
    });
    expect(depthLogSample(observed.params[14])).toBe(4.25);
    for (const malformed of [[-1, 51, 0], [-1, 51, -4], [-1, 51, NaN], [-1, 51]]) {
        expect(depthLogSample(reading(14, malformed))).toBeUndefined();
    }
});


test('Wind reads independent World and Local bearings without borrowing the other frame', () => {
    const observed = channel(6, 0, 'Wind');
    const scalar = observed.params[15];
    const world = { ...scalar, param: 14, values: [360], lastHeard: 900 };
    const local = { ...scalar, param: 10, values: [0], lastHeard: 800, source: 'Local' };
    observed.params[14] = world;
    observed.params[10] = local;
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        worldWind: { bearing: 360, text: '360°', reading: world },
        localWind: { bearing: 0, text: '0°', reading: local }
    });
    observed.params[14] = { ...world, values: [120, 3, 2], numValues: 3 };
    expect(inspect()).toMatchObject({
        worldWind: { unavailable: true },
        localWind: { bearing: 0, reading: local }
    });
});


test('WindFromWing uses the reported estimate and never presents its angle of attack as a wind bearing', () => {
    const observed = channel(6, 0, 'WindFromWing');
    const estimate = { ...observed.params[15], values: [254], lastHeard: 900 };
    observed.params[15] = estimate;
    observed.params[14] = { ...estimate, param: 14, values: [15] };
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        worldWind: { bearing: 254, text: '254°', reading: estimate },
        details: [{ parameterId: 15, reading: estimate }]
    });
    expect(inspect()).not.toHaveProperty('localWind');
    observed.params[15] = { ...estimate, values: [254, 7.6, 2.8], numValues: 3 };
    expect(inspect()).toMatchObject({ worldWind: { unavailable: true } });
});


test('Nav compares independent bearings and uses observed target subscription bytes', () => {
    const observed = channel(6, 0, 'Nav');
    const scalar = observed.params[15];
    const adjusted = { ...scalar, param: 20, values: [-45], lastHeard: 800 };
    const targetSource = { ...scalar, param: 13, msgType: DRONE_LINK_MSG_TYPE_ADDR, values: [7, 22, 4, 200], lastHeard: 900 };
    Object.assign(observed.params, {
        8: { ...scalar, param: 8, values: [0] }, 9: { ...scalar, param: 9, values: [1250] },
        13: targetSource, 17: { ...scalar, param: 17, values: [-2.5] }, 20: adjusted
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        navigationBearings: { heading: { bearing: 0 }, adjusted: { bearing: 315, text: '315°', reading: adjusted },
            wind: { unavailable: true } },
        crossTrack: { text: '-2.5' },
        following: { text: '22>4.8', reading: targetSource }, followingNode: 22
    });
    expect(moduleSummaries({ id: 7, lastHeard: 1000, channels: { 6: observed } })[0]).toMatchObject({ text: '1.3 km' });
    observed.params[13] = { ...targetSource, values: [7, 22, 4] };
    expect(inspect()).toMatchObject({ following: { unavailable: true } });
});


test('Waypoint keeps route progress and ETA distinct across first, last, empty and one-point routes', () => {
    const observed = channel(6, 0, 'Waypoint');
    const scalar = observed.params[15];
    const byte = (param: number, value: number) => ({ ...scalar, param, msgType: DRONE_LINK_MSG_TYPE_UINT8_T, values: [value] });
    const distances = (values: number[]) => ({ ...scalar, values, numValues: values.length });
    Object.assign(observed.params, {
        9: byte(9, 6), 10: byte(10, 0), 14: byte(14, 1),
        15: distances([300, 4500, 4200]), 16: { ...scalar, param: 16, values: [0] }
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        waypoint: { text: '1 of 6' }, loop: { text: 'Loop' }, eta: undefined,
        routeProgress: { completed: 0, next: 0 }
    });
    observed.params[10] = byte(10, 5);
    observed.params[15] = distances([0, 0, 4200]);
    expect(inspect()).toMatchObject({ waypoint: { text: '6 of 6' }, routeProgress: { completed: 1, next: 1 } });
    observed.params[9] = byte(9, 1);
    observed.params[10] = byte(10, 0);
    observed.params[15] = distances([250, 250, 0]);
    observed.params[16] = { ...scalar, param: 16, values: [2] };
    expect(inspect()).toMatchObject({ waypoint: { text: '1 of 1' }, routeProgress: undefined, eta: '02:05' });
    observed.params[9] = byte(9, 0);
    expect(inspect()).toMatchObject({ waypoint: { text: 'No route' }, remaining: { unavailable: true },
        routeProgress: undefined, eta: undefined, speed: { unavailable: true },
        details: expect.arrayContaining([expect.objectContaining({ parameterId: 15, reading: observed.params[15] })]) });
});


test('Sailor keeps live and course wind separate and handles four-byte flags', () => {
    const observed = channel(6, 0, 'Sailor');
    const scalar = observed.params[15];
    const reading = (param: number, values: number[], msgType: number = DRONE_LINK_MSG_TYPE_FLOAT) => ({
        ...scalar, param, values, numValues: values.length, msgType
    });
    const flags = reading(21, [2, 1, 2, 255], DRONE_LINK_MSG_TYPE_UINT8_T);
    Object.assign(observed.params, {
        8: reading(8, [-5]), 12: reading(12, [220]), 16: reading(16, [-4]), 17: reading(17, [0]),
        18: reading(18, Array(16).fill(50), DRONE_LINK_MSG_TYPE_UINT8_T), 21: flags,
        22: reading(22, [1]), 24: reading(24, [-0.5])
    });
    expect(channelVisualization(observed)?.inspector?.(observed)).toMatchObject({
        sailBearings: { target: { bearing: 355 }, course: { bearing: 356 }, wind: { bearing: 220 },
            courseWind: { bearing: 360, reading: flags }, wing: { bearing: 10 } },
        gybing: true, rudderOutput: -0.5, sheet: { text: '0.0' }, speeds: [undefined, undefined],
        context: expect.arrayContaining([
            expect.objectContaining({ label: 'Crossing wind', unavailable: true }),
            expect.objectContaining({ label: 'Helm', text: 'Gybing' })
        ])
    });
});


test('Proa wraps the reported course and scales steering commands in the vessel frame', () => {
    const observed = channel(6, 0, 'Proa');
    const scalar = observed.params[15];
    const read = (param: number, value: number, msgType: number = DRONE_LINK_MSG_TYPE_FLOAT) =>
        ({ ...scalar, param, values: [value], msgType });
    Object.assign(observed.params, {
        16: read(16, 524), 17: read(17, -0.5), 22: read(22, 0.5), 23: read(23, -1),
        24: read(24, 125), 28: read(28, -20), 29: read(29, 0, DRONE_LINK_MSG_TYPE_UINT8_T)
    });
    expect(channelVisualization(observed)?.inspector?.(observed)).toMatchObject({
        proaBearings: { course: { bearing: 164, reading: observed.params[16] }, frame: { bearing: 144 } },
        steering: { wing: { bearing: -45 }, left: { bearing: 60 }, right: { bearing: -120 }, bow: { bearing: 125 } },
        context: expect.arrayContaining([expect.objectContaining({ label: 'Operation', text: 'Passive' })])
    });
});


test('TurnRate preserves signed outputs, valid zero, and the observed gybe mode', () => {
    const observed = channel(6, 0, 'TurnRate');
    const scalar = observed.params[15];
    const rate = (value: number) => ({ ...scalar, param: 16, values: [value] });
    Object.assign(observed.params, {
        10: { ...scalar, param: 10, values: [-3] }, 12: { ...scalar, param: 12, values: [4] },
        16: rate(-8.2), 19: { ...scalar, param: 19, msgType: DRONE_LINK_MSG_TYPE_UINT8_T, values: [2] }
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        target: { bearing: 357 }, heading: { bearing: 4 }, output: -8.2,
        turnOutput: { text: '-8.2', reading: observed.params[16] },
        mode: { text: 'Gybe', severity: 'danger' }, threshold: { unavailable: true }
    });
    observed.params[16] = rate(0);
    expect(inspect()).toMatchObject({ output: 0, turnOutput: { text: '0.0' }, gybing: true });
    observed.params[16] = rate(0.04);
    expect(inspect()).toMatchObject({ turnOutput: { text: '+<0.1' } });
    observed.params[16] = rate(11);
    expect(inspect()).toMatchObject({ turnOutput: { unavailable: true } });
});


test('TankSteer preserves each drive sign and does not turn invalid drive or distance into zero', () => {
    const observed = channel(6, 0, 'TankSteer');
    const scalar = observed.params[15];
    const read = (param: number, value: number) => ({ ...scalar, param, values: [value] });
    Object.assign(observed.params, {
        8: read(8, -0.65), 9: read(9, 0), 20: read(20, -3), 22: read(22, 0), 24: read(24, 43),
        10: { ...read(10, 1), msgType: DRONE_LINK_MSG_TYPE_UINT8_T }
    });
    const inspect = () => channelVisualization(observed)?.inspector?.(observed);
    expect(inspect()).toMatchObject({
        drives: { left: { output: -0.65, reading: { reading: observed.params[8] } }, right: { output: 0 } },
        heading: { bearing: 0 }, target: { bearing: 357 }, distanceMetres: 43, mode: { text: 'Automatic' }
    });
    observed.params[8] = read(8, 1.1);
    observed.params[9] = read(9, 0.001);
    observed.params[24] = read(24, -1);
    expect(inspect()).toMatchObject({
        drives: { left: { reading: { unavailable: true } }, right: { output: 0.001, reading: { text: '+<0.01' } } },
        distance: { unavailable: true }
    });
});
