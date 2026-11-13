import { ChannelState, NodeState, ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T, DRONE_MODULE_PARAM_TYPE } from './DroneLinkMsg';
import { locationCoordinates, MapBinding, mapBindings } from './mapBindings';
import type { VisualizationSetting, VisualizationSettingsDefinition, VisualizationTarget, VoltageThresholds } from './visualizationSettings';

export interface ObservedSummary {
    label: string;
    text: string;
    channelId: number;
    parameterId: number;
    reading?: ParameterState;
    severity?: 'warning' | 'danger';
    status?: string;
    unavailable?: boolean;
    binding?: MapBinding;
    bearing?: number;
    voltageDial?: number;
    lines?: string[];
    sources?: Pick<ObservedSummary, 'label' | 'channelId' | 'parameterId' | 'reading'>[];
}

export type InspectorSummary = {
    layout?: 'compact';
    primary: ObservedSummary[];
    supporting: ObservedSummary[];
} | PacketTelemetrySummary | { inputs: PowerInputSummary[] } | AnemometerSummary | WaterSensorSummary | ReceiverSummary | MotorSummary | ServoSummary | {
    joystick: { x?: number; y?: number; z?: number; pressed?: boolean };
    details: ObservedSummary[];
} | {
    sceneColours: (string | undefined)[];
    details: ObservedSummary[];
};

export interface ServoSummary {
    servoPosition: ObservedSummary;
    pwmAngle: ObservedSummary;
    position?: number;
    angle?: number;
    curve?: number[];
    controlPoints?: number[];
    details: ObservedSummary[];
}

export interface MotorSummary {
    motorSpeed: ObservedSummary;
    configuredLimits: ObservedSummary;
    deadbandReading: ObservedSummary;
    mappedSpeed?: number;
    limits?: { min: number; max: number };
    deadband?: number;
    details: ObservedSummary[];
}

export interface ReceiverSummary {
    receiverOutputs: { value?: number; reading: ObservedSummary }[];
    mode: ObservedSummary & { kind?: 'active' | 'passthrough' };
    rawPwm?: number[];
    details: ObservedSummary[];
}

export interface AnemometerSummary {
    windSpeed: ObservedSummary;
    knots?: number;
    metresPerSecond?: string;
}

interface WaterSensorSummary {
    waterLevel: number | undefined;
    thresholdRatio?: number;
    threshold: number | undefined;
    rawReading: ObservedSummary;
    thresholdReading: ObservedSummary;
    alarm: ObservedSummary;
}

interface PowerInputSummary {
    label: string;
    voltage: ObservedSummary;
    readings: ObservedSummary[];
}

interface PacketTelemetrySummary {
    columns: { label: string; count?: string; rate?: string }[];
    details: ObservedSummary[];
    note?: string;
    signal?: ObservedSummary;
}

interface PacketTelemetryDefinition {
    countsParameter: number;
    ratesParameter: number;
    note?: string;
}

interface ModuleVisualization {
    overlay?: (channel: ChannelState, thresholds?: VoltageThresholds | null) => ObservedSummary;
    inspector?: (channel: ChannelState, thresholds?: VoltageThresholds | null) => InspectorSummary;
    settings?: VisualizationSettingsDefinition;
}

function hasReading(reading: ParameterState | undefined): reading is ParameterState {
    return !!reading?.lastHeard && Number.isFinite(reading.lastHeard) && !reading.unavailable?.value;
}

function numericValue(reading: ParameterState | undefined, types: number[]): number | undefined {
    if (!hasReading(reading) || !types.includes(reading.msgType) || reading.numValues !== 1 || reading.values.length !== 1) return;
    const value = reading.values[0];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
}

function field(channel: ChannelState, parameterId: number, label: string, text?: string): ObservedSummary {
    const unavailable = text === undefined;
    return { label, text: text ?? '—', channelId: channel.channel, parameterId, reading: channel.params[parameterId],
        status: unavailable ? 'Unavailable' : undefined, unavailable };
}

function satelliteCount(channel: ChannelState): ObservedSummary {
    const count = numericValue(channel.params[9], [DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T]);
    if (count === undefined || count < 0 || !Number.isInteger(count)) return { ...field(channel, 9, 'Satellites'), text: '— sats' };
    const summary = field(channel, 9, 'Satellites', `${count} sats`);
    if (count < 4) return { ...summary, severity: 'danger', status: 'Very low satellite count' };
    if (count < 9) return { ...summary, severity: 'warning', status: 'Low satellite count' };
    return summary;
}

