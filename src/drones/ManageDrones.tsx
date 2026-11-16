import React, { useEffect, useId, useRef, useState } from 'react';
import type { GlobalState } from '../dronelink/DroneLinkState';
import SettingsDialog from '../components/ui/SettingsDialog';
import SurfacePanel from '../components/ui/SurfacePanel';
import { ApiError, authenticatedFetchJson } from '../utils/api';
import { Composition, Drone, Grouping, GroupingChange, groupingRoot, nodeLabel } from './grouping';

type Draft = { mode: 'move' | 'master'; source: Drone; grouping: Grouping };

function Members({ members, master, nodes }: { members: number[]; master: number | null; nodes: GlobalState }) {
  return members.length ? <ul className="list-unstyled mb-0">
    {members.map(address => <li key={address}>{nodeLabel(nodes, address)}
      {address === master && <span className="badge text-bg-primary ms-2">Master</span>}
    </li>)}
  </ul> : <p className="dw-meta mb-0">Empty · identity retained in history</p>;
}

function MasterField({ title, members, master, setMaster, nodes }: {
  title: string; members: number[]; master: number | null; setMaster: (master: number | null) => void; nodes: GlobalState;
}) {
  const id = useId();
  return <div><label htmlFor={id}>{title}</label>
    <select id={id} required className="form-select" value={master ?? ''} onChange={event => setMaster(Number(event.target.value) || null)}>
      <option value="">Choose a master</option>
      {members.map(address => <option key={address} value={address}>{nodeLabel(nodes, address)}</option>)}
    </select>
  </div>;
}

