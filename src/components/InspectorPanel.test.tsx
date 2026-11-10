import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InspectorPanel from './InspectorPanel';
import { DroneLinkStateHook } from '../dronelink/useDroneLinkState';
import { DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_CHAR } from '../dronelink/DroneLinkMsg';

const receivedAt = Date.parse('2026-11-07T12:00:00Z');
const state = {
  7: { id: 7, droneId: 'drone-seven', interface: 'cloud', lastHeard: receivedAt, channels: {
    4: { channel: 4, name: 'GPS', lastHeard: receivedAt, params: {
      5: { param: 5, values: ['NMEA'], msgType: DRONE_LINK_MSG_TYPE_CHAR, bytesPerValue: 1, numValues: 1, writable: false },
      8: { param: 8, name: 'location', values: [-1, 51, 0], msgType: DRONE_LINK_MSG_TYPE_FLOAT, bytesPerValue: 4, numValues: 3, writable: true,
        lastHeard: receivedAt, timestamp: receivedAt - 60000, source: 'Gateway 254', nameLastHeard: receivedAt + 1000, nameSource: 'HTTP' }
    } }
  } }
};
const hook = { state, nodeCount: 1, isLoading: false, error: null, observationStatus: 'ready', snapshotWriteFailures: 0, stats: { nodes: 1, channels: 1, parameters: 2, received: 2 },
  resetNodeObservations: jest.fn(), getNodeState: jest.fn(), getParamValues: jest.fn(), loadSharedObservations: jest.fn(),
  startStreaming: jest.fn(), stopStreaming: jest.fn(), reset: jest.fn(), on: jest.fn(), off: jest.fn() } as DroneLinkStateHook;
afterEach(() => jest.restoreAllMocks());
test('Viewer can inspect singleton identity and binding provenance without command/reset controls; role changes remove reset', async () => {
  const reset = jest.fn().mockResolvedValue(undefined); jest.spyOn(window, 'confirm').mockReturnValue(true);
  const props = { domainId: 'fleet', droneLinkState: { ...hook, resetNodeObservations: reset }, selectedNodeId: 7, onNodeSelect: jest.fn() };
  const view = render(<InspectorPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Node details' }));
  expect(screen.getByText(/Drone: drone-seven/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close Node details' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Reset node observations' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Map source bindings' }));
  expect(screen.getByRole('cell', { name: /7>4.8 GPS.location/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close Map source bindings' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
  fireEvent.click(screen.getByRole('button', { name: 'Parameter details: location' }));
  expect(screen.getByText(/Value last changed/)).toHaveTextContent(new Date(receivedAt - 60000).toLocaleString());
  expect(screen.getByText(/Name received/)).toHaveTextContent('via HTTP');
  expect(screen.queryByTitle('Enable Channel')).not.toBeInTheDocument(); expect(screen.queryByTitle('Channel Settings')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close Parameter details: location' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.rerender(<InspectorPanel {...props} canReset />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspector tools' }));
  expect(screen.getByRole('button', { name: 'Reset node observations' })).toHaveAccessibleDescription('Clears shared observations for everyone. Identity and history stay.');
  fireEvent.click(screen.getByRole('button', { name: 'Reset node observations' }));
  await waitFor(() => expect(reset).toHaveBeenCalledWith(7));
  view.rerender(<InspectorPanel {...props} canReset={false} />);
  expect(screen.queryByRole('button', { name: 'Reset node observations' })).not.toBeInTheDocument();
});

test('degraded snapshot warning reports current unavailable parts',()=>{
 render(<InspectorPanel domainId="fleet" droneLinkState={{...hook,unavailableObservationParts:2}} selectedNodeId={7} />);
 expect(screen.getByRole('alert')).toHaveTextContent('2 observation parts are unavailable because packet validation failed.');
});
