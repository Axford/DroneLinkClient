import { useCallback, useState } from 'react';
import type { Node, NodeChange } from '@xyflow/react';

// Controlled graph updates replace nodes as their draft, selection or live data changes.
// Keep observed sizes so React Flow can retain handle geometry and resize cards when needed.
export function useMeasuredGraphNodes<T extends Node>(nodes: T[]) {
    const [measurements, setMeasurements] = useState<ReadonlyMap<string, NonNullable<Node['measured']>>>(new Map());
    const rememberMeasurements = useCallback((changes: NodeChange[]) => {
        setMeasurements(previous => {
            let next: Map<string, NonNullable<Node['measured']>> | undefined;
            for (const change of changes) {
                if (change.type !== 'dimensions' || !change.dimensions) continue;
                const measured = previous.get(change.id);
                const { width, height } = change.dimensions;
                if (measured?.width === width && measured.height === height) continue;
                next ??= new Map(previous);
                next.set(change.id, change.dimensions);
            }
            return next ?? previous;
        });
    }, []);

    return { measuredNodes: nodes.map(node => ({ ...node, measured: measurements.get(node.id) })), rememberMeasurements };
}