function positionText(reading: ParameterState | undefined): string | undefined {
    if (!hasReading(reading) || reading.msgType !== DRONE_LINK_MSG_TYPE_FLOAT || reading.numValues !== 3 ||
        reading.values.length !== 3 || !Number.isFinite(reading.values[2])) return;
    const coordinates = locationCoordinates({ reading });
    if (coordinates) return `${coordinates[1].toFixed(5)}°, ${coordinates[0].toFixed(5)}°`;
}

function byteArray(reading: ParameterState | undefined, length: number): number[] | undefined {
    if (!hasReading(reading) || reading.msgType !== DRONE_LINK_MSG_TYPE_UINT8_T ||
        reading.numValues !== length || reading.values.length !== length) return;
    const bytes = Array.from<number | string>(reading.values);
    if (bytes.every((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)) return bytes;
}

const resetReasons: Record<number, string> = {
    1: 'Power on', 3: 'Software reset', 4: 'Legacy watchdog', 5: 'Deep sleep', 6: 'SDIO reset',
    7: 'Timer group 0 watchdog', 8: 'Timer group 1 watchdog', 9: 'RTC watchdog', 10: 'Intrusion reset',
    11: 'Timer group CPU watchdog', 12: 'Software CPU reset', 13: 'RTC CPU watchdog',
    14: 'CPU reset by other core', 15: 'Brownout', 16: 'RTC module watchdog'
};

function uptimeText(seconds: number | undefined): string | undefined {
    if (seconds === undefined || !Number.isInteger(seconds) || seconds < 0 || seconds > 0xffffffff) return;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor(seconds / 60) % 60;
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds % 60}s`].filter(Boolean).join(' ');
}

function packetValues(reading: ParameterState | undefined, type: number): number[] | undefined {
    if (!hasReading(reading) || reading.msgType !== type || reading.numValues !== 3 || reading.values.length !== 3) return;
    const values = Array.from<number | string>(reading.values);
    const valid = (value: number | string): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
        (type !== DRONE_LINK_MSG_TYPE_UINT32_T || (Number.isInteger(value) && value <= 0xffffffff));
    if (values.every(valid)) return values;
}

export class PacketTelemetryRenderer {
    constructor(private readonly definition: PacketTelemetryDefinition) {}

    inspector(channel: ChannelState): PacketTelemetrySummary {
        const { countsParameter, ratesParameter, note } = this.definition;
        const counts = packetValues(channel.params[countsParameter], DRONE_LINK_MSG_TYPE_UINT32_T);
        const rates = packetValues(channel.params[ratesParameter], DRONE_LINK_MSG_TYPE_FLOAT);
        const columns = ['Sent', 'Received', 'Rejected'].map((label, index) => ({
            label,
            count: counts?.[index].toString(),
            rate: rates ? `${rates[index].toFixed(1)}/s` : undefined
        }));
        return {
            columns,
            details: [
                field(channel, countsParameter, 'Packet counts', counts && columns.map(({ label, count }) => `${label} ${count}`).join(' · ')),
                field(channel, ratesParameter, 'Packet rates', rates && columns.map(({ label, rate }) => `${label} ${rate}`).join(' · '))
            ],
            note
        };
    }
}

export function signedRssi(magnitude: number): number | undefined {
    if (magnitude >= 0 && magnitude <= 100) return 0 - magnitude;
}

function rfm69Signal(channel: ChannelState): ObservedSummary {
    const raw = numericValue(channel.params[8], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const rssi = raw === undefined ? undefined : signedRssi(raw);
    return field(channel, 8, 'RSSI', rssi === undefined ? undefined : `${Math.round(rssi)} dBm`);
}

const rfm69Packets = new PacketTelemetryRenderer({ countsParameter: 9, ratesParameter: 10 });

const powerQuantities = [
    { id: 14, label: 'Load voltage', unit: 'V' },
    { id: 12, label: 'Current', unit: 'A' },
    { id: 13, label: 'Power', unit: 'W' }
];

function powerQuantity(value: number | undefined, unit: string): string | undefined {
    if (value !== undefined) return `${value.toFixed(2)} ${unit}`;
}

const cellVoltageParameter = 15;
const deviceAlarmParameter = 16;

interface PowerTelemetryDefinition {
    inputCount: number;
    usageParameter: number;
}

class PowerTelemetryRenderer {
    constructor(private readonly definition: PowerTelemetryDefinition) {}

    inputs(channel: ChannelState): PowerInputSummary[] {
        return Array.from({ length: this.definition.inputCount }, (_, index) => ({
            label: `Input ${index + 1}`,
            voltage: this.cellVoltage(channel, index),
            readings: this.readings(channel, index)
        }));
    }

    private value(channel: ChannelState, id: number, type: number, index: number): number | undefined {
        const reading = channel.params[id];
        if (!hasReading(reading) || reading.msgType !== type ||
            reading.numValues !== this.definition.inputCount || reading.values.length !== this.definition.inputCount) return;
        const value = reading.values[index];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }

    private quantity(channel: ChannelState, id: number, index: number, label: string, unit: string): ObservedSummary {
        const value = this.value(channel, id, DRONE_LINK_MSG_TYPE_FLOAT, index);
        return field(channel, id, label, powerQuantity(value, unit));
    }

    cellVoltage(channel: ChannelState, index: number, thresholds?: VoltageThresholds | null): ObservedSummary {
        const volts = this.value(channel, cellVoltageParameter, DRONE_LINK_MSG_TYPE_FLOAT, index);
        const summary = field(channel, cellVoltageParameter, 'Cell voltage', powerQuantity(volts, 'V'));
        if (volts === undefined) return summary;
        const voltage = { ...summary, voltageDial: volts >= 0 ? volts : undefined };
        if (thresholds && volts < thresholds.redBelow) {
            return { ...voltage, severity: 'danger', status: `Below red threshold (${thresholds.redBelow} V)` };
        }
        if (thresholds && volts < thresholds.amberBelow) {
            return { ...voltage, severity: 'warning', status: `Below amber threshold (${thresholds.amberBelow} V)` };
        }
        return voltage;
    }

    readings(channel: ChannelState, index: number): ObservedSummary[] {
        const alarm = this.value(channel, deviceAlarmParameter, DRONE_LINK_MSG_TYPE_UINT8_T, index);
        return [
            ...powerQuantities.map(({ id, label, unit }) => this.quantity(channel, id, index, label, unit)),
            this.quantity(channel, this.definition.usageParameter, index, 'Usage', 'Ah'),
            field(channel, deviceAlarmParameter, 'Device alarm', alarm === 1 ? 'Triggered' : alarm === 0 ? 'Clear' : undefined)
        ];
    }
}

const ina219 = new PowerTelemetryRenderer({ inputCount: 1, usageParameter: 19 });
const ina3221 = new PowerTelemetryRenderer({ inputCount: 3, usageParameter: 20 });

export function windSpeedKnots(value: number): number | undefined {
    if (value >= 0) return value;
}

function waterSensorSummary(channel: ChannelState): WaterSensorSummary {
    const counts = (id: number) => {
        const value = numericValue(channel.params[id], [DRONE_LINK_MSG_TYPE_UINT32_T]);
        if (value !== undefined && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return value;
    };
    const waterLevel = counts(11);
    const threshold = counts(12);
    const thresholdRatio = waterLevel !== undefined && threshold !== undefined && threshold > 0 ? waterLevel / threshold : undefined;
    const nearThreshold = thresholdRatio !== undefined && thresholdRatio > 0.5 && thresholdRatio < 1;
    const rawReading = field(channel, 11, 'Raw level', waterLevel?.toString());
    const reportedAlarm = numericValue(channel.params[13], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const alarm = field(channel, 13, 'Device alarm', reportedAlarm === 1 ? 'Triggered' : reportedAlarm === 0 ? 'Clear' : undefined);
    return {
        waterLevel,
        threshold,
        thresholdRatio,
        rawReading: nearThreshold && reportedAlarm !== 1
            ? { ...rawReading, severity: 'warning', status: 'Above half of threshold' } : rawReading,
        thresholdReading: field(channel, 12, 'Threshold', threshold?.toString()),
        alarm: reportedAlarm === 1 ? { ...alarm, severity: 'danger' } : alarm
    };
}

function receiverSummary(channel: ChannelState): ReceiverSummary {
    const outputs = Array.from({ length: 6 }, (_, index) => {
        const id = 11 + index;
        const value = numericValue(channel.params[id], [DRONE_LINK_MSG_TYPE_FLOAT]);
        return { value, reading: field(channel, id, `Output ${index + 1}`, value?.toFixed(2)) };
    });
    const switchValue = numericValue(channel.params[29], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const kind = switchValue === undefined ? undefined : switchValue < 0.5 ? 'passthrough' : 'active';
    const mode = field(channel, 29, 'Mode', kind && { passthrough: 'Passthrough', active: 'Active' }[kind]);
    const rawPwm = byteArray(channel.params[20], 6)?.map(byte => byte * 10);
    const pwm = rawPwm?.map((value, index) => `Channel ${index + 1} ${value} µs`).join(' · ');
    return {
        receiverOutputs: outputs.slice(0, 4),
        mode: { ...mode, kind },
        rawPwm,
        details: [mode, ...outputs.map(output => output.reading), field(channel, 20, 'Raw PWM', pwm)]
    };
}

function motorSummary(channel: ChannelState): MotorSummary {
    const speed = numericValue(channel.params[8], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const reading = channel.params[12];
    let limits: MotorSummary['limits'];
    if (hasReading(reading) && reading.msgType === DRONE_LINK_MSG_TYPE_FLOAT &&
        reading.numValues === 2 && reading.values.length === 2) {
        const min = reading.values[0];
        const max = reading.values[1];
        if (typeof min === 'number' && typeof max === 'number' && min >= -1 && max <= 1 && min < max) {
            limits = { min, max };
        }
    }
    const deadbandValue = numericValue(channel.params[13], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const deadband = deadbandValue === undefined ? undefined : Math.abs(deadbandValue);
    // Match the firmware's clamp and remap before it applies deadband and inversion.
    const mappedSpeed = limits && speed !== undefined
        ? (Math.max(-1, Math.min(1, speed)) + 1) * (limits.max - limits.min) / 2 + limits.min
        : undefined;
    const motorSpeed = field(channel, 8, 'Speed input', speed?.toFixed(2));
    const configuredLimits = field(channel, 12, 'Configured limits', limits && `${limits.min.toFixed(2)} to ${limits.max.toFixed(2)}`);
    const deadbandReading = field(channel, 13, 'Deadband', deadband === undefined ? undefined : `±${deadband.toFixed(2)}`);
    return {
        motorSpeed,
        configuredLimits,
        deadbandReading,
        mappedSpeed,
        limits,
        deadband,
        details: [motorSpeed, configuredLimits, deadbandReading]
    };
}

function servoSummary(channel: ChannelState): ServoSummary {
    const readFloat = (id: number) => numericValue(channel.params[id], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const position = readFloat(8);
    const angle = readFloat(14);
    const centre = readFloat(13);
    const reading = channel.params[12];
    let map: number[] | undefined;
    if (hasReading(reading) && reading.msgType === DRONE_LINK_MSG_TYPE_FLOAT &&
        reading.numValues === 4 && reading.values.length === 4) {
        const values = Array.from<number | string>(reading.values);
        if (values.every((value): value is number => typeof value === 'number' && Number.isFinite(value))) map = values;
    }
    const controlPoints = map;
    const curve = controlPoints && centre !== undefined ? Array.from({ length: 61 }, (_, index) => {
        const [a, b, c, d] = controlPoints;
        const t = index / 60;
        const u = 1 - t;
        const target = a * u ** 3 + 3 * b * u ** 2 * t + 3 * c * u * t ** 2 + d * t ** 3 + centre;
        return Math.trunc(Math.min(180, Math.max(0, target)));
    }) : undefined;
    const servoPosition = field(channel, 8, 'Reported position', position?.toFixed(2));
    const pwmAngle = field(channel, 14, 'PWM output angle', angle === undefined ? undefined : `${angle.toFixed(1)}°`);
    return {
        servoPosition,
        pwmAngle,
        position,
        angle,
        curve,
        controlPoints,
        details: [
            servoPosition,
            pwmAngle,
            field(channel, 12, 'Map control points', map?.map(point => `${point.toFixed(1)}°`).join(' · ')),
            field(channel, 13, 'Centre adjustment', centre === undefined ? undefined : `${centre.toFixed(1)}°`)
        ]
    };
}

const visualizations = new Map<string, ModuleVisualization>([
    ['Servo', { inspector: servoSummary }],
    ['Motor', { inspector: motorSummary }],
    ['Receiver', { inspector: receiverSummary }],
    ['Joystick', {
        inspector(channel) {
            const axis = (id: number) => {
                const value = numericValue(channel.params[id], [DRONE_LINK_MSG_TYPE_FLOAT]);
                if (value !== undefined && Math.abs(value) <= 1) return value;
            };
            const x = axis(10);
            const y = axis(11);
            const z = axis(12);
            const button = axis(13);
            const pressed = button === undefined ? undefined : button > 0;
            return {
                joystick: { x, y, z, pressed },
                details: [
                    field(channel, 10, 'X', x?.toFixed(2)),
                    field(channel, 11, 'Y', y?.toFixed(2)),
                    field(channel, 12, 'Z', z?.toFixed(2)),
                    field(channel, 13, 'Button', pressed === undefined ? undefined : pressed ? 'Pressed' : 'Released')
                ]
            };
        }
    }],
    ['Neopixel', {
        inspector(channel) {
            const sceneParameter = 8;
            const headerBytes = 4;
            const segmentCount = 4;
            const bytesPerSegment = 3;
            const bytes = byteArray(channel.params[sceneParameter], headerBytes + segmentCount * bytesPerSegment);
            const sceneColours = Array.from({ length: segmentCount }, (_, index) => {
                const offset = headerBytes + index * bytesPerSegment;
                return bytes && `#${bytes.slice(offset, offset + bytesPerSegment)
                    .map(component => component.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
            });
            return {
                sceneColours,
                details: [field(channel, sceneParameter, 'Scene colours', bytes ? sceneColours.join(' · ') : undefined)]
            };
        }
    }],
    ['WaterSensor', {
        inspector: waterSensorSummary,
        overlay(channel) {
            const { thresholdRatio, rawReading, thresholdReading, alarm } = waterSensorSummary(channel);
            const label = alarm.severity === 'danger' ? 'Water alarm' : 'Water';
            const value = thresholdRatio === undefined ? rawReading.text : `${(thresholdRatio * 100).toFixed(0)}%`;
            return {
                ...rawReading,
                label: thresholdRatio === undefined ? 'Water sensor raw level' : 'Water sensor percentage of threshold',
                text: `${label} ${value}`,
                severity: alarm.severity ?? rawReading.severity,
                sources: thresholdRatio === undefined ? [rawReading, alarm] : [rawReading, thresholdReading, alarm],
                status: [
                    alarm.unavailable ? 'Device alarm unavailable' : `Device alarm ${alarm.text.toLowerCase()}`,
                    rawReading.status
                ].filter(Boolean).join(' · ')
            };
        }
    }],
    ['Anemometer', {
        inspector(channel) {
            const parameter = 10;
            const value = numericValue(channel.params[parameter], [DRONE_LINK_MSG_TYPE_FLOAT]);
            const knots = value === undefined ? undefined : windSpeedKnots(value);
            const windSpeed = field(channel, parameter, 'Wind speed', knots === undefined ? undefined : `${knots.toFixed(1)} kn`);
            return {
                windSpeed,
                knots,
                metresPerSecond: knots === undefined ? undefined : `${(knots / 1.94384).toFixed(1)} m/s`
            };
        }
    }],
    ['INA3221', { inspector: channel => ({ inputs: ina3221.inputs(channel) }) }],
    ['RFM69Telemetry', {
        overlay: rfm69Signal,
        inspector(channel) {
            const packets = rfm69Packets.inspector(channel);
            const signal = rfm69Signal(channel);
            return { ...packets, signal, details: [...packets.details, signal] };
        }
    }],
    ['SerialTelemetry', new PacketTelemetryRenderer({
        countsParameter: 9,
        ratesParameter: 10,
        note: 'Received means complete serial RX handoffs before DroneLink CRC validation. Rejected means serial framing rejects.'
    })],
    ['UDPTelemetry', new PacketTelemetryRenderer({ countsParameter: 10, ratesParameter: 11 })],
    ['NMEA', {
        overlay: satelliteCount,
        inspector(channel) {
            const heading = numericValue(channel.params[10], [DRONE_LINK_MSG_TYPE_FLOAT]);
            const bearing = heading !== undefined && heading >= 0 && heading <= 360 ? heading : undefined;
            const speed = numericValue(channel.params[11], [DRONE_LINK_MSG_TYPE_FLOAT]);
            return {
                primary: [{ ...field(channel, 10, 'Heading', bearing === undefined ? undefined : `${bearing.toFixed(1)}°`), bearing }],
                supporting: [field(channel, 8, 'Position', positionText(channel.params[8])), satelliteCount(channel),
                    field(channel, 11, 'Speed', speed !== undefined && speed >= 0 ? `${speed.toFixed(1)} kn` : undefined)]
            };
        }
    }],
    ['INA219', {
        settings: {
            moduleType: 'INA219',
            description: 'Shared cell-voltage colours for this channel.',
            invalidMessage: 'Enter two positive voltage thresholds. The red threshold must be lower than amber.',
            fields: [{ key: 'redBelow', label: 'Red below (V)' }, { key: 'amberBelow', label: 'Amber below (V)' }],
            parse(draft) {
                const redBelow = Number(draft.redBelow), amberBelow = Number(draft.amberBelow);
                return Number.isFinite(redBelow) && Number.isFinite(amberBelow) && redBelow > 0 && amberBelow > redBelow ? { redBelow, amberBelow } : null;
            }
        },
        overlay(channel, thresholds) {
            const { voltageDial, ...cell } = ina219.cellVoltage(channel, 0, thresholds);
            return { ...cell, text: `Cell ${cell.text}` };
        },
        inspector(channel, thresholds) {
            return {
                layout: 'compact',
                primary: [ina219.cellVoltage(channel, 0, thresholds)],
                supporting: ina219.readings(channel, 0)
            };
        }
    }],
    ['Management', {
        inspector(channel) {
            const reset = byteArray(channel.params[10], 3);
            const reasons = reset?.slice(1).map((code, core) => `Core ${core}: ${resetReasons[code] ?? `Code ${code}`}`);
            const ip = byteArray(channel.params[12], 4);
            return {
                primary: [field(channel, 13, 'Last reported uptime', uptimeText(numericValue(channel.params[13], [DRONE_LINK_MSG_TYPE_UINT32_T]))),
                    field(channel, 12, 'IP address', ip?.join('.'))],
                supporting: [{ ...field(channel, 10, 'Reset reasons', reasons?.join(' · ')), lines: reasons }]
            };
        }
    }]
]);

