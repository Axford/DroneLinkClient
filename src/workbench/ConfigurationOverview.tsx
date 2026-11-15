import React, { Suspense, useId, useState } from 'react';
import SettingsDialog from '../components/ui/SettingsDialog';
import type { ConfigurationOverview as Overview } from './nodeConfiguration';
import { updateSubscriptionSource } from './nodeConfiguration';

const ConfigurationGraph = React.lazy(() => import('./ConfigurationGraph'));

type Module = Overview['modules'][number];
type Subscription = Module['subscriptions'][number];

export default function ConfigurationOverview({ overview, text, editable, onChange, goToLine, selectedChannel, onSelect, selectedDetails }: {
    overview: Overview;
    text: string;
    editable: boolean;
    onChange: (draft: string) => void;
    goToLine: (line: number) => void;
    selectedChannel?: number;
    onSelect: (channel: number) => void;
    selectedDetails?: React.ReactNode;
}) {
    const inputId = useId();
    const [settingsChannel, setSettingsChannel] = useState<number>();
    const [edit, setEdit] = useState<{ subscription: Subscription; text: string; value: string }>();
    const active = editable && edit?.text === text ? edit : undefined;
    const updated = active && updateSubscriptionSource(text, active.subscription, active.value);
    const invalid = !!active && active.value.trim() !== active.subscription.source && updated === undefined;

    function openModule(module: Module) {
        onSelect(module.channel);
        setSettingsChannel(module.channel);
    }

    function editSource(module: Module, subscription: Subscription) {
        onSelect(module.channel);
        setEdit({ subscription, text, value: subscription.source });
    }

    function finish(apply = false) {
        if (apply && updated !== undefined) onChange(updated);
        setEdit(undefined);
    }

    return <section className="dw-config-overview" aria-label="Modules and subscriptions">
        <Suspense fallback={<p role="status">Loading subscription graph…</p>}>
            <ConfigurationGraph overview={overview} selected={selectedChannel} onSelect={onSelect}
                onModule={openModule} onInput={editable ? editSource : undefined} goToLine={goToLine} />
        </Suspense>
        <SettingsDialog compact title="Module settings" show={settingsChannel !== undefined && settingsChannel === selectedChannel && !!selectedDetails}
            onHide={() => setSettingsChannel(undefined)}>
            {selectedDetails}
        </SettingsDialog>
        <SettingsDialog compact title="Edit source" show={!!active} onHide={() => finish()}>
            {active && <form className="dw-config-source" onSubmit={event => {
                event.preventDefault();
                if (updated !== undefined) finish(true);
            }}>
                <label htmlFor={inputId}>Source for {active.subscription.input}</label>
                <input id={inputId} className="form-control font-monospace" autoFocus spellCheck={false}
                    value={active.value} aria-invalid={invalid || undefined} aria-describedby={`${inputId}-hint`}
                    onChange={event => setEdit({ ...active, value: event.target.value })} />
                <p id={`${inputId}-hint`} className="dw-meta mb-0">
                    {invalid && 'Enter a valid source. '}Use <code>node&gt;channel.parameter</code>. Use <code>@</code> for this node.
                </p>
                <div className="dw-toolbar">
                    <button type="submit" className="btn btn-primary" disabled={updated === undefined}>Update draft</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => finish()}>Cancel</button>
                </div>
            </form>}
        </SettingsDialog>
    </section>;
}
