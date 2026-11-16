import { DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import useSummaryWrite from './useSummaryWrite';

interface Mode {
    value: number;
    label: string;
    action?: { description: string; warning?: boolean };
}

export default function SummaryModeActions({ nodeId, channelId, name, param, observedMode, modes }: {
    nodeId: number; channelId: number; name: string; param: number; observedMode?: number; modes: readonly Mode[];
}) {
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const write = resolve(param, UINT8);
    const canChooseMode = observedMode === write?.observed && modes.some(mode => mode.value === observedMode && mode.action);

    function modeReadback(observed: number, requested: number) {
        const label = modes.find(mode => mode.value === observed)?.label;
        if (label === undefined) return 'Newer mode is unrecognised';
        return observed === requested ? `Observed mode is now ${label}` : `Newer mode is ${label}`;
    }

    return <div className="dw-summary-actions">
        <div className="dw-summary-action-row" role="group" aria-label={`${name} actions`}>
            {modes.map(({ value, label, action }) => {
                if (!action) return null;
                const canChange = canChooseMode && observedMode !== value;
                const treatment = action.warning ? 'btn-outline-warning dw-summary-action-emphasis' : 'btn-outline-secondary';
                return <button key={value} type="button" className={`btn btn-sm ${treatment}`}
                    aria-disabled={!canChange || busy} data-inspector-focus={`${name.toLowerCase()}-mode-${value}-${channelId}`}
                    title={action.description}
                    onClick={() => { if (canChange) void send(label, write, value, modeReadback); }}>{label}</button>;
            })}
        </div>
        {status}
    </div>;
}
