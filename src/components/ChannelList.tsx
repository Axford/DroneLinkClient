import React, { useLayoutEffect, useRef, useState } from 'react';
import { Card } from 'react-bootstrap';
import { ArrowDown, ArrowDownUp, ArrowUp, ArrowsExpand, ArrowsCollapse } from 'react-bootstrap-icons';
import type { NodeState } from '../dronelink/DroneLinkState';
import IconButton from './ui/IconButton';
import ChannelCard from './ChannelCard';
import { useChannelPresentation } from './InspectorSession';

export default function ChannelList({ node }: { node: NodeState }) {
    const view = useChannelPresentation(node);
    const allExpanded = view.ids.every(id => !view.collapsed.includes(id));
    const [announcement, setAnnouncement] = useState('');
    const movedControl = useRef<HTMLButtonElement | null>(null);
    useLayoutEffect(() => {
        movedControl.current?.focus();
        movedControl.current = null;
    });

    if (!view.ids.length) return <Card><Card.Body>No channels discovered for this node</Card.Body></Card>;

    return <div>
        <div className="channel-list-header d-flex justify-content-between align-items-center mb-2">
            <h6 className="mb-0 text-white">Channels ({view.ids.length})</h6>
            <div className="dw-row-actions">
                {view.ids.length > 1 && <IconButton label="Reorder channels" icon={<ArrowDownUp />} aria-pressed={view.reordering} data-inspector-focus="reorder" onClick={view.toggleReordering} />}
                <IconButton label={allExpanded ? 'Collapse All' : 'Expand All'} icon={allExpanded ? <ArrowsCollapse /> : <ArrowsExpand />} data-inspector-focus="bulk" onClick={() => view.setAllCollapsed(allExpanded)} />
            </div>
        </div>
        <span role="status" className="visually-hidden">{announcement}</span>
        <div className="dw-channel-grid">
            {view.ids.map((id, index) => {
                const channel = node.channels[id];
                const name = channel.name || `Channel ${id}`;
                const actions = view.reordering && <div className="dw-channel-reorder" role="group" aria-label={`Reorder ${name}, channel ${id}`}>
                    {([-1, 1] as const).map(direction => {
                        const unavailable = index + direction < 0 || index + direction >= view.ids.length;
                        return <IconButton key={direction} type="button" label={`Move channel ${id} ${direction < 0 ? 'earlier' : 'later'}`} icon={direction < 0 ? <ArrowUp /> : <ArrowDown />}
                            aria-disabled={unavailable} data-inspector-focus={`move-${id}-${direction}`} onClick={event => {
                                const position = view.move(id, direction);
                                if (position === undefined) return;
                                movedControl.current = event.currentTarget;
                                setAnnouncement(`${name}, channel ${id}, moved to position ${position} of ${view.ids.length}.`);
                            }} />;
                    })}
                </div>;
                return <ChannelCard key={id} nodeId={node.id} channelId={id} channel={channel}
                    expanded={!view.collapsed.includes(id)} onToggleExpand={() => view.toggleChannel(id)}
                    systemOpen={view.systemOpen.includes(id)} onToggleSystem={open => view.setSystemOpen(id, open)} actions={actions} />;
            })}
        </div>
    </div>;
}
