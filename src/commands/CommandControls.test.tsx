import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DomainCommands, ParameterCommands } from './CommandControls';
import { CommandScope } from './session';
import { Command, Target, WriteObservation } from './model';

const target: Target = { nodeAddress: 7, channel: 4, param: 8 };
const observed: WriteObservation = { bytes: Uint8Array.of(4), expected: {
  observationEpoch: 'm1-c-1', nodeGeneration: 0, msgType: 0, payloadBytes: 1, writable: true
} };
const response = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status,
  json: async () => status < 400 ? { success: true, data, pagination: { nextCursor: null } } : data
} as Response);
const command = (domainId: string, state: Command['state'] = 'pending'): Command => ({
  id: 'x'.repeat(43), domainId, target, operation: 'write', requested: { values: [21] }, state, transport: 'http', priority: 3,
  acceptedAt: '2026-11-10T12:00:00Z', expiresAt: '2026-11-10T13:00:00Z', terminalAt: null, reason: null, cancelledBy: null,
  submittedBy: { userId: 'user', displayName: 'Operator' }
});
const reservation = { submissionId: 'a'.repeat(43), firstUseExpiresAt: '2099-01-01T00:00:00Z' };
afterEach(() => jest.restoreAllMocks());

test('unknown outcome survives panel navigation and retry uses the same typed request and reservation', async () => {
  const scope = { domainId: 'recovery', userId: 'user', canSubmit: true, canSettings: true };
  const bodies: unknown[] = [];
  let preparations = 0;
  jest.spyOn(global, 'fetch').mockImplementation((path, options) => {
    const url = String(path);
    if (url === '/api/session') return response({ csrfToken: 'test' });
    if (url.endsWith('/command-submissions')) { preparations++; return response(reservation, 201); }
    if (url.endsWith('/commands') && options?.method === 'POST') {
      bodies.push(JSON.parse(String(options.body)));
      return bodies.length === 1 ? Promise.reject(new TypeError('Connection closed')) : response(command(scope.domainId));
    }
    if (url.endsWith('/command-settings')) return response({ revision: 1, httpLifetimeSeconds: 3600 });
    return response({ items: [] });
  });
  const view = render(<CommandScope.Provider value={scope}><ParameterCommands target={target} observation={observed} /></CommandScope.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit parameter value' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Value 1' }), { target: { value: '21' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit write' }));
  await screen.findByRole('button', { name: 'Retry same request' });
  view.rerender(<CommandScope.Provider value={scope}><DomainCommands node={8} /></CommandScope.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Domain commands' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry same request' }));
  await screen.findByText(/Write accepted at/);
  expect(preparations).toBe(1);
  expect(bodies).toEqual([{
    submissionId: reservation.submissionId, target, operation: 'write', expected: observed.expected, payload: { values: [21] }
  }, bodies[0]]);
});

test('an open editor fences a new generation before any reservation is issued', async () => {
  const scope = { domainId: 'conflict', userId: 'user', canSubmit: true, canSettings: false };
  const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => response({ items: [] }));
  const renderWith = (observation: WriteObservation) =>
    <CommandScope.Provider value={scope}><ParameterCommands target={target} observation={observation} /></CommandScope.Provider>;
  const view = render(renderWith(observed));
  await screen.findByText('No pending commands.');
  fireEvent.click(screen.getByRole('button', { name: 'Edit parameter value' }));
  view.rerender(renderWith({ ...observed, expected: { ...observed.expected, nodeGeneration: 1 } }));
  expect(screen.getByRole('button', { name: 'Submit write' })).toBeDisabled();
  expect(screen.getByText(/Observation metadata changed/)).toBeVisible();
  expect(fetch.mock.calls.every(([url]) => !String(url).endsWith('/command-submissions'))).toBe(true);
});

test('Viewer reads canonical history and lifetime without mutation controls', async () => {
  const scope = { domainId: 'viewing', userId: 'viewer', canSubmit: false, canSettings: false };
  jest.spyOn(global, 'fetch').mockImplementation(path => String(path).endsWith('/command-settings')
    ? response({ revision: 1, httpLifetimeSeconds: 3600 }) : response({ items: [command(scope.domainId)] }));
  render(<CommandScope.Provider value={scope}><DomainCommands node={7} /></CommandScope.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Domain commands' }));
  expect(await screen.findByText('Write · pending')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Command lifetime seconds' })).toHaveValue('3600'));
  expect(screen.queryByRole('button', { name: /Cancel Write|Save command lifetime|Query addressed/ })).not.toBeInTheDocument();
});
