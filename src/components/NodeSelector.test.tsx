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
