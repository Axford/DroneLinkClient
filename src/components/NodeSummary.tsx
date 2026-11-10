import React from 'react';
import { ExclamationOctagon, ExclamationTriangle } from 'react-bootstrap-icons';
import { ObservedSummary } from '../dronelink/moduleVisualizations';
import { receiptLabel } from '../dronelink/observedPositions';
import './NodeSummary.css';

interface SummaryProps {
    nodeId: number;
    summaries: ObservedSummary[];
    now: number;
}

function observationDetails(nodeId: number, summary: ObservedSummary, now: number) {
    const { channelId, parameterId, reading, status } = summary;
    return [`${nodeId}>${channelId}.${parameterId}`, reading?.source || 'Unknown source',
        `Server receipt: ${receiptLabel(reading?.lastHeard, now)}`, status].filter(Boolean).join(' · ');
}

export function SummaryChips({ nodeId, summaries, now }: SummaryProps) {
    if (!summaries.length) return null;
    return <div className="dw-summary-chips">
        {summaries.map(summary => <span key={`${summary.channelId}:${summary.parameterId}`} className="dw-summary-chip"
            role="group" aria-label={[summary.label, summary.text, summary.status].filter(Boolean).join(' · ')}
            data-severity={summary.severity ?? 'neutral'} title={`${summary.label} · ${observationDetails(nodeId, summary, now)}`}>
            {summary.severity === 'warning' && <ExclamationTriangle aria-hidden="true" />}
            {summary.severity === 'danger' && <ExclamationOctagon aria-hidden="true" />}
            <span aria-hidden="true">{summary.text}</span>
        </span>)}
    </div>;
}

export function SummaryDetails({ nodeId, summaries, now }: SummaryProps) {
    if (!summaries.length) return null;
    return <dl className="mb-0" aria-label="Observed readings">
        {summaries.map(summary => <React.Fragment key={`${summary.channelId}:${summary.parameterId}`}>
            <dt>{summary.label}</dt>
            <dd>{summary.text}<div className="dw-meta">
                <div>{observationDetails(nodeId, summary, now)}</div>
                {summary.binding && <div>Map binding: {summary.binding.path} · Priority {summary.binding.priority}</div>}
                {summary.reading?.timestamp ? <div>Value last changed {new Date(summary.reading.timestamp).toLocaleString()}</div> : null}
                {summary.reading?.nameLastHeard ? <div>Name received {new Date(summary.reading.nameLastHeard).toLocaleString()} via {summary.reading.nameSource || 'Unknown source'}</div> : null}
            </div></dd>
        </React.Fragment>)}
    </dl>;
}
