import { hex, i2cDefaults } from './i2cDiscovery';
import type { ResponseAddress } from './i2cDiscovery';
import type { ConfigurationOverview } from './nodeConfiguration';
import { moduleSettings, probePinSettings } from './nodeConfiguration';

type Module = ConfigurationOverview['modules'][number];

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
    i2cAddress?: ResponseAddress;
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
        if (Object.prototype.hasOwnProperty.call(i2cDefaults, type)) {
            const values = settings.get('bus') ?? ['0'];
            const bus = values.length === 1 && /^ *[0-7] *$/.test(values[0]) ? String(Number(values[0])) : undefined;
            const addresses = settings.get('addr');
            const raw = addresses?.length === 1 ? addresses[0] : undefined;
            const numeric = raw && /^\d+$/.test(raw.trim()) ? Number(raw) : undefined;
            const address = addresses ? numeric : i2cDefaults[type];
            const target = bus !== undefined && address !== undefined && address >= 8 && address <= 119 ?
                { channel: Number(bus), address } : undefined;
            return [{ ...device(bus === undefined ? [] : [`i${bus}`], bus === undefined ? 'Check bus in Code' :
                `I²C channel ${bus}${target ? ` · ${hex(target.address)}` : ' · Check address in Code'}`), bus: true, i2cAddress: target }];
        }
        if (pinTypes.has(type)) {
            const values = settings.get('pin') ?? settings.get('pins');
            const pins = values?.length === 1 ? values[0].split(',').map(value => gpioAliases[value] ?? value) : [];
            if (pins.length) return [device(pins, pins.map(pin => `GPIO ${pin}`).join(', '))];
        }
        return [];
    });
}
