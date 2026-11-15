import type { Domain } from '../App';
import { authenticatedFetchJson } from '../utils/api';
import type { ReplayFrame, ReplaySample, ReplayWindow } from './history';

export interface ReplayProgress { preparedUntil: number | null; requestedUntil: number | null }
export interface ReplayInfo extends ReplayProgress {
    first: number | null;
    last: number | null;
    userId: string;
    admin: boolean;
    domain: Domain;
    intervalMs: number;
    settingsRevision: number;
}
export interface Bookmark { id: string; at: number; authorId: string; note: string }
interface WindowPage { ready: boolean; frame: ReplayFrame | null; samples: ReplaySample[]; nextCursor: string | null }

const json = <T>(url: string, options?: RequestInit & { notifyForbidden?: boolean }): Promise<T> =>
    authenticatedFetchJson(url, options).then(result => result.data as T);

function pause(signal: AbortSignal, time = 1500) {
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, time);
        function abort() { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }
        signal.addEventListener('abort', abort, { once: true });
    });
}

export const replayUrl = (domainId: string) => `/api/domains/${encodeURIComponent(domainId)}/replay`;

export function createReplayApi(domainId: string) {
    const root = replayUrl(domainId);
    const post = <T>(path: string, body: unknown, signal: AbortSignal, method = 'POST') =>
        json<T>(root + path, { method, body: JSON.stringify(body), signal, notifyForbidden: false });
    const finish = async (at: number, signal: AbortSignal, progress?: (status: ReplayProgress) => void) => {
        let anchorRequested = false;
        while (true) {
            const status = await json<ReplayProgress & { ready?: boolean }>(root + '/progress?at=' + at, { signal });
            progress?.(status);
            if (status.ready) return;
            if (!anchorRequested && status.preparedUntil !== null && status.preparedUntil >= at) {
                const prepared = await post<{ ready: boolean }>('/prepare', { at }, signal);
                if (prepared.ready) return;
                anchorRequested = true;
            }
            await pause(signal);
        }
    };
    return {
        info: (signal: AbortSignal) => json<ReplayInfo>(root, { signal }),
        bookmarks: (cursor: string | null, signal: AbortSignal) => json<{ items: Bookmark[]; nextCursor: string | null }>(
            root + '/bookmarks' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { signal }),
        prepare: (at: number, follow: boolean, signal: AbortSignal) => post<ReplayProgress & { ready: boolean }>('/prepare', { at, follow }, signal),
        setting: (intervalMs: number, revision: number, signal: AbortSignal) => post<Pick<ReplayInfo, 'intervalMs' | 'settingsRevision'>>(
            '/settings', { intervalMs, revision }, signal, 'PUT'),
        saveBookmark: async (at: number | undefined, note: string, signal: AbortSignal) =>
            post<{ ready: boolean; bookmark: Bookmark }>('/bookmarks', { at, note }, signal),
        changeBookmark: (id: string, note: string | null, signal: AbortSignal) => post<Bookmark | null>(
            '/bookmarks/' + encodeURIComponent(id), note === null ? {} : { note }, signal, note === null ? 'DELETE' : 'PATCH'),
        async window(from: number, until: number, signal: AbortSignal, progress?: (status: ReplayProgress) => void): Promise<ReplayWindow> {
            const path = `${root}/window?from=${from}&until=${until}`;
            let page = await json<WindowPage>(path, { signal });
            while (!page.ready) {
                const status = await post<ReplayProgress & { ready: boolean }>('/prepare', { at: from }, signal);
                if (!status.ready) {
                    progress?.(status);
                    await finish(from, signal, progress);
                }
                page = await json<WindowPage>(path, { signal });
            }
            const frame = page.frame;
            if (!frame) throw new Error('The starting state is unavailable');
            let retainedBytes = 0;
            const samples: ReplaySample[] = [];
            while (true) {
                for (const sample of page.samples) {
                    retainedBytes += 192 + sample.payload.length * 2;
                    if (retainedBytes > 500_000_000) throw new Error('This telemetry window exceeds the Replay cache budget.');
                    samples.push(sample);
                }
                if (!page.nextCursor) return { from, until, frame, samples };
                page = await json<WindowPage>(path + '&cursor=' + encodeURIComponent(page.nextCursor), { signal });
            }
        }
    };
}
