import { DroneLinkState } from './DroneLinkState';
const at = '2026-11-07T12:00:00.000Z';
const node = (generation = 0, revision = 1) => ({ nodeAddress: 7, generation, revision, lastReceivedAt: at, resetAt: null, droneId: 'drone-seven' });
const channel = (generation = 0, revision = 1, payload = 'Cg==') => ({ nodeAddress: 7, generation, revision, channel: 1, lastReceivedAt: at, params: { '1': { value: { payload, msgType: 0, writable: false, lastReceivedAt: at, valueLastChangedAt: at, origin: { kind: 'http', forwarderAddress: 254, sourceAddress: 7 } } } } });
const response = (data: unknown, nextCursor: string | null = null, status = 200) => ({ ok: status < 400, status, json: async () => ({ success: status < 400, data, pagination: { nextCursor } }) });
const snapshot = (nodes = [node()], channels: any[] = [channel()], next: string | null = null) => response({ schemaVersion: 1, activationEpoch: 'm1-c-1', nodes, channels, startCursor: 'start', catchUpCursor: next ? null : 'caught-up' }, next);
const updates = (events: unknown[] = []) => response({ events, cursor: 'caught-up', caughtUp: true });
let state: DroneLinkState;
beforeEach(() => { jest.useFakeTimers(); state = new DroneLinkState(); });
afterEach(() => { state.destroy(); jest.useRealTimers(); jest.restoreAllMocks(); });
function fetcher(snapshotResult = snapshot(), catchUp = updates()) {
  return jest.fn().mockImplementation((url: string) => {
    if (url === '/api/session') return Promise.resolve(response({ csrfToken: 'csrf' }));
    if (url.endsWith('/observation-diagnostics')) return Promise.resolve(response({ snapshotWriteFailures: 3, countedThrough: at }));
    if (url.includes('/observations/updates?') && url.includes('through=')) return Promise.resolve(catchUp);
    if (url.endsWith('/observations')) return Promise.resolve(snapshotResult);
    return new Promise(() => {});
  });
}
test('loads shared snapshot plus catch-up without reducing history or fabricating freshness', async () => {
  const history = jest.spyOn(state, 'processHistoricalMessages'); global.fetch = fetcher();
  await state.loadHistory('fleet');
  expect(state.getParameterState(7, 1, 1)?.values).toEqual([10]);
  expect(state.getParameterState(7, 1, 1)?.lastHeard).toBe(Date.parse(at));
  expect(state.getParameterState(7, 1, 1)?.timestamp).toBe(Date.parse(at));
  expect(state.getNodeState(7)?.droneId).toBe('drone-seven');
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(state.snapshotWriteFailures).toBe(3); expect(history).not.toHaveBeenCalled();
  expect((fetch as jest.Mock).mock.calls.map(call => call[0]).some(url => /\/messages|\/stream/.test(url))).toBe(false);
});
test('scan rows and catch-up produce the same complete state as a fresh snapshot after reset', async () => {
  const initial = snapshot([node()], [channel()], 'second');
  const finalPage = snapshot([node(1, 3)], [channel(1, 4, 'FA==')]);
  global.fetch = fetcher(initial, updates([{ nodes: [node(1, 3)], channels: [] }, { nodes: [node(1, 4)], channels: [channel(1, 4, 'FA==')] }]));
  const implementation = (fetch as jest.Mock).getMockImplementation()!;
  (fetch as jest.Mock).mockImplementation((url: string, options: unknown) => url.includes('observations?cursor=second') ? Promise.resolve(finalPage) : implementation(url, options));
  await state.loadHistory('fleet', false); const reconciled = state.getState();
  const other = new DroneLinkState(); global.fetch = fetcher(snapshot([node(1, 4)], [channel(1, 4, 'FA==')]));
  try { await other.loadHistory('fleet', false); expect(reconciled).toEqual(other.getState()); } finally { other.destroy(); }
});
test('empty observations still start updates and stopping aborts the owned request', async () => {
  global.fetch = fetcher(snapshot([], [])); await state.loadHistory('fleet');
  const calls = (fetch as jest.Mock).mock.calls; const live = calls.find(call => call[0].includes('timeoutMs=25000'));
  expect(live).toBeDefined(); state.stopStreaming(); expect(live![1].signal.aborted).toBe(true);
});
test('late responses from a previous Domain cannot change the current view', async () => {
  let finish: (value: any) => void = () => {}; const normal = fetcher(snapshot([], []));
  global.fetch = jest.fn().mockImplementation((url: string, options: unknown) => url === '/api/domains/old/observations' ? new Promise(resolve => { finish = resolve; }) : normal(url, options));
  const old = state.loadHistory('old'); await state.loadHistory('current'); finish(snapshot()); await old;
  expect(state.getState()).toEqual({});
});
test('reset sends expected generation once, clears structure only on success and retains identity', async () => {
  global.fetch = fetcher(); await state.loadHistory('fleet'); const normal = (fetch as jest.Mock).getMockImplementation()!;
  (fetch as jest.Mock).mockImplementation((url: string, options: any) => url.endsWith('/nodes/7/reset') ? Promise.resolve(response({ nodeAddress: 7, generation: 1, revision: 2, resetAt: at })) : normal(url, options));
  await state.resetNodeObservations(7);
  expect(state.getNodeState(7)?.channels).toEqual({}); expect(state.getNodeState(7)?.droneId).toBe('drone-seven');
  const reset = (fetch as jest.Mock).mock.calls.find(call => call[0].endsWith('/nodes/7/reset'));
  expect(JSON.parse(reset![1].body)).toEqual({ expectedGeneration: 0 });
});
test('an expired live continuation replaces snapshots automatically without history replay', async () => {
  let expire: (value: unknown) => void = () => {}; const normal = fetcher();
  global.fetch = jest.fn().mockImplementation((url: string, options: unknown) => url.includes('timeoutMs=25000') ? new Promise(resolve => { expire = resolve; }) : normal(url, options));
  await state.loadHistory('fleet');
  expire({ ok: false, status: 410, json: async () => ({ code: 'snapshot-required' }) });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect((fetch as jest.Mock).mock.calls.filter(call => call[0].endsWith('/observations')).length).toBe(2);
  expect(state.getParameterState(7, 1, 1)?.timestamp).toBe(Date.parse(at));
});

