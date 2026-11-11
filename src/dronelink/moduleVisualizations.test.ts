import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT } from './DroneLinkMsg';
import type { ChannelState, NodeState } from './DroneLinkState';
import { channelVisualization, moduleSummaries } from './moduleVisualizations';
import type { VisualizationSetting } from './visualizationSettings';

const channel = (id: number, volts: number, type = 'INA219'): ChannelState => ({
    channel: id, lastHeard: 1000, params: {
        5: { param: 5, values: [type], msgType: DRONE_LINK_MSG_TYPE_CHAR, bytesPerValue: 1, numValues: type.length, writable: false },
        15: { param: 15, values: [volts], msgType: DRONE_LINK_MSG_TYPE_FLOAT, bytesPerValue: 4, numValues: 1,
            writable: false, lastHeard: 500, source: 'HTTP' }
    }
});
const thresholds = { redBelow: 3.25, amberBelow: 3.5 };
const record: VisualizationSetting = { nodeAddress: 7, channel: 6, moduleType: 'INA219', revision: 1, thresholds };

test.each([[3.2, 'danger'], [3.25, 'warning'], [3.49, 'warning'], [3.5, undefined], [NaN, undefined]])(
    'voltage %s uses the same boundary in the overlay and Inspector while other channels stay neutral',
    (volts, severity) => {
        const selected = channel(6, volts);
        const node: NodeState = { id: 7, lastHeard: 1000, channels: { 6: selected, 7: channel(7, 3.2) } };
        const [first, other] = moduleSummaries(node, target => target.channel === 6 && target.moduleType === 'INA219' ? record : undefined);
        expect(first.severity).toBe(severity);
        expect(first.reading?.lastHeard).toBe(500);
        expect(other.severity).toBeUndefined();
        expect(channelVisualization(selected)?.inspector?.(selected, thresholds).primary[0].severity).toBe(severity);
        expect(moduleSummaries(node, () => ({ ...record, thresholds: null }))[0].severity).toBeUndefined();
    }
);

test('saved INA219 thresholds only apply when a matching module is observed again', () => {
    const node: NodeState = { id: 7, observationGeneration: 1, lastHeard: 1000, channels: {} };
    expect(moduleSummaries(node, () => record)).toEqual([]);
    expect(moduleSummaries({ ...node, channels: { 6: channel(6, 3.2, 'NMEA') } }, () => record)[0].label).toBe('Satellites');
    expect(moduleSummaries({ ...node, channels: { 6: channel(6, 3.2) } }, () => record)[0].severity).toBe('danger');
});
