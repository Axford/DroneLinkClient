import React, { useState, useEffect } from 'react';
import { Card, Badge, Row, Col } from 'react-bootstrap';
import { Wifi, WifiOff, Cpu, Hash } from 'react-bootstrap-icons';
import { NodeState } from '../dronelink/DroneLinkState';

interface NodeInfoProps {
    node: NodeState;
}

const NodeInfo: React.FC<NodeInfoProps> = ({ node }) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    
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
        
        const timeDiff = currentTime - node.lastHeard;
        const seconds = Math.floor(timeDiff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (seconds < 60) return `${seconds}s ago`;
        if (minutes < 60) return `${minutes}m ago`;
        return `${hours}h ago`;
    };

    return (
        <Card className="mb-3 bg-dark border-secondary">
            <Card.Header className="py-2 bg-dark border-secondary">
                <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                        {isActive ? (
                            <Wifi size={16} className="text-success" />
                        ) : (
                            <WifiOff size={16} className="text-muted" />
                        )}
                        <strong className="text-white">{node.name || `Node ${node.id}`}</strong>
                    </div>
                    <Badge bg={isActive ? 'success' : 'secondary'}>
                        {isActive ? 'Active' : 'Inactive'}
                    </Badge>
                </div>
            </Card.Header>
            <Card.Body className="py-2 bg-dark">
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
                        <small className="text-secondary">Last Heard:</small>
                        <div className="small fw-medium">
                            <span className={isActive ? 'text-success' : 'text-secondary'}>
                                {getLastHeardText()}
                            </span>
                        </div>
                    </Col>
                </Row>
            </Card.Body>
        </Card>
    );
};

export default NodeInfo;