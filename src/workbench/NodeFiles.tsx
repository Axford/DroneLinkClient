import React, { useEffect, useState } from 'react';
import { Transport, transportLabel } from './useWorkbenchFeed';

interface Entry { path: string; directory: boolean; bytes?: number }
interface Directory { path: string; entries: Entry[]; truncated: boolean }
interface StoredFile { path: string; text: string; revision: string; editable: boolean }
interface Props {
    node: number;
    transport?: Transport;
    available: boolean;
    uptimeMs?: number;
    activity: (busy: boolean, dirty: boolean) => void;
}

function editorText(text: string) { return text.replace(/\r\n/g, '\n'); }

export default function NodeFiles({ node, transport, available, uptimeMs, activity }: Props) {
    const [directory, setDirectory] = useState<Directory>();
    const [stored, setStored] = useState<StoredFile>();
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
    const dirty = !!stored && draft !== editorText(stored.text);
    const path = directory?.path ?? '/';
    const canAct = available && !!transport && !busy;

    useEffect(() => { activity(busy, dirty); return () => activity(false, false); }, [activity, busy, dirty]);
    useEffect(() => {
        if (!dirty && !busy) return;
        const keepDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', keepDraft);
        return () => window.removeEventListener('beforeunload', keepDraft);
    }, [busy, dirty]);

    async function request<T>(endpoint: string, options?: RequestInit, selectedPath?: string): Promise<T> {
        const query = new URLSearchParams({ transport: transport! });
        if (selectedPath !== undefined) query.set('path', selectedPath);
        const response = await fetch(`/api/workbench/v1/nodes/${node}/${endpoint}?${query}`, {
            ...options, cache: 'no-store', headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (response.status === 404 ? 'This gateway does not provide node file operations.' : 'The node request failed.'));
        return body as T;
    }

    async function run(operation: () => Promise<void>) {
        if (!canAct) return;
        setBusy(true);
        setFeedback(undefined);
        try { await operation(); }
        catch (error) { setFeedback({ text: error instanceof Error ? error.message : 'The node request failed.', error: true }); }
        finally { setBusy(false); }
    }

    function open(filePath: string) {
        if (dirty && !window.confirm('Discard the unsaved draft and open the stored file?')) return;
        void run(async () => {
            const file = await request<StoredFile>('file', undefined, filePath);
            setStored(file);
            setDraft(editorText(file.text));
        });
    }

    function upload() {
        if (!stored?.editable || !dirty) return;
        void run(async () => {
            const text = stored.text.includes('\r\n') ? draft.replace(/\n/g, '\r\n') : draft;
            const file = await request<StoredFile>('file', { method: 'PUT', body: JSON.stringify({ path: stored.path, revision: stored.revision, text }) });
            setStored(file);
            setDraft(editorText(file.text));
            setFeedback({ text: 'Stored file verified by readback. Running configuration changes require a separate Restart.' });
        });
    }

    function restart() {
        const draftNote = dirty ? ' Your unsaved draft will stay in the editor.' : '';
        if (!window.confirm(`Restart node ${node} using its stored configuration?${draftNote}`)) return;
        void run(async () => {
            await request('restart', { method: 'POST', body: '{}' });
            setFeedback({ text: 'Restart requested. Check Network for the node’s return.' });
        });
    }

    function browse(nextPath: string) {
        void run(async () => setDirectory(await request<Directory>('files', undefined, nextPath)));
    }

    return <section className="dw-workbench-files dw-panel" aria-label={`Node ${node} files`}>
        <header className="dw-toolbar">
            <h2>Node files</h2>
            {transport && <span className="dw-meta">Node {node} · {transportLabel[transport]}</span>}
            <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => browse(path)}>{directory ? 'Refresh files' : 'List files'}</button>
            <button type="button" className="btn btn-outline-danger" disabled={!canAct} onClick={restart}>Restart node</button>
        </header>
        {uptimeMs !== undefined && <p className="dw-meta">{available ? 'Runtime' : 'Last seen runtime'} · Uptime <output aria-label="Last reported runtime uptime">{Math.floor(uptimeMs / 1000)} s</output></p>}
        {!available && <p className="dw-meta">The selected route is unavailable. Any open draft is still here.</p>}
        {busy && <p role="status">Waiting for the node…</p>}
        {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
        {directory && <div className="dw-workbench-file-list">
            <p>Stored directory <code>{path}</code></p>
            {path !== '/' && <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => browse(path.slice(0, path.lastIndexOf('/')) || '/')}>Parent directory</button>}
            {directory.entries.length === 0 && <p>No files in this directory.</p>}
            <ul className="list-unstyled">
                {directory.entries.map(entry => <li key={entry.path}>
                    <button type="button" className="btn btn-link" disabled={!canAct} onClick={() => entry.directory ? browse(entry.path) : open(entry.path)}>
                        {entry.path.slice(entry.path.lastIndexOf('/') + 1)}{entry.directory ? '/' : ''}
                    </button>
                    {!entry.directory && <span className="dw-meta">{entry.bytes} bytes</span>}
                </li>)}
            </ul>
            {directory.truncated && <p>Showing the first 64 entries.</p>}
        </div>}
        {stored && <div>
            <label htmlFor={`node-file-${node}`}>Stored file <code>{stored.path}</code>{dirty && ' · Unsaved draft'}</label>
            <textarea id={`node-file-${node}`} className="form-control font-monospace" rows={12} spellCheck={false}
                value={draft} readOnly={!stored.editable || busy} onChange={event => setDraft(event.target.value)} />
            <div className="dw-toolbar dw-workbench-file-actions">
                <button type="button" className="btn btn-primary" disabled={!canAct || !dirty || !stored.editable} onClick={upload}>Upload to node</button>
                <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => open(stored.path)}>Reopen from node</button>
                {!stored.editable && <span className="dw-meta">The firmware reserves this file for upload recovery.</span>}
            </div>
        </div>}
    </section>;
}
