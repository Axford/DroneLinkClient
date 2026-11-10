import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodeSelector from './NodeSelector';

test('narrow node list keeps selection context and opens a scrollable dialog for keyboard inspection', async () => {
  const original = window.matchMedia;
  window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  try {
    const select = jest.fn();
    render(<NodeSelector nodes={[{ id: 7, name: 'Survey', lastHeard: 0, channels: {} }]} selectedNodeId={7}
      onNodeSelect={select} onLocate={jest.fn()} canLocate={() => false} now={1000} />);
    expect(screen.getByText('7 · Survey', { selector: '.dw-meta' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Inspect/ })).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: 'Expand node list' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expand.focus(); userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Observed nodes' })).toBeVisible();
    const node = screen.getByRole('button', { name: 'Inspect node 7: Survey' });
    node.focus(); userEvent.keyboard('{Enter}'); expect(select).toHaveBeenCalledWith(7);
    expect(expand).toHaveAttribute('aria-expanded', 'false');
  } finally { window.matchMedia = original; }
});

test('desktop cards show compact ages and expose exact receipts and long names without a visible list header', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const name = 'A long survey node name that must remain accessible';
  render(<NodeSelector nodes={[
    { id: 7, name, lastHeard: now - 4000, channels: {} },
    { id: 11, lastHeard: now - 180000, channels: {} },
    { id: 22, lastHeard: now - 7200000, channels: {} },
    { id: 37, lastHeard: 0, channels: {} }
  ]} selectedNodeId={7} onNodeSelect={jest.fn()} onLocate={jest.fn()} canLocate={id => id === 7} now={now} />);
  expect(screen.queryByText('Nodes · 4')).not.toBeInTheDocument();
  expect(screen.getByText('4s')).toBeVisible(); expect(screen.getByText('3m')).toBeVisible(); expect(screen.getByText('2h')).toBeVisible(); expect(screen.getByText('—')).toBeVisible();
  const node = screen.getByRole('button', { name: `Inspect node 7: ${name}` });
  expect(node).toHaveAttribute('aria-pressed', 'true'); expect(node).toHaveAccessibleDescription(expect.stringContaining('Server receipt:'));
  expect(screen.getByTitle(`7 · ${name}`)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Locate node 7' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Locate node 37' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Inspect node 37: Node 37' })).toHaveAccessibleDescription('No saved receipt');
});
