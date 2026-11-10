import React, { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { Gear } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';
import DangerAction from './ui/DangerAction';
import { DroneLinkStateHook } from '../dronelink/useDroneLinkState';
import NodeSelector from './NodeSelector';
import NodeInfo from './NodeInfo';
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
    const [tools, setTools] = useState(false);
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
            <header className="inspector-header">
                <h2>Inspector</h2>
                <IconButton label="Inspector tools" icon={<Gear />} onClick={() => setTools(true)} />
            </header>
            <SettingsDialog title="Inspector tools" show={tools} onHide={() => setTools(false)}>
                <SurfacePanel title="Observations"><p>Shared observations: {droneLinkState.observationStatus}. Saved failed snapshot writes: {droneLinkState.snapshotWriteFailures ?? 0}</p>
                {canReset && selectedNode && <DangerAction label={`Reset Node ${selectedNode.id}`} warning="Clears shared observations for everyone. Identity and history stay."><IconButton label="Reset node observations" icon={<Gear />} variant="outline-danger" disabled={resetting} onClick={resetSelected} /></DangerAction>}
                {resetError && <Alert variant="danger">{resetError}</Alert>}
                </SurfacePanel>
            </SettingsDialog>
            <div className="inspector-content">
                {droneLinkState.error && <Alert variant="danger">{droneLinkState.error}</Alert>}
                {!!droneLinkState.unavailableObservationParts && <Alert variant="warning">{droneLinkState.unavailableObservationParts} observation parts are unavailable because packet validation failed.</Alert>}
                {!!droneLinkState.snapshotWriteFailures && <Alert variant="warning">{droneLinkState.snapshotWriteFailures} saved snapshot write failures</Alert>}
                {nodes.length === 0 && droneLinkState.nodeCount === 0 ? (
                    <p className="dw-status">No nodes discovered</p>
                ) : nodes.length === 0 && droneLinkState.nodeCount > 0 ? (
                    <Alert variant="warning">Node observations unavailable. Refresh to retry.</Alert>
                ) : (
                    <div>
                        <NodeSelector
                            nodes={nodes}
                            selectedNodeId={selectedNodeId}
                            onNodeSelect={onNodeSelect}
                        />

                        {selectedNode && (
                            <NodeInfo node={selectedNode} />
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
