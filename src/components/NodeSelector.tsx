import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GeoAlt } from 'react-bootstrap-icons';
import { NodeState } from '../dronelink/DroneLinkState';
import { receiptAgeLabel, receiptLabel } from '../dronelink/observedPositions';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import useNarrowLayout from './ui/useNarrowLayout';
import './NodeSelector.css';

interface NodeSelectorProps {
    nodes: NodeState[];
    selectedNodeId: number | null;
    onNodeSelect: (nodeId: number) => void;
    onLocate: (nodeId: number) => void;
    canLocate: (nodeId: number) => boolean;
    now: number;
}

/** Node selection remains available independently of basemap/position availability. */
export default function NodeSelector({ nodes, selectedNodeId, onNodeSelect, onLocate, canLocate, now }: NodeSelectorProps) {
    const narrow = useNarrowLayout();
    const [expanded, setExpanded] = useState(!narrow);
    useEffect(() => setExpanded(!narrow), [narrow]);
    const selected = nodes.find(node => node.id === selectedNodeId);
    const selectedLabel = selected ? `${selected.id} · ${selected.name || `Node ${selected.id}`}` : 'Choose a node';

    const items = <ul id="observed-node-list" className="dw-node-items">
            {[...nodes].sort((a, b) => a.id - b.id).map(node => <li key={node.id}>
                <button type="button" className="dw-node-select" aria-pressed={node.id === selectedNodeId}
                    aria-label={`Inspect node ${node.id}: ${node.name || `Node ${node.id}`}`} aria-describedby={`node-receipt-${node.id}`} onClick={() => { onNodeSelect(node.id); if (narrow) setExpanded(false); }}>
                    <strong>{node.id} · {node.name || `Node ${node.id}`}</strong>
                    <span id={`node-receipt-${node.id}`} className="dw-meta" title={receiptLabel(node.lastHeard, now)}>{node.lastHeard ? `Received ${receiptAgeLabel(node.lastHeard, now)}` : 'No saved receipt'}</span>
                </button>
                <IconButton label={`Locate node ${node.id}`} icon={<GeoAlt />} disabled={!canLocate(node.id)} onClick={() => { onLocate(node.id); if (narrow) setExpanded(false); }} />
            </li>)}
            {nodes.length === 0 && <li className="dw-meta dw-node-list-empty">No observed nodes</li>}
        </ul>;

    return <section className="dw-node-list" aria-label="Observed nodes">
        <header className="dw-node-list-header">
            <div><strong>Nodes · {nodes.length}</strong><div className="dw-meta">{selectedLabel}</div></div>
            <IconButton label={expanded ? 'Collapse node list' : 'Expand node list'} icon={expanded ? <ChevronUp /> : <ChevronDown />}
                aria-expanded={expanded} aria-controls={expanded ? "observed-node-list" : undefined} aria-haspopup={narrow ? "dialog" : undefined} onClick={() => setExpanded(value => !value)} />
        </header>
        {!narrow && expanded && items}
        {narrow && <SettingsDialog title="Observed nodes" show={expanded} onHide={() => setExpanded(false)}>{items}</SettingsDialog>}
    </section>;
}