test('passive diagnostics cannot hold up the first live update request', async () => {
  const normal = fetcher(); global.fetch = jest.fn().mockImplementation((url: string, options: any) => url.endsWith('/observation-diagnostics') ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) : normal(url, options));
  await state.loadObservations('fleet');
  expect((fetch as jest.Mock).mock.calls.some(call => call[0].includes('timeoutMs=25000'))).toBe(true);
  const diagnostic = (fetch as jest.Mock).mock.calls.find(call => call[0].endsWith('/observation-diagnostics'));
  jest.advanceTimersByTime(5000); expect(diagnostic![1].signal.aborted).toBe(true);
});
test('NAME-only structure preserves name source and receipt time without inventing a value receipt', async () => {
  const named: any = channel(); named.params = { '1': { name: { payload: 'bg==', lastReceivedAt: at, nameLastChangedAt: at, origin: { kind: 'gateway', forwarderAddress: 254, sourceAddress: 7 } } } };
  global.fetch = fetcher(snapshot([node()], [named])); await state.loadObservations('fleet', false);
  const parameter = state.getParameterState(7, 1, 1)!;
  expect(parameter.name).toBe('n'); expect(parameter.nameSource).toBe('Gateway 254');
  expect(parameter.nameLastHeard).toBe(Date.parse(at)); expect(parameter.lastHeard).toBeUndefined(); expect(parameter.values).toEqual([]);
});
test('a terminal response publishes stopped status to subscribers', async () => {
  let finish: (value: any) => void = () => {}; const normal = fetcher(); const status: string[] = [];
  state.on('state.changed', () => status.push(state.observationStatus));
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => url.includes('timeoutMs=25000') ? new Promise(resolve => { finish = resolve; }) : normal(url, options));
  await state.loadObservations('fleet'); finish({ ok: false, status: 404, json: async () => ({ code: 'not-found' }) });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(status[status.length - 1]).toBe('stopped');
});
test('transient failure during expired-continuation resync is retried without a second reset or history replay', async () => {
  let finish: (value: any) => void = () => {}; let snapshots = 0, live = 0; const normal = fetcher();
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.endsWith('/observations')) {
      snapshots++; if (snapshots === 2) return Promise.resolve({ ok: false, status: 503, json: async () => ({ code: 'unavailable' }) });
      return Promise.resolve(snapshot([node()], [channel(0, snapshots, snapshots >= 3 ? 'FA==' : 'Cg==')]));
    }
    if (url.includes('timeoutMs=25000')) { live++; if (live === 1) return new Promise(resolve => { finish = resolve; }); return new Promise(() => {}); }
    return normal(url, options);
  });
  await state.loadObservations('fleet'); finish({ ok: false, status: 410, json: async () => ({ code: 'snapshot-required' }) });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(snapshots).toBe(2); jest.advanceTimersByTime(5000);
  for (let i = 0; i < 50; i++) await Promise.resolve();
  expect(snapshots).toBe(3); expect(state.getParameterState(7, 1, 1)?.values).toEqual([20]); expect(state.observationStatus).toBe('ready');
});


