import { Form } from 'react-bootstrap';
import { DRONE_LINK_MSG_TYPE_ADDR as ADDR, DRONE_LINK_MSG_TYPE_CHAR as CHAR } from '@dronelink/protocol';
import { addressFields } from './model';

export default function ParameterFields({ msgType, fields, onChange, labels }: {
    msgType: number;
    fields: string[];
    labels?: readonly string[];
    onChange: (index: number, value: string) => void;
}) {
    return <>
            {msgType === ADDR ? Array.from({ length: fields.length / 5 }, (_, row) =>
                <fieldset key={row}><legend>Address {row + 1}</legend><div className="dw-parameter-inputs">
                    {addressFields.map((name, column) => {
                        const i = row * 5 + column;
                        return <label key={name}>{name}<Form.Control size="sm" inputMode="numeric" value={fields[i]} onChange={event => onChange(i, event.target.value)} /></label>;
                    })}
                </div></fieldset>) : <div className="dw-parameter-inputs">
                    {fields.map((value, i) => <label key={i}>{msgType === CHAR ? 'Requested text' : (labels?.[i] ?? `Value ${i + 1}`)}
                        <Form.Control size="sm" value={value} inputMode={msgType === CHAR ? 'text' : 'decimal'}
                            onChange={event => onChange(i, event.target.value)} /></label>)}
                </div>}
    </>;
}