function GroupEditor({ draft, nodes, root, busy, onSave, onCancel }: {
  draft: Draft; nodes: GlobalState; root: string; busy: boolean;
  onSave: (path: string, method: string, body: unknown) => void; onCancel: () => void;
}) {
  const { mode, source, grouping } = draft;
  const [moving, setMoving] = useState<number[]>([]);
  const [destination, setDestination] = useState('');
  const [sourceMaster, setSourceMaster] = useState<number | null>(source.masterAddress);
  const [targetMaster, setTargetMaster] = useState<number | null>(null);
  const [restoration, setRestoration] = useState<{ addresses: number[]; items?: Drone[]; error?: boolean }>();
  const [retryRestoration, setRetryRestoration] = useState(0);
  const remaining = source.memberAddresses.filter(address => !moving.includes(address));
  const former = restoration?.addresses === moving ? restoration.items : undefined;
  const candidate = former?.find(row => destination === 'restore:' + row.droneId);
  const target = grouping.drones.find(row => row.droneId === destination);
  const newSingleton = destination === 'new' && moving.length === 1 && remaining.length > 0;
  const targetMembers = [...(target?.memberAddresses ?? []), ...moving].sort((a, b) => a - b);
  const actualSourceMaster = sourceMaster !== null && remaining.includes(sourceMaster) ? sourceMaster : null;
  const actualTargetMaster = newSingleton ? moving[0] : targetMaster !== null && targetMembers.includes(targetMaster) ? targetMaster : null;
  const mayRestore = moving.length > 0 && remaining.length > 0;

  useEffect(() => {
    if (!mayRestore) return;
    const controller = new AbortController();
    const load = async () => {
      const candidates = new Map<string, Drone>();
      for (const address of moving) {
        let cursor: string | null = null;
        do {
          const result: { data: { items: Drone[] }; pagination: { nextCursor: string | null } } =
            await authenticatedFetchJson(root + '/drone-grouping/restorable?nodeAddress=' + address +
              (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal: controller.signal });
          for (const item of result.data.items) candidates.set(item.droneId, item);
          cursor = result.pagination.nextCursor;
        } while (cursor && !controller.signal.aborted);
      }
      if (!controller.signal.aborted) setRestoration({ addresses: moving, items: Array.from(candidates.values()) });
    };
    void load().catch(() => { if (!controller.signal.aborted) setRestoration({ addresses: moving, error: true }); });
    return () => controller.abort();
  }, [mayRestore, moving, root, retryRestoration]);

  const validMove = moving.length > 0 && (target || candidate || newSingleton) &&
    (!remaining.length || actualSourceMaster !== null) && actualTargetMaster !== null;
  const validMaster = actualSourceMaster !== null && actualSourceMaster !== source.masterAddress;
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === 'master' && validMaster) {
      onSave(root + '/drones/' + encodeURIComponent(source.droneId) + '/master', 'PUT',
        { expectedRevision: source.revision, masterAddress: actualSourceMaster });
    }
    if (mode !== 'move' || !validMove) return;
    const selected = target || candidate;
    onSave(root + '/drones/move-nodes', 'POST', {
      sourceDroneId: source.droneId, expectedSourceRevision: source.revision,
      sourceMasterAddress: actualSourceMaster, nodeAddresses: moving,
      destination: selected ? {
        kind: target ? 'existing' : 'restore', droneId: selected.droneId,
        expectedRevision: selected.revision, masterAddress: actualTargetMaster,
      } : { kind: 'new' },
    });
  }

  return <form onSubmit={save} className="d-grid gap-3">
    <h3 className="h6 mb-0">{mode === 'master' ? 'Change master' : 'Move nodes'} · {nodeLabel(nodes, source.masterAddress)}</h3>
    <fieldset disabled={busy} className="d-grid gap-3">
      {mode === 'master' ? <>
        <MasterField title="Master" members={remaining} master={actualSourceMaster} setMaster={setSourceMaster} nodes={nodes} />
        <SurfacePanel><h4 className="h6">Resulting Drone</h4><Members members={remaining} master={actualSourceMaster} nodes={nodes} /></SurfacePanel>
      </> : <>
        <fieldset>
          <legend className="h6">Nodes to move</legend>
          {source.memberAddresses.map(address => <label className="form-check" key={address}>
            <input className="form-check-input" type="checkbox" checked={moving.includes(address)} onChange={event => {
              const selected = event.target.checked ? [...moving, address] : moving.filter(node => node !== address);
              setMoving(selected);
              setDestination('');
              setTargetMaster(null);
              setSourceMaster(selected.includes(source.masterAddress) ? null : source.masterAddress);
            }} />
            <span className="form-check-label">{nodeLabel(nodes, address)}{address === source.masterAddress ? ' (current master)' : ''}</span>
          </label>)}
        </fieldset>
        {!!moving.length && <label>Destination Drone
          <select className="form-select" required value={destination} onChange={event => {
            const selected = event.target.value;
            const existing = grouping.drones.find(row => row.droneId === selected);
            setDestination(selected);
            setTargetMaster(existing?.masterAddress ?? (moving.length === 1 ? moving[0] : null));
          }}>
            <option value="">Choose a destination</option>
            {grouping.drones.filter(row => row.droneId !== source.droneId).map(row =>
              <option key={row.droneId} value={row.droneId}>Join {nodeLabel(nodes, row.masterAddress)}</option>)}
            {moving.length === 1 && remaining.length > 0 && <option value="new">Create a new singleton</option>}
            {former?.map(row => <option key={row.droneId} value={'restore:' + row.droneId}>
              Restore {nodeLabel(nodes, row.masterAddress)} · {row.droneId}
            </option>)}
          </select>
        </label>}
        {mayRestore && restoration?.addresses !== moving && <span className="dw-meta" role="status">Checking restoration options…</span>}
        {restoration?.addresses === moving && restoration.error && <div role="alert">Restoration options are unavailable.{' '}
          <button type="button" className="btn btn-link p-0" onClick={() => { setRestoration(undefined); setRetryRestoration(value => value + 1); }}>Retry</button>
        </div>}
        {candidate && <SurfacePanel>
          <h4 className="h6">Previous composition of the Drone being restored</h4>
          <Members members={candidate.memberAddresses} master={candidate.masterAddress} nodes={nodes} />
        </SurfacePanel>}
        {destination && <div className="row g-3">
          <div className="col-12 col-sm-6"><SurfacePanel className="h-100">
            <h4 className="h6">Source after move</h4>
            <Members members={remaining} master={actualSourceMaster} nodes={nodes} />
            {!!remaining.length && <div className="mt-2"><MasterField title="Source master" members={remaining} master={actualSourceMaster} setMaster={setSourceMaster} nodes={nodes} /></div>}
          </SurfacePanel></div>
          <div className="col-12 col-sm-6"><SurfacePanel className="h-100">
            <h4 className="h6">Destination after move</h4>
            <Members members={targetMembers} master={actualTargetMaster} nodes={nodes} />
            {!newSingleton && <div className="mt-2"><MasterField title="Destination master" members={targetMembers} master={actualTargetMaster} setMaster={setTargetMaster} nodes={nodes} /></div>}
          </SurfacePanel></div>
        </div>}
      </>}
    </fieldset>
    <div className="d-flex justify-content-end gap-2">
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={busy || !(mode === 'move' ? validMove : validMaster)}>
        {busy ? 'Saving…' : mode === 'master' ? 'Save master' : candidate ? 'Move and restore' : 'Move nodes'}
      </button>
    </div>
  </form>;
}

function GroupingHistory({ root }: { root: string }) {
  const [items, setItems] = useState<GroupingChange[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [before, setBefore] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const suffix = before ? '?beforeSequence=' + before : '';
    void authenticatedFetchJson(root + '/drone-grouping/changes' + suffix, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(previous => before ? [...previous, ...result.data.items] : result.data.items);
        setNext(result.pagination.nextBeforeSequence);
        setStatus('ready');
      }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [root, before, retry]);
  const historicalMembers = (row: Composition) => row.memberAddresses.map(address => `Node ${address}${address === row.masterAddress ? ' (master)' : ''}`).join(', ') || 'Empty';
  return <div className="d-grid gap-2">
    {items.map(change => <SurfacePanel key={change.sequence}>
      <p className="dw-meta mb-2">Change {change.sequence} · {new Date(change.committedAt).toLocaleString()}</p>
      {change.after.map(row => {
        const previous = change.before.find(item => item.droneId === row.droneId);
        return <div key={row.droneId} className="mb-2">
          <strong className="text-break">Drone {row.droneId}</strong>
          <div>Before: {previous ? historicalMembers(previous) : 'New identity'}</div>
          <div>After: {historicalMembers(row)}</div>
        </div>;
      })}
    </SurfacePanel>)}
    {status === 'loading' && <p role="status">Loading grouping history…</p>}
    {status === 'error' && <p role="alert">Grouping history is unavailable.{' '}
      <button type="button" className="btn btn-link p-0" onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>Retry</button>
    </p>}
    {status === 'ready' && !items.length && <p>No grouping changes yet.</p>}
    {status === 'ready' && next !== null && <div><button type="button" className="btn btn-secondary" onClick={() => { setStatus('loading'); setBefore(next); }}>Older changes</button></div>}
  </div>;
}

