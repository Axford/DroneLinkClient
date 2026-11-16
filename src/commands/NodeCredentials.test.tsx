import { fireEvent, render, screen } from '@testing-library/react';
import NodeCredentials from './NodeCredentials';
import { CommandScope, commandRequest } from './session';

jest.mock('./session', () => ({ ...jest.requireActual('./session'), commandRequest: jest.fn() }));

const call = commandRequest as jest.Mock;
const scope = { domainId: 'fleet', userId: 'owner', canSubmit: true, canSettings: true };
const url = '/api/domains/fleet/node-credentials/3';
const now = Date.parse('2026-11-16T13:00:00Z');
const unpaired = { enrollmentId: null, enrolledAt: null, revokedAt: null };
const enrolled = { enrollmentId: 'identity', enrolledAt: new Date(now).toISOString(), revokedAt: null };
const view = (canSettings = true) => <CommandScope.Provider value={{ ...scope, canSettings }}>
  <NodeCredentials node={3} now={now} />
</CommandScope.Provider>;

beforeEach(() => call.mockReset());

test('owners can get a one-time USB claim for the displayed node', async () => {
  call.mockResolvedValueOnce({ data: unpaired }).mockResolvedValueOnce({
    data: { claim: 'claim', expiresAt: new Date(now + 60_000).toISOString() }
  }).mockResolvedValue({ data: unpaired });
  render(view());
  fireEvent.click(await screen.findByRole('button', { name: 'Create USB enrollment claim' }));
  expect(await screen.findByRole('textbox', { name: 'USB enrollment claim' })).toHaveValue('claim');
  expect(call).toHaveBeenCalledWith(url + '/claim', { method: 'POST', body: '{}', userId: 'owner' });
});

test('revocation requires confirmation and submits the displayed enrollment ID', async () => {
  const revoked = { ...enrolled, revokedAt: new Date(now + 500).toISOString() };
  call.mockResolvedValueOnce({ data: enrolled }).mockResolvedValue({ data: revoked });
  render(view());
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke credential' }));
  expect(call).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke now' }));
  expect(await screen.findByText('Revoked')).toBeInTheDocument();
  expect(call).toHaveBeenCalledWith(url + '/revoke', {
    method: 'POST', body: JSON.stringify({ enrollmentId: 'identity' }), userId: 'owner'
  });
});

test('operators without credential management authority never request a claim', () => {
  render(view(false));
  expect(call).not.toHaveBeenCalled();
  expect(screen.queryByText('Recovery credential')).toBeNull();
});
