import React, { useState } from 'react';
import { Card, Button, Alert } from 'react-bootstrap';
import { DroneLinkStateHook } from '../dronelink/useDroneLinkState';
import NodeSelector from './NodeSelector';
import NodeInfo from './NodeInfo';
import ChannelList from './ChannelList';
import './InspectorPanel.css';

interface InspectorPanelProps {
    domainId: string;
    droneLinkState: DroneLinkStateHook;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ domainId, droneLinkState }) => {
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

    const nodes = Object.values(droneLinkState.state);
    const selectedNode = selectedNodeId ? droneLinkState.state[selectedNodeId] : null;
    
    // Additional debug - check if nodeCount matches nodes array length
    const nodeCountMismatch = droneLinkState.nodeCount !== nodes.length;
    if (nodeCountMismatch) {
        console.warn('Node count mismatch!', {
            nodeCount: droneLinkState.nodeCount,
            nodesArrayLength: nodes.length,
            stateKeys: Object.keys(droneLinkState.state),
            state: droneLinkState.state
        });
    }

    // Debug logging
    console.log('InspectorPanel Debug:', {
        domainId,
        nodeCount: droneLinkState.nodeCount,
        stateKeys: Object.keys(droneLinkState.state),
        stateValues: Object.values(droneLinkState.state),
        nodes: nodes.length,
        nodesArray: nodes,
        stats: droneLinkState.stats,
        isLoading: droneLinkState.isLoading,
        error: droneLinkState.error,
        fullState: droneLinkState.state
    });

    return (
        <div className="inspector-panel text-white">
            <div className="inspector-header border-secondary">
                <h5 className="mb-0 text-white">Node Inspector</h5>
            </div>
            
            <div className="inspector-content">

                
                {nodes.length === 0 && droneLinkState.nodeCount === 0 ? (
                    <Card className="text-center bg-dark border-secondary">
                        <Card.Body>
                            <p className="text-white mb-2">No nodes discovered</p>
                            <small className="text-secondary d-block mb-3">
                                {droneLinkState.isLoading 
                                    ? 'Loading historical data...' 
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
                            onNodeSelect={setSelectedNodeId}
                        />

                        {selectedNode && (
                            <NodeInfo node={selectedNode} />
                        )}

                        {selectedNode && (
                            <ChannelList 
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