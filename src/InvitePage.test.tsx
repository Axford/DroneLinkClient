import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InvitePage from './InvitePage';
const token = 'A'.repeat(20) + '.' + 'B'.repeat(43);
const renderPage = () => render(<MemoryRouter initialEntries={['/invite/' + token]}><Routes><Route path="/invite/:token" element={<InvitePage />} /><Route path="/private/domain/fleet" element={<p>Joined domain</p>} /></Routes></MemoryRouter>);
afterEach(() => jest.restoreAllMocks());
test('unauthenticated invitation shows Google return path without domain disclosure', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({ code: 'unauthenticated' }) }); renderPage();
  const link = await screen.findByRole('link', { name: 'Sign in with Google' }); expect(link.getAttribute('href')).toBe('/auth/google?returnTo=' + encodeURIComponent('/invite/' + token));
  expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByText('Accept Invitation')).not.toBeInTheDocument();
});
test('matching invitation requires explicit acceptance and a fresh session CSRF token', async () => {
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  global.fetch = jest.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    requests.push({ url, options }); const data = url === '/api/user' ? { email: 'target@example.test' } : url === '/api/session' ? { data: { csrfToken: 'csrf' } } : options?.method === 'POST' ? { data: { domainId: 'fleet' } } : { data: { domainName: 'Fleet', role: 'viewer', inviterDisplayName: 'Owner', expiresAt: '2026-11-13' } };
    return { status: 200, ok: true, json: async () => data };
  }); renderPage();
  await screen.findByRole('button', { name: 'Accept Invitation' }); expect(requests.filter(request => request.options?.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' })); await screen.findByText('Joined domain');
  expect(new Headers(requests.find(request => request.options?.method === 'POST')!.options!.headers).get('X-CSRF-Token')).toBe('csrf');
});
test('wrong Google identity shows the signed-in email and no acceptance action', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ email: 'wrong@example.test' }) }).mockResolvedValueOnce({ status: 403, ok: false, json: async () => ({ code: 'forbidden', message: 'Access denied' }) });
  renderPage(); await waitFor(() => expect(screen.getByText(/wrong@example.test/)).toBeInTheDocument()); await screen.findByText('Access denied');
  expect(screen.queryByRole('button', { name: 'Accept Invitation' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Sign out to switch accounts' })).toBeInTheDocument();
});
