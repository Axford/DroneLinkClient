import { DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import type { PolarSummary } from '../dronelink/moduleVisualizations';
import useSummaryWrite from './useSummaryWrite';

const MODE = 9;
const choices = [
    { value: 0, label: 'Passive', description: 'Pass through the reported heading' },
    { value: 1, label: 'Active', description: 'Run polar sampling and allow Polar to adjust the heading' },
] as const;

function modeReadback(observed: number, requested: number) {
    const label = observed === 2 ? 'Reset' : choices.find(choice => choice.value === observed)?.label;
    if (label === undefined) return 'Newer mode is unrecognised';
    return observed === requested ? `Observed mode is now ${label}` : `Newer mode is ${label}`;
}

export default function PolarActions({ nodeId, channelId, modeValue }: {
    nodeId: number; channelId: number; modeValue: PolarSummary['modeValue'];
}) {
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const write = resolve(MODE, UINT8);
    const canChooseMode = (modeValue === 0 || modeValue === 1) && modeValue === write?.observed;

    return <div className="dw-summary-actions">
        <div className="dw-summary-action-row" role="group" aria-label="Polar actions">
            {choices.map(({ value, label, description }) => {
                const canChange = canChooseMode && modeValue !== value;
                return <button key={value} type="button" className="btn btn-sm btn-outline-secondary"
                    aria-disabled={!canChange || busy} data-inspector-focus={`polar-mode-${value}-${channelId}`}
                    title={description}
                    onClick={() => { if (canChange) void send(label, write, value, modeReadback); }}>{label}</button>;
            })}
        </div>
        {status}
    </div>;
}