test('failed catch-up with a valid cursor retries a complete fresh snapshot before publishing ready', async () => {
  let finish: (value: any) => void = () => {}; let snapshots = 0, catchUps = 0;
  const normal = fetcher();
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.endsWith('/observations')) { snapshots++; return Promise.resolve(snapshot([node()], [channel(0, snapshots, snapshots === 3 ? 'Hg==' : 'Cg==')])); }
    if (url.includes('through=')) { catchUps++; return Promise.resolve(catchUps === 2 ? { ok: false, status: 503, json: async () => ({ code: 'unavailable' }) } : updates()); }
    if (url.includes('timeoutMs=25000')) return new Promise(resolve => { finish = resolve; });
    return normal(url, options);
  });
  await state.loadObservations('fleet'); finish({ ok: false, status: 410, json: async () => ({ code: 'snapshot-required' }) });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(snapshots).toBe(2); expect(state.observationStatus).toBe('resynchronising');
  jest.advanceTimersByTime(5000); for (let i = 0; i < 50; i++) await Promise.resolve();
  expect(snapshots).toBe(3); expect(catchUps).toBe(3); expect(state.observationStatus).toBe('ready'); expect(state.getParameterState(7, 1, 1)?.values).toEqual([30]);
});
test('resynchronisation authorization failure stops all retries', async () => {
  let finish: (value: any) => void = () => {}; let snapshots = 0; const normal = fetcher();
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.endsWith('/observations')) { snapshots++; return Promise.resolve(snapshots === 1 ? snapshot() : { ok: false, status: 403, json: async () => ({ code: 'forbidden' }) }); }
    if (url.includes('timeoutMs=25000')) return new Promise(resolve => { finish = resolve; });
    return normal(url, options);
  });
  await state.loadObservations('fleet'); finish({ ok: false, status: 410, json: async () => ({ code: 'snapshot-required' }) });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(state.observationStatus).toBe('stopped'); jest.advanceTimersByTime(15000);
  for (let i = 0; i < 10; i++) await Promise.resolve(); expect(snapshots).toBe(2);
});


test('a transient live failure reports retrying with saved observations, then recovers without changing receipt time', async () => {
  const normal = fetcher(); let calls = 0;
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.includes('timeoutMs=25000')) {
      calls++;
      if (calls === 1) return Promise.reject(new Error('Offline'));
      if (calls === 2) return Promise.resolve(updates());
      return new Promise(() => {});
    }
    return normal(url, options);
  });
  await state.loadObservations('fleet');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(state.observationStatus).toBe('retrying');
  expect(state.getParameterState(7, 1, 1)?.lastHeard).toBe(Date.parse(at));
  jest.advanceTimersByTime(5000);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(state.observationStatus).toBe('ready');
  expect(state.getParameterState(7, 1, 1)?.lastHeard).toBe(Date.parse(at));
});


test('a live discovered node resolves its persistent Drone identity without replaying history', async () => {
  const normal = fetcher(snapshot([], [])); let calls = 0;
  const liveNode = { nodeAddress: 7, generation: 0, revision: 1, lastReceivedAt: at, resetAt: null };
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.endsWith('/identities')) return Promise.resolve(response({ nodes: [{ address: 7, droneId: 'drone-seven' }], drones: [] }));
    if (url.includes('timeoutMs=25000')) {
      if (++calls === 1) return Promise.resolve(updates([{ nodes: [liveNode], channels: [channel()] }]));
      return new Promise(() => {});
    }
    return normal(url, options);
  });
  await state.loadObservations('fleet');
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(state.getNodeState(7)?.droneId).toBe('drone-seven');
  expect(state.getParameterState(7, 1, 1)?.lastHeard).toBe(Date.parse(at));
  expect((fetch as jest.Mock).mock.calls.filter(([url]) => url.endsWith('/identities'))).toHaveLength(1);
});


test('a late identity lookup from the previous Domain cannot rename the current Drone', async () => {
  const normal = fetcher(); let finish: (value: any) => void = () => {}; let identityStarted = false;
  global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
    if (url.includes('/old/observations') && !url.includes('/updates')) {
      const row = { nodeAddress: 7, generation: 0, revision: 1, lastReceivedAt: at, resetAt: null };
      return Promise.resolve(response({ schemaVersion: 1, activationEpoch: 'm1-c-1', nodes: [row], channels: [], startCursor: 'start', catchUpCursor: 'caught-up' }));
    }
    if (url.endsWith('/old/identities')) { identityStarted = true; return new Promise(resolve => { finish = resolve; }); }
    return normal(url, options);
  });
  const oldLoad = state.loadObservations('old');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(identityStarted).toBe(true);
  await state.loadObservations('current', false);
  finish(response({ nodes: [{ address: 7, droneId: 'obsolete-drone' }], drones: [] })); await oldLoad;
  expect(state.getNodeState(7)?.droneId).toBe('drone-seven');
});
