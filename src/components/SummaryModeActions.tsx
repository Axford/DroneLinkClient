import { DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import useSummaryWrite from './useSummaryWrite';

interface Mode {
    value: number;
    label: string;
    action?: { description: string; warning?: boolean; label?: string; oneShot?: boolean };
}

export default function SummaryModeActions({ nodeId, channelId, name, param, observedMode, modes }: {
    nodeId: number; channelId: number; name: string; param: number; observedMode?: number; modes: readonly Mode[];
}) {
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const write = resolve(param, UINT8);
    const current = modes.find(mode => mode.value === observedMode)?.action;
    const canChooseMode = observedMode === write?.observed && !!current && !current.oneShot;

    function modeReadback(observed: number, requested: number, oneShot?: boolean) {
        const mode = modes.find(candidate => candidate.value === observed);
        if (oneShot && mode?.action?.oneShot) return;
        const label = mode?.label;
        if (oneShot) return label ? `Newer mode is ${label}. Action outcome unconfirmed.` :
            'Newer mode is unrecognised. Action outcome unconfirmed.';
        if (label === undefined) return 'Newer mode is unrecognised';
        return observed === requested ? `Observed mode is now ${label}` : `Newer mode is ${label}`;
    }

    return <div className="dw-summary-actions">
        <div className="dw-summary-action-row" role="group" aria-label={`${name} actions`}>
            {modes.map(({ value, label, action }) => {
                if (!action) return null;
                const canChange = canChooseMode && observedMode !== value;
                const actionLabel = action.label ?? label;
                const treatment = action.warning ? 'btn-outline-warning dw-summary-action-emphasis' : 'btn-outline-secondary';
                return <button key={value} type="button" className={`btn btn-sm ${treatment}`}
                    aria-disabled={!canChange || busy} data-inspector-focus={`${name.toLowerCase()}-mode-${value}-${channelId}`}
                    title={action.description}
                    onClick={() => { if (canChange) void send(actionLabel, write, value,
                        (observed, requested) => modeReadback(observed, requested, action.oneShot)); }}>{actionLabel}</button>;
            })}
        </div>
        {status}
    </div>;
}
