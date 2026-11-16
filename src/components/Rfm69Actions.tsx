import { useId } from 'react';
import { DRONE_LINK_MSG_TYPE_FLOAT as FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import useSummaryWrite from './useSummaryWrite';
import './Rfm69Actions.css';

const powerOptions = Array.from({ length: 35 }, (_, index) => index - 14);
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const priorityOptions = [0, 1, 2, 3];
const powerText = (value: number) => `${value} dBm`;
const priorityText = (value: number) => priorities[value] ? `${value} · ${priorities[value]}` : String(value);

function RadioSetting({ label, tip, observed, options, format, disabled, onChange }: {
    label: string;
    tip: string;
    observed?: number;
    options: number[];
    format: (value: number) => string;
    disabled: boolean;
    onChange: (value: number) => void;
}) {
    const id = useId();
    const observedOutsideOptions = observed !== undefined && !options.includes(observed);

    return <div className="dw-radio-setting" title={tip}>
        <label htmlFor={id} className="dw-meta">{label}</label>
        <span className="visually-hidden" id={`${id}-tip`}>{tip}</span>
        <select id={id} aria-describedby={`${id}-tip`} className="form-select form-select-sm"
            value={observed ?? ''} disabled={disabled}
            onChange={event => {
                const raw = event.target.value;
                const value = Number(raw);
                if (!disabled && raw !== '' && value !== observed && options.includes(value)) onChange(value);
            }}>
            {observed === undefined && <option value="" disabled>Unavailable</option>}
            {observedOutsideOptions && <option value={observed} disabled>{format(observed)}</option>}
            {options.map(value => <option key={value} value={value}>{format(value)}</option>)}
        </select>
    </div>;
}

export default function Rfm69Actions({ nodeId, channelId, power, priority }: {
    nodeId: number; channelId: number; power?: number; priority?: number;
}) {
    const { resolve, send, busy, status } = useSummaryWrite(nodeId, channelId);
    const powerWrite = resolve(11, FLOAT);
    const priorityWrite = resolve(13, UINT8);

    return <div className="dw-summary-actions">
        <div className="dw-radio-settings" role="group" aria-label="Radio settings">
            <RadioSetting label="Transmit power" tip="Selecting a value submits the change. Transmit power affects radio link reach."
                observed={power} options={powerOptions} format={powerText}
                disabled={busy || !powerWrite || powerWrite.observed !== power}
                onChange={value => void send('Transmit power', powerWrite, value, observed => `Reported power is ${powerText(observed)}`)} />
            <RadioSetting label="Minimum priority"
                tip="Selecting a value submits the change. The radio skips packets below this priority, which can include readback."
                observed={priority} options={priorityOptions} format={priorityText}
                disabled={busy || !priorityWrite || priorityWrite.observed !== priority}
                onChange={value => void send('Minimum priority', priorityWrite, value, observed => `Reported minimum priority is ${priorityText(observed)}`)} />
        </div>
        {status}
    </div>;
}
