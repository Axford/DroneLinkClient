import React from 'react';
import { render, screen } from '@testing-library/react';
import { projectSailingProfiles, SailingProfiles } from './SailingProfiles';

test('wind-referenced profiles place sectors around north and only close complete curves', () => {
    const polar = [255, ...Array(14).fill(0), 128];
    const first = Array(16).fill(0);
    const second = Array(16).fill(255);
    const projection = (bearing?: number, speeds: [number[] | undefined, number[] | undefined] = [first, second]) =>
        projectSailingProfiles({ bearing, polar, speeds, inner: 20, outer: 40 });
    const { rerender } = render(<svg role="img" aria-label="Profiles"><SailingProfiles profiles={projection(354.375)} /></svg>);
    const plot = screen.getByRole('img', { name: 'Profiles' });
    const point = (series: string, index: number) => plot.querySelector(`[data-series="${series}"]`)!
        .getAttribute('points')!.split(' ').slice(index * 2, index * 2 + 2).map(Number);
    expect(point('polar', 0)[0]).toBeCloseTo(50);
    expect(point('polar', 0)[1]).toBeCloseTo(10);
    expect(point('polar', 31)[0]).toBeLessThan(50);
    expect(plot.querySelector('polygon[data-series="speed"]')).toBeInTheDocument();

    rerender(<svg role="img" aria-label="Profiles"><SailingProfiles profiles={projection(354.375, [undefined, second])} /></svg>);
    expect(plot.querySelector('polygon[data-series="speed"]')).not.toBeInTheDocument();
    expect(plot.querySelector('polyline[data-series="speed"]')).toBeInTheDocument();
    expect(point('speed', 0)[0]).toBeCloseTo(50);
    expect(point('speed', 0)[1]).toBeCloseTo(90);

    rerender(<svg role="img" aria-label="Profiles"><SailingProfiles profiles={projection()} /></svg>);
    expect(plot.querySelector('[data-series]')).not.toBeInTheDocument();
});
