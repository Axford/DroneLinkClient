import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DomainCollaboration from './DomainCollaboration';
import { Domain, User } from '../App';
const owner: Domain = { _id: 'fleet', name: 'Fleet', revision: 7, status: 'active', myRole: 'owner', canManageMembers: true, canManageKeys: true, canEdit: true, canArchive: true, canRestore: false };
const viewer: Domain = { ...owner, myRole: 'viewer', canManageMembers: false, canManageKeys: false, canEdit: false, canArchive: false };
const person: User = { _id: 'user', displayName: 'User', email: 'user@example.test', isPlatformAdmin: false };
const response = (data: any, status = 200) => ({ ok: status < 400, status, json: async () => data });
function setup() {
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  let issued = false;
  const invitation = { _id: 'invitation', emailCanonical: 'target@example.test', role: 'viewer', revision: 1, effectiveState: 'pending', expiresAt: '2026-11-13T00:00:00Z' };
  global.fetch = jest.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    requests.push({ url, options });
    if (url === '/api/session') return response({ success: true, data: { csrfToken: 'csrf-proof' } });
    if (url.includes('/members?')) return response({ data: [{ _id: 'user', displayName: 'User', email: person.email, role: 'owner' }], pagination: { nextCursor: null } });
    if (url.includes('/invitations?')) return response({ data: issued ? [invitation] : [], pagination: { nextCursor: null } });
    if (url.endsWith('/invitations') && options?.method === 'POST') { issued = true; return response({ data: { invitation, shareUrl: 'https://example.test/invite/one.secret' } }, 201); }
    if (url.endsWith('/reissue')) return response({ data: { invitation: { ...invitation, revision: 2 }, shareUrl: 'https://example.test/invite/two.fresh' } });
    if (url.endsWith('/key')) return response({ data: { apiKey: 'private-current-key', revision: 7 } });
    return response({ data: owner });
  });
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  return requests;
}
afterEach(() => jest.restoreAllMocks());
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Domain settings' }));
test('Viewer reads members but never requests keys or renders administration controls', async () => {
  const requests = setup(); render(<DomainCollaboration domain={viewer} user={person} onRefresh={async () => {}} />); open();
  await screen.findByText(person.email);
  expect(screen.queryByRole('button', { name: 'Show key' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Archive domain' })).not.toBeInTheDocument();
  expect(requests.some(request => request.url.endsWith('/key') || request.url.includes('/invitations'))).toBe(false);
});
test('Owner creates targeted invitations, copies the shown-once link, and reissues with CSRF/revisions', async () => {
  const requests = setup(); render(<DomainCollaboration domain={owner} user={person} onRefresh={async () => {}} />); open();
  await screen.findByText(person.email);
  fireEvent.change(screen.getByLabelText('Invitation email'), { target: { value: 'target@example.test' } }); fireEvent.change(screen.getByLabelText('Invitation role'), { target: { value: 'viewer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
  await screen.findByDisplayValue('https://example.test/invite/one.secret'); fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.test/invite/one.secret');
  const issued = requests.find(request => request.url.endsWith('/invitations') && request.options?.method === 'POST')!;
  expect(JSON.parse(issued.options!.body as string)).toEqual({ email: 'target@example.test', role: 'viewer' }); expect(new Headers(issued.options!.headers).get('X-CSRF-Token')).toBe('csrf-proof');
  const reissue = await screen.findByRole('button', { name: 'Reissue' }); await waitFor(() => expect(reissue).not.toBeDisabled()); fireEvent.click(reissue);
  await screen.findByDisplayValue('https://example.test/invite/two.fresh');
  expect(JSON.parse(requests.find(request => request.url.endsWith('/reissue'))!.options!.body as string)).toEqual({ role: 'viewer', revision: 1 });
});
test('role change clears a displayed key and discards an obsolete in-flight key response', async () => {
  setup(); const original = global.fetch as jest.Mock; const base = original.getMockImplementation()!; let finish: (value: any) => void = () => {};
  original.mockImplementation((url, options) => url.endsWith('/key') ? new Promise(resolve => { finish = resolve; }) : base(url, options));
  const { rerender } = render(<DomainCollaboration domain={owner} user={person} onRefresh={async () => {}} />); open(); await screen.findByText(person.email);
  fireEvent.click(screen.getByRole('button', { name: 'Show key' })); await waitFor(() => expect(original).toHaveBeenCalledWith('/api/domains/fleet/key', expect.anything()));
  await act(async () => { rerender(<DomainCollaboration domain={viewer} user={person} onRefresh={async () => {}} />); });
  await act(async () => finish(response({ data: { apiKey: 'must-not-return' } })));
  expect(screen.queryByText('must-not-return')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Show key' })).not.toBeInTheDocument();
});
test('archive/restore use reviewed domain revisions and archived controls stay read-only', async () => {
  const requests = setup(); const refresh = jest.fn().mockResolvedValue(undefined); const { rerender } = render(<DomainCollaboration domain={owner} user={person} onRefresh={refresh} />); open();
  await screen.findByText(person.email); fireEvent.click(screen.getByRole('button', { name: 'Archive domain' }));
  await waitFor(() => expect(requests.some(request => request.url.endsWith('/archive'))).toBe(true)); expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('History and memberships are retained'));
  expect(JSON.parse(requests.find(request => request.url.endsWith('/archive'))!.options!.body as string)).toEqual({ revision: 7 });
  await act(async () => { rerender(<DomainCollaboration domain={{ ...owner, revision: 8, status: 'archived', canEdit: false, canArchive: false, canRestore: true, canManageMembers: false, canManageKeys: false }} user={person} onRefresh={refresh} />); });
  expect(screen.queryByRole('button', { name: 'Create invitation' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Restore domain' })).toBeInTheDocument();
});

test('an external domain revision refreshes members without clearing the newly issued link', async () => {
  const requests = setup(); const { rerender } = render(<DomainCollaboration domain={owner} user={person} onRefresh={async () => {}} />); open();
  await screen.findByText(person.email); fireEvent.change(screen.getByLabelText('Invitation email'), { target: { value: 'target@example.test' } }); fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
  await screen.findByDisplayValue('https://example.test/invite/one.secret'); await waitFor(() => expect(screen.getByRole('button', { name: 'Create invitation' })).not.toBeDisabled());
  const before = requests.filter(request => request.url.includes('/members?')).length;
  await act(async () => { rerender(<DomainCollaboration domain={{ ...owner, revision: 8 }} user={person} onRefresh={async () => {}} />); });
  await waitFor(() => expect(requests.filter(request => request.url.includes('/members?')).length).toBeGreaterThan(before));
  expect(screen.getByDisplayValue('https://example.test/invite/one.secret')).toBeInTheDocument();
});
