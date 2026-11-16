import { DRONE_LINK_MSG_TYPE_FLOAT as FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import type { TankSteerSummary } from '../dronelink/moduleVisualizations';
import useSummaryWrite from './useSummaryWrite';

const MODE = 10;
const DISTANCE = 24;
const modes = ['Manual', 'Automatic'] as const;

function modeReadback(observed: number, requested: number) {
    if (observed !== 0 && observed !== 1) return 'Newer mode is unrecognised';
    return observed === requested ? `Observed mode is now ${modes[observed]}` : `Newer mode is ${modes[observed]}`;
}

function distanceReadback(observed: number) {
    return observed === 0 ? 'Observed distance is zero' : 'Newer distance differs';
}

export default function TankSteerActions({ nodeId, channelId, summary }: {
    nodeId: number; channelId: number; summary: TankSteerSummary;
}) {
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const mode = resolve(MODE, UINT8);
    const distance = resolve(DISTANCE, FLOAT);
    const modeMatches = summary.modeValue !== undefined && summary.modeValue === mode?.observed;
    const canClear = modeMatches && summary.modeValue === 0 && (distance?.observed ?? 0) > 0;

    return <div className="dw-summary-actions">
        <div className="dw-summary-action-row" role="group" aria-label="TankSteer actions">
            {modes.map((label, value) => {
                const canChange = modeMatches && summary.modeValue !== value;
                return <button key={label} type="button" className="btn btn-sm btn-outline-secondary"
                    aria-disabled={!canChange || busy} data-inspector-focus={`tanksteer-mode-${value}-${channelId}`}
                    title={`Switch TankSteer to ${label} mode`}
                    onClick={() => { if (canChange) void send(label, mode, value, modeReadback); }}>{label}</button>;
            })}
            <button type="button" className="btn btn-sm btn-outline-warning dw-summary-action-emphasis"
                aria-disabled={!canClear || busy} data-inspector-focus={`tanksteer-clear-distance-${channelId}`}
                title="Set the Manual distance input to zero"
                onClick={() => { if (canClear) void send('Clear distance', distance, 0, distanceReadback); }}>Clear distance</button>
        </div>
        {status}
    </div>;
}
