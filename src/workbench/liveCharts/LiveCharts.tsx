import React, { useEffect, useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { transportLabel } from '../useWorkbenchFeed';
import { LiveCapture, seriesLimit, TimeRange } from './capture';
import type { Signal } from './catalogue';
import ChartTimeline, { seriesColor, timeLabel, TimelineSeries } from './ChartTimeline';
import './liveCharts.css';

export interface ChartInspection { range?: TimeRange; cursor?: number; pinned?: number }

interface Props {
    capture: LiveCapture;
    connected: boolean;
    onCapturing: (running: boolean) => void;
    catalogue: Signal[];
    retainedSignals: ReadonlyMap<string, Signal>;
    series: Signal[];
    addSignal: (signal: Signal) => void;
    removeSignal: (id: string) => void;
    separate: Record<string, boolean>;
    setSeparate: (id: string, value: boolean) => void;
    inspection: ChartInspection;
    setInspection: React.Dispatch<React.SetStateAction<ChartInspection>>;
    search: string;
    onSearch: (value: string) => void;
}

export default function LiveCharts({ capture, connected, onCapturing, catalogue, retainedSignals, series, addSignal, removeSignal,
    separate, setSeparate, search, onSearch, inspection, setInspection }: Props) {
    const [now, setNow] = useState(Date.now);
    const { range: selectedRange, cursor, pinned } = inspection;
    const running = capture.running;
    const frozen = capture.isFrozen;
    useEffect(() => {
        if (!running || frozen) return;
        const timer = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(timer);
    }, [running, frozen]);
    const bounds = useMemo(() => capture.range(now), [capture, now]);
    const range = selectedRange ?? bounds;
    const availability = useMemo(() => bounds ? capture.availability(bounds) : undefined, [capture, bounds]);
    const queries = useMemo(() => range ? capture.samples(series, range, true) : series.map(() => []), [capture, series, range]);
    const groups = useMemo(() => {
        const panels = new Map<string, TimelineSeries[]>();
        series.forEach((signal, index) => {
            const key = signal.unit && !separate[signal.id] ? `unit:${signal.unit}` : signal.id;
            const panel = panels.get(key) ?? [];
            panel.push({ signal, samples: queries[index], color: seriesColor(index) });
            panels.set(key, panel);
        });
        return Array.from(panels.values());
    }, [series, queries, separate]);
    const used = new Set(series.map(signal => signal.id));
    const availableSignals = new Map(retainedSignals);
    catalogue.forEach(signal => availableSignals.set(signal.id, signal));
    const candidates = Array.from(availableSignals.values()).filter(signal => !used.has(signal.id) &&
        search.toLowerCase().trim().split(/\s+/).every(term => `${signal.name} ${signal.location} ${signal.id} ${signal.unit || ''}`.toLowerCase().includes(term)));
    const [selected, setSelected] = useState('');
    const selectedSignal = candidates.find(signal => signal.id === selected) ?? candidates[0];
    const canInspect = !!bounds && bounds[1] > bounds[0];
    const effectiveCursor = range && Math.max(range[0], Math.min(range[1], cursor ?? range[1]));
    const pinVisible = pinned !== undefined && range && pinned >= range[0] && pinned <= range[1];
    const changeNow = () => setNow(Date.now());
    const clearInspection = () => setInspection({});
    const setRange = (range?: TimeRange) => setInspection(previous => ({ ...previous, range }));
    const setCursor = (cursor: number) => setInspection(previous => ({ ...previous, cursor }));
    const setPinned = (pinned?: number) => setInspection(previous => ({ ...previous, pinned }));

    function changeRange(edge: 'start' | 'end', timestamp: number) {
        if (!bounds || !range) return;
        const next: TimeRange = edge === 'start' ? [Math.min(timestamp, range[1] - 1), range[1]] :
            [range[0], Math.max(timestamp, range[0] + 1)];
        setRange(next);
    }

    return <section className="dw-live-charts" aria-label="Live charts">
        <div className="dw-chart-actions">
            {running ? <Button size="sm" onClick={() => {
                capture.stop(Date.now()); onCapturing(false); changeNow();
            }}>Stop capture</Button> : <Button size="sm" disabled={!connected} title="Collect up to 15 minutes of gateway receipts."
                aria-description="Collect up to 15 minutes of gateway receipts." onClick={() => {
                capture.start(Date.now()); clearInspection(); onCapturing(true); changeNow();
            }}>Start capture</Button>}
            {frozen ? <Button size="sm" variant="outline-secondary" onClick={() => {
                capture.follow(); clearInspection(); changeNow();
            }}>{running ? 'Return to live' : 'Show final window'}</Button> : running && <Button size="sm" variant="outline-secondary" onClick={() => {
                capture.freeze(Date.now()); changeNow();
            }}>Freeze view</Button>}
        </div>
        {bounds && <p className="dw-meta mb-0">{running ? frozen ? 'View frozen · Capture continues' : 'Following live' : 'Capture stopped'}
                {' · '}{availability?.earliest !== undefined ? `Earliest sample ${timeLabel(availability.earliest)}` : 'Waiting for numeric samples'}
                {availability?.limited && ' · Packet limit reached'}{!connected && running && ' · Gateway disconnected'}</p>}
        <div className="dw-chart-picker">
            <label>Find parameters<input className="form-control form-control-sm" type="search" value={search}
                onChange={event => { onSearch(event.target.value); setSelected(''); }} /></label>
            <label>Series<select className="form-select form-select-sm" value={selectedSignal?.id ?? ''}
                disabled={!candidates.length} onChange={event => setSelected(event.target.value)}>
                {!candidates.length && <option value="">No matching signals</option>}
                {candidates.map(signal => <option key={signal.id} value={signal.id}>
                    {signal.name}{signal.unit ? ` (${signal.unit})` : ''} · {signal.location} · {signal.id}
                </option>)}
            </select></label>
            <Button size="sm" variant="outline-secondary" disabled={!selectedSignal || series.length >= seriesLimit}
                onClick={() => { if (selectedSignal) addSignal(selectedSignal); }}>Add series</Button>
        </div>
        {series.length >= seriesLimit && <p className="dw-meta mb-0">Remove a series to add another. Up to {seriesLimit} can be shown.</p>}
        {!!series.length && <ul className="dw-chart-series" aria-label="Plotted series">
            {series.map((signal, index) => {
                const samples = queries[index];
                const sample = cursor === undefined ? samples[samples.length - 1] :
                    effectiveCursor === undefined || !range ? undefined : capture.reading(signal, effectiveCursor, range);
                const first = samples.find(item => item.value !== null);
                const last = samples[samples.length - 1];
                const source = running && !frozen ? capture.currentSource(signal.node) : undefined;
                const switches = samples.reduce((count, item, i) => i && item.segment !== samples[i - 1].segment ? count + 1 : count, 0);
                return <li key={signal.id}>
                    <span className="dw-chart-swatch" style={{ backgroundColor: seriesColor(index) }} />
                    <div className="dw-chart-series-name"><strong>{signal.name}{signal.unit ? ` (${signal.unit})` : ''}</strong>
                        <span className="dw-meta">{signal.location} · {signal.id}</span>
                        {bounds && <span className="dw-meta">{first ? `Samples from ${timeLabel(first.time)}` : 'No samples in view'}
                            {last && ` · Last sample via ${transportLabel[last.transport]}`}
                            {source && (!source.transport ? ' · Route unavailable' : last && last.transport !== source.transport ? ` · Switched to ${transportLabel[source.transport]}` : last && source.segment !== last.segment ? ' · Awaiting fresh samples' : '')}
                            {switches > 0 && ` · ${switches} source or connection ${switches === 1 ? 'break' : 'breaks'}`}</span>}
                        {sample && sample.value !== null && <span className="dw-chart-value">{sample.value?.toLocaleString(undefined, { maximumSignificantDigits: 8 })}
                            {' · '}{timeLabel(sample.time)} · {transportLabel[sample.transport]}</span>}
                    </div>
                    {signal.unit && <Button size="sm" variant="outline-secondary" aria-label={`${separate[signal.id] ? 'Group' : 'Separate'} ${signal.name}`}
                        onClick={() => setSeparate(signal.id, !separate[signal.id])}>{separate[signal.id] ? 'Group' : 'Separate'}</Button>}
                    <Button size="sm" variant="outline-secondary" aria-label={`Remove ${signal.name}`}
                        onClick={() => removeSignal(signal.id)}>Remove</Button>
                </li>;
            })}
        </ul>}
        {bounds && range && canInspect && !!groups.length && <>
            {(!running || frozen) && <div className="dw-chart-ranges">
                <label>View start <span>{timeLabel(range[0])}</span>
                    <input type="range" min={bounds[0]} max={bounds[1]} value={range[0]} onChange={event => changeRange('start', Number(event.target.value))} /></label>
                <label>View end <span>{timeLabel(range[1])}</span>
                    <input type="range" min={bounds[0]} max={bounds[1]} value={range[1]} onChange={event => changeRange('end', Number(event.target.value))} /></label>
                <Button size="sm" variant="outline-secondary" onClick={() => setRange()}>Reset range</Button>
            </div>}
            <ChartTimeline groups={groups} range={range} cursor={effectiveCursor} pinned={pinned} onCursor={setCursor}
                onPin={time => { setCursor(time); setPinned(time); }} />
            <div className="dw-chart-ranges">
                <label>Time cursor <span>{timeLabel(effectiveCursor!)}</span>
                    <input type="range" min={range[0]} max={range[1]} value={effectiveCursor} onChange={event => setCursor(Number(event.target.value))} /></label>
                {pinVisible ? <>
                    <span className="dw-chart-value">Pinned {timeLabel(pinned!)} · Δ {((effectiveCursor! - pinned!) / 1000).toFixed(3)} s</span>
                    <Button size="sm" variant="outline-secondary" onClick={() => setPinned(undefined)}>Clear pin</Button>
                </> : <Button size="sm" variant="outline-secondary" onClick={() => setPinned(effectiveCursor)}>Pin time</Button>}
            </div>
        </>}
    </section>;
}
