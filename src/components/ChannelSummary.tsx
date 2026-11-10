import React, { useState } from 'react';
import { ExclamationOctagon, ExclamationTriangle, InfoCircle } from 'react-bootstrap-icons';
import type { InspectorSummary, ObservedSummary } from '../dronelink/moduleVisualizations';
import { SummaryDetails } from './NodeSummary';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';

function Reading({ summary, primary }: { summary: ObservedSummary; primary?: boolean }) {
    return <div className={primary ? 'dw-summary-primary' : 'dw-summary-supporting'} data-severity={summary.severity ?? 'neutral'}>
        <dt className="dw-meta">{summary.label}</dt>
        <dd>
            {summary.bearing !== undefined && <span className="dw-heading-compass" aria-hidden="true">
                <span>N</span><span>E</span><span>S</span><span>W</span>
                <i style={{ transform: `rotate(${summary.bearing % 360}deg)` }} />
            </span>}
            {summary.severity === 'warning' && <ExclamationTriangle aria-hidden="true" />}
            {summary.severity === 'danger' && <ExclamationOctagon aria-hidden="true" />}
            {summary.lines ? <span className="dw-summary-lines">
                {summary.lines.map(line => <span key={line}>{line}</span>)}
            </span> : <span>{summary.text}</span>}
            {summary.status && <span className="visually-hidden"> · {summary.status}</span>}
        </dd>
    </div>;
}

export default function ChannelSummary({ channelId, summary }: { channelId: number; summary: InspectorSummary }) {
    const layout = summary.primary.length === 1 ? 'lead' : 'rows';
    return <dl className="dw-channel-summary" data-layout={layout} aria-label={`Observed readings for channel ${channelId}`}>
        {summary.primary.map(reading => <Reading key={reading.parameterId} summary={reading} primary />)}
        {summary.supporting.map(reading => <Reading key={reading.parameterId} summary={reading} />)}
    </dl>;
}

export function ChannelSummaryDetails({ nodeId, channelId, summary }: { nodeId: number; channelId: number; summary: InspectorSummary }) {
    const [details, setDetails] = useState(false);
    const title = `Channel ${channelId} reading details`;
    return <>
        <IconButton label={title} icon={<InfoCircle />} data-inspector-focus={`summary-details-${channelId}`} onClick={() => setDetails(true)} />
        <SettingsDialog title={title} show={details} onHide={() => setDetails(false)}>
            <SummaryDetails nodeId={nodeId} summaries={[...summary.primary, ...summary.supporting]} now={Date.now()} />
        </SettingsDialog>
    </>;
}
