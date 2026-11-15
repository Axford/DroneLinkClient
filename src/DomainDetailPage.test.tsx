import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import DomainDetailPage from './DomainDetailPage';
import mapboxgl from 'mapbox-gl';
jest.mock('react-resizable-panels', () => ({ Panel: ({ children }: any) => <div>{children}</div>, PanelGroup: ({ children }: any) => <div>{children}</div>, PanelResizeHandle: () => null }));
jest.mock('mapbox-gl', () => ({ Map: jest.fn(), NavigationControl: jest.fn() }));
jest.mock('./components/DomainCollaboration', () => () => <div>Collaboration</div>);
jest.mock('./components/InspectorPanel', () => {
  const { ParameterCommands } = jest.requireActual('./commands/CommandControls');
  const Inspector = jest.requireActual('./components/InspectorPanel').default;
  return (props: any) => jest.requireActual('./commands/session').useCommandScope()?.userId === 'lens-user'
    ? <Inspector {...props} /> : <div>Inspector{['demotion', 'archive', 'navigation', 'revocation'].includes(
    jest.requireActual('./commands/session').useCommandScope()?.userId
  ) && <ParameterCommands target={{ nodeAddress: 7, channel: 4, param: 8 }} />}</div>;
});
function Harness() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/private/domain/b')}>Switch domain</button><Routes><Route path="/private/domain/:domainId" element={<DomainDetailPage />} /></Routes></>;
}
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const sharedSnapshot = () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { schemaVersion: 1, activationEpoch: 'm1-c-1', nodes: [], channels: [], startCursor: 'start', catchUpCursor: 'final' }, pagination: { nextCursor: null } }) });
function observationReply(url: string): any {
  if (url.includes('/visualization-settings?')) return { ok: true, status: 200, json: async () => ({ data: { items: [] }, pagination: { nextCursor: null } }) };
  if (url.startsWith('/api/domains?')) return { ok: true, status: 200, json: async () => ({ data: [], pagination: { nextCursor: null } }) };
  if (url.endsWith('/observations')) return sharedSnapshot();
  if (url.includes('/observations/updates?')) return { ok: true, status: 200, json: async () => ({ success: true, data: { events: [], cursor: 'final', caughtUp: true }, pagination: { nextCursor: null } }) };
  if (url.endsWith('/observation-diagnostics')) return { ok: true, status: 200, json: async () => ({ success: true, data: { snapshotWriteFailures: 0, countedThrough: null } }) };
}

test('changing the selected domain aborts its old poll and loads the new shared observations', async () => {
  const streams: Array<{ domain: string; signal: AbortSignal }> = [];
  global.fetch = jest.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.includes('timeoutMs=25000')) {
      streams.push({ domain: url.includes('/a/') ? 'a' : 'b', signal: options!.signal as AbortSignal });
      return new Promise(() => {});
    }
    if (observationReply(url)) return observationReply(url);
    const value = url === '/api/user' ? { _id: 'owner', displayName: 'Owner' }
      : url === '/api/config' ? { success: true, data: { mapboxAccessToken: null } }
      : url.includes('/messages?') ? { success: true, data: [], cursor: url.includes('/a/') ? 'a-cursor' : 'b-cursor', nextCursor: null }
      : { success: true, data: { _id: url.endsWith('/a') ? 'a' : 'b', name: url.endsWith('/a') ? 'Alpha' : 'Bravo', users: [] } };
    return { ok: true, json: async () => value };
  });
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  await waitFor(() => expect(streams.map(s => s.domain)).toEqual(['a']));
  fireEvent.click(screen.getByRole('button', { name: 'Switch domain' }));
  await waitFor(() => expect(streams.map(s => s.domain)).toEqual(['a', 'b']));
  expect(streams[0].signal.aborted).toBe(true);
});

test('the map initializes when a slow snapshot load finally reveals its container', async () => {
  jest.useFakeTimers();
  const constructor = mapboxgl.Map as unknown as jest.Mock;
  constructor.mockImplementation(() => ({ addControl: jest.fn(), on: jest.fn(), remove: jest.fn(), getCenter: () => ({lng: -1, lat: 51}), getZoom: () => 17 }));
  let finishObservations: ((value: any) => void) | undefined;
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('timeoutMs=25000')) return new Promise(() => {});
    if (url.endsWith('/observations')) return new Promise(resolve => { finishObservations = resolve; });
    if (observationReply(url)) return observationReply(url);
    const value = url === '/api/user' ? { _id: 'owner', displayName: 'Owner' }
      : url === '/api/config' ? { success: true, data: { mapboxAccessToken: 'public-fixture-token' } }
      : { success: true, data: { _id: 'a', name: 'Alpha', users: [] } };
    return { ok: true, json: async () => value };
  });
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  await waitFor(() => expect(finishObservations).toBeDefined());
  act(() => { jest.advanceTimersByTime(600); });
  expect(constructor).not.toHaveBeenCalled();
  await act(async () => { finishObservations!(sharedSnapshot()); });
  expect(constructor).toHaveBeenCalledTimes(1);
});

