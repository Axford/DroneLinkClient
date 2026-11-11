import React, { useId } from 'react';
import { Card, Badge, Collapse } from 'react-bootstrap';
import { ChevronDown, ChevronRight } from 'react-bootstrap-icons';
import { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_MODULE_PARAM_STATUS, DRONE_MODULE_PARAM_RESETCOUNT } from '../dronelink/DroneLinkMsg';
import { receiptLabel } from '../dronelink/observedPositions';
import ParameterList from './ParameterList';
import ChannelSummary, { ChannelSummaryDetails } from './ChannelSummary';
import { channelVisualization } from '../dronelink/moduleVisualizations';
import { useVisualizationSettings } from './VisualizationSettings';
import ChannelVisualizationSettings from './ChannelVisualizationSettings';

interface ChannelCardProps {
    nodeId: number;
    channelId: number;
    channel: ChannelState;
    generation?: number;
    expanded: boolean;
    onToggleExpand: () => void;
    systemOpen: boolean;
    onToggleSystem: (open: boolean) => void;
    showParameters: boolean;
    onShowParameters: (show: boolean) => void;
    actions?: React.ReactNode;
}
function observedByte(reading: ParameterState | undefined): number | undefined {
    if (!reading || reading.unavailable?.value || reading.msgType !== DRONE_LINK_MSG_TYPE_UINT8_T || reading.numValues !== 1 || reading.values.length !== 1) return;
    const value = reading.values[0];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255 ? value : undefined;
}
export default function ChannelCard({ nodeId, channelId, channel, generation = 0, expanded, onToggleExpand, systemOpen, onToggleSystem, showParameters, onShowParameters, actions }: ChannelCardProps) {
    const bodyId = useId();
    const plugin = channelVisualization(channel);
    const settings = useVisualizationSettings();
    const definition = plugin?.settings;
    const target = definition && { nodeAddress: nodeId, channel: channelId, moduleType: definition.moduleType };
    const thresholds = target && settings?.get(target)?.thresholds;
    const summary = showParameters ? undefined : plugin?.inspector?.(channel, thresholds);
    const parameterCount = Object.keys(channel.params).length;
    const status = observedByte(channel.params[DRONE_MODULE_PARAM_STATUS]);
    const resets = observedByte(channel.params[DRONE_MODULE_PARAM_RESETCOUNT]);
    const statusText = status === 0 ? 'Disabled' : status === 1 ? 'Enabled' : status === 2 ? 'Waiting' : status;
    const provenance = (id: number) => { const reading = channel.params[id]; return `Observed ${nodeId}>${channelId}.${id} · ${reading.source || 'Unknown source'} · ${receiptLabel(reading.lastHeard)}`; };
    return <Card className="channel-card">
        <div className="dw-channel-card-heading"><Card.Header data-inspector-focus={`channel-${channelId}`} className="dw-channel-toggle" as="button" type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggleExpand}>
            <span className="dw-channel-identity">{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}<strong>{channel.name || `Channel ${channelId}`}</strong><span className="dw-meta">{nodeId}&gt;{channelId}</span></span>
            <span className="dw-channel-metadata">
                {channel.type !== undefined && <Badge bg="secondary">{channel.type}</Badge>}
                {status !== undefined && <Badge bg="secondary" title={provenance(DRONE_MODULE_PARAM_STATUS)}>Status: {statusText}</Badge>}
                {resets !== undefined && <Badge bg="secondary" title={provenance(DRONE_MODULE_PARAM_RESETCOUNT)}>Resets: {resets}</Badge>}
                <span className="dw-meta">{parameterCount} {parameterCount === 1 ? 'param' : 'params'}</span>
            </span>
            <span className="visually-hidden">Channel receipt: {receiptLabel(channel.lastHeard)}</span>
        </Card.Header>{actions}
            {definition && target && settings?.canEdit && <ChannelVisualizationSettings target={target} definition={definition} generation={generation} />}
        </div>
        <Collapse in={expanded}><div id={bodyId}><Card.Body>
            {plugin?.inspector && <div className="dw-channel-summary-toolbar">
                <div className="dw-channel-views" role="group" aria-label={`View for channel ${channelId}`}>
                    <button type="button" aria-pressed={!showParameters} data-inspector-focus={`summary-${channelId}`} onClick={() => onShowParameters(false)}>Summary</button>
                    <button type="button" aria-pressed={showParameters} data-inspector-focus={`parameters-${channelId}`} onClick={() => onShowParameters(true)}>Parameters</button>
                </div>
                {summary && <ChannelSummaryDetails nodeId={nodeId} channelId={channelId} summary={summary} />}
            </div>}
            {summary ? <ChannelSummary channelId={channelId} summary={summary} /> :
                parameterCount ? <ParameterList nodeId={nodeId} channelId={channelId} parameters={channel.params} systemOpen={systemOpen} onToggleSystem={onToggleSystem} /> :
                    <p className="dw-meta mb-0">No parameters discovered</p>}
        </Card.Body></div></Collapse>
    </Card>;
}
