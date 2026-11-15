import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CloudReplay from './CloudReplay';
import { authenticatedFetchJson } from '../utils/api';
import { createReplayApi } from './replayApi';

jest.mock('../components/WorkspaceShell', () => ({ children }: React.PropsWithChildren) => <div>{children}</div>);
jest.mock('../components/ObservedMap', () => ({ historicalTime }: { historicalTime?: number }) => <div data-testid="map-time">{historicalTime}</div>);
jest.mock('../workbench/liveCharts/ChartTimeline', () => ({ __esModule: true, default: () => <div>Charts</div>, seriesColor: () => 'red' }));
jest.mock('../utils/api', () => ({
    ...jest.requireActual('../utils/api'),
    authenticatedFetchJson: jest.fn(),
    affectsDomain: () => false,
    accessEvent: 'dronelink:access-changed'
}));
jest.mock('./replayApi', () => ({ createReplayApi: jest.fn() }));

test('opens from a saved time and scrubs cached packets without fetching across an uncached drag', async () => {
    const anchor = Date.parse('2026-11-10T09:00:00Z');
    const bookmarkTime = anchor + 30000;
    const requestWindow = jest.fn(async (from: number, until: number) => ({
        from, until, frame: { until: from, channels: [{ nodeAddress: 11, channel: 7, params: { 14: { name: { payload: 'UmVwbGF5IHNpZ25hbA==' }, value: { msgType: 0, payload: 'Cw==' } } } }] }, samples: []
    }));
    (authenticatedFetchJson as jest.Mock).mockImplementation(async url =>
        url === '/api/user' ? { _id: 'viewer' } : { data: { mapboxAccessToken: null } });
    (createReplayApi as jest.Mock).mockReturnValue({
        info: async () => ({
            first: anchor, last: anchor + 3600000, intervalMs: 86400000, settingsRevision: 0,
            userId: 'viewer', admin: false,
            domain: { _id: 'fleet', name: 'My fleet', status: 'active', myRole: 'viewer', canEdit: false }
        }),
        bookmarks: async () => ({ items: [{ id: 'test', note: 'Sail test', at: bookmarkTime, authorId: 'editor' }], nextCursor: null }),
        window: requestWindow
    });
    render(<MemoryRouter initialEntries={['/private/domain/fleet/replay']}><Routes>
        <Route path="/private/domain/:domainId/replay" element={<CloudReplay />} />
    </Routes></MemoryRouter>);
    const open = await screen.findByRole('button', { name: /Sail test/ });
    expect(requestWindow).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Bookmark playhead/ })).toBeNull();
    fireEvent.click(open);
    await waitFor(() => expect(screen.getByTestId('map-time')).toHaveTextContent(String(bookmarkTime)));

    fireEvent.change(screen.getByLabelText('Recorded node'), { target: { value: '11' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Plot Replay signal' }));
    expect(screen.getByRole('region', { name: 'Replay charts' })).toBeInTheDocument();

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: anchor + 60000 } });
    expect(screen.getByTestId('map-time')).toHaveTextContent(String(anchor + 60000));
    fireEvent.pointerUp(slider);
    expect(requestWindow).toHaveBeenCalledTimes(1);

    fireEvent.change(slider, { target: { value: anchor + 420000 } });
    expect(requestWindow).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(screen.getByTestId('map-time')).toHaveTextContent(String(anchor + 420000)));
    expect(requestWindow).toHaveBeenCalledTimes(2);
});
