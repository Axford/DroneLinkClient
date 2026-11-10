import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkspaceShell from './WorkspaceShell';
import { Domain, User } from '../App';
const domain = { _id: 'fleet', name: 'Fleet', status: 'active' } as Domain;
const user = { _id: 'u', displayName: 'Pilot', email: 'pilot@example.test' } as User;
afterEach(() => jest.restoreAllMocks());
test('an open Domain starts as an accessible rail, with Home, shortcuts and account retained', () => {
  render(<MemoryRouter><WorkspaceShell user={user} activeDomain={domain} shortcuts={[domain]}>Map</WorkspaceShell></MemoryRouter>);
  const rail = screen.getByLabelText('Workspace navigation');
  expect(rail).toHaveClass('collapsed');
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/private/');
  expect(screen.getByRole('link', { name: 'Open Fleet' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Account: Pilot' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
  expect(rail).not.toHaveClass('collapsed');
});
test('narrow screens keep navigation in the icon rail', () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() })) });
  render(<MemoryRouter><WorkspaceShell user={user} shortcuts={[domain]}>Home</WorkspaceShell></MemoryRouter>);
  expect(screen.getByLabelText('Workspace navigation')).toHaveClass('collapsed');
  expect(screen.queryByRole('button', { name: 'Expand navigation' })).not.toBeInTheDocument();
  delete (window as any).matchMedia;
});
