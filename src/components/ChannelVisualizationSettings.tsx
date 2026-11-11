import React, { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Gear } from 'react-bootstrap-icons';
import { ApiError } from '../utils/api';
import { VisualizationSetting, VisualizationSettingsDefinition, VisualizationTarget, VoltageThresholds, visualizationKey } from '../dronelink/visualizationSettings';
import { useVisualizationSettings } from './VisualizationSettings';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';

const draftFor = (thresholds?: VoltageThresholds | null) => ({
    redBelow: thresholds ? String(thresholds.redBelow) : '',
    amberBelow: thresholds ? String(thresholds.amberBelow) : ''
});

export default function ChannelVisualizationSettings({ target, definition, generation }: {
    target: VisualizationTarget;
    definition: VisualizationSettingsDefinition;
    generation: number;
}) {
    const settings = useVisualizationSettings();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(draftFor());
    const [revision, setRevision] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();
    const [conflict, setConflict] = useState(false);

    if (!settings?.canEdit) return null;
    const saved = settings.get(target);
    const title = `Visualization settings for channel ${target.channel}`;
    const loadSaved = (record?: VisualizationSetting) => {
        setDraft(draftFor(record?.thresholds));
        setRevision(record?.revision ?? 0);
        setConflict(false);
        setError(undefined);
    };
    const commit = async (thresholds: VoltageThresholds | null) => {
        setSaving(true);
        setError(undefined);
        try {
            await settings.save(target, generation, revision, thresholds);
            setOpen(false);
        } catch (problem) {
            if (problem instanceof ApiError && problem.status === 409) {
                setConflict(true);
                setError('The saved settings or observed channel changed. Review the latest settings before trying again.');
            } else setError(problem instanceof Error ? problem.message : 'Could not save visualization settings.');
        } finally {
            setSaving(false);
        }
    };
    return <>
        <IconButton label={title} icon={<Gear />} data-inspector-focus={`visualization-${target.channel}`}
            onClick={() => { loadSaved(saved); setOpen(true); }} />
        <SettingsDialog title={title} show={open} onHide={() => { if (!saving) setOpen(false); }} compact>
            <Form noValidate onSubmit={event => {
                event.preventDefault();
                if (saving || conflict) return;
                const thresholds = definition.parse(draft);
                if (thresholds) void commit(thresholds);
                else setError(definition.invalidMessage);
            }}>
                {error && <Alert variant="warning">{error}</Alert>}
                <p>{definition.description}</p>
                <fieldset className="dw-visualization-fields mb-3" disabled={saving || conflict}>
                    {definition.fields.map(field => <Form.Group key={field.key}>
                        <Form.Label className="w-100">
                            {field.label}
                            <Form.Control type="number" step="any" inputMode="decimal" value={draft[field.key]}
                                onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} />
                        </Form.Label>
                    </Form.Group>)}
                </fieldset>
                <div className="dw-row-actions">
                    {conflict ? <Button type="button" disabled={saving} onClick={async () => {
                        setSaving(true);
                        try {
                            const records = await settings.refresh();
                            if (!records) return;
                            const latest = records.find(record => visualizationKey(record) === visualizationKey(target));
                            loadSaved((saved?.revision ?? 0) > (latest?.revision ?? 0) ? saved : latest);
                        } catch {
                            setError('Could not reload saved settings. Try again.');
                        } finally { setSaving(false); }
                    }}>Reload saved settings</Button> : <>
                        {saved?.thresholds && <Button type="button" variant="secondary" disabled={saving} onClick={() => void commit(null)}>Clear thresholds</Button>}
                        <Button type="submit" disabled={saving}>Save</Button>
                    </>}
                </div>
            </Form>
        </SettingsDialog>
    </>;
}
