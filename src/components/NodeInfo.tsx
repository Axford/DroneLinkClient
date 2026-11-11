import React, { useState, useEffect } from 'react';
import { Card, Badge, Row, Col } from 'react-bootstrap';
import { Wifi, WifiOff, Cpu, Hash, InfoCircle } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import { commandRequest, root, useCommandScope } from '../commands/session';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';
import MapBindings from './MapBindings';
import { receiptLabel } from '../dronelink/observedPositions';
import { NodeState } from '../dronelink/DroneLinkState';
import { moduleSummaries, spatialSummaries } from '../dronelink/moduleVisualizations';
import { SummaryChips, SummaryDetails } from './NodeSummary';
import { useVisualizationSettings } from './VisualizationSettings';

interface NodeInfoProps {
    node: NodeState;
}

const NodeInfo: React.FC<NodeInfoProps> = ({ node }) => {
    const [details, setDetails] = useState(false);
    const scope = useCommandScope();
    const [transport, setTransport] = useState<'http'>();
    const domainId = scope?.domainId;
    const droneId = node.droneId;
    useEffect(() => {
        setTransport(undefined);
        if (!details || !domainId || !droneId) return;
        const controller = new AbortController();
        void commandRequest<{ data: { drones: Array<{ _id: string; activeCommandTransport?: 'http' }> } }>(
            root(domainId) + '/identities', { signal: controller.signal }
        ).then(({ data }) => {
            if (!controller.signal.aborted) setTransport(data.drones.find(drone => drone._id === droneId)?.activeCommandTransport);
        }).catch(() => {});
        return () => controller.abort();
    }, [details, domainId, droneId]);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const settings = useVisualizationSettings();
    const summaries = [...moduleSummaries(node, settings?.get), ...spatialSummaries(node)];
    
    const channelCount = Object.keys(node.channels).length;
    const parameterCount = Object.values(node.channels).reduce(
        (total, channel) => total + Object.keys(channel.params).length, 
        0
    );

    // Update current time every second for relative time calculations
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // Calculate if node is active (heard from recently)
    const isActive = node.lastHeard && (currentTime - node.lastHeard) < 5 * 60 * 1000; // 5 minutes
    
    const getLastHeardText = (): string => {
        if (!node.lastHeard) return 'Never';
        
        if (node.interface === 'cloud') return receiptLabel(node.lastHeard, currentTime);
        const timeDiff = currentTime - node.lastHeard;
        const seconds = Math.floor(timeDiff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (seconds < 60) return `${seconds}s ago`;
        if (minutes < 60) return `${minutes}m ago`;
        return `${hours}h ago`;
    };

    return (
        <SurfacePanel className="mb-3">
            <div className="dw-item-row"><div className="dw-toolbar dw-item-content"><strong>{node.name || `Node ${node.id}`}</strong><Badge bg="secondary">{node.interface === 'cloud' ? 'Cloud observation' : isActive ? 'Active' : 'Inactive'}</Badge></div><div className="dw-row-actions"><IconButton data-inspector-focus="node-details" label="Node details" icon={<InfoCircle />} onClick={() => setDetails(true)} /><MapBindings node={node} /></div></div>
            <div className="dw-meta">Node {node.id} · {getLastHeardText()} · {channelCount} {channelCount === 1 ? 'channel' : 'channels'} · {parameterCount} {parameterCount === 1 ? 'parameter' : 'parameters'}</div>
            <SummaryChips nodeId={node.id} summaries={summaries} now={currentTime} />
            <SettingsDialog title="Node details" show={details} onHide={() => setDetails(false)}>
                {transport === 'http' && <p className="dw-meta">Command transport: HTTP</p>}
        <Card className="bg-dark border-secondary">
            <Card.Header className="py-2 bg-dark border-secondary">
                <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                        {node.interface === 'cloud' ? <Hash size={16} className="text-secondary" /> : isActive ? (
                            <Wifi size={16} className="text-success" />
                        ) : (
                            <WifiOff size={16} className="text-muted" />
                        )}
                        <strong className="text-white">{node.name || `Node ${node.id}`}</strong>
                    </div>
                    <Badge bg={node.interface === 'cloud' ? 'secondary' : isActive ? 'success' : 'secondary'}>
                        {node.interface === 'cloud' ? 'Cloud observation' : isActive ? 'Active' : 'Inactive'}
                    </Badge>
                </div>
            </Card.Header>
            <Card.Body className="py-2 bg-dark">
                <p className="small text-white">Drone: {node.droneId || 'Identity unavailable'} · Singleton master: Node {node.id}</p>
                <Row className="g-2">
                    <Col xs={6}>
                        <div className="d-flex align-items-center gap-1">
                            <Hash size={12} className="text-secondary" />
                            <small className="text-secondary">ID:</small>
                        </div>
                        <div className="small fw-medium text-white">{node.id}</div>
                    </Col>
                    <Col xs={6}>
                        <div className="d-flex align-items-center gap-1">
                            <Cpu size={12} className="text-secondary" />
                            <small className="text-secondary">Channels:</small>
                        </div>
                        <div className="small fw-medium text-white">{channelCount}</div>
                    </Col>
                    <Col xs={6}>
                        <small className="text-secondary">Parameters:</small>
                        <div className="small fw-medium text-white">{parameterCount}</div>
                    </Col>
                    <Col xs={6}>
                        <small className="text-secondary">Last received:</small>
                        <div className="small fw-medium">
                            <span className={isActive ? 'text-success' : 'text-secondary'}>
                                {getLastHeardText()}
                            </span>
                        </div>
                    </Col>
                </Row>
                <SummaryDetails nodeId={node.id} summaries={summaries} now={currentTime} />
            </Card.Body>
        </Card>
            </SettingsDialog>
        </SurfacePanel>
    );
};

export default NodeInfo;
