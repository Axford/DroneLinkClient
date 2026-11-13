import React from 'react';
import type { ChannelState } from '../dronelink/DroneLinkState';
import { compactReceiptAge, receiptLabel } from '../dronelink/observedPositions';
import { probeModeLabels, readProbeResults } from './probeResults';

export default function ProbeInstrument({ channel, now, disabled }: {
    channel: ChannelState;
    now: number;
    disabled: boolean;
}) {
    const { rows, refreshMs } = readProbeResults(channel);
    return <section aria-label="Probe pin results" className="mb-3">
        {disabled && <p className="dw-meta">Probe disabled. Showing last received results.</p>}
        {!disabled && !!refreshMs && <p className="dw-meta">Expected refresh per pin: about {refreshMs / 1000} s</p>}
        {rows.length ? <dl className="mb-0">
            {rows.map(({ gpio, result, mode, description, baud }) => <React.Fragment key={gpio}>
                <dt>GPIO {gpio}{probeModeLabels[mode - 1] && ` · ${probeModeLabels[mode - 1]}`}
                    {mode === 3 && ` · ${baud ? `${baud} baud` : 'Baud unavailable'} · 8N1`}</dt>
                <dd className="text-break">
                    {description}
                    <span className="dw-meta ms-2" title={receiptLabel(result.lastHeard, now)}>
                        <span className="visually-hidden">Received: </span>{compactReceiptAge(result.lastHeard, now)}
                    </span>
                </dd>
            </React.Fragment>)}
        </dl> : <p className="dw-meta mb-0">No Probe pin results received</p>}
    </section>;
}
