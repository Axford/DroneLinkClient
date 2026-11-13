import type { ConfigurationOverview } from './nodeConfiguration';
import { moduleSettings, probePinSettings } from './nodeConfiguration';

type Module = ConfigurationOverview['modules'][number];

export const boardWidth = 430;
export const boardHeight = boardWidth * 2096 / 2434;
const endpoint = (id: string, label: string, x: number, y: number, gpio?: number) =>
    ({ id, label, x: boardWidth * x / 2434, y: boardHeight * y / 2096, gpio });

// Connector positions come from the legacy V4 diagram. GPIO functions
// follow DroneNode's pinConfig.h. Only endpoints shown on this board are listed.
export const boardEndpoints = [
    endpoint('32', 'OUT1 · GPIO 32', 314, 762, 32),
    endpoint('33', 'OUT1 · GPIO 33', 410, 760, 33),
    endpoint('25', 'DAC1 · GPIO 25', 310, 1005, 25),
    endpoint('26', 'DAC1 · GPIO 26', 410, 1005, 26),
    endpoint('14', 'OUT3 · GPIO 14', 310, 1245, 14),
    endpoint('15', 'OUT3 · GPIO 15', 410, 1245, 15),
    endpoint('16', 'Serial 2 RX · GPIO 16', 310, 1485, 16),
    endpoint('17', 'Serial 2 TX · GPIO 17', 410, 1485, 17),
    endpoint('13', 'Serial 1 RX · GPIO 13', 310, 1720, 13),
    endpoint('12', 'Serial 1 TX · GPIO 12', 410, 1720, 12),
    endpoint('35', 'Power header · GPIO 35', 310, 1980, 35),
    endpoint('2', 'Status LED · GPIO 2', 1800, 1860, 2),
    ...[[2334, 1844], [2334, 1311], [2334, 782], [2334, 254], [1940, 883], [1940, 622], [1940, 372], [1940, 101]]
        .map(([x, y], bus) => endpoint(`i${bus}`, `I²C channel ${bus}`, x, y)),
];

const i2cTypes = new Set(['ADS1015', 'BME280', 'CMPS12', 'HT16K33', 'INA219', 'INA3221', 'LSM9DS1', 'MPU6050',
    'Rotary', 'VL53L0X', 'Wind', 'Controller', 'Joystick', 'Diagnostic', 'QMC5883L', 'HMC5883L']);
const portPins: Record<string, string[]> = { '1': ['13', '12'], '2': ['16', '17'] };
const gpioAliases: Record<string, string> = {
    OUT0_0: '32', OUT0_1: '33', OUT1_0: '14', OUT1_1: '15', OUT2_0: '2', OUT2_1: '4',
    DAC0_0: '25', DAC0_1: '26', IN0_0: '34', IN0_1: '35',
};
const pinTypes = new Set(['Digital', 'Analog', 'Servo', 'Motor', 'Depth', 'WaterSensor']);

export interface PhysicalDevice {
    id: string;
    module: Module;
    connections: string[];
    label: string;
    detail: string;
    gpio?: number;
    bus?: boolean;
    mode?: string;
}

export function physicalDevices(text: string, modules: Module[]): PhysicalDevice[] {
    return modules.flatMap<PhysicalDevice>(module => {
        const { channel, name, type } = module;
        const label = name || type;
        const settings = moduleSettings(text, module);
        const device = (connections: string[], detail: string): PhysicalDevice =>
            ({ id: String(channel), module, connections, label, detail });
        if (type === 'NMEA') {
            const values = settings.get('port');
            const port = values?.length === 1 ? values[0].replace(/[ \t]/g, '') : values ? '' : '1';
            const ports = /^[12](?:,(?:[12]|255))?$/.test(port) ? port.split(',').filter(value => value !== '255') : [];
            return [device(ports.flatMap(value => portPins[value]), ports.length ? ports.map(value => `Serial ${value}`).join(' + ') : 'Check port in Code')];
        }
        if (type === 'Probe') {
            return Array.from(probePinSettings(text, module), ([gpio, { values }]) => ({
                ...device([String(gpio)], ''), id: `${channel}:${gpio}`, label: `GPIO ${gpio} Probe`, gpio,
                mode: values.length === 1 ? values[0] : undefined,
            }));
        }
        if (i2cTypes.has(type)) {
            const values = settings.get('bus') ?? ['0'];
            const bus = values.length === 1 && /^ *[0-7] *$/.test(values[0]) ? String(Number(values[0])) : undefined;
            const address = settings.get('addr')?.[0];
            return [{ ...device(bus === undefined ? [] : [`i${bus}`], bus === undefined ? 'Check bus in Code' :
                `I²C channel ${bus}${address ? ` · address ${address}` : ''}`), bus: true }];
        }
        if (pinTypes.has(type)) {
            const values = settings.get('pin') ?? settings.get('pins');
            const pins = values?.length === 1 ? values[0].split(',').map(value => gpioAliases[value] ?? value) : [];
            if (pins.length) return [device(pins, pins.map(pin => `GPIO ${pin}`).join(', '))];
        }
        return [];
    });
}

export function springPositions(devices: PhysicalDevice[]) {
    // Work in columns outside the board. Each card is pulled toward its
    // connector height and pushed away from neighboring cards.
    const columns: { id: string; anchor: number; y: number }[][] = [[], []];
    const spacing = 138;
    for (const device of devices) {
        const points = boardEndpoints.filter(point => device.connections.includes(point.id));
        const side = points[0] && points[0].x > boardWidth / 2 ? 1 : 0;
        const anchor = points.length ? points.reduce((sum, point) => sum + point.y, 0) / points.length - 24 : boardHeight;
        columns[side].push({ id: device.id, anchor, y: anchor });
    }
    return new Map(columns.flatMap((column, side) => {
        column.sort((a, b) => a.anchor - b.anchor);
        column.forEach((card, index) => { card.y = card.anchor + index * spacing * 0.5; });
        for (let pass = 0; pass < 24; pass++) {
            for (const card of column) card.y += (card.anchor - card.y) * 0.2;
            for (let i = 1; i < column.length; i++) {
                const prior = column[i - 1], card = column[i];
                const correction = Math.max(0, spacing - (card.y - prior.y)) / 2;
                prior.y -= correction;
                card.y += correction;
            }
        }
        // Finish with a nonoverlapping layout around the relaxed positions.
        for (let i = 1; i < column.length; i++) column[i].y = Math.max(column[i].y, column[i - 1].y + spacing);
        return column.map(({ id, y }) => [id, { x: side ? boardWidth + 66 : -250, y }] as const);
    }));
}
