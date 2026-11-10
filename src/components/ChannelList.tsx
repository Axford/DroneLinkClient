import React, { useState } from 'react';
import { Card } from 'react-bootstrap';
import { ArrowsExpand, ArrowsCollapse } from 'react-bootstrap-icons';
import { ChannelState } from '../dronelink/DroneLinkState';
import IconButton from './ui/IconButton';
import ChannelCard from './ChannelCard';

interface ChannelListProps {
    nodeId: number;
    channels: { [channelId: number]: ChannelState };
}

const ChannelList: React.FC<ChannelListProps> = ({ nodeId, channels }) => {
    const [expandedChannels, setExpandedChannels] = useState<Set<number>>(new Set());
    
    const channelEntries = Object.entries(channels).map(([channelId, channel]) => ({
        id: parseInt(channelId),
        ...channel
    }));

    // Sort channels by ID for consistent display
    channelEntries.sort((a, b) => a.id - b.id);
    
    // Calculate if all channels are expanded
    const allExpanded = channelEntries.length > 0 && channelEntries.every(channel => expandedChannels.has(channel.id));

    const handleToggleExpand = (channelId: number) => {
        const newExpanded = new Set(expandedChannels);
        if (newExpanded.has(channelId)) {
            newExpanded.delete(channelId);
        } else {
            newExpanded.add(channelId);
        }
        setExpandedChannels(newExpanded);
    };

    const handleExpandAll = () => {
        if (allExpanded) {
            setExpandedChannels(new Set());
        } else {
            setExpandedChannels(new Set(channelEntries.map(c => c.id)));
        }
    };

    if (channelEntries.length === 0) {
        return (
            <Card className="bg-dark border-secondary">
                <Card.Body className="text-center py-3">
                    <div className="text-white">No channels discovered for this node</div>

                </Card.Body>
            </Card>
        );
    }

    return (
        <div>
            <div className="channel-list-header d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0 text-white">Channels ({channelEntries.length})</h6>
                <IconButton label={allExpanded ? 'Collapse All' : 'Expand All'} icon={allExpanded ? <ArrowsCollapse /> : <ArrowsExpand />} onClick={handleExpandAll} />
            </div>
            
            <div>
                {channelEntries.map(channel => (
                    <ChannelCard
                        key={channel.id}
                        nodeId={nodeId}
                        channelId={channel.id}
                        channel={channel}
                        expanded={expandedChannels.has(channel.id)}
                        onToggleExpand={() => handleToggleExpand(channel.id)}
                    />
                ))}
            </div>
        </div>
    );
};

export default ChannelList;