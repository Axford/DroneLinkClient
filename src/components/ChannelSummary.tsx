import React, { useState } from 'react';
import { CaretUpFill, ExclamationOctagon, ExclamationTriangle, InfoCircle } from 'react-bootstrap-icons';
import type { ObservedSummary } from '../dronelink/moduleVisualizations';
import { SummaryDetails } from './NodeSummary';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';

export default function ChannelSummary({ nodeId, channelId, summaries }: { nodeId: number; channelId: number; summaries: ObservedSummary[] }) {
    const [details, setDetails] = useState(false);
    const title = `Channel ${channelId} reading details`;
    return <>
        <dl className="dw-channel-summary" aria-label={`Observed readings for channel ${channelId}`}>
            {summaries.map(summary => <div key={summary.parameterId} data-severity={summary.severity ?? 'neutral'}>
                <dt className="dw-meta">{summary.label}</dt>
                <dd>
                    {summary.bearing !== undefined && <span className="dw-heading-compass" aria-hidden="true">
                        <span>N</span><CaretUpFill style={{ transform: `rotate(${summary.bearing % 360}deg)` }} />
                    </span>}
                    {summary.severity === 'warning' && <ExclamationTriangle aria-hidden="true" />}
                    {summary.severity === 'danger' && <ExclamationOctagon aria-hidden="true" />}
                    {summary.text}
                    {summary.status && <span className="visually-hidden"> · {summary.status}</span>}
                </dd>
            </div>)}
        </dl>
        <div className="dw-channel-summary-actions">
            <IconButton label={title} icon={<InfoCircle />} data-inspector-focus={`summary-details-${channelId}`} onClick={() => setDetails(true)} />
        </div>
        <SettingsDialog title={title} show={details} onHide={() => setDetails(false)}>
            <SummaryDetails nodeId={nodeId} summaries={summaries} now={Date.now()} />
        </SettingsDialog>
    </>;
}
