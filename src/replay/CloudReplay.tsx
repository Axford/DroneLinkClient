import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Alert } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import type { User } from '../App';
import ObservedMap from '../components/ObservedMap';
import WorkspaceShell from '../components/WorkspaceShell';
import { InspectorSessionProvider } from '../components/InspectorSession';
import ChannelList from '../components/ChannelList';
import { ObservationNamesContext } from '../components/parameterPresentation';
import { accessEvent, affectsDomain, authenticatedFetchJson } from '../utils/api';
import ChartTimeline, { seriesColor } from '../workbench/liveCharts/ChartTimeline';
import { seriesLimit, TimeRange } from '../workbench/liveCharts/capture';
import { Signal, signalCatalogue, SignalPlotContext } from '../workbench/liveCharts/catalogue';
import '../workbench/liveCharts/liveCharts.css';
import { createReplayApi, Bookmark, ReplayInfo, ReplayProgress } from './replayApi';
import { ReplayCache, ReplayWindow, replaySeries, replayState, replayWindowMs } from './history';
import './replay.css';

const suggested = 30 * 60000;
const increments: [number, string][] = [[5, '5 min'], [30, '30 min'], [60, '1 hr'], [720, '12 hr'], [1440, '1 day']];
const timestamp = (time: number) => new Date(time).toLocaleString();
const dateInput = (time: number | null) => time === null ? '' :
    new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const clamp = (time: number, first: number, last: number) => Math.min(last, Math.max(first, time));
const message = (error: unknown) => error instanceof Error ? error.message : 'Replay request failed';

function rangeAround(at: number, duration: number, first: number, last: number): TimeRange {
    const from = clamp(Math.round(at - duration / 2), first, Math.max(first, last - duration));
    return [from, Math.min(last, from + duration)];
}

