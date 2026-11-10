import React from 'react';
import { Form, Button } from 'react-bootstrap';
import { NodeState } from '../dronelink/DroneLinkState';

interface NodeSelectorProps {
    nodes: NodeState[];
    selectedNodeId: number | null;
    onNodeSelect: (nodeId: number | null) => void;
}

const NodeSelector: React.FC<NodeSelectorProps> = ({ nodes, selectedNodeId, onNodeSelect }) => {
    return (
        <div className="node-selector">
            <Form.Label htmlFor="cloud-node-selector" className="visually-hidden">Drone / Node</Form.Label>
            <Form.Select
                id="cloud-node-selector"
                size="sm"
                className="bg-dark text-white border-secondary"
                value={selectedNodeId || ''}
                onChange={(e) => onNodeSelect(e.target.value ? parseInt(e.target.value) : null)}
            >
                <option value="">Choose a node...</option>
                {nodes.map(node => (
                    <option key={node.id} value={node.id}>
                        {node.name || `Node ${node.id}`} · Drone {node.droneId || 'identity unavailable'}
                    </option>
                ))}
            </Form.Select>

            {nodes.length > 0 && (
                <div className="node-badges">
                    {nodes.map(node => (
                        <Button type="button" size="sm"
                            key={node.id}
                            variant={selectedNodeId === node.id ? 'primary' : 'outline-secondary'} aria-pressed={selectedNodeId === node.id}
                            className="node-badge small"
                            onClick={() => onNodeSelect(node.id)}
                        >
                            {node.name || `Node ${node.id}`}
                            <span className="ms-1 text-secondary">({Object.keys(node.channels).length})</span>
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default NodeSelector;
