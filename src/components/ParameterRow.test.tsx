import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ParameterRow from './ParameterRow';
import { ObservationNamesContext } from './parameterPresentation';
import { ParameterState, GlobalState } from '../dronelink/DroneLinkState';
const receivedAt = Date.parse('2026-11-10T12:00:00Z');
const value: ParameterState = { param: 8, msgType: 3, numValues: 1, bytesPerValue: 4, writable: true, values: [1.23456789], name: 'reading', source: 'Gateway 254', lastHeard: receivedAt, timestamp: receivedAt - 60000, nameLastHeard: receivedAt - 120000, nameSource: 'HTTP' };

test('compact typed value details preserve exact values and both provenance facets without edit controls', async () => {
    render(<ParameterRow nodeId={7} channelId={4} parameterId={8} parameter={value} />);
    expect(screen.getByText('1.2346')).toBeVisible(); expect(screen.getByText('7>4.8 · FLOAT')).toBeVisible();
    expect(screen.getByText('Observed writable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Parameter details: reading' }));
    expect(screen.getByText('1.23456789')).toBeVisible();
    expect(screen.getByText(/Value last changed/)).toHaveTextContent(new Date(receivedAt - 60000).toLocaleString());
    expect(screen.getByText(/Name received/)).toHaveTextContent('via HTTP');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Parameter details: reading' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('late metadata resolves ADDR names and removal/replacement clears them without changing the original receipt', () => {
    const parameter = { ...value, msgType: 1, values: [0, 11, 2, 200], name: 'target' };
    const state: GlobalState = { 11: { id: 11, name: 'Bravo', lastHeard: receivedAt, channels: { 2: { channel: 2, lastHeard: receivedAt, name: 'GPS', params: { 8: { ...value, name: 'position' } } } } } };
    const content = (names: GlobalState) => <ObservationNamesContext.Provider value={names}><ParameterRow nodeId={7} channelId={4} parameterId={8} parameter={parameter} /></ObservationNamesContext.Provider>;
    const view = render(content({})); expect(screen.getByText('0:11>2.8')).toBeVisible();
    view.rerender(content(state)); expect(screen.getByText('Bravo > GPS.position')).toBeVisible();
    expect(screen.getByTitle(/^Server receipt:/)).toHaveAttribute('title', expect.stringContaining(new Date(receivedAt).toLocaleString()));
    view.rerender(content({})); expect(screen.queryByText('Bravo > GPS.position')).not.toBeInTheDocument();
});

test('name-only and failed facets remain explicitly unavailable and preserve valid companions', () => {
    const view = render(<ParameterRow nodeId={7} channelId={4} parameterId={8} parameter={{ ...value, values: [], numValues: 0, lastHeard: undefined, timestamp: undefined }} />);
    expect(screen.getByText('Value unavailable')).toBeVisible(); expect(screen.getByText('7>4.8 · Type unavailable')).toBeVisible();
    view.rerender(<ParameterRow nodeId={7} channelId={4} parameterId={8} parameter={{ ...value, unavailable: { name: 'invalid-length' } }} />);
    expect(screen.getByText('1.2346')).toBeVisible(); expect(screen.getByText('Name unavailable')).toBeVisible();
    expect(screen.getByText('Param 8')).toBeVisible(); expect(screen.queryByText('reading')).not.toBeInTheDocument();
});
