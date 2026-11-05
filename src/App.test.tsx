import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// These pages use Mapbox/device workflows outside the app startup contract.
jest.mock('./HomePage', () => () => <div>Domain list</div>);
jest.mock('./DomainDetailPage', () => () => <div>Domain detail</div>);
jest.mock('./InvitePage', () => () => <div>Invitation</div>);
jest.mock('./Sidebar', () => () => <nav>Navigation</nav>);

afterEach(() => { jest.restoreAllMocks(); });

test('keeps the loading indicator while the session request is pending', () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  expect(fetch).toHaveBeenCalledWith('/api/user');
});

test('shows a session request failure without rendering the domain list', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch user data');
  expect(screen.queryByText('Domain list')).not.toBeInTheDocument();
});

test('loads the domain list using the existing same-origin session and domain APIs', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ _id: 'user', domains: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, pages: 0, hasNext: false, hasPrev: false } }) });
  render(<App />);
  expect(await screen.findByText('Domain list')).toBeInTheDocument();
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/domains?page=1&limit=10');
});
