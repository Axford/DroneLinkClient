import React, { Suspense, useEffect, useState } from 'react';
import type { Ace } from 'ace-builds';
import { Folder2Open, ThreeDots } from 'react-bootstrap-icons';
import { Dropdown } from 'react-bootstrap';
import IconButton from '../components/ui/IconButton';
import DangerAction from '../components/ui/DangerAction';
import SettingsDialog from '../components/ui/SettingsDialog';
import useNarrowLayout from '../components/ui/useNarrowLayout';
import { CloudFile, CloudFileEntry, cloudNodeFiles } from './cloudNodeFiles';
import { authenticatedFetchJson } from '../utils/api';
import ConfigurationOverview from './ConfigurationOverview';
import { inspectNodeConfiguration } from './nodeConfiguration';
import { Transport, transportLabel } from './useWorkbenchFeed';

const ConfigurationEditor = React.lazy(() => import('./ConfigurationEditor'));
const noDiagnostics: ReturnType<typeof inspectNodeConfiguration>['diagnostics'] = [];
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const timestampFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
    domainId?: string;
    readOnly?: boolean;
    connected?: { request: <T>(endpoint: string, options?: RequestInit, path?: string) => Promise<T> };
    activity: (busy: boolean, dirty: boolean) => void;
}

function editorText(text: string) { return text.replace(/\r\n/g, '\n'); }

