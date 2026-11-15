import { useEffect, useRef, useState } from 'react';

export interface MotherboardSource {
    scope: string;
    read: (signal: AbortSignal) => Promise<unknown>;
}

function isReport(value: unknown, node: number): value is { version: number } {
    if (!value || typeof value !== 'object') return false;
    const report = value as { schemaVersion?: unknown; node?: unknown; version?: unknown };
    return report.schemaVersion === 1 && report.node === node &&
        typeof report.version === 'number' && [0, 1, 2, 4].includes(report.version);
}

export function useMotherboardVersion(node: number, source?: MotherboardSource) {
    const [report, setReport] = useState<{ scope: string; node: number; version: number }>();
    const read = useRef(source?.read);
    read.current = source?.read;
    const scope = source?.scope;
    useEffect(() => {
        setReport(undefined);
        if (scope === undefined || !read.current) return;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        void read.current(controller.signal).then(result => {
            if (!controller.signal.aborted && isReport(result, node)) {
                setReport({ scope, node, version: result.version });
            }
        }).catch(() => { /* Pin readings remain available without a board report. */ })
            .finally(() => clearTimeout(timer));
        return () => { clearTimeout(timer); controller.abort(); };
    }, [node, scope]);
    return report && report.node === node && report.scope === scope ? report.version : undefined;
}
