import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import DomainDetailPage from './DomainDetailPage';
import mapboxgl from 'mapbox-gl';
jest.mock('react-resizable-panels', () => ({ Panel: ({ children }: any) => <div>{children}</div>, PanelGroup: ({ children }: any) => <div>{children}</div>, PanelResizeHandle: () => null }));
jest.mock('mapbox-gl', () => ({ Map: jest.fn(), NavigationControl: jest.fn() }));
jest.mock('./components/DomainCollaboration', () => () => <div>Collaboration</div>);
jest.mock('./components/InspectorPanel', () => () => <div>Inspector</div>);
function Harness() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/private/domain/b')}>Switch domain</button><Routes><Route path="/private/domain/:domainId" element={<DomainDetailPage />} /></Routes></>;
}
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const sharedSnapshot = () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { schemaVersion: 1, activationEpoch: 'm1-c-1', nodes: [], channels: [], startCursor: 'start', catchUpCursor: 'final' }, pagination: { nextCursor: null } }) });
function observationReply(url: string): any {
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
  act(() => window.dispatchEvent(new Event('focus'))); await screen.findByText(/Archived domain · Read-only/);
  await act(async () => finishOld(reply({ data: { _id: 'a', name: 'Alpha', revision: 2, status: 'active', myRole: 'owner' } })));
  expect(screen.getByText(/Archived domain · Read-only/)).toBeInTheDocument();
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
