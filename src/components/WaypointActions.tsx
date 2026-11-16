import { DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import type { WaypointSummary } from '../dronelink/moduleVisualizations';
import { useMapCamera } from './MapCamera';
import useSummaryWrite from './useSummaryWrite';

const MODE = 8;
const INDEX = 10;

const waypointReadback = (observed: number, requested: number) =>
    observed === requested ? 'Newer waypoint matches' : 'Newer waypoint differs';
const reloadReadback = () => 'Newer mode received; file reload unconfirmed';

export default function WaypointActions({ nodeId, channelId, summary }: {
    nodeId: number; channelId: number; summary: WaypointSummary;
}) {
    const center = useMapCamera();
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const indexWrite = resolve(INDEX, UINT8);
    const modeWrite = resolve(MODE, UINT8);
    const hasRoute = (summary.count ?? 0) > 0;
    const next = summary.index !== undefined && summary.index === indexWrite?.observed &&
        summary.count !== undefined && summary.index + 1 < summary.count ? summary.index + 1 : undefined;
    const { target } = summary;
    return <div className="dw-summary-actions">
        <div className="dw-summary-action-row" role="group" aria-label="Waypoint actions">
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-disabled={!hasRoute || !indexWrite || busy}
                data-inspector-focus={`waypoint-restart-${channelId}`}
                title="Start the loaded route at waypoint 1" onClick={() => void send('Restart', indexWrite, hasRoute ? 0 : undefined, waypointReadback)}>Restart</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-disabled={next === undefined || busy}
                data-inspector-focus={`waypoint-next-${channelId}`}
                title="Select the next waypoint in the loaded route" onClick={() => void send('Next', indexWrite, next, waypointReadback)}>Next</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-disabled={!center || !target}
                data-inspector-focus={`waypoint-goto-${channelId}`}
                title="Center the map on the observed waypoint target" onClick={() => target && center?.(target)}>Goto</button>
            <button type="button" className="btn btn-sm btn-outline-warning dw-summary-action-emphasis" aria-disabled={!modeWrite || busy}
                data-inspector-focus={`waypoint-reload-${channelId}`}
                title="Reread waypoint.csv and return to waypoint 1" onClick={() => void send('Reload', modeWrite, 1, reloadReadback)}>Reload</button>
        </div>
        {status}
    </div>;
}