export default function ManageDrones({ domainId, canEdit, grouping, error, nodes, refresh, refreshAccess, onClose }: {
  domainId: string; canEdit: boolean; grouping?: Grouping; error?: string; nodes: GlobalState;
  refresh: () => Promise<Grouping | undefined>; refreshAccess: () => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>();
  const [history, setHistory] = useState(false);
  const [notice, setNotice] = useState<{ message: string; warning?: boolean }>();
  const [busy, setBusy] = useState(false);
  const mutation = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => {
    const pending = mutation.current;
    mutation.current = undefined;
    pending?.abort();
  }, []);
  const root = groupingRoot(domainId);
  const title = canEdit ? 'Manage Drones' : 'Drones';
  async function save(path: string, method: string, body: unknown) {
    if (!canEdit || mutation.current) return;
    const controller = new AbortController();
    mutation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setNotice(undefined);
    try {
      await authenticatedFetchJson(path, { method, body: JSON.stringify(body), notifyForbidden: false, signal: controller.signal });
      if (mutation.current !== controller) return;
      setDraft(undefined);
      setNotice({ message: 'Drone grouping saved.' });
      await refresh();
    } catch (err) {
      if (mutation.current !== controller) return;
      setDraft(undefined);
      if (err instanceof ApiError && err.code === 'conflict') {
        setNotice({ message: 'The grouping changed while you were editing. Review the refreshed groups before trying again.', warning: true });
      } else {
        setNotice({ message: err instanceof ApiError ? err.message : 'The save could not be confirmed. Review the refreshed groups before trying again.', warning: true });
      }
      await refresh();
      if (err instanceof ApiError && (err.status === 403 || err.code === 'domain-archived')) await refreshAccess().catch(() => {});
    } finally {
      clearTimeout(timeout);
      if (mutation.current === controller) { mutation.current = undefined; setBusy(false); }
    }
  }

  return <SettingsDialog title={title} show onHide={() => { if (!busy) onClose(); }}>
    {notice && <p className={notice.warning ? 'alert alert-warning mb-0' : 'alert alert-success mb-0'} role={notice.warning ? 'alert' : 'status'}>{notice.message}</p>}
    {error && <p role="alert" className="alert alert-warning mb-0">{error}{' '}
      <button type="button" className="btn btn-link p-0" onClick={() => void refresh()}>Refresh groups</button>
    </p>}
    {draft && canEdit ? <GroupEditor draft={draft} nodes={nodes} root={root} busy={busy} onSave={save} onCancel={() => setDraft(undefined)} />
      : <>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="h6 mb-0">{history ? 'Grouping history' : 'Current composition'}</h3>
          <button type="button" className="btn btn-secondary" onClick={() => { setHistory(value => !value); setNotice(undefined); }}>
            {history ? 'Current groups' : 'Grouping history'}
          </button>
        </div>
        {history ? <GroupingHistory root={root} /> : <>
          {!grouping && !error && <p role="status">Loading Drone groups…</p>}
          {grouping && !grouping.drones.length && <p>No Drones have been discovered.</p>}
          {grouping?.drones.map(drone => <SurfacePanel key={drone.droneId}>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <h4 className="h6 mb-2">{nodeLabel(nodes, drone.masterAddress)}</h4>
              {canEdit && !error && <div className="d-flex flex-wrap gap-2">
                {drone.memberAddresses.length > 1 && <button type="button" className="btn btn-secondary" disabled={busy}
                  onClick={() => { setNotice(undefined); setDraft({ mode: 'master', source: drone, grouping }); }}>Change master</button>}
                {(grouping.drones.length > 1 || drone.memberAddresses.length > 1) && <button type="button" className="btn btn-secondary" disabled={busy}
                  onClick={() => { setNotice(undefined); setDraft({ mode: 'move', source: drone, grouping }); }}>Move nodes</button>}
              </div>}
            </div>
            <Members members={drone.memberAddresses} master={drone.masterAddress} nodes={nodes} />
            <details className="dw-meta text-break mt-2"><summary>Drone identity</summary>{drone.droneId}</details>
          </SurfacePanel>)}
        </>}
      </>}
  </SettingsDialog>;
}