test('newer archived access context wins over an older delayed Owner refresh', async () => {
  let refreshes = 0; let finishOld: (value: any) => void = () => {};
  const reply = (data: any) => ({ ok: true, status: 200, json: async () => data });
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('timeoutMs=25000')) return new Promise(() => {});
    if (observationReply(url)) return observationReply(url);
    if (url === '/api/user') return reply({ _id: 'user', email: 'user@example.test' });
    if (url === '/api/config') return reply({ data: { mapboxAccessToken: null } });
    refreshes++;
    if (refreshes === 2) return new Promise(resolve => { finishOld = resolve; });
    return reply({ data: { _id: 'a', name: 'Alpha', revision: refreshes === 1 ? 1 : 3, status: refreshes === 1 ? 'active' : 'archived', myRole: refreshes === 1 ? 'owner' : 'viewer' } });
  });
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  await screen.findByText('Alpha'); act(() => window.dispatchEvent(new Event('focus'))); await waitFor(() => expect(refreshes).toBe(2));
  act(() => window.dispatchEvent(new Event('focus'))); await screen.findByRole('button', { name: 'Archived · Read-only' });
  await act(async () => finishOld(reply({ data: { _id: 'a', name: 'Alpha', revision: 2, status: 'active', myRole: 'owner' } })));
  const status = screen.getByRole('button', { name: 'Archived · Read-only' });
  expect(status).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Connect local gateway' })).not.toBeInTheDocument();
  fireEvent.click(status);
  expect(await screen.findByText(/Read-only retained history. Live updates are stopped./)).toBeVisible();
  expect(screen.getByText('0 Drones · 0 parameters')).toBeVisible();
  expect(within(screen.getByRole('navigation', { name: 'Domain lenses' })).getByRole('button', { name: 'Archived · Read-only' })).toBe(status);
});
test('a late denied request from a previous domain cannot clear the current domain', async () => {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('timeoutMs=25000')) return new Promise(() => {});
    if (observationReply(url)) return observationReply(url);
    const data = url === '/api/user' ? { _id: 'user' } : url === '/api/config' ? { data: { mapboxAccessToken: null } } : url.includes('/messages?') ? { data: [], cursor: 'cursor', nextCursor: null } : { data: { _id: 'b', name: 'Bravo', status: 'active' } };
    return { ok: true, status: 200, json: async () => data };
  });
  render(<MemoryRouter initialEntries={['/private/domain/b']}><Harness /></MemoryRouter>); await screen.findByText('Bravo');
  act(() => window.dispatchEvent(new CustomEvent('dronelink:access-changed', { detail: { status: 403, url: '/api/domains/a/key' } })));
  expect(screen.getByText('Bravo')).toBeInTheDocument(); expect(screen.queryByText('Domain access denied.')).not.toBeInTheDocument();
});


test('a transient access refresh failure retains the Domain and shared observations', async () => {
  let offline = false;
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (offline) throw new TypeError('Network unavailable');
    if (url.includes('timeoutMs=25000')) return new Promise(() => {});
    if (observationReply(url)) return observationReply(url);
    const data = url === '/api/user' ? { _id: 'viewer' } : url === '/api/config' ? { data: { mapboxAccessToken: null } } : { data: { _id: 'a', name: 'Alpha', status: 'active', canEdit: false } };
    return { ok: true, status: 200, json: async () => data };
  });
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  await screen.findByText('Alpha');
  expect(screen.queryByText('Collaboration')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  offline = true;
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(screen.getByText('Alpha')).toBeInTheDocument(); expect(screen.getByText('Inspector')).toBeInTheDocument();
});

test('a settings load failure keeps observations visible and offers a retry', async () => {
  let fail = true;
  const reply = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => data });
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('/visualization-settings?') && fail) return reply({ message: 'Unavailable' }, 503);
    if (url.includes('timeoutMs=25000')) return new Promise(() => {});
    if (observationReply(url)) return observationReply(url);
    if (url === '/api/user') return reply({ _id: 'user', displayName: 'Viewer' });
    if (url === '/api/config') return reply({ data: { mapboxAccessToken: null } });
    return reply({ data: { _id: 'a', name: 'Alpha', status: 'active', canEdit: false } });
  });
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  expect(await screen.findByText('Could not refresh visualization settings.')).toBeVisible();
  expect(screen.getByText('Inspector')).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
  await waitFor(() => expect(screen.queryByText('Could not refresh visualization settings.')).not.toBeInTheDocument());
});

