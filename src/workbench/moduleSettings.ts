import { probeModes, probePins } from '../components/probeResults';

export interface ModuleSetting { name: string; value: string }

export interface ConfigurationParameter {
    address: number;
    name: string;
    type: 'u8' | 'u32' | 'f' | 'c' | 'addr';
    count: number;
    sourceAddress?: number;
    configurable: boolean;
    alwaysPublished: boolean;
    runtimeOnly: boolean;
    defaultValue?: string;
}


const common: Record<string, string> = { name: '"Module"', status: '1', interval: '1000', publish: 'status, name' };
const examples: Record<string, Record<string, string>> = {
    NMEA: { port: '1, 255', baud: '9600', fix: '0, 0, 0', correction: '0, 0, 0', $correction: '@>GPS.location' },
    Nav: { mode: '0', correction: '20', crosswind: '0.5', limits: '-25, 10',
        location: '0, 0, 0', $location: '@>GPS.location', target: '0, 0, 0', $target: '@>Waypoint.target',
        wind: '0', $wind: '@>Wind.direction', satellites: '0', $satellites: '@>GPS.satellites' },
    Probe: Object.fromEntries(probePins.map(pin => [`pin${pin}`, probeModes(pin)[0] ?? 'digital'])),
    INA219: { cells: '3', threshold: '11.2' },
    INA3221: { cells: '3, 3, 3', threshold: '11.2, 11.2, 11.2', shunt: '100, 100, 100' },
};

export function moduleSettingsExamples(type: string, recorded?: ModuleSetting[], i2cAddress?: number) {
    const settings = new Map(Object.entries(common));
    if (i2cAddress !== undefined) {
        settings.set('bus', '0');
        settings.set('addr', String(i2cAddress));
    }
    for (const [name, value] of Object.entries(Object.prototype.hasOwnProperty.call(examples, type) ? examples[type] : {})) settings.set(name, value);
    for (const { name, value } of recorded ?? []) {
        if (/^\$?[A-Za-z][A-Za-z0-9_]*$/.test(name) && typeof value === 'string' && !/[\r\n]/.test(value)) settings.set(name, value);
    }
    return Array.from(settings, ([name, value]) => ({ name, value }));
}
