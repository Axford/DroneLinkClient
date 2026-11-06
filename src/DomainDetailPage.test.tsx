import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import DomainDetailPage from './DomainDetailPage';
import mapboxgl from 'mapbox-gl';
jest.mock('react-resizable-panels', () => ({ Panel: ({ children }: any) => <div>{children}</div>, PanelGroup: ({ children }: any) => <div>{children}</div>, PanelResizeHandle: () => null }));
jest.mock('mapbox-gl', () => ({ Map: jest.fn(), NavigationControl: jest.fn() }));
jest.mock('./components/InspectorPanel', () => () => <div>Inspector</div>);
function Harness() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/private/domain/b')}>Switch domain</button><Routes><Route path="/private/domain/:domainId" element={<DomainDetailPage />} /></Routes></>;
}
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
test('changing the selected domain aborts its old poll and loads the new domain history', async () => {
  const streams: Array<{ domain: string; signal: AbortSignal }> = [];
  global.fetch = jest.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.includes('/stream?')) {
      streams.push({ domain: url.includes('/a/') ? 'a' : 'b', signal: options!.signal as AbortSignal });
      return new Promise(() => {});
    }
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

test('the map initializes when a slow history replay finally reveals its container', async () => {
  jest.useFakeTimers();
  const constructor = mapboxgl.Map as unknown as jest.Mock;
  constructor.mockImplementation(() => ({ addControl: jest.fn(), on: jest.fn(), remove: jest.fn() }));
  let finishHistory: ((value: any) => void) | undefined;
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('/stream?')) return new Promise(() => {});
    if (url.includes('/messages?')) return new Promise(resolve => { finishHistory = resolve; });
    const value = url === '/api/user' ? { _id: 'owner', displayName: 'Owner' }
      : url === '/api/config' ? { success: true, data: { mapboxAccessToken: 'public-fixture-token' } }
      : { success: true, data: { _id: 'a', name: 'Alpha', users: [] } };
    return { ok: true, json: async () => value };
  });
  render(<MemoryRouter initialEntries={['/private/domain/a']}><Harness /></MemoryRouter>);
  await waitFor(() => expect(finishHistory).toBeDefined());
  act(() => { jest.advanceTimersByTime(600); });
  expect(constructor).not.toHaveBeenCalled();
  await act(async () => { finishHistory!({ ok: true, json: async () => ({ success: true, data: [], cursor: 'cursor', nextCursor: null }) }); });
  expect(constructor).toHaveBeenCalledTimes(1);
});