test.each(['demotion', 'archive', 'navigation', 'revocation'])('a delayed reservation cannot submit after %s', async change => {
  let finish: (response: Response) => void = () => {};
  const reply = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) } as Response);
  let editable = true;
  let archived = false;
  const requests = jest.fn().mockImplementation((url: string) => {
    if (url.includes('timeoutMs=25000')) return new Promise(() => {});
    if (observationReply(url)) return Promise.resolve(observationReply(url));
    if (url === '/api/user') return Promise.resolve({ ok: true, json: async () => ({ _id: change }) });
    if (url === '/api/config') return Promise.resolve(reply({ mapboxAccessToken: null }));
    if (url === '/api/session') return Promise.resolve(reply({ csrfToken: 'fixture' }));
    if (url.endsWith('/command-submissions')) return new Promise(resolve => { finish = resolve; });
    if (url.includes('/commands')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { items: [] }, pagination: { nextCursor: null } }) });
    const id = url.endsWith('/a') ? 'a' : 'b';
    return Promise.resolve(reply({ _id: id, name: id === 'a' ? 'Alpha' : 'Bravo',
      status: archived ? 'archived' : 'active', canEdit: editable }));
  });
  global.fetch = requests as unknown as typeof fetch;
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Query value' }));
  await waitFor(() => expect(requests.mock.calls.some(([url]) => url.endsWith('/command-submissions'))).toBe(true));
  if (change === 'navigation') {
    fireEvent.click(screen.getByRole('button', { name: 'Switch domain' }));
    await screen.findByText('Bravo');
  } else if (change === 'revocation') {
    act(() => window.dispatchEvent(new CustomEvent('dronelink:access-changed', {
      detail: { status: 403, url: '/api/domains/a/observations' },
    })));
    await screen.findByText('Domain access denied.');
  } else {
    editable = false;
    archived = change === 'archive';
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Query value' })).not.toBeInTheDocument());
  }
  await act(async () => finish(reply({ submissionId: 's'.repeat(43), firstUseExpiresAt: '2099-01-01T00:00:00Z' })));
  expect(requests.mock.calls.some(([url, options]) => url.endsWith('/commands') && options?.method === 'POST')).toBe(false);
});

test.each(['editor', 'viewer'])('archived %s can switch lenses with the selected node and see the Files tab', async role => {
  const reply = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  const requests = jest.fn(async (url: string) => {
    if (url.endsWith('/observations')) {
      const snapshot = await sharedSnapshot().json();
      return reply({ ...snapshot, data: { ...snapshot.data, nodes: [{ nodeAddress: 11, generation: 0, revision: 1, droneId: 'drone-11', lastReceivedAt: '2026-11-13T10:00:00Z' }] } });
    }
    if (url.endsWith('/cloud-files')) return reply({ data: [] });
    if (observationReply(url)) return observationReply(url);
    if (url === '/api/user') return reply({ _id: 'lens-user', displayName: 'Lens user' });
    if (url === '/api/config') return reply({ data: { mapboxAccessToken: null } });
    return reply({ data: { _id: 'a', name: 'Alpha', status: 'archived', myRole: role, canEdit: false } });
  });
  global.fetch = requests as unknown as typeof fetch;
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  const lenses = within(await screen.findByRole('navigation', { name: 'Domain lenses' }));
  expect(lenses.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
  expect(lenses.queryByRole('button', { name: 'Nodes' })).not.toBeInTheDocument();
  const inspector = screen.getByRole('region', { name: 'Node Inspector' });
  expect(inspector).toHaveAttribute('data-size', 'collapsed');
  fireEvent.click(await screen.findByRole('button', { name: /^Inspect node 11:/ }));
  expect(screen.getByRole('region', { name: 'Node Inspector' })).toHaveAttribute('data-size', 'normal');
  expect(screen.getByRole('heading', { name: 'Node 11' })).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Node Inspector' })).getByText('Cloud', { exact: true })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Files' })).toBeVisible();
  fireEvent.click(lenses.getByRole('button', { name: 'Network' }));
  expect(screen.getByText(/Live gateway routes are unavailable for archived Domains/)).toBeVisible();
  expect(screen.getByRole('button', { name: /^Inspect node 11:/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
  if (role === 'editor') {
    expect(await screen.findByText('No Cloud files.')).toBeVisible();
    expect(screen.getByText(/Cloud files are read-only/)).toBeVisible();
  } else {
    expect(screen.getByText(/Node files are available to Domain Owners/)).toBeVisible();
    expect(requests.mock.calls.some(([url]) => url.includes('/cloud-files'))).toBe(false);
  }
});