export default function NodeFiles({ node, transport, available, uptimeMs, activity, domainId, readOnly = false, connected }: Props) {
    const codeEditor = React.useRef<Ace.Editor | null>(null);
    const narrow = useNarrowLayout();
    const explorerRef = React.useRef<HTMLElement>(null);
    const [compactPanel, setCompactPanel] = useState(false);
    const compact = narrow || compactPanel;
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined' || !explorerRef.current) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0) setCompactPanel(entry.contentRect.width < 560);
        });
        observer.observe(explorerRef.current);
        return () => observer.disconnect();
    }, []);
    const [picker, setPicker] = useState(false);
    const [view, setView] = useState<'logical' | 'code'>('logical');
    const [selectedModule, setSelectedModule] = useState<number>();
    const [lineToOpen, setLineToOpen] = useState<number>();
    const [source, setSource] = useState<'node' | 'cloud'>('node');
    const [cloudEntries, setCloudEntries] = useState<CloudFileEntry[]>();
    const [cloudFile, setCloudFile] = useState<CloudFile>();
    const [cloudDraft, setCloudDraft] = useState('');
    const cloudDirty = !!cloudFile && cloudDraft !== editorText(cloudFile.text);
    const cloud = domainId ? cloudNodeFiles(domainId, node) : undefined;
    const editorRef = React.useRef<HTMLTextAreaElement>(null);
    const [directory, setDirectory] = useState<Directory>();
    const [stored, setStored] = useState<StoredFile>();
    const [draft, setDraft] = useState('');
    const [versionText, setVersionText] = useState<string>();
    const [versions, setVersions] = useState<BackupVersion[]>();
    const [backupStatus, setBackupStatus] = useState<BackupStatus>();
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
    const uploadText = (versionText ?? stored?.text)?.includes('\r\n') ? draft.replace(/\n/g, '\r\n') : draft;
    const dirty = !!stored && uploadText !== stored.text;
    useEffect(() => { if (!compact) setPicker(false); }, [compact]);
    const path = directory?.path ?? '/';
    const remote = connected?.request;
    const remoteRef = React.useRef(remote);
    remoteRef.current = remote;
    const backupHistory = connected && domainId && stored?.editable
        ? `/api/domains/${encodeURIComponent(domainId)}/nodes/${node}/file-backups` : undefined;
    const canAct = !readOnly && available && !!transport && !busy && (!domainId || !!connected);
    const showingCloud = readOnly || source === 'cloud';
    const current = showingCloud ? cloudFile : stored;
    const currentDraft = showingCloud ? cloudDraft : draft;
    const setCurrentDraft = showingCloud ? setCloudDraft : setDraft;
    const configuration = current?.path === '/config.ini';
    const highlighted = /\.ini$/i.test(current?.path ?? '');
    const editable = !readOnly && (showingCloud ? !!cloudFile : !!stored?.editable);
    const cloudText = cloudFile?.text.includes('\r\n') ? cloudDraft.replace(/\n/g, '\r\n') : cloudDraft;
    const draftText = showingCloud ? cloudText : uploadText;
    const overview = React.useMemo(() => configuration ? inspectNodeConfiguration(draftText, node) : undefined,
        [configuration, draftText, node]);
    const diagnostics = overview?.diagnostics ?? noDiagnostics;
    const configurationError = diagnostics.some(item => item.severity === 'error');

    useEffect(() => {
        setView('logical');
        setSelectedModule(undefined);
        setLineToOpen(undefined);
    }, [node, source, current?.path]);

    const goToLine = React.useCallback((line: number) => {
        const code = codeEditor.current;
        if (code) {
            code.gotoLine(line, 0, false);
            code.selection.selectLine();
            code.focus();
            return;
        }
        const editor = editorRef.current;
        if (!editor) return;
        const lines = editor.value.split('\n');
        const start = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
        editor.focus();
        editor.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
        // Move the textarea viewport as well as its selection, including for keyboard users.
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
        editor.scrollTop = (line - 1) * lineHeight;
        editor.scrollLeft = 0;
    }, []);

    function openCodeAtLine(line: number) {
        setView('code');
        setLineToOpen(line);
    }

    // The editor stays mounted when switching views to preserve its cursor and scroll.
    useEffect(() => {
        if (view !== 'code' || lineToOpen === undefined) return;
        const frame = requestAnimationFrame(() => {
            goToLine(lineToOpen);
            setLineToOpen(undefined);
        });
        return () => cancelAnimationFrame(frame);
    }, [view, lineToOpen, goToLine]);

    useEffect(() => { activity(busy, dirty || cloudDirty); return () => activity(false, false); }, [activity, busy, dirty, cloudDirty]);
    useEffect(() => {
        if (!dirty && !cloudDirty && !busy) return;
        const keepDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', keepDraft);
        return () => window.removeEventListener('beforeunload', keepDraft);
    }, [busy, dirty, cloudDirty]);

    useEffect(() => {
        if (!available || !domainId || !remoteRef.current) return;
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

    async function run(operation: () => Promise<void>, allowed = canAct) {
        if (!allowed || busy) return;
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
            setPicker(false);
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
        if (!canAct) return;
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
        void run(async () => setVersions((await authenticatedFetchJson(`${backupHistory}?${path}`)).data), true);
    }

    function restore(version: BackupVersion) {
        if (!backupHistory || !stored || (dirty && !window.confirm('Replace the unsaved draft with this backup?'))) return;
        const path = new URLSearchParams({ path: stored.path });
        void run(async () => {
            const { data } = await authenticatedFetchJson(`${backupHistory}/${encodeURIComponent(version.id)}?${path}`);
            setVersionText(data.text);
            setDraft(editorText(data.text));
            setFeedback({ text: 'Backup loaded into the editor. Upload to write it to the node.' });
        }, true);
    }

    useEffect(() => {
        if (!readOnly || !domainId) return;
        let active = true;
        setBusy(true);
        void cloudNodeFiles(domainId, node).list().then(entries => {
            if (active) setCloudEntries(entries);
        }).catch(error => {
            if (active) setFeedback({ text: error instanceof Error ? error.message : 'Could not load Cloud files.', error: true });
        }).finally(() => { if (active) setBusy(false); });
        return () => { active = false; };
    }, [domainId, node, readOnly]);

    function chooseSource(next: 'node' | 'cloud') {
        setSource(next);
        setFeedback(undefined);
        if (next === 'cloud' && !cloudEntries) refreshCloud();
    }

    function refreshCloud() {
        if (cloud) void run(async () => setCloudEntries(await cloud.list()), true);
    }

    function openCloud(filePath: string) {
        if (!cloud || (cloudDirty && !window.confirm('Discard the unsaved Cloud draft?'))) return;
        void run(async () => {
            const file = await cloud.open(filePath);
            setCloudFile(file);
            setCloudDraft(editorText(file.text));
            setPicker(false);
        }, true);
    }

    function rememberCloud(file: CloudFile) {
        setCloudFile(file);
        setCloudDraft(editorText(file.text));
        setCloudEntries(entries => [...(entries ?? []).filter(entry => entry.path !== file.path),
            { path: file.path, modifiedAt: file.modifiedAt }].sort((a, b) => a.path.localeCompare(b.path)));
    }

    function saveCloud() {
        if (readOnly || !cloud || !cloudFile || !cloudDirty) return;
        void run(async () => {
            rememberCloud(await cloud.save(cloudFile.path, cloudText, cloudFile.revision));
            setFeedback({ text: 'Saved to Cloud.' });
        }, true);
    }

    function copyToCloud() {
        if (readOnly || !cloud || !stored || !stored.editable) return;
        if (cloudDirty && !window.confirm('Discard the unsaved Cloud draft to open the copy?')) return;
        if (!window.confirm(`Copy the current text to Cloud as ${stored.path}?`)) return;
        void run(async () => {
            const entries = await cloud.list();
            const path = stored.path;
            const previous = entries.some(entry => entry.path === path) ? await cloud.open(path) : undefined;
            if (previous && !window.confirm(`Replace the Cloud file ${path}?`)) return;
            const copy = await cloud.save(path, uploadText, previous?.revision ?? null);
            setCloudEntries(entries);
            rememberCloud(copy);
            setSource('cloud');
            setFeedback({ text: 'Copied to Cloud.' });
        }, true);
    }

    function loadCloudDraft() {
        if (!cloudFile || !canAct) return;
        if (dirty && !window.confirm('Replace the unsaved node draft with this Cloud file?')) return;
        void run(async () => {
            const target = stored?.path === cloudFile.path ? stored : await request<StoredFile>('file', undefined, cloudFile.path);
            if (!target.editable) throw new Error('This node file is read-only.');
            if (target !== stored) {
                setStored(target);
                setVersions(undefined);
                setBackupStatus(undefined);
            }
            setVersionText(cloudText);
            setDraft(editorText(cloudText));
            setSource('node');
            setFeedback({ text: 'Cloud file loaded into the draft. Upload to write it to the node.' });
        });
    }

    const explorer = <aside aria-label="File explorer" className="dw-file-browser">
        {!readOnly && <div className="dw-file-sources" role="group" aria-label="File location">
            <button type="button" className="btn" aria-pressed={!showingCloud} disabled={busy} onClick={() => chooseSource('node')}>On-node</button>
            <button type="button" className="btn" aria-pressed={showingCloud} disabled={busy || !cloud} title={cloud ? undefined : 'Cloud files require a hosted Domain'} onClick={() => chooseSource('cloud')}>Cloud</button>
        </div>}
        {showingCloud ? <div className="dw-file-tree">
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={refreshCloud}>Refresh Cloud files</button>
            {cloudEntries?.length === 0 && <p className="dw-meta">No Cloud files.{!readOnly && ' Copy an on-node file to get started.'}</p>}
            <ul className="list-unstyled mb-0">{cloudEntries?.map(entry => <li key={entry.path}>
                <button type="button" className="btn dw-file-row" disabled={busy} aria-current={cloudFile?.path === entry.path ? 'true' : undefined}
                    onClick={() => openCloud(entry.path)} title={entry.path}>
                    <span>{entry.path}</span>
                    <time dateTime={entry.modifiedAt} title={timestampFormat.format(new Date(entry.modifiedAt))}>
                        {compact ? timestampFormat.format(new Date(entry.modifiedAt)) : dateFormat.format(new Date(entry.modifiedAt))}
                    </time>
                </button>
            </li>)}</ul>
        </div> : <div className="dw-file-tree">
            <div className="dw-toolbar">
                <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => browse(path)}>{directory ? 'Refresh files' : 'List files'}</button>
                <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => open('/config.ini')}>Open node configuration</button>
            </div>
            {directory && <>
                <p className="dw-meta mb-0">Stored directory <code>{path}</code></p>
                {path !== '/' && <button type="button" className="btn btn-outline-secondary" disabled={!canAct} onClick={() => browse(path.slice(0, path.lastIndexOf('/')) || '/')}>Parent directory</button>}
                {directory.entries.length === 0 && <p className="dw-meta">No files in this directory.</p>}
                <ul className="list-unstyled mb-0">
                    {directory.entries.map(entry => <li key={entry.path}>
                        <button type="button" className="btn dw-file-row" disabled={!canAct} aria-current={stored?.path === entry.path ? 'true' : undefined}
                            onClick={() => entry.directory ? browse(entry.path) : open(entry.path)}>
                            <span>{entry.path.slice(entry.path.lastIndexOf('/') + 1)}{entry.directory ? '/' : ''}</span>
                            {!entry.directory && <span className="dw-meta">{entry.bytes} bytes</span>}
                        </button>
                    </li>)}
                </ul>
                {directory.truncated && <p className="dw-meta">Showing the first 64 entries.</p>}
            </>}
        </div>}
        {picker && feedback?.error && <p role="alert" className="dw-file-tree">{feedback.text}</p>}
    </aside>;
    const editorLabel = `${showingCloud ? 'Cloud file' : 'Stored file'} ${current?.path ?? ''}`;
    const plainEditor = <textarea ref={editorRef} wrap={highlighted ? 'off' : undefined} aria-label={editorLabel}
        aria-invalid={configurationError || undefined} className="form-control font-monospace" rows={12} spellCheck={false}
        value={currentDraft} readOnly={!editable || busy} onChange={event => setCurrentDraft(event.target.value)} />;

    return <section ref={explorerRef} data-compact={compact} className="dw-workbench-files dw-file-explorer" aria-label={`Node ${node} files`}>
        {!compact && explorer}
        {compact && <SettingsDialog compact title="Files" show={picker} onHide={() => setPicker(false)}>{explorer}</SettingsDialog>}
        <div className="dw-file-workspace">
            <header className="dw-toolbar dw-file-header">
                {compact && <IconButton label="Browse files" icon={<Folder2Open />} aria-haspopup="dialog" onClick={() => setPicker(true)} />}
                <span className="dw-meta">Node {node}{transport ? ` · ${transportLabel[transport]}` : ''}</span>
                {current && <strong><code>{current.path}</code></strong>}
                {(showingCloud ? cloudDirty : dirty) && <span className="dw-meta">Unsaved draft</span>}
                <div className="dw-toolbar dw-file-actions">
                    {readOnly ? null : showingCloud ? <>
                        <button type="button" className="btn btn-outline-secondary" disabled={!canAct || !cloudFile} onClick={loadCloudDraft}>Load into node draft…</button>
                        <button type="button" className="btn btn-primary" disabled={!cloudDirty || busy} onClick={saveCloud}>Save to Cloud</button>
                    </> : <>
                        {cloud && stored?.editable && <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={copyToCloud}>Copy to Cloud…</button>}
                        {stored && <button type="button" className="btn btn-primary" disabled={!canAct || !dirty || !stored.editable || configurationError} onClick={upload}>Upload to node</button>}
                        <Dropdown align="end">
                            <Dropdown.Toggle as="button" type="button" className="btn dw-icon-button dw-file-more" aria-label="Node actions" title="Node actions"><ThreeDots /></Dropdown.Toggle>
                            <Dropdown.Menu>
                                {stored && <Dropdown.Item as="button" disabled={!canAct} onClick={() => open(stored.path)}>Reopen from node</Dropdown.Item>}
                                <DangerAction compact label="Restart node" warning="Restart interrupts this node.">
                                    <Dropdown.Item as="button" className="text-danger" disabled={!canAct} onClick={restart}>Restart node</Dropdown.Item>
                                </DangerAction>
                            </Dropdown.Menu>
                        </Dropdown>
                    </>}
                </div>
            </header>
            {readOnly && <p className="dw-meta">Archived Domain · Cloud files are read-only.</p>}
            {uptimeMs !== undefined && !showingCloud && <p className="dw-meta">{available ? 'Runtime' : 'Last seen runtime'} · Uptime <output aria-label="Last reported runtime uptime">{Math.floor(uptimeMs / 1000)} s</output></p>}
            {!available && !showingCloud && <p className="dw-meta">The selected route is unavailable.</p>}
            {busy && <p role="status">Working…</p>}
            {connected && !showingCloud && <p role="status" className="dw-meta">
                {backupStatus?.pending ? `Cloud backup pending (${backupStatus.pending})${backupStatus.retrying ? ' · retrying' : ''}`
                    : stored?.backup === 'not-queued' || backupStatus?.unavailable ? 'Cloud backup could not be queued. Reopen the file to retry.'
                    : stored?.backup === 'pending' ? backupStatus ? 'Cloud backup saved' : 'Cloud backup pending'
                    : null}
            </p>}
            {feedback && !(picker && feedback.error) && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
            {current && <>
                {overview && <div className="dw-file-sources dw-config-views" role="group" aria-label="Configuration views">
                    <button type="button" className="btn btn-sm" aria-pressed={view === 'logical'} onClick={() => setView('logical')}>Logical</button>
                    <button type="button" className="btn btn-sm" aria-pressed={view === 'code'} onClick={() => setView('code')}>Code</button>
                </div>}
                <div hidden={!!overview && view !== 'code'}>
                {highlighted ? <Suspense fallback={plainEditor}><ConfigurationEditor key={`${source}:${current.path}`}
                    editorRef={codeEditor} label={editorLabel} text={currentDraft} onChange={setCurrentDraft}
                    readOnly={!editable || busy} diagnostics={diagnostics} /></Suspense> : plainEditor}
                </div>
                {configuration && <details className="dw-file-checks">
                    <summary>{configurationError ? readOnly ? 'Configuration errors found.' : 'Fix configuration errors before uploading.' :
                        diagnostics.length ? `${diagnostics.length} configuration warning(s).` : 'No structural issues found.'}</summary>
                    <p className="dw-meta">Checks cover file structure, interval and subscription addresses. Module settings and live bindings are unverified.</p>
                    <ul className="list-unstyled mb-0">{diagnostics.map(({ line, severity, message }, index) => <li key={index}>
                        <button type="button" className="btn btn-link text-start" onClick={() => openCodeAtLine(line)}>Line {line}: {severity} — {message}</button>
                    </li>)}</ul>
                </details>}
                {overview && view === 'logical' && <ConfigurationOverview key={`${source}:${current?.path}:${current?.revision}`} overview={overview} text={draftText}
                    editable={editable && !busy && !configurationError} onChange={text => setCurrentDraft(editorText(text))}
                    selectedChannel={selectedModule} onSelect={setSelectedModule}
                    goToLine={openCodeAtLine} />}
                {!showingCloud && <>
                    {backupHistory && <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={loadVersions}>Backup history</button>}
                    {!stored?.editable && <span className="dw-meta">The firmware reserves this file for upload recovery.</span>}
                    {versions && <ul className="list-unstyled" aria-label="Backup versions">
                        {!versions.length && <li>No saved versions.</li>}
                        {versions.map(version => <li key={version.id}>
                            <button type="button" className="btn btn-link" disabled={busy} onClick={() => restore(version)}>
                                Load backup · {new Date(version.savedAt).toLocaleString()}
                            </button>
                        </li>)}
                    </ul>}
                </>}
            </>}
        </div>
    </section>;
}
