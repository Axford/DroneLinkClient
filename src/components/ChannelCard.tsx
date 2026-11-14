import React, { useId } from 'react';
import { Card, Collapse } from 'react-bootstrap';
import { ChevronDown, ChevronRight, ClockFill, ExclamationCircleFill, ListUl, SlashCircleFill, Speedometer2 } from 'react-bootstrap-icons';
import { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T, DRONE_MODULE_PARAM_ERROR, DRONE_MODULE_PARAM_NAME, DRONE_MODULE_PARAM_STATUS, DRONE_MODULE_PARAM_RESETCOUNT } from '../dronelink/DroneLinkMsg';
import { compactReceiptAge, receiptLabel } from '../dronelink/observedPositions';
import IconButton from './ui/IconButton';
import ModuleStatusAction from './ModuleStatusAction';
import ParameterList from './ParameterList';
import ProbeInstrument from './ProbeInstrument';
import ChannelSummary, { ChannelSummaryDetails } from './ChannelSummary';
import { channelVisualization, observedModuleType } from '../dronelink/moduleVisualizations';
import { useVisualizationSettings } from './VisualizationSettings';
import ChannelVisualizationSettings from './ChannelVisualizationSettings';

interface ChannelCardProps {
    nodeId: number;
    channelId: number;
    channel: ChannelState;
    generation?: number;
    now?: number;
    sampleLive?: boolean;
    expanded: boolean;
    onToggleExpand: () => void;
    systemOpen: boolean;
    onToggleSystem: (open: boolean) => void;
    showParameters: boolean;
    onShowParameters: (show: boolean) => void;
    actions?: React.ReactNode;
}
function observedInteger(reading: ParameterState | undefined, type: number = DRONE_LINK_MSG_TYPE_UINT8_T): number | undefined {
    if (!reading || reading.unavailable?.value || reading.msgType !== type || reading.numValues !== 1 || reading.values.length !== 1) return;
    const value = reading.values[0];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= (type === DRONE_LINK_MSG_TYPE_UINT32_T ? 0xffffffff : 255) ? value : undefined;
}
export default function ChannelCard({ nodeId, channelId, channel, generation = 0, now = Date.now(), sampleLive = false, expanded, onToggleExpand, systemOpen, onToggleSystem, showParameters, onShowParameters, actions }: ChannelCardProps) {
    const bodyId = useId();
    const plugin = channelVisualization(channel);
    const settings = useVisualizationSettings();
    const definition = plugin?.settings;
    const target = definition && { nodeAddress: nodeId, channel: channelId, moduleType: definition.moduleType };
    const thresholds = target && settings?.get(target)?.thresholds;
    const summary = plugin?.inspector?.(channel, thresholds);
    const sampleScope = sampleLive && expanded && !showParameters ? `${nodeId}/${channelId}/${generation}` : undefined;
    const parameterCount = Object.keys(channel.params).length;
    const status = observedInteger(channel.params[DRONE_MODULE_PARAM_STATUS]);
    const error = observedInteger(channel.params[DRONE_MODULE_PARAM_ERROR]) === 1;
    const reset = channel.params[DRONE_MODULE_PARAM_RESETCOUNT];
    const resets = observedInteger(reset, DRONE_LINK_MSG_TYPE_UINT32_T) ?? observedInteger(reset);
    const operatingStatus = status === 0 ? 'Disabled' : status === 1 ? 'Enabled' : status === 2 ? 'Waiting' : undefined;
    const statusText = error ? 'Error' : operatingStatus;
    const StatusIcon = error ? ExclamationCircleFill : status === 0 ? SlashCircleFill : ClockFill;
    const moduleType = observedModuleType(channel);
    const observedName = channel.params[DRONE_MODULE_PARAM_NAME]?.unavailable?.value ? undefined : channel.name?.trim();
    const name = observedName || moduleType || channel.type || 'Unnamed';
    const receipt = receiptLabel(channel.lastHeard, now);
    return <Card className="channel-card" data-status={statusText?.toLowerCase()}>
        <div className="dw-channel-card-heading">
            <Card.Header data-inspector-focus={`channel-${channelId}`} className="dw-channel-toggle" as="button" type="button"
                aria-expanded={expanded} aria-controls={bodyId} onClick={onToggleExpand}>
                {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                <span className="dw-channel-identity">
                    <strong><span className="dw-channel-number">{channelId}.</span> <span className="dw-channel-name">{name}</span></strong>
                    <span className="dw-channel-metadata">
                        <span title={resets === undefined ? 'Reset count unavailable' :
                            `Observed ${nodeId}>${channelId}.${DRONE_MODULE_PARAM_RESETCOUNT} · ${reset.source || 'Unknown source'} · ${receiptLabel(reset.lastHeard, now)}`}>
                            <span className="visually-hidden">Resets: </span>{resets ?? '—'}
                        </span>
                        <span title={receipt}><span className="visually-hidden">Receipt age: </span>{compactReceiptAge(channel.lastHeard, now)}</span>
                    </span>
                    {statusText && (statusText === 'Enabled' ? <span className="visually-hidden">Enabled</span> :
                        <span className="dw-channel-status"><StatusIcon aria-hidden="true" />{statusText}
                            {error && operatingStatus && <span className="visually-hidden"> · Operating status: {operatingStatus}</span>}
                        </span>)}
                </span>
            </Card.Header>
            <div className="dw-channel-actions">
                {expanded && summary && <div className="dw-channel-view-actions" role="group" aria-label={`View for channel ${channelId}`}>
                    <IconButton className="dw-channel-view-switch" label={showParameters ? 'Show Summary' : 'Show Parameters'}
                        icon={showParameters ? <Speedometer2 aria-hidden="true" /> : <ListUl aria-hidden="true" />}
                        aria-controls={bodyId} data-inspector-focus={`view-${channelId}`} onClick={() => onShowParameters(!showParameters)} />
                    <ChannelSummaryDetails nodeId={nodeId} channelId={channelId} summary={summary} sampleScope={sampleScope} onShowParameters={() => onShowParameters(true)} />
                </div>}
                <ModuleStatusAction key={`${nodeId}:${channelId}:${generation}`} node={nodeId} channel={channelId} name={String(name)} status={status} />
                {actions}
                {definition && target && settings?.canEdit && <ChannelVisualizationSettings target={target} definition={definition} generation={generation} />}
            </div>
        </div>
        <Collapse in={expanded}><div id={bodyId}><Card.Body>
            {moduleType === 'Probe' && <ProbeInstrument channel={channel} now={now} disabled={status === 0} />}
            {summary && !showParameters ? <ChannelSummary nodeId={nodeId} channelId={channelId} summary={summary} sampleScope={sampleScope} /> :
                parameterCount ? <ParameterList nodeId={nodeId} channelId={channelId} parameters={channel.params} moduleType={moduleType} systemOpen={systemOpen} onToggleSystem={onToggleSystem} /> :
                    <p className="dw-meta mb-0">No parameters discovered</p>}
        </Card.Body></div></Collapse>
    </Card>;
}
