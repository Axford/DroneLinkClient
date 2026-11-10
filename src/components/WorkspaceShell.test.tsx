import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Domain, User } from '../App';
import WorkspaceShell from './WorkspaceShell';

const domain = { _id: 'fleet', name: 'Fleet', status: 'active' } as Domain;
const archived = { _id: 'old-fleet', name: 'Old Fleet', status: 'archived' } as Domain;
const user = { _id: 'u', displayName: 'Pilot', email: 'pilot@example.test' } as User;
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function renderWorkspace({ portrait = false, compact = false } = {}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === '(orientation: portrait)' ? portrait : compact,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
  render(<MemoryRouter>
    <WorkspaceShell user={user} activeDomain={domain} shortcuts={[domain, archived]}>Map</WorkspaceShell>
  </MemoryRouter>);
  return within(screen.getByRole('navigation', { name: 'Primary navigation' }));
}

afterEach(() => {
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
});

test('an open Domain starts as an expandable landscape rail with active destinations and the account', () => {
  const nav = renderWorkspace();
  expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/private/');
  expect(nav.getByRole('link', { name: 'Open Fleet' })).toHaveAttribute('aria-current', 'page');
  expect(nav.queryByRole('link', { name: 'Open Old Fleet' })).not.toBeInTheDocument();
  expect(nav.getByRole('button', { name: 'Account: Pilot' })).toBeInTheDocument();
  fireEvent.click(nav.getByRole('button', { name: 'Expand navigation' }));
  expect(nav.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
});

test('portrait with room along the top offers direct destinations and the account', () => {
  const nav = renderWorkspace({ portrait: true });
  expect(nav.getByRole('link', { name: 'Open Fleet' })).toBeInTheDocument();
  expect(nav.getByRole('button', { name: 'Account: Pilot' })).toBeInTheDocument();
  expect(nav.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  expect(nav.queryByRole('button', { name: 'Expand navigation' })).not.toBeInTheDocument();
});

test.each([true, false])('a short edge uses a pop-up and keeps account access independent (portrait: %s)', async portrait => {
  const nav = renderWorkspace({ portrait, compact: true });
  const toggle = nav.getByRole('button', { name: 'Open navigation' });
  const account = nav.getByRole('button', { name: 'Account: Pilot' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(nav.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(toggle); });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(nav.getByRole('link', { name: 'Open Fleet' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(nav.getByRole('link', { name: 'Home' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await act(async () => { fireEvent.click(account); });
  expect(nav.getByText('pilot@example.test')).toBeInTheDocument();
  expect(nav.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
});
