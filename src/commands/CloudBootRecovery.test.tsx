import { fireEvent, render, screen } from '@testing-library/react';
import { NodeState } from '../dronelink/DroneLinkState';
import CloudBootRecovery from './CloudBootRecovery';
import { CommandScope, submit } from './session';

jest.mock('./session', () => ({
  ...jest.requireActual('./session'),
  submit: jest.fn(() => new Promise(() => undefined))
}));

const now = 150000;
const scope = { domainId: 'bench', userId: 'operator', canSubmit: true, canSettings: false };
const node = (mode = 2, lastHeard = now, directHttpObservation = true): NodeState => ({
  id: 3, lastHeard, interface: 'cloud',
  channels: { 1: { channel: 1, lastHeard, params: { 23: {
    param: 23, observationBytes: Uint8Array.of(1, mode, 6, 5, 240, 240, 0, 17, 34, 51, 68, 85, 102, 119),
    directHttpObservation, lastHeard, msgType: 0, bytesPerValue: 1, numValues: 14, values: [], writable: false
  } } } }
});

test('retries the exact degraded boot shown by a fresh direct status report', () => {
  render(<CommandScope.Provider value={scope}><CloudBootRecovery node={node()} now={now} /></CommandScope.Provider>);
  expect(screen.getByText('Quarantined channel 240')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry normal startup' }));
  expect(submit).toHaveBeenCalledWith(scope, { operation: 'retry-normal', bootId: '0011223344556677',
    target: { nodeAddress: 3, channel: 1, param: 24 } });
});

test('offers a retry only for a recent direct degraded report and current edit access', () => {
  const view = (target: NodeState, canSubmit = true) => <CommandScope.Provider value={{ ...scope, canSubmit }}>
    <CloudBootRecovery node={target} now={now} />
  </CommandScope.Provider>;
  const control = () => screen.queryByRole('button', { name: 'Retry normal startup' });
  const { rerender } = render(view(node(1)));
  expect(control()).toBeNull();
  rerender(view(node(2, now - 45001)));
  expect(control()).toBeNull();
  rerender(view(node(2, now, false)));
  expect(control()).toBeNull();
  rerender(view(node(), false));
  expect(control()).toBeNull();
  rerender(view(node()));
  expect(control()).toBeInTheDocument();
});
