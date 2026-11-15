import React, { lazy, Suspense } from 'react';
import type { ChannelState } from '../dronelink/DroneLinkState';
import { compactReceiptAge, receiptLabel } from '../dronelink/observedPositions';
import { motherboardDiagram } from '../workbench/motherboardDiagrams';
import '../workbench/physicalWiring.css';
import { probeModeLabels, probePinName, readProbeResults } from './probeResults';
import './ProbeInstrument.css';

const ProbeWiringGraph = lazy(() => import('./ProbeWiringGraph'));

export default function ProbeInstrument({ channel, now, disabled, motherboardVersion }: {
    channel: ChannelState;
    now: number;
    disabled: boolean;
    motherboardVersion?: number;
}) {
    const { rows, refreshMs } = readProbeResults(channel);
    const diagram = motherboardDiagram(motherboardVersion);
    const pins = rows.map(({ gpio, result, mode, description, baud, status }) => {
        const point = diagram?.endpoints.find(endpoint => endpoint.gpio === gpio);
        const connector = point?.label.split(' · ')[0];
        const name = probePinName(gpio);
        const modeLabel = mode === 3 ? `Serial · ${baud ? `${baud} baud` : 'Baud unavailable'} · 8N1` : probeModeLabels[mode - 1];
        const stale = !disabled && mode > 0 && status !== 5 && result.lastHeard !== undefined &&
            now - result.lastHeard > Math.max(5000, 2 * (refreshMs || 1000));
        return { gpio, mapped: !!point, card: <article className="dw-physical-device dw-probe-pin" key={gpio}
            aria-label={name} data-state={status === 5 || status === 6 ? 'unavailable' : stale ? 'stale' : undefined}>
            <div className="dw-probe-pin-heading"><strong>{name}</strong>
                <span className="dw-meta" title={receiptLabel(result.lastHeard, now)}>
                    <span className="visually-hidden">Received: </span>{compactReceiptAge(result.lastHeard, now)}
                </span>
            </div>
            {(modeLabel || connector) && <span className="dw-meta">
                {[modeLabel, connector === name ? undefined : connector].filter(Boolean).join(' · ')}
            </span>}
            <span>{stale && 'Stale · '}{description}</span>
            {diagram && !point && <span className="dw-meta">Connector unmapped on V{diagram.version}</span>}
        </article> };
    });
    const wired = pins.filter(pin => pin.mapped);
    const cards = <div className="dw-probe-pin-grid">{pins.map(pin => pin.card)}</div>;

    return <section aria-label="Probe pin results">
        {disabled && <p className="dw-meta mb-2">Probe disabled. Showing last received results.</p>}
        {!disabled && !!refreshMs && <p className="dw-meta mb-2">Expected refresh per pin: about {refreshMs / 1000} s</p>}
        {pins.length === 0 ? <p className="dw-meta mb-0">No Probe pin results received</p> : diagram ?
            <Suspense fallback={cards}>
                <ProbeWiringGraph key={`${diagram.version}/${wired.map(pin => pin.gpio).join(',')}`} diagram={diagram} pins={wired} />
                {wired.length !== pins.length && <div className="dw-probe-pin-grid">{pins.filter(pin => !pin.mapped).map(pin => pin.card)}</div>}
            </Suspense> : <>
                <p className="dw-meta mb-2">{motherboardVersion === 1 ? 'Motherboard diagram unavailable for DroneLink V1.' :
                    'Motherboard diagram unavailable. Detection requires a direct Wi-Fi route and supported firmware.'}</p>
                {cards}
            </>}
    </section>;
}
