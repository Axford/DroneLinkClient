import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp, GeoAlt } from 'react-bootstrap-icons';
import { NodeState } from '../dronelink/DroneLinkState';
import { compactReceiptAge, receiptLabel } from '../dronelink/observedPositions';
import { moduleSummaries } from '../dronelink/moduleVisualizations';
import { SummaryChips } from './NodeSummary';
import { CardMotionList } from './ui/CardMotion';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import useNarrowLayout from './ui/useNarrowLayout';
import { useVisualizationSettings } from './VisualizationSettings';
import './NodeSelector.css';

interface NodeSelectorProps {
    nodes: NodeState[];
    selectedNodeId: number | null;
    onNodeSelect: (nodeId: number) => void | boolean;
    onLocate?: (nodeId: number) => void;
    canLocate?: (nodeId: number) => boolean;
    inline?: boolean;
    local?: boolean;
    status?: (nodeId: number) => string;
    selectionDisabled?: boolean;
    now: number;
}

function nodeLabel(node: NodeState) {
    return node.name ? `${node.id} ${node.name}` : `Node ${node.id}`;
}

/** Node selection remains available independently of basemap/position availability. */
export default function NodeSelector({ nodes, selectedNodeId, onNodeSelect, onLocate, canLocate, now, inline, local, status, selectionDisabled }: NodeSelectorProps) {
    const listId = useId();
    const narrow = useNarrowLayout();
    const settings = useVisualizationSettings();
    const [expanded, setExpanded] = useState(!narrow);
    useEffect(() => setExpanded(!narrow), [narrow]);
    const selected = nodes.find(node => node.id === selectedNodeId);
    const selectedLabel = selected ? nodeLabel(selected) : 'Choose a node';

    const label = local ? "Local nodes" : "Observed nodes";
    const showItems = inline || narrow || expanded;
    const items = <ul id={listId} className="dw-node-items">
        <CardMotionList as="li" items={(showItems ? [...nodes] : []).sort((a, b) => a.id - b.id).map(node => {
            const receipt = node.interface === 'Local' ? 'Gateway receipt' : 'Server receipt';
            const routeStatus = status?.(node.id);
            return { key: String(node.id), selected: node.id === selectedNodeId, element: <div className="dw-node-overlay-card">
                <button type="button" className="dw-node-select" aria-pressed={node.id === selectedNodeId}
                    aria-label={routeStatus ? `${node.name || `Node ${node.id}`} · ${routeStatus}` : `Inspect node ${node.id}: ${node.name || `Node ${node.id}`}`} disabled={selectionDisabled && node.id !== selectedNodeId} aria-describedby={`${listId}-receipt-${node.id}`}
                    onClick={() => { if (onNodeSelect(node.id) !== false && narrow && !inline) setExpanded(false); }}>
                    <strong className="dw-node-name" title={nodeLabel(node)}>{nodeLabel(node)}</strong>
                    {routeStatus && <span className="dw-meta dw-node-route-status"> · {routeStatus}</span>}
                    <span className="dw-node-age" aria-hidden="true" title={node.lastHeard ? `${receipt}: ${receiptLabel(node.lastHeard, now)}` : 'No saved receipt'}>{compactReceiptAge(node.lastHeard, now)}</span>
                    <span id={`${listId}-receipt-${node.id}`} className="visually-hidden">{node.lastHeard ? `${receipt}: ${receiptLabel(node.lastHeard, now)}` : 'No saved receipt'}</span>
                </button>
                {onLocate && <IconButton label={`Locate node ${node.id}`} icon={<GeoAlt />} disabled={!canLocate?.(node.id)}
                    onClick={() => { onLocate(node.id); if (narrow) setExpanded(false); }} />}
            <SummaryChips nodeId={node.id} summaries={moduleSummaries(node, settings?.get)} now={now} />
        </div> }; })} />
        {showItems && nodes.length === 0 && <li className="dw-meta dw-node-list-empty">{local ? "Waiting for local routes." : "No observed nodes"}</li>}
    </ul>;
    const toggle = <IconButton label={expanded ? 'Collapse node list' : 'Expand node list'} icon={expanded ? <ChevronUp /> : <ChevronDown />}
        aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-haspopup={narrow ? 'dialog' : undefined}
        onClick={() => setExpanded(value => !value)} />;

    return <section className={`dw-node-list ${inline ? 'dw-node-list-inline' : ''} ${!inline && !narrow && !expanded ? 'collapsed' : ''}`} aria-label={label}>
        <span className="visually-hidden">{nodes.length} observed nodes</span>
        {inline ? items : narrow ? <header className="dw-node-list-header">
            <div><strong>Nodes · {nodes.length}</strong><div className="dw-meta">{selectedLabel}</div></div>{toggle}
        </header> : <div className="dw-node-list-toggle">{toggle}</div>}
        {!inline && !narrow && items}
        {!inline && narrow && <SettingsDialog title={label} show={expanded} onHide={() => setExpanded(false)}>{items}</SettingsDialog>}
    </section>;
}
