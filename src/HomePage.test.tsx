import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { ToastProvider } from './contexts/ToastContext';
import { Domain, User } from './App';
const owner: Domain = { _id: 'fleet', name: 'Fleet', revision: 7, status: 'active', myRole: 'owner', canManageMembers: true, canManageKeys: true, canEdit: true, canArchive: true, canRestore: false };
const user: User = { _id: 'user', displayName: 'User', email: 'user@example.test' };
const reply = (data: any, status = 200) => ({ ok: status < 400, status, json: async () => data });
function setup(domain = owner) {
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.includes('/members?limit=100')) return reply({ data: [{ _id: 'one' }], pagination: { nextCursor: url.includes('cursor=') ? null : 'next-page' } });
    if (url.endsWith('/identities')) return reply({ data: { drones: [{ _id: 'drone' }], nodes: [{ nodeAddress: 1 }] } });
    if (url.includes('/members?')) return reply({ data: [{ _id: 'user', displayName: 'User', email: user.email, role: domain.myRole }], pagination: { nextCursor: null } });
    if (url.includes('/invitations?')) return reply({ data: [], pagination: { nextCursor: null } });
    if (url === '/api/session') return reply({ data: { csrfToken: 'csrf' } });
    if (url.endsWith('/key')) return reply({ data: { apiKey: 'shown-key' } });
    return reply({ data: domain });
  });
  const refresh = jest.fn().mockResolvedValue(undefined);
  const statusChange = jest.fn();
  const view = render(<ToastProvider><MemoryRouter><HomePage user={user} domains={[domain]} onRefresh={refresh} onDomainUpdate={jest.fn()} onDomainDelete={jest.fn()} pagination={{ limit: 10, nextCursor: null, hasPrev: false }} onPageChange={jest.fn()} loading={false} canCreate={false} status={domain.status} onStatusChange={statusChange} /></MemoryRouter></ToastProvider>);
  return { ...view, refresh, statusChange };
}
afterEach(() => jest.restoreAllMocks());
test('homepage cards count all member pages and separate operations from collapsed administration', async () => {
  setup();
  const totals = screen.getByLabelText('Domain totals');
  await waitFor(() => expect(totals).toHaveTextContent('2 users'));
  expect(totals).toHaveTextContent('1 Drone'); expect(totals).toHaveTextContent('1 node');
  expect(screen.getByRole('link', { name: 'Fleet' })).toHaveAttribute('href', '/private/domain/fleet');
  expect(screen.queryByRole('link', { name: 'Open map and inspector' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Domain settings' })).toHaveAttribute('aria-haspopup', 'dialog');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect((fetch as jest.Mock).mock.calls.some(([url]) => url.includes('/invitations') || url.endsWith('/key'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Domain settings' }));
  await screen.findByText(user.email);
  expect(screen.getByRole('button', { name: 'Create invitation' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
  await screen.findByText('shown-key');
  fireEvent.click(screen.getByRole('button', { name: 'Close Domain settings' }));
  await waitFor(() => expect(screen.queryByText('shown-key')).not.toBeInTheDocument());
});
test('Viewer homepage cards retain member visibility without key or invitation access', async () => {
  setup({ ...owner, myRole: 'viewer', canManageMembers: false, canManageKeys: false, canEdit: false, canArchive: false });
  fireEvent.click(screen.getByRole('button', { name: 'Domain settings' }));
  await screen.findByText(user.email);
  expect(screen.queryByRole('button', { name: 'Show key' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create invitation' })).not.toBeInTheDocument();
});
test('unavailable totals are reported with retry and do not masquerade as zero', async () => {
  setup();
  await waitFor(() => expect(screen.getByLabelText('Domain totals')).toHaveTextContent('2 users'));
  (fetch as jest.Mock).mockRejectedValue(new Error('Offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByText('Totals unavailable.');
  expect(within(screen.getByLabelText('Domain totals')).queryByText('0')).not.toBeInTheDocument();
});
test('archiving from a homepage card refreshes its owning list', async () => {
  const { refresh } = setup(); jest.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Domain settings' }));
  await screen.findByText(user.email);
  fireEvent.click(screen.getByRole('button', { name: 'Archive domain' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetch).toHaveBeenCalledWith('/api/domains/fleet/archive', expect.objectContaining({ method: 'POST', body: JSON.stringify({ revision: 7 }) }));
});

test('domain status uses selected tabs and keeps refresh beside totals', async () => {
  const { statusChange } = setup();
  expect(screen.getByRole('tab', { name: 'Active domains' })).toHaveAttribute('aria-selected', 'true');
  const archived = screen.getByRole('tab', { name: 'Archived domains' });
  expect(archived).toHaveAttribute('aria-selected', 'false');
  fireEvent.click(archived);
  expect(statusChange).toHaveBeenCalledWith('archived');
  expect(within(screen.getByLabelText('Domain totals')).getByRole('button', { name: 'Refresh totals' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Domain totals')).toHaveTextContent('2 users'));
});
