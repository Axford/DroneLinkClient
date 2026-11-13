import React, { useState } from 'react';
import { ExclamationOctagon, ExclamationTriangle, InfoCircle } from 'react-bootstrap-icons';
import type { InspectorSummary, ObservedSummary } from '../dronelink/moduleVisualizations';
import { SummaryDetails } from './NodeSummary';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import Rfm69Signal from './Rfm69Signal';
import CellVoltageDial from './CellVoltageDial';

function Reading({ summary, primary, inlineSeverity, hideLabel }: { summary: ObservedSummary; primary?: boolean; inlineSeverity?: boolean; hideLabel?: boolean }) {
    const bearing = summary.bearing;
    const hasCompass = bearing !== undefined;
    const volts = summary.voltageDial;
    const severityIcon = summary.severity === 'warning' ? <ExclamationTriangle aria-hidden="true" />
        : summary.severity === 'danger' ? <ExclamationOctagon aria-hidden="true" /> : null;
    return <div className={primary ? 'dw-summary-primary' : 'dw-summary-supporting'}
        data-severity={summary.severity ?? 'neutral'} data-unavailable={summary.unavailable || undefined}
        data-graphic={volts !== undefined ? 'voltage' : hasCompass ? 'compass' : undefined}>
        <dt className={hasCompass || (hideLabel && !summary.unavailable) ? 'visually-hidden' : 'dw-meta'}>{summary.label}{inlineSeverity && severityIcon}</dt>
        <dd>
            {hasCompass && <span className="dw-heading-compass" aria-hidden="true">
                <span>N</span><span>E</span><span>S</span><span>W</span>
                <i style={{ transform: `rotate(${bearing % 360}deg)` }} />
            </span>}
            {!inlineSeverity && severityIcon}
            {volts !== undefined ? <CellVoltageDial volts={volts} text={summary.text} /> : summary.lines ? <span className="dw-summary-lines">
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
    if ('inputs' in summary) {
        return <section className="dw-power-inputs" aria-label={label}>
            {summary.inputs.map(input => <section className="dw-power-input" key={input.label} role="group" aria-label={input.label}>
                <dl className="dw-channel-summary dw-power-input-readings">
                    <Reading summary={input.voltage} primary hideLabel={input.voltage.voltageDial !== undefined} />
                    {input.readings.map(reading => <Reading key={reading.parameterId} summary={reading} hideLabel={reading.parameterId !== 16} />)}
                </dl>
            </section>)}
        </section>;
    }
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
    const layout = summary.layout ?? (summary.primary.length === 1 ? 'lead' : 'rows');
    const supportingRows = layout === 'compact' ? Math.ceil(summary.supporting.length / 2) : summary.supporting.length;
    const leadRows = { '--dw-summary-rows': Math.max(1, supportingRows) } as React.CSSProperties;
    return <dl className="dw-channel-summary" data-layout={layout} style={leadRows} aria-label={label}>
        {summary.primary.map(reading => <Reading key={reading.parameterId} summary={reading} primary inlineSeverity={layout === 'compact'} />)}
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
            {'inputs' in summary ? summary.inputs.map(input => <section key={input.label} role="group" aria-label={input.label}>
                <h3 className="dw-meta mt-2">{input.label}</h3>
                <SummaryDetails nodeId={nodeId} summaries={[input.voltage, ...input.readings]} now={Date.now()} />
            </section>) : <SummaryDetails nodeId={nodeId}
                summaries={'details' in summary ? summary.details : [...summary.primary, ...summary.supporting]} now={Date.now()} />}
        </SettingsDialog>
    </>;
}
