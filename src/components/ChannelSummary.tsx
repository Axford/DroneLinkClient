import React, { useState } from 'react';
import { ExclamationOctagon, ExclamationTriangle, InfoCircle } from 'react-bootstrap-icons';
import type { InspectorSummary, ObservedSummary } from '../dronelink/moduleVisualizations';
import { SummaryDetails } from './NodeSummary';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import Rfm69Signal from './Rfm69Signal';

function Reading({ summary, primary }: { summary: ObservedSummary; primary?: boolean }) {
    const bearing = summary.bearing;
    const hasCompass = bearing !== undefined;
    return <div className={primary ? 'dw-summary-primary' : 'dw-summary-supporting'}
        data-severity={summary.severity ?? 'neutral'} data-unavailable={summary.unavailable || undefined}
        data-graphic={hasCompass || undefined}>
        <dt className={hasCompass ? 'visually-hidden' : 'dw-meta'}>{summary.label}</dt>
        <dd>
            {hasCompass && <span className="dw-heading-compass" aria-hidden="true">
                <span>N</span><span>E</span><span>S</span><span>W</span>
                <i style={{ transform: `rotate(${bearing % 360}deg)` }} />
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

function PacketReading({ label, value }: { label: string; value?: string }) {
    return <dd data-unavailable={value === undefined || undefined}>
        <span className="visually-hidden">{label}: </span>
        {value === undefined ? <>
            <span aria-hidden="true">—</span><span className="visually-hidden">Unavailable</span>
        </> : <span>{value}</span>}
    </dd>;
}

export default function ChannelSummary({ channelId, summary, sampleScope }: { channelId: number; summary: InspectorSummary; sampleScope?: string }) {
    const label = `Observed readings for channel ${channelId}`;
    if ('columns' in summary) {
        return <>
            <dl className="dw-channel-summary" data-layout="columns" aria-label={label}>
                {summary.columns.map(column => <div key={column.label} className="dw-summary-primary">
                    <dt className="dw-meta">{column.label}</dt>
                    <PacketReading label="Count" value={column.count} />
                    <PacketReading label="Rate in packets per second" value={column.rate} />
                </div>)}
            </dl>
            {summary.signal && <Rfm69Signal key={sampleScope} signal={summary.signal} scope={sampleScope} />}
        </>;
    }
    const layout = summary.primary.length === 1 ? 'lead' : 'rows';
    return <dl className="dw-channel-summary" data-layout={layout} aria-label={label}>
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
            {'columns' in summary && summary.note && <p className="dw-meta">{summary.note}</p>}
            <SummaryDetails nodeId={nodeId} summaries={'details' in summary ? summary.details : [...summary.primary, ...summary.supporting]} now={Date.now()} />
        </SettingsDialog>
    </>;
}
