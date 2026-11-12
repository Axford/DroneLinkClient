import { render, screen } from '@testing-library/react';
import { SummaryChips, SummaryDetails } from './NodeSummary';
import type { ObservedSummary } from '../dronelink/moduleVisualizations';

it.each([['Local', 'Gateway receipt'], ['Gateway 246', 'Server receipt']])(
    'labels %s readings with the clock that recorded them', (source, receipt) => {
        const now = Date.parse('2026-11-12T12:00:00Z');
        const summary: ObservedSummary = {
            channelId: 10, parameterId: 9, label: 'Satellites', text: '7 sats',
            reading: { param: 9, msgType: 0, bytesPerValue: 1, numValues: 1, values: [7], writable: false, source, lastHeard: now },
        };
        render(<>
            <SummaryChips nodeId={11} summaries={[summary]} now={now} />
            <SummaryDetails nodeId={11} summaries={[summary]} now={now} />
        </>);
        const provenance = `11>10.9 · ${source} · ${receipt}:`;
        expect(screen.getByRole('group', { name: 'Satellites · 7 sats' })).toHaveAttribute('title', expect.stringContaining(provenance));
        expect(screen.getByText(text => text.startsWith(provenance))).toBeInTheDocument();
    },
);