function DomainReplay({ domainId }: { domainId: string }) {
    const api = useMemo(() => createReplayApi(domainId), [domainId]);
    const cache = useMemo(() => new ReplayCache(), []);
    const [info, setInfo] = useState<ReplayInfo>();
    const [user, setUser] = useState<User>();
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [at, setAt] = useState<number>();
    const [range, setRange] = useState<TimeRange>();
    const [preview, setPreview] = useState<number>();
    const [pending, setPending] = useState<number>();
    const [progress, setProgress] = useState<ReplayProgress>();
    const [cacheVersion, setCacheVersion] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [rate, setRate] = useState(1);
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [bookmarkCursor, setBookmarkCursor] = useState<string | null>(null);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const [editing, setEditing] = useState<Bookmark>();
    const [start, setStart] = useState('');
    const [from, setFrom] = useState('');
    const [until, setUntil] = useState('');
    const lifetime = useRef<AbortController>(new AbortController());
    const intent = useRef(0);
    const requests = useRef(new Map<number, { controller: AbortController; promise: Promise<ReplayWindow> }>());

    const showBookmarks = useCallback(async (cursor: string | null, signal: AbortSignal) => {
        const page = await api.bookmarks(cursor, signal);
        if (signal.aborted) return;
        setBookmarks(previous => cursor ? [...previous, ...page.items] : page.items);
        setBookmarkCursor(page.nextCursor);
    }, [api]);

    useEffect(() => {
        const controller = new AbortController();
        const pendingRequests = requests.current;
        lifetime.current = controller;
        void Promise.all([
            api.info(controller.signal),
            authenticatedFetchJson('/api/user', { signal: controller.signal }),
            authenticatedFetchJson('/api/config', { signal: controller.signal }),
            showBookmarks(null, controller.signal)
        ]).then(([metadata, account, config]) => {
            if (controller.signal.aborted) return;
            setInfo(metadata); setUser(account); setToken(config.data.mapboxAccessToken);
        }).catch(failure => { if (!controller.signal.aborted) setError(message(failure)); });
        const accessChanged = (event: Event) => {
            if (!affectsDomain(event, domainId)) return;
            controller.abort();
            for (const value of Array.from(pendingRequests.values())) value.controller.abort();
            cache.clear();
            setInfo(undefined); setUser(undefined); setBookmarks([]); setPlaying(false);
            setError('Replay access changed. Return to Home or sign in again.');
        };
        window.addEventListener(accessEvent, accessChanged);
        return () => {
            ++intent.current;
            window.removeEventListener(accessEvent, accessChanged);
            controller.abort();
            for (const value of Array.from(pendingRequests.values())) value.controller.abort();
            pendingRequests.clear();
            cache.clear();
        };
    }, [api, cache, domainId, showBookmarks]);

    const loadWindow = useCallback((time: number, metadata: ReplayInfo, prefetch = false) => {
        const cached = cache.at(time);
        if (cached) return Promise.resolve(cached);
        const first = metadata.first!, last = metadata.last!;
        const lower = first + Math.floor((time - first) / replayWindowMs) * replayWindowMs;
        const upper = Math.min(last + 1, lower + replayWindowMs);
        const existing = requests.current.get(lower);
        if (existing) return existing.promise;
        if (!prefetch) {
            for (const [key, value] of Array.from(requests.current)) {
                value.controller.abort();
                requests.current.delete(key);
            }
        }
        const controller = new AbortController();
        const promise = api.window(lower, upper, controller.signal, status => {
            if (!prefetch && !controller.signal.aborted) setProgress(status);
        }).then(data => {
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            cache.add(data, time); setCacheVersion(version => version + 1);
            return data;
        }).finally(() => {
            if (requests.current.get(lower)?.controller === controller) requests.current.delete(lower);
        });
        requests.current.set(lower, { controller, promise });
        return promise;
    }, [api, cache]);

    const setSharedRange = useCallback((next: TimeRange) => {
        setRange(next); setFrom(dateInput(next[0])); setUntil(dateInput(next[1]));
    }, []);

    const seek = useCallback(async (time: number, metadata = info, shift = false) => {
        if (!metadata || metadata.first === null || metadata.last === null || !Number.isFinite(time)) return;
        const destination = clamp(Math.round(time), metadata.first, metadata.last);
        const sequence = ++intent.current;
        setPreview(undefined); setError(''); setProgress(undefined);
        if (!range || shift || destination < range[0] || destination > range[1]) {
            setSharedRange(rangeAround(destination, shift || !range ? suggested : range[1] - range[0], metadata.first, metadata.last));
        }
        if (cache.at(destination)) {
            if (pending !== undefined) {
                requests.current.forEach(value => value.controller.abort());
                requests.current.clear();
            }
            setPending(undefined); setAt(destination); return;
        }
        setPending(destination);
        try {
            await loadWindow(destination, metadata);
            if (sequence === intent.current) setAt(destination);
        } catch (failure) {
            if (sequence === intent.current && !lifetime.current.signal.aborted) { setError(message(failure)); setPlaying(false); }
        } finally {
            if (sequence === intent.current) { setPending(undefined); setProgress(undefined); }
        }
    }, [cache, info, loadWindow, pending, range, setSharedRange]);

    async function open(time: number | null, latest = false) {
        if (time === null || !info || !Number.isFinite(time)) return;
        setPlaying(false);
        try {
            const metadata = latest ? await api.info(lifetime.current.signal) : info;
            const destination = latest ? metadata.last : time;
            if (destination === null) return;
            if (latest) {
                setInfo(metadata);
                // Request catch-up to the newest bound, even if the window starts earlier.
                void api.prepare(destination, true, lifetime.current.signal).catch(failure => {
                    if (!lifetime.current.signal.aborted) setError(message(failure));
                });
            }
            await seek(destination, metadata, true);
        } catch (failure) { if (!lifetime.current.signal.aborted) setError(message(failure)); }
    }

    async function refresh() {
        const signal = lifetime.current.signal;
        try {
            const updated = await api.info(signal);
            requests.current.forEach(value => value.controller.abort());
            requests.current.clear();
            cache.clear();
            setCacheVersion(version => version + 1);
            setInfo(updated);
            if (at !== undefined) await seek(at, updated);
        } catch (failure) { if (!signal.aborted) setError(message(failure)); }
    }

    useEffect(() => {
        if (!playing || at === undefined || pending !== undefined || !range || !info) return;
        if (at >= range[1]) { setPlaying(false); return; }
        const timer = window.setTimeout(() => { void seek(Math.min(range[1], at + rate * 100)); }, 100);
        const currentWindow = cache.at(at);
        if (currentWindow && currentWindow.until <= range[1] && currentWindow.until - at <= rate * 3000 &&
            !cache.at(currentWindow.until) && !requests.current.size) {
            void loadWindow(currentWindow.until, info, true).catch(() => {});
        }
        return () => window.clearTimeout(timer);
    }, [playing, at, rate, pending, range, info, seek, cache, loadWindow]);

    const shownTime = preview !== undefined && cache.at(preview) ? preview : at;
    const state = useMemo(() => {
        const window = shownTime === undefined ? undefined : cache.at(shownTime);
        return window && shownTime !== undefined ? replayState(window, shownTime) : {};
    }, [cache, cacheVersion, shownTime]);
    const chartGroups = useMemo(() => {
        if (!range) return [];
        const windows = cache.inRange(range);
        return signals.map((signal, index) => [{ signal, samples: replaySeries(windows, range, signal), color: seriesColor(index) }]);
    }, [cache, cacheVersion, range, signals]);
    const addPlot = (node: number, channel: number, parameter: number) => {
        const matches = signalCatalogue(state).filter(item => item.node === node && item.channel === channel && item.parameter === parameter);
        setSignals(current => [...current, ...matches.filter(match => !current.some(item => item.id === match.id))].slice(0, seriesLimit));
    };
    function applyRange(event: FormEvent) {
        event.preventDefault();
        if (!info || info.first === null || info.last === null) return;
        const lower = Date.parse(from), upper = Date.parse(until);
        if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper || upper < info.first || lower > info.last) {
            setError('Choose a range within the retained history.'); return;
        }
        const next: TimeRange = [Math.max(info.first, lower), Math.min(info.last, upper)];
        setSharedRange(next);
        const target = clamp(at ?? next[0], next[0], next[1]);
        // A commit inside the new range should not shift it using the old render's bounds.
        setPlaying(false);
        if (target !== at) {
            const sequence = ++intent.current;
            setPending(target); setPreview(undefined);
            void loadWindow(target, info).then(() => {
                if (intent.current === sequence) setAt(target);
            }).catch(failure => {
                if (intent.current === sequence && !lifetime.current.signal.aborted) setError(message(failure));
            }).finally(() => { if (intent.current === sequence) { setPending(undefined); setProgress(undefined); } });
        }
    }
    async function saveBookmark(event: FormEvent) {
        event.preventDefault();
        const signal = lifetime.current.signal;
        setBusy(true); setError('');
        try {
            if (editing) await api.changeBookmark(editing.id, note, signal);
            else await api.saveBookmark(at, note, signal);
            setNote(''); setEditing(undefined);
            await showBookmarks(null, signal);
        } catch (failure) { if (!signal.aborted) setError(message(failure)); }
        finally { if (!signal.aborted) { setBusy(false); setProgress(undefined); } }
    }
    async function remove(bookmark: Bookmark) {
        try {
            await api.changeBookmark(bookmark.id, null, lifetime.current.signal);
            await showBookmarks(null, lifetime.current.signal);
        } catch (failure) { if (!lifetime.current.signal.aborted) setError(message(failure)); }
    }
    async function changeInterval(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!info) return;
        const interval = Number(new FormData(event.currentTarget).get('interval'));
        try {
            const updated = await api.setting(interval * 3600000, info.settingsRevision, lifetime.current.signal);
            setInfo({ ...info, ...updated });
        } catch (failure) { if (!lifetime.current.signal.aborted) setError(message(failure)); }
    }
    if (!info || !user) return <main>{error ? <Alert variant="danger">{error} <Link to="/private">Home</Link></Alert> : <p role="status">Opening Cloud Replay…</p>}</main>;
    const canEdit = info.domain.canEdit && info.domain.status === 'active';
    const selectedNode = selected === null ? undefined : state[selected];
    const viewedWindow = shownTime === undefined ? undefined : cache.at(shownTime);
    const outsideLoaded = preview !== undefined && !cache.at(preview);
    return <WorkspaceShell user={user} activeDomain={info.domain}>
        <section className="dw-replay" aria-label="Cloud Replay">
            <header className="dw-replay-toolbar">
                <h1>{info.domain.name} · Cloud Replay</h1>
                <Link to={`/private/domain/${encodeURIComponent(domainId)}`}>Cloud Live</Link>
                <Button variant="secondary" onClick={() => { setPlaying(false); void refresh(); }}>Refresh history</Button>
            </header>
            {error && <Alert variant="danger">{error}</Alert>}
            {info.first === null ? <p>No telemetry has been retained in this Domain.</p> : <p>Retained history {timestamp(info.first)} – {timestamp(info.last!)}</p>}
            <form className="dw-replay-toolbar" onSubmit={event => { event.preventDefault(); void open(Date.parse(start)); }}>
                <Form.Group><Form.Label htmlFor="replay-start">Replay time</Form.Label>
                    <Form.Control id="replay-start" type="datetime-local" step="1" required min={dateInput(info.first)} max={dateInput(info.last)} value={start} onChange={event => setStart(event.target.value)} />
                </Form.Group>
                <Button type="submit" disabled={info.first === null}>Open time</Button>
                <Button type="button" variant="secondary" disabled={info.last === null} onClick={() => void open(info.last, true)}>Latest activity</Button>
            </form>
            {progress && <p role="status">Preparing replay from retained telemetry. This can take time.{progress.preparedUntil === null ? '' : ' Prepared through ' + timestamp(progress.preparedUntil) + '.'}</p>}
            {!progress && pending !== undefined && <p role="status">Loading {timestamp(pending)}…</p>}
            {range && at !== undefined && <>
                <form className="dw-replay-toolbar" onSubmit={applyRange}>
                    <Form.Group><Form.Label htmlFor="replay-from">Range start</Form.Label><Form.Control id="replay-from" type="datetime-local" step="1" value={from} onChange={event => setFrom(event.target.value)} /></Form.Group>
                    <Form.Group><Form.Label htmlFor="replay-end">Range end</Form.Label><Form.Control id="replay-end" type="datetime-local" step="1" value={until} onChange={event => setUntil(event.target.value)} /></Form.Group>
                    <Button type="submit" variant="secondary">Apply range</Button>
                </form>
                <div className="dw-replay-toolbar" aria-label="Playback controls">
                    <Button onClick={() => setPlaying(value => !value)} disabled={pending !== undefined || (!playing && at >= range[1])}>{playing ? 'Pause' : 'Play'}</Button>
                    <label>Speed <select aria-label="Playback speed" value={rate} onChange={event => setRate(Number(event.target.value))}>
                        {[0.5, 1, 2, 5, 10, 60].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
                    </select></label>
                    {increments.map(([minutes, label]) => <Button key={minutes} variant="secondary" disabled={at === info.last} onClick={() => {
                        setPlaying(false); void seek(at + minutes * 60000);
                    }}>+{label}</Button>)}
                </div>
                <label className="dw-replay-playhead">Replay playhead · {timestamp(preview ?? pending ?? at)}
                    <input type="range" min={range[0]} max={range[1]} value={clamp(preview ?? pending ?? at, range[0], range[1])}
                        onChange={event => { setPlaying(false); setPreview(Number(event.target.value)); }}
                        onPointerUp={event => void seek(Number(event.currentTarget.value))}
                        onKeyUp={event => { if (preview !== undefined) void seek(preview); }}
                        onBlur={() => { if (preview !== undefined) void seek(preview); }} />
                </label>
                {outsideLoaded && <p>Release the playhead to load that time.</p>}
                {viewedWindow && !viewedWindow.samples.length && <p>No telemetry was recorded in this window. Showing the last recorded state.</p>}
                <SignalPlotContext.Provider value={addPlot}>
                    <ObservationNamesContext.Provider value={state}>
                        <div className="dw-replay-views">
                            <ObservedMap token={token} user={user} state={state} historicalTime={shownTime} selectedNodeId={selected} onNodeSelect={setSelected} />
                            <section aria-label="Recorded channels">
                                <Form.Label htmlFor="replay-node">Recorded node</Form.Label>
                                <Form.Select id="replay-node" value={selected ?? ''} onChange={event => setSelected(event.target.value ? Number(event.target.value) : null)}>
                                    <option value="">Select node</option>
                                    {Object.values(state).map(node => <option key={node.id} value={node.id}>{node.name || `Node ${node.id}`}</option>)}
                                </Form.Select>
                                <InspectorSessionProvider nodes={state} inventoryComplete={false}>
                                    {selectedNode && <ChannelList node={selectedNode} historicalTime={shownTime} />}
                                </InspectorSessionProvider>
                            </section>
                        </div>
                        {signals.length > 0 && <section aria-label="Replay charts" onMouseLeave={() => setPreview(undefined)}>
                            <p>Charts use the loaded portions of this replay range.</p>
                            <div className="dw-replay-toolbar">
                                {signals.map(signal => <Button key={signal.id} variant="secondary" size="sm" onClick={() => setSignals(current => current.filter(item => item.id !== signal.id))}>Remove {signal.name}</Button>)}
                            </div>
                            <ChartTimeline range={range} showDates cursor={preview ?? at} groups={chartGroups}
                                onCursor={setPreview} onPin={time => { setPlaying(false); void seek(time); }} />
                        </section>}
                    </ObservationNamesContext.Provider>
                </SignalPlotContext.Provider>
            </>}
            <section aria-label="Replay bookmarks">
                <h2>Bookmarks</h2>
                {bookmarks.length === 0 && <p>No bookmarks saved.</p>}
                {bookmarks.map(bookmark => <div className="dw-replay-toolbar" key={bookmark.id}>
                    <Button variant="link" onClick={() => void open(bookmark.at)}>{bookmark.note} · {timestamp(bookmark.at)}</Button>
                    {canEdit && bookmark.authorId === info.userId && <Button variant="secondary" onClick={() => { setEditing(bookmark); setNote(bookmark.note); }}>Edit</Button>}
                    {canEdit && (bookmark.authorId === info.userId || info.admin || info.domain.myRole === 'owner') &&
                        <Button variant="secondary" onClick={() => { if (window.confirm('Remove this bookmark?')) void remove(bookmark); }}>Remove</Button>}
                </div>)}
                {bookmarkCursor && <Button variant="secondary" onClick={() => void showBookmarks(bookmarkCursor, lifetime.current.signal).catch(failure => setError(message(failure)))}>More bookmarks</Button>}
                {canEdit && info.first !== null && <form className="dw-replay-toolbar" onSubmit={event => void saveBookmark(event)}>
                    <Form.Group><Form.Label htmlFor="replay-note">Bookmark note</Form.Label>
                        <Form.Control id="replay-note" value={note} maxLength={1024} onChange={event => setNote(event.target.value)} required />
                    </Form.Group>
                    <Button type="submit" disabled={busy || pending !== undefined}>{editing ? 'Save note' : at === undefined ? 'Bookmark latest activity' : 'Bookmark playhead'}</Button>
                    {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(undefined); setNote(''); }}>Cancel</Button>}
                </form>}
            </section>
            {canEdit && <form className="dw-replay-toolbar" onSubmit={event => void changeInterval(event)}>
                <Form.Group><Form.Label htmlFor="replay-interval">Key frame interval (hours)</Form.Label>
                    <Form.Control key={info.settingsRevision} id="replay-interval" name="interval" type="number" step="1" min="1" max="720" defaultValue={info.intervalMs / 3600000} required />
                </Form.Group>
                <Button type="submit" variant="secondary">Save interval</Button>
            </form>}
        </section>
    </WorkspaceShell>;
}

export default function CloudReplay() {
    const { domainId } = useParams();
    return domainId ? <DomainReplay key={domainId} domainId={domainId} /> : null;
}
