import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { MotherboardDiagram } from './motherboardDiagrams';

export type BoardNode = Node<{
    diagram: MotherboardDiagram;
    pins?: readonly string[];
    selected?: string;
    select?: (endpoint: string) => void;
}, 'board'>;

export default function MotherboardCard({ data }: NodeProps<BoardNode>) {
    const { diagram, pins, selected, select } = data;
    return <div className="dw-physical-board" style={{ width: diagram.width, height: diagram.height }}>
        <img src={diagram.image} alt={`DroneLink V${diagram.version} motherboard connector diagram`} draggable={false} />
        {diagram.endpoints.filter(point => !pins || pins.includes(point.id)).map(point => {
            const style = { left: point.x, top: point.y };
            return <React.Fragment key={point.id}>
                <Handle type="source" position={point.x > diagram.width / 2 ? Position.Right : Position.Left}
                    id={point.id} style={{ ...style, right: 'auto', transform: 'translate(-50%, -50%)' }} />
                {select ? <button type="button" className="dw-physical-endpoint nodrag nopan" aria-label={point.label} title={point.label}
                    aria-pressed={selected === point.id} style={style} onClick={() => select(point.id)} />
                    : <span className="dw-physical-endpoint dw-probe-endpoint" title={point.label} style={style} />}
            </React.Fragment>;
        })}
    </div>;
}