export function observedModuleType(channel: ChannelState | undefined): string | undefined {
    const type = channel?.params[DRONE_MODULE_PARAM_TYPE];
    if (type?.msgType !== DRONE_LINK_MSG_TYPE_CHAR || type.unavailable?.value || type.values.length !== 1) return;
    const name = type.values[0];
    if (typeof name === 'string') return name;
}

export function channelVisualization(channel: ChannelState): ModuleVisualization | undefined {
    const type = observedModuleType(channel);
    if (type) return visualizations.get(type);
}

export function moduleSummaries(node: NodeState, getSettings?: (target: VisualizationTarget) => VisualizationSetting | undefined): ObservedSummary[] {
    const channels = Object.values(node.channels).sort((a, b) => a.channel - b.channel);
    return Array.from(visualizations).flatMap(([type, plugin]) => {
        const overlay = plugin.overlay;
        if (!overlay) return [];
        return channels.filter(channel => observedModuleType(channel) === type).map(channel =>
            overlay(channel, getSettings?.({ nodeAddress: node.id, channel: channel.channel, moduleType: type })?.thresholds));
    });
}

export function spatialSummaries(node: NodeState): ObservedSummary[] {
    const { location, heading } = mapBindings(node);
    const summaries: ObservedSummary[] = [];
    if (location) {
        const text = positionText(location.reading);
        summaries.push({ ...location, binding: location, label: 'Position', text: text ?? 'Position —', status: text ? undefined : 'Unavailable' });
    }
    if (heading) {
        const degrees = numericValue(heading.reading, [DRONE_LINK_MSG_TYPE_FLOAT]);
        summaries.push({ ...heading, binding: heading, label: 'Heading', text: degrees === undefined ? 'Heading —' : `Heading ${degrees.toFixed(1)}°`,
            status: degrees === undefined ? 'Unavailable' : undefined });
    }
    return summaries;
}
