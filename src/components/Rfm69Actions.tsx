import { useId, useState } from 'react';
import { DRONE_LINK_MSG_TYPE_FLOAT as FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import useSummaryWrite from './useSummaryWrite';
import './Rfm69Actions.css';

const powerOptions = Array.from({ length: 35 }, (_, index) => index - 14);
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const priorityOptions = [0, 1, 2, 3];
const powerText = (value: number) => `${value} dBm`;
const priorityText = (value: number) => priorities[value] ? `${value} · ${priorities[value]}` : String(value);

function RadioSetting({ label, observed, options, format, pathId, busy, onApply }: {
    label: string;
    observed?: number;
    options: number[];
    format: (value: number) => string;
    pathId?: string;
    busy: boolean;
    onApply: (value: number) => void;
}) {
    const selectId = useId();
    const observedId = useId();
    const [draft, setDraft] = useState<{ value: number; observed?: number; pathId: string }>();
    const selected = pathId && draft?.pathId === pathId && draft.observed === observed ? draft.value : undefined;
    const canApply = !busy && selected !== undefined && selected !== observed && options.includes(selected);

    return <div className="dw-radio-setting">
        <label htmlFor={selectId}>{label}</label>
        <span className="dw-meta" id={observedId}>Reported {observed === undefined ? 'unavailable' : format(observed)}</span>
        <div className="dw-summary-action-row">
            <select id={selectId} aria-describedby={observedId} className="form-select form-select-sm"
                value={selected ?? ''} disabled={!pathId || busy}
                onChange={event => {
                    const value = event.target.value;
                    setDraft(pathId && value !== '' ? { value: Number(value), observed, pathId } : undefined);
                }}>
                <option value="">Select a value</option>
                {options.map(value => <option key={value} value={value}>{format(value)}</option>)}
            </select>
            <button type="button" className="btn btn-sm btn-outline-warning" aria-label={`Apply ${label.toLowerCase()}`}
                aria-disabled={!canApply} onClick={() => {
                    if (!canApply) return;
                    onApply(selected);
                    setDraft(undefined);
                }}>Apply</button>
        </div>
    </div>;
}

export default function Rfm69Actions({ nodeId, channelId, power, priority }: {
    nodeId: number; channelId: number; power?: number; priority?: number;
}) {
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const powerWrite = resolve(11, FLOAT);
    const priorityWrite = resolve(13, UINT8);

    const linkNote = useId();
    return <div className="dw-summary-actions">
        <div className="dw-radio-settings" role="group" aria-label="Radio settings" aria-describedby={linkNote}>
            <RadioSetting label="Transmit power" observed={power} options={powerOptions} format={powerText}
                pathId={powerWrite?.observed === power ? powerWrite?.path.id : undefined} busy={busy}
                onApply={value => void send('Transmit power', powerWrite, value, observed => `Reported power is ${powerText(observed)}`)} />
            <RadioSetting label="Minimum priority" observed={priority} options={priorityOptions} format={priorityText}
                pathId={priorityWrite?.observed === priority ? priorityWrite?.path.id : undefined} busy={busy}
                onApply={value => void send('Minimum priority', priorityWrite, value, observed => `Reported minimum priority is ${priorityText(observed)}`)} />
        </div>
        <p className="dw-meta mb-0 mt-1" id={linkNote}>Power affects link reach. Packets below the minimum priority are skipped.</p>
        {status}
    </div>;
}
