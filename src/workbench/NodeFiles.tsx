import React, { useEffect, useState } from 'react';
import { authenticatedFetchJson } from '../utils/api';
import ConfigurationOverview from './ConfigurationOverview';
import { inspectNodeConfiguration } from './nodeConfiguration';
import { Transport, transportLabel } from './useWorkbenchFeed';

interface Entry { path: string; directory: boolean; bytes?: number }
interface Directory { path: string; entries: Entry[]; truncated: boolean }
interface StoredFile { path: string; text: string; revision: string; editable: boolean; backup?: 'pending' | 'not-queued' | 'excluded' }
interface BackupVersion { id: string; savedAt: string }
interface BackupStatus { pending: number; retrying?: boolean; unavailable?: boolean }
interface Props {
    node: number;
    transport?: Transport;
    available: boolean;
    uptimeMs?: number;
    connected?: { domainId: string; request: <T>(endpoint: string, options?: RequestInit, path?: string) => Promise<T> };
    activity: (busy: boolean, dirty: boolean) => void;
}

function editorText(text: string) { return text.replace(/\r\n/g, '\n'); }

export default function NodeFiles({ node, transport, available, uptimeMs, activity, connected }: Props) {
    const editorRef = React.useRef<HTMLTextAreaElement>(null);
    const [directory, setDirectory] = useState<Directory>();
    const [stored, setStored] = useState<StoredFile>();
    const [draft, setDraft] = useState('');
    const [versionText, setVersionText] = useState<string>();
    const [versions, setVersions] = useState<BackupVersion[]>();
    const [backupStatus, setBackupStatus] = useState<BackupStatus>();
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
    const dirty = !!stored && (draft !== editorText(stored.text) ||
        (versionText !== undefined && versionText !== stored.text));
    const path = directory?.path ?? '/';
    const remote = connected?.request;
    const remoteRef = React.useRef(remote);
    remoteRef.current = remote;
    const domainId = connected?.domainId;
    const backupHistory = domainId && stored?.editable
        ? `/api/domains/${encodeURIComponent(domainId)}/nodes/${node}/file-backups` : undefined;
    const canAct = available && !!transport && !busy;
    const configuration = stored?.path === '/config.ini';
    const uploadText = (versionText ?? stored?.text)?.includes('\r\n') ? draft.replace(/\n/g, '\r\n') : draft;
    const overview = React.useMemo(() => configuration ? inspectNodeConfiguration(uploadText, node) : undefined,
        [configuration, uploadText, node]);
    const diagnostics = overview?.diagnostics ?? [];
    const configurationError = diagnostics.some(item => item.severity === 'error');

    function goToLine(line: number) {
        const editor = editorRef.current;
        if (!editor) return;
        const lines = draft.split('\n');
        const start = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
        editor.focus();
        editor.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
        // Move the textarea viewport as well as its selection, including for keyboard users.
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
        editor.scrollTop = (line - 1) * lineHeight;
        editor.scrollLeft = 0;
    }

    useEffect(() => { activity(busy, dirty); return () => activity(false, false); }, [activity, busy, dirty]);
    useEffect(() => {
        if (!dirty && !busy) return;
        const keepDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', keepDraft);
        return () => window.removeEventListener('beforeunload', keepDraft);
    }, [busy, dirty]);

    useEffect(() => {
        if (!available || !domainId) return;
        let active = true;
        let pending = false;
        const refresh = async () => {
            if (pending) return;
            pending = true;
            try {
                const status = await remoteRef.current?.<BackupStatus>('backup-status');
                if (active) setBackupStatus(status);
            } catch { if (active) setBackupStatus(undefined); }
            finally { pending = false; }
        };
        void refresh();
        const timer = setInterval(refresh, 5000);
        return () => { active = false; clearInterval(timer); };
    }, [available, domainId, stored]);

    async function request<T>(endpoint: string, options?: RequestInit, selectedPath?: string): Promise<T> {
        if (remote) return remote<T>(endpoint, options, selectedPath);
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
            setBackupStatus(undefined);
            setStored(file);
            setVersionText(undefined);
            setVersions(undefined);
            setDraft(editorText(file.text));
        });
    }

    function upload() {
        if (!stored?.editable || !dirty || configurationError) return;
        void run(async () => {
            const file = await request<StoredFile>('file', { method: 'PUT', body: JSON.stringify({ path: stored.path, revision: stored.revision, text: uploadText }) });
            setBackupStatus(undefined);
            setStored(file);
            setVersionText(undefined);
            setVersions(undefined);
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

    function loadVersions() {
        if (!backupHistory || !stored) return;
        const path = new URLSearchParams({ path: stored.path });
        void run(async () => setVersions((await authenticatedFetchJson(`${backupHistory}?${path}`)).data));
    }

    function restore(version: BackupVersion) {
        if (!backupHistory || !stored || (dirty && !window.confirm('Replace the unsaved draft with this backup?'))) return;
        const path = new URLSearchParams({ path: stored.path });
        void run(async () => {
            const { data } = await authenticatedFetchJson(`${backupHistory}/${encodeURIComponent(version.id)}?${path}`);
            setVersionText(data.text);
            setDraft(editorText(data.text));
            setFeedback({ text: 'Backup loaded into the editor. Upload to write it to the node.' });
        });
    }

    return <section className="dw-workbench-files dw-panel" aria-label={`Node ${node} files`}>
        <header className="dw-toolbar">
            <h2>Node files</h2>
            {transport && <span className="dw-meta">Node {node} · {transportLabel[transport]}</span>}
            <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => browse(path)}>{directory ? 'Refresh files' : 'List files'}</button>
            <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => open('/config.ini')}>Open node configuration</button>
            <button type="button" className="btn btn-outline-danger" disabled={!canAct} onClick={restart}>Restart node</button>
        </header>
        {uptimeMs !== undefined && <p className="dw-meta">{available ? 'Runtime' : 'Last seen runtime'} · Uptime <output aria-label="Last reported runtime uptime">{Math.floor(uptimeMs / 1000)} s</output></p>}
        {!available && <p className="dw-meta">The selected route is unavailable. Any open draft is still here.</p>}
        {busy && <p role="status">Waiting for the node…</p>}
        {connected && <p role="status">
            {backupStatus?.pending ? `Cloud backup pending (${backupStatus.pending})${backupStatus.retrying ? ' · retrying' : ''}`
                : stored?.backup === 'not-queued' || backupStatus?.unavailable ? 'Cloud backup could not be queued. Reopen the file to retry.'
                : stored?.backup === 'pending' ? backupStatus ? 'Cloud backup saved' : 'Cloud backup pending'
                : 'Cloud backup captures files opened or verified on the node.'}
        </p>}
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
            <textarea ref={editorRef} wrap={configuration ? 'off' : undefined} aria-invalid={configurationError || undefined} aria-describedby={configuration ? `node-config-checks-${node}` : undefined} id={`node-file-${node}`} className="form-control font-monospace" rows={12} spellCheck={false}
                value={draft} readOnly={!stored.editable || busy} onChange={event => setDraft(event.target.value)} />
            {configuration && <section aria-label="Configuration checks">
                <p id={`node-config-checks-${node}`} className="dw-meta">Checks cover file structure, the shared interval setting and subscription addresses. Other module settings and live bindings are not verified against the node’s firmware.</p>
                <p role="status">{configurationError ? 'Fix configuration errors before uploading.' :
                    diagnostics.length ? `${diagnostics.length} configuration warning(s).` : 'No structural issues found.'}</p>
                {diagnostics.length > 0 && <ul className="list-unstyled">
                    {diagnostics.map(({ line, severity, message }, index) => <li key={index}>
                        <button type="button" className="btn btn-link text-start" onClick={() => goToLine(line)}>Line {line}: {severity} — {message}</button>
                    </li>)}
                </ul>}
            </section>}
            {overview && <ConfigurationOverview key={stored.revision} overview={overview} text={uploadText}
                editable={stored.editable && !busy} onChange={text => setDraft(editorText(text))} goToLine={goToLine} />}
            <div className="dw-toolbar dw-workbench-file-actions">
                <button type="button" className="btn btn-primary" disabled={!canAct || !dirty || !stored.editable || configurationError} onClick={upload}>Upload to node</button>
                <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => open(stored.path)}>Reopen from node</button>
                {backupHistory && <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={loadVersions}>Backup history</button>}
                {!stored.editable && <span className="dw-meta">The firmware reserves this file for upload recovery.</span>}
            </div>
            {versions && <ul className="list-unstyled" aria-label="Backup versions">
                {!versions.length && <li>No saved versions.</li>}
                {versions.map(version => <li key={version.id}>
                    <button type="button" className="btn btn-link" disabled={!canAct} onClick={() => restore(version)}>
                        Load backup · {new Date(version.savedAt).toLocaleString()}
                    </button>
                </li>)}
            </ul>}
        </div>}
    </section>;
}
