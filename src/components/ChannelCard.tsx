import React from 'react';
import { Card, Badge, Collapse } from 'react-bootstrap';
import { ChevronDown, ChevronRight } from 'react-bootstrap-icons';
import { ChannelState } from '../dronelink/DroneLinkState';
import ParameterList from './ParameterList';

interface ChannelCardProps {
    nodeId: number;
    channelId: number;
    channel: ChannelState;
    expanded: boolean;
    onToggleExpand: () => void;
}

const ChannelCard: React.FC<ChannelCardProps> = ({ 
    nodeId, 
    channelId, 
    channel, 
    expanded,
    onToggleExpand
}) => {
    const parameterCount = Object.keys(channel.params).length;
    const isActive = channel.lastHeard && (Date.now() - channel.lastHeard) < 5 * 60 * 1000; // 5 minutes
    
    const getChannelStatusVariant = (): string => {
        if (channel.enabled === false) return 'secondary';
        if (isActive) return 'success';
        return 'warning';
    };
    
    const getChannelStatusText = (): string => {
        if (channel.enabled === false) return 'Disabled';
        if (isActive) return 'Recent observation';
        return 'Older observation';
    };

    return (
        <Card className="channel-card bg-dark border-secondary">
            <Card.Header 
                className="bg-dark border-secondary"
                onClick={onToggleExpand}
            >
                <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                        {expanded ? (
                            <ChevronDown size={14} className="text-muted" />
                        ) : (
                            <ChevronRight size={14} className="text-muted" />
                        )}
                        <div>
                            <strong className="me-2 text-white">
                                {channel.name || `Channel ${channelId}`}
                            </strong>
                            <small className="text-secondary">({channelId})</small>
                        </div>
                    </div>
                    
                    <div className="d-flex align-items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Badge bg={getChannelStatusVariant()} className="small">
                            {getChannelStatusText()}
                        </Badge>
                        
                        {channel.type && (
                            <Badge bg="info" className="small">
                                {channel.type}
                            </Badge>
                        )}
                        
                        <Badge bg="outline-secondary" className="small">
                            {parameterCount} params
                        </Badge>
                        
                    </div>
                </div>
            </Card.Header>
            
            <Collapse in={expanded}>
                <div>
                    <Card.Body className="py-2 bg-dark">
                        {parameterCount === 0 ? (
                            <div className="text-center py-2">
                                <small className="text-secondary">No parameters discovered</small>
                            </div>
                        ) : (
                            <ParameterList 
                                nodeId={nodeId}
                                channelId={channelId}
                                parameters={channel.params}
                            />
                        )}
                    </Card.Body>
                </div>
            </Collapse>
        </Card>
    );
};

export default ChannelCard;