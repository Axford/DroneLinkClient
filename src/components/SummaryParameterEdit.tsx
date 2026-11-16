import { useContext } from 'react';
import { ParameterEditorContext } from '../commands/ParameterEditor';
import { DRONE_LINK_MSG_TYPE_FLOAT as FLOAT } from '../dronelink/DroneLinkMsg';

interface Edit {
    param: number;
    label: string;
    description: string;
    fields: readonly string[];
    min: number;
    max: number;
    localOnly?: boolean;
}

export const headingEdit = (param: number): Edit => ({
    param, label: 'Set heading', fields: ['Target heading (°)'], min: 0, max: 360,
    description: 'Enter a target heading from 0° to 360°. A subscribed source can overwrite it.',
});

export const servoPositionEdit: Edit = {
    param: 8, label: 'Set position', fields: ['Position'], min: -1, max: 1, localOnly: true,
    description: 'Enter a normalized position from −1 to +1. This can move the servo. A subscribed source can overwrite the position.',
};

export const servoCurveEdit: Edit = {
    param: 12, label: 'Edit curve', fields: ['Point 1 (°)', 'Point 2 (°)', 'Point 3 (°)', 'Point 4 (°)'],
    min: 0, max: 180, localOnly: true,
    description: 'Enter four control points from 0° to 180°. Applying the curve can move the servo.',
};

export default function SummaryParameterEdit({ nodeId, channelId, edit }: {
    nodeId: number; channelId: number; edit: Edit;
}) {
    const editor = useContext(ParameterEditorContext);
    const target = { nodeAddress: nodeId, channel: channelId, param: edit.param };
    const path = editor?.resolve(target);
    const expected = path?.sample.observation?.expected;
    const workbenchRequired = edit.localOnly && (!path || path.id === 'cloud');
    const enabled = path?.available && expected?.writable && expected.msgType === FLOAT && expected.payloadBytes === 4 * edit.fields.length && !workbenchRequired;

    return <button type="button" className="btn btn-outline-secondary btn-sm"
        data-inspector-focus={`summary-edit-${channelId}-${edit.param}`}
        title={workbenchRequired ? 'Select a local Workbench connection to edit.' : edit.description}
        aria-disabled={!enabled}
        onClick={event => {
            if (!enabled) return;
            editor?.open(target, edit.label, event.currentTarget, {
                description: edit.description,
                fieldLabels: edit.fields,
                validate: payload => {
                    if (!('values' in payload) || payload.values.length !== edit.fields.length ||
                        payload.values.some(value => value < edit.min || value > edit.max)) {
                        throw new Error(`Enter values from ${edit.min} to ${edit.max}.`);
                    }
                }
            });
        }}>{edit.label}</button>;
}
