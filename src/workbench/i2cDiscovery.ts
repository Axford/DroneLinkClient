import { useEffect, useRef, useState } from 'react';

export interface RegisterRequest { channel: number; address: number; register: number; length: number }
interface RegisterResult extends RegisterRequest { status: string; bytes: number[]; receivedAt: number }
export interface BusChannel { channel: number; status: string; addresses: number[] }
interface Scan { multiplexer: number; channels: BusChannel[]; receivedAt: number }
export type DiagnosticRequest = <T>(endpoint: string, body: object, signal: AbortSignal) => Promise<T>;
export interface ResponseAddress { channel: number; address: number }

const qmcSource = 'https://www.qstcorp.com/upload/pdf/202512/13-52-04%20QMC5883L%20Datasheet%20Rev.%20B.pdf';
const inaSource = 'https://www.ti.com/lit/ds/symlink/ina3221.pdf';
const bmeSource = 'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf';

export const i2cDefaults: Record<string, number> = {
    ADS1015: 0x49, BME280: 0x76, CMPS12: 0x60, HT16K33: 0x70, INA219: 0x40, INA3221: 0x40,
    LSM9DS1: 0x1e, MPU6050: 0x68, Rotary: 0x49, VL53L0X: 0x29, Wind: 0x36, Controller: 0x3c,
    Joystick: 8, Diagnostic: 0x3c, QMC5883L: 0x0d, HMC5883L: 0x1e,
};

export function hex(value: number) { return `0x${value.toString(16).padStart(2, '0').toUpperCase()}`; }
export const responseKey = ({ channel, address }: ResponseAddress) => `${channel}:${address}`;

export function candidates(address: number) {
    if (address >= 0x40 && address <= 0x43) return ['INA219', 'INA3221'];
    return Object.keys(i2cDefaults).filter(type => i2cDefaults[type] === address);
}

function signatures(address: number) {
    if (address === 0x0d) return { type: 'QMC5883L', source: qmcSource, reads: [{ register: 0x0d, expected: [0xff] }] };
    if (address >= 0x40 && address <= 0x43) return { type: 'INA3221', source: inaSource,
        reads: [{ register: 0xff, expected: [0x32, 0x20] }, { register: 0xfe, expected: [0x54, 0x49] }] };
    if (address === 0x76) return { type: 'BME280', source: bmeSource, reads: [{ register: 0xd0, expected: [0x60] }] };
}

export function canIdentify(address: number) { return !!signatures(address); }

export function useI2cDiscovery(scope: string, request?: DiagnosticRequest) {
    const [scan, setScan] = useState<Scan>();
    const [results, setResults] = useState<Record<string, { match?: string; source: string; reads: RegisterResult[]; receivedAt: number; error?: string }>>({});
    const [busy, setBusy] = useState<string>();
    const [error, setError] = useState<string>();
    const running = useRef<AbortController | undefined>(undefined);
    const activeScope = useRef(scope);
    activeScope.current = scope;
    useEffect(() => {
        setScan(undefined);
        setResults({});
        setBusy(undefined);
        setError(undefined);
        return () => {
            running.current?.abort();
            running.current = undefined;
        };
    }, [scope]);

    async function run(label: string, operation: (send: DiagnosticRequest, signal: AbortSignal) => Promise<void>) {
        if (!request || running.current) return;
        const controller = new AbortController();
        const { signal } = controller;
        running.current = controller;
        const deadline = setTimeout(() => controller.abort(), 35000);
        setError(undefined);
        setBusy(label);
        const send: DiagnosticRequest = async <T,>(endpoint: string, body: object, abortSignal: AbortSignal) => {
            if (abortSignal.aborted || activeScope.current !== scope) throw new Error('The selected route changed.');
            const result = await request<T>(endpoint, body, abortSignal);
            if (abortSignal.aborted || activeScope.current !== scope) throw new Error('The selected route changed.');
            return result;
        };
        try { await operation(send, signal); }
        catch (failure) {
            if (!signal.aborted && activeScope.current === scope) {
                setError(failure instanceof Error ? failure.message : 'I²C diagnostic failed.');
            }
        } finally {
            clearTimeout(deadline);
            if (running.current === controller) {
                setBusy(undefined);
                running.current = undefined;
            }
        }
    }

    function scanAll() {
        void run('Scanning I²C channels…', async (send, signal) => {
            setScan(undefined);
            setResults({});
            setScan(await send<Scan>('i2c-scan', {}, signal));
        });
    }

    function identify(target: ResponseAddress) {
        const signature = signatures(target.address);
        if (!signature || !scan?.channels.some(channel => channel.channel === target.channel && channel.addresses.includes(target.address))) return;
        void run(`Reading registers on channel ${target.channel}…`, async (send, signal) => {
            const reads: RegisterResult[] = [];
            let match: string | undefined = signature.type;
            let error: string | undefined;
            try {
                for (const { register, expected } of signature.reads) {
                    const read = await send<RegisterResult>('i2c-register', { ...target, register, length: expected.length }, signal);
                    reads.push(read);
                    if (read.status !== 'complete' || expected.length !== read.bytes.length ||
                        !expected.every((value, index) => read.bytes[index] === value)) { match = undefined; break; }
                    if (register !== signature.reads[signature.reads.length - 1].register) await new Promise(resolve => setTimeout(resolve, 1250));
                }
            } catch (failure) {
                match = undefined;
                error = failure instanceof Error ? failure.message : 'Register read failed.';
            }
            if (signal.aborted || activeScope.current !== scope) return;
            setResults(current => ({ ...current, [responseKey(target)]: { match, source: signature.source, reads,
                receivedAt: reads[reads.length - 1]?.receivedAt ?? Date.now(), error } }));
        });
    }
    return { scan, results, busy, error, scanAll, identify };
}
