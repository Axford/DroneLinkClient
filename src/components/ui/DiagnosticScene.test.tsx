import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DiagnosticScene from './DiagnosticScene';
import type { DiagnosticSceneData } from '../../dronelink/diagnosticScene';

const magnetic: DiagnosticSceneData = {
  extent: 40,
  samples: [[-14, 8, 32], [16, -27, 3]],
  vector: { from: [2, 3, -1], to: [17, -26, 5] },
  calibration: { centre: [2, 3, -1], radii: [32, 28, 35] }
};

test('expanded diagnostics update in place and release their view on close', async () => {
  const renderScene = (scene: DiagnosticSceneData) =>
    <DiagnosticScene title="Magnetic diagnostic" scene={scene} readings={<p>Latest X 17 µT</p>} />;
  const { rerender, unmount } = render(renderScene(magnetic));
  const trigger = screen.getByRole('button', { name: 'Show 3D' });
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = within(screen.getByRole('dialog', { name: 'Magnetic diagnostic' }));
  const chart = dialog.getByRole('img', { name: /rotatable/i });
  const initial = chart.querySelector('.dw-diagnostic-vector')?.getAttribute('x2');
  expect(initial).toBeTruthy();
  fireEvent.click(dialog.getByRole('button', { name: 'Rotate right' }));
  expect(chart.querySelector('.dw-diagnostic-vector')).not.toHaveAttribute('x2', initial);
  fireEvent.click(dialog.getByRole('button', { name: 'XY view' }));
  expect(dialog.getByRole('img', { name: /XY projection/i })).not.toHaveTextContent('+Z');
  expect(dialog.getByText('Latest X 17 µT')).toBeVisible();
  rerender(renderScene({ ...magnetic, vector: { from: [2, 3, -1], to: [-10, -26, 5] } }));
  expect(chart.querySelector('.dw-diagnostic-vector')).toHaveAttribute('x2', '135');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  fireEvent.click(trigger);
  const reopened = screen.getByRole('img', { name: /rotatable/i });
  expect(reopened).toHaveTextContent('+Z');
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true');
  unmount();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('invalid calibration and vectors leave the text equivalent available', () => {
  render(<DiagnosticScene title="Acceleration diagnostic" scene={{
    extent: 0,
    vector: { from: [0, 0, 0], to: [0, NaN, 0] },
    calibration: { centre: [0, 0, 0], radii: [1, 1, 0] }
  }} readings={<p>Acceleration unavailable</p>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show 3D' }));
  const chart = screen.getByRole('img');
  expect(chart.querySelector('.dw-diagnostic-vector')).toBeNull();
  expect(chart.querySelector('.dw-diagnostic-calibration')).toBeNull();
  expect(screen.getByText('Acceleration unavailable')).toBeVisible();
});
