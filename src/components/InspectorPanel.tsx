import React, { useState } from 'react';
import { Card, Button, Alert } from 'react-bootstrap';
import { DroneLinkStateHook } from '../dronelink/useDroneLinkState';
import NodeSelector from './NodeSelector';
import NodeInfo from './NodeInfo';
import MapBindings from './MapBindings';
import ChannelList from './ChannelList';
import './InspectorPanel.css';

interface InspectorPanelProps {
    domainId: string;
    droneLinkState: DroneLinkStateHook;
    canReset?: boolean;
    selectedNodeId: number | null;
    onNodeSelect: (nodeId: number | null) => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ domainId, droneLinkState, canReset = false, selectedNodeId, onNodeSelect }) => {
    const [resetError, setResetError] = useState<string | null>(null);
    const [resetting, setResetting] = useState(false);
    const resetSelected = async () => {
        if (!selectedNodeId || !window.confirm(`Reset shared observations for node ${selectedNodeId}? Identity, membership and packet history are retained. Unchanged values suppressed by a gateway may not return until a fresh copy reaches the Server.`)) return;
        setResetError(null); setResetting(true);
        try { await droneLinkState.resetNodeObservations(selectedNodeId); }
        catch (error) { setResetError(error instanceof Error ? error.message : 'Reset failed. Refresh and review before trying again.'); }
        finally { setResetting(false); }
    };

    const nodes = Object.values(droneLinkState.state);
    const selectedNode = selectedNodeId ? droneLinkState.state[selectedNodeId] : null;

    return (
        <div className="inspector-panel text-white">
            <div className="inspector-header border-secondary">
                <h5 className="mb-0 text-white">Drone / Node Inspector</h5>
                <small className="text-secondary">Shared observations: {droneLinkState.observationStatus}. Saved failed snapshot writes: {droneLinkState.snapshotWriteFailures ?? 0}</small>
            </div>

            <div className="inspector-content">
                {droneLinkState.error && <Alert variant="danger">{droneLinkState.error}</Alert>}
                {!!droneLinkState.unavailableObservationParts && <Alert variant="warning">{droneLinkState.unavailableObservationParts} observation parts are unavailable because packet validation failed.</Alert>}
                {resetError && <Alert variant="danger">{resetError}</Alert>}
                {canReset && selectedNode && <Button variant="outline-warning" size="sm" disabled={resetting} onClick={resetSelected}>Reset node observations</Button>}


                {nodes.length === 0 && droneLinkState.nodeCount === 0 ? (
                    <Card className="text-center bg-dark border-secondary">
                        <Card.Body>
                            <p className="text-white mb-2">No nodes discovered</p>
                            <small className="text-secondary d-block mb-3">
                                {droneLinkState.isLoading
                                    ? 'Loading shared observations...'
                                    : 'Waiting for DroneLink nodes...'
                                }
                            </small>

                            {process.env.NODE_ENV === 'development' && (
                                <div>
                                    <small className="text-secondary d-block mb-2">
                                        This is normal if no DroneLink messages have been received yet.
                                    </small>
                                    <Button
                                        variant="outline-primary"
                                        size="sm"
                                        onClick={() => window.location.reload()}
                                    >
                                        Refresh Page
                                    </Button>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                ) : nodes.length === 0 && droneLinkState.nodeCount > 0 ? (
                    <Alert variant="warning" className="bg-dark border-warning">
                        <Alert.Heading className="text-warning">Data Loading Issue</Alert.Heading>
                        <p className="text-white">Node count shows {droneLinkState.nodeCount} nodes, but nodes array is empty.</p>
                        <p className="text-white">This suggests a state synchronization issue.</p>
                        <Button variant="outline-warning" onClick={() => window.location.reload()}>
                            Refresh Page
                        </Button>
                    </Alert>
                ) : (
                    <div>
                        <NodeSelector
                            nodes={nodes}
                            selectedNodeId={selectedNodeId}
                            onNodeSelect={onNodeSelect}
                        />

                        {selectedNode && (
                            <><NodeInfo node={selectedNode} /><MapBindings node={selectedNode} /></>
                        )}

                        {selectedNode && (
                            <ChannelList key={selectedNode.id}
                                nodeId={selectedNode.id}
                                channels={selectedNode.channels}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default InspectorPanel;
