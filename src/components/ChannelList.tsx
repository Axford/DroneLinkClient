import React, { useState, useEffect } from 'react';
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
    const [collapsedChannels, setCollapsedChannels] = useState<Set<number>>(new Set());
    
    const channelEntries = Object.entries(channels).map(([channelId, channel]) => ({
        id: parseInt(channelId),
        ...channel
    }));

    // Sort channels by ID for consistent display
    channelEntries.sort((a, b) => a.id - b.id);
    
    // Calculate if all channels are expanded
    const allExpanded = channelEntries.length > 0 && channelEntries.every(channel => !collapsedChannels.has(channel.id));

    const handleToggleExpand = (channelId: number) => {
        const nextCollapsed = new Set(collapsedChannels);
        if (nextCollapsed.has(channelId)) {
            nextCollapsed.delete(channelId);
        } else {
            nextCollapsed.add(channelId);
        }
        setCollapsedChannels(nextCollapsed);
    };

    const handleExpandAll = () => {
        if (allExpanded) {
            setCollapsedChannels(new Set(channelEntries.map(c => c.id)));
        } else {
            setCollapsedChannels(new Set());
        }
    };

    useEffect(() => {
        setCollapsedChannels(previous => {
            const remaining = new Set(Array.from(previous).filter(id => channels[id]));
            return remaining.size === previous.size ? previous : remaining;
        });
    }, [channels]);

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
            
            <div className="dw-channel-grid">
                {channelEntries.map(channel => (
                    <ChannelCard
                        key={channel.id}
                        nodeId={nodeId}
                        channelId={channel.id}
                        channel={channel}
                        expanded={!collapsedChannels.has(channel.id)}
                        onToggleExpand={() => handleToggleExpand(channel.id)}
                    />
                ))}
            </div>
        </div>
    );
};

export default ChannelList;