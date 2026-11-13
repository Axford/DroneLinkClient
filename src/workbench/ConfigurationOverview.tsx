import React, { Suspense, useCallback, useId, useState } from 'react';
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
    const [edit, setEdit] = useState<{ subscription: Subscription; text: string; value: string }>();
    const active = edit?.text === text ? edit : undefined;
    const updated = active && updateSubscriptionSource(text, active.subscription, active.value);
    const invalid = !!active && active.value.trim() !== active.subscription.source && updated === undefined;

    const selectInput = useCallback((module: Module, subscription: Subscription) => {
        onSelect(module.channel);
        if (editable) setEdit({ subscription, text, value: subscription.source });
        else document.getElementById(`${inputId}-line-${subscription.line}`)?.focus();
    }, [editable, inputId, onSelect, text]);

    function finish(apply = false) {
        if (apply && updated !== undefined) onChange(updated);
        setEdit(undefined);
        if (active) document.getElementById(`${inputId}-edit-${active.subscription.line}`)?.focus();
    }

    return <section className="dw-config-overview" aria-label="Modules and subscriptions">
        <p className="dw-meta">From the draft. Local matches show modules declared in this file; parameter names, remote sources and live bindings are unverified. Correct malformed lines in the text editor.</p>
        <Suspense fallback={<p role="status">Loading subscription graph…</p>}>
            <ConfigurationGraph modules={overview.modules} selected={selectedChannel} onSelect={onSelect} onInput={selectInput} />
        </Suspense>
        {selectedDetails}
        <ul className="list-unstyled">
            {overview.modules.map(module => <li key={module.channel} className="dw-config-module" data-selected={module.channel === selectedChannel}>
                <button type="button" className="btn btn-link p-0 text-start" onClick={() => { onSelect(module.channel); goToLine(module.line); }}>
                    {module.type}{module.name && ` · ${module.name}`} · Channel {module.channel}
                </button>
                {!module.subscriptions.length && <p className="dw-meta mb-0">No subscriptions declared.</p>}
                {module.subscriptions.length > 0 && <ul className="list-unstyled mb-0">
                    {module.subscriptions.map(subscription => <li key={subscription.line} className="dw-config-subscription">
                        <div className="dw-toolbar">
                            <button type="button" className="btn btn-link p-0 text-start" id={`${inputId}-line-${subscription.line}`} onClick={() => { onSelect(module.channel); goToLine(subscription.line); }}>
                                Line {subscription.line}: {subscription.input}
                            </button>
                            <code>{subscription.source}</code>
                            <span className="dw-meta">{subscription.resolution}</span>
                            {editable && <button type="button" id={`${inputId}-edit-${subscription.line}`}
                                className="btn btn-outline-secondary" aria-expanded={active?.subscription === subscription} aria-label={`Edit source for ${subscription.input} on channel ${module.channel}`}
                                onClick={() => selectInput(module, subscription)}>Edit source</button>}
                        </div>
                        {active && active.subscription === subscription && editable && <div className="dw-config-source">
                            <label htmlFor={inputId}>Source for {subscription.input}</label>
                            <input id={inputId} className="form-control font-monospace" autoFocus spellCheck={false}
                                value={active.value} aria-invalid={invalid || undefined} aria-describedby={`${inputId}-hint`} onChange={event => setEdit({ ...active, value: event.target.value })}
                                onKeyDown={event => {
                                    if (event.key === 'Escape') finish();
                                    if (event.key === 'Enter' && updated !== undefined) {
                                        event.preventDefault();
                                        finish(true);
                                    }
                                }} />
                            <p id={`${inputId}-hint`} className="dw-meta mb-0">
                                {invalid && 'Enter a valid source. '}Use <code>node&gt;channel.parameter</code>. Use <code>@</code> for this node.
                            </p>
                            <div className="dw-toolbar">
                                <button type="button" className="btn btn-outline-secondary" disabled={updated === undefined}
                                    onClick={() => finish(true)}>Update draft</button>
                                <button type="button" className="btn btn-outline-secondary" onClick={() => finish()}>Cancel</button>
                            </div>
                        </div>}
                    </li>)}
                </ul>}
            </li>)}
        </ul>
    </section>;
}
