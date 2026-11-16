import React, { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import type { Domain, User } from '../App';
import WorkspaceShell from '../components/WorkspaceShell';
import PageFeedback from '../components/ui/PageFeedback';
import { ApiError, accessEvent, affectsDomain, authenticatedFetchJson } from '../utils/api';
import ModelEditor from './ModelEditor';
import { Revision, Snapshot, cloudModels } from './cloudModels';

function ModelLibrary({ domain, signal }: { domain: Domain; signal: AbortSignal }) {
  const [open, setOpen] = useState<{ snapshot?: Snapshot; historical?: boolean } | null>(null);
  const [models, setModels] = useState<Revision[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [history, setHistory] = useState<{ modelId: string; rows: Revision[]; next: string | null }>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const modelApi = cloudModels(domain._id, signal);
  const editable = domain.canEdit && domain.status === 'active';

  async function run(operation: () => Promise<void>) {
    setWorking(true); setError('');
    try { await operation(); }
    catch (issue) { if (!signal.aborted) setError(issue instanceof Error ? issue.message : 'Could not open Dreamer models.'); }
    finally { if (!signal.aborted) setWorking(false); }
  }

  function list(after?: string) {
    return run(async () => {
      const result = await modelApi.list(after);
      setModels(previous => after ? [...previous, ...result.data] : result.data);
      setNext(result.nextCursor);
    });
  }

  useEffect(() => {
    setWorking(true);
    void cloudModels(domain._id, signal).list().then(result => {
      if (signal.aborted) return;
      setModels(result.data); setNext(result.nextCursor); setWorking(false);
    }).catch(issue => {
      if (!signal.aborted) { setError(issue instanceof Error ? issue.message : 'Could not open Dreamer models.'); setWorking(false); }
    });
  }, [domain._id, signal]);

  function openRevision(row: Revision, head: Revision) {
    void run(async () => {
      const snapshot = await modelApi.open(row.modelId, row.revisionId);
      setOpen({ snapshot, historical: row.revisionId !== head.revisionId });
    });
  }

  function showHistory(modelId: string, after?: string) {
    void run(async () => {
      const result = await modelApi.history(modelId, after);
      setHistory(previous => ({
        modelId, rows: after && previous?.modelId === modelId ? [...previous.rows, ...result.data] : result.data,
        next: result.nextCursor,
      }));
    });
  }

  if (open) return <ModelEditor cloud={{
    domainId: domain._id, initial: open.snapshot, editable: editable && !open.historical,
    save: modelApi.save,
    back: () => { setOpen(null); setHistory(undefined); void list(); },
  }} />;

  return <section className="dw-panel dreamer-model-library">
    <header className="dw-toolbar">
      <h1>Dreamer models</h1>
      {editable && <Button onClick={() => setOpen({})} disabled={working}>New model</Button>}
    </header>
    <p className="dw-meta">{domain.name}{editable ? '' : ' · Read-only'}</p>
    {error && <p role="alert" className="dreamer-model-error">{error}</p>}
    {working && <p role="status">Loading…</p>}
    {!working && !error && models.length === 0 && <p>No saved models.</p>}
    <ul className="dreamer-library-list">
      {models.map(model => <li key={model.modelId}>
        <div className="dreamer-library-row">
          <span><strong>{model.name}</strong> <span className="dw-meta">Revision {model.number}</span></span>
          <div className="dw-toolbar">
            <Button variant="outline-secondary" disabled={working} onClick={() => openRevision(model, model)}>Open latest</Button>
            <Button variant="outline-secondary" disabled={working} aria-expanded={history?.modelId === model.modelId}
              onClick={() => history?.modelId === model.modelId ? setHistory(undefined) : showHistory(model.modelId)}>Revisions</Button>
          </div>
        </div>
        {history?.modelId === model.modelId && <ul className="dreamer-library-list dreamer-library-history">
          {history.rows.map(revision => <li className="dreamer-library-row" key={revision.revisionId}>
            <span>Revision {revision.number} <span className="dw-meta">{new Date(revision.savedAt).toLocaleString()}</span></span>
            <Button variant="outline-secondary" disabled={working} onClick={() => openRevision(revision, history.rows[0])}>Open revision {revision.number}</Button>
          </li>)}
          {history.next && <li><Button variant="outline-secondary" disabled={working} onClick={() => showHistory(model.modelId, history.next ?? undefined)}>More revisions</Button></li>}
        </ul>}
      </li>)}
    </ul>
    {next && <Button variant="outline-secondary" onClick={() => void list(next)} disabled={working}>More models</Button>}
    {error && <Button variant="outline-secondary" onClick={() => void list()} disabled={working}>Reload models</Button>}
    <Link to="/private">Domains</Link>
  </section>;
}

function DomainModels({ domainId }: { domainId: string }) {
  const [session, setSession] = useState<{ domain: Domain; user: User; signal: AbortSignal }>();
  const [error, setError] = useState('');
  useEffect(() => {
    const requests = new AbortController();
    let generation = 0;
    let loaded = false;
    async function refresh() {
      const current = ++generation;
      try {
        const options = { signal: requests.signal, notifyForbidden: false };
        const [entry, user] = await Promise.all([
          authenticatedFetchJson('/api/domains/' + encodeURIComponent(domainId), options),
          authenticatedFetchJson('/api/user', options),
        ]);
        if (requests.signal.aborted || current !== generation) return;
        loaded = true;
        setSession({ domain: entry.data, user, signal: requests.signal }); setError('');
      } catch (issue) {
        if (requests.signal.aborted || current !== generation) return;
        const denied = issue instanceof ApiError && [401, 403, 404].includes(issue.status);
        if (loaded && !denied) return;
        loaded = false;
        setSession(undefined); setError(issue instanceof Error ? issue.message : 'Dreamer Domain unavailable.');
      }
    }
    const changed = (event: Event) => {
      if (affectsDomain(event, domainId) && (event as CustomEvent).detail?.status !== 401) void refresh();
      if ((event as CustomEvent).detail?.status === 401) { generation++; loaded = false; setSession(undefined); setError('Sign in again to continue.'); }
    };
    const focus = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(focus, 15000);
    window.addEventListener(accessEvent, changed);
    window.addEventListener('focus', focus);
    return () => {
      requests.abort(); clearInterval(timer);
      window.removeEventListener(accessEvent, changed); window.removeEventListener('focus', focus);
    };
  }, [domainId]);
  if (error) return <PageFeedback message={error}><Link to="/private">Return to Domains</Link></PageFeedback>;
  if (!session) return <PageFeedback loading message="Opening Dreamer…" />;
  return <WorkspaceShell user={session.user} activeDomain={session.domain}>
    <ModelLibrary domain={session.domain} signal={session.signal} />
  </WorkspaceShell>;
}

export default function CloudDreamer() {
  const { domainId } = useParams();
  return domainId ? <DomainModels key={domainId} domainId={domainId} /> : null;
}
