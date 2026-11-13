import React, { useId, useRef, useState } from 'react';
import type { ConfigurationOverview as Overview } from './nodeConfiguration';
import { updateSubscriptionSource } from './nodeConfiguration';

type Subscription = Overview['modules'][number]['subscriptions'][number];

export default function ConfigurationOverview({ overview, text, editable, onChange, goToLine }: {
    overview: Overview;
    text: string;
    editable: boolean;
    onChange: (draft: string) => void;
    goToLine: (line: number) => void;
}) {
    const inputId = useId();
    const editButton = useRef<HTMLButtonElement>(null);
    const [edit, setEdit] = useState<{ subscription: Subscription; text: string; value: string }>();
    const active = edit?.text === text ? edit : undefined;
    const updated = active && updateSubscriptionSource(text, active.subscription, active.value);
    const invalid = !!active && active.value.trim() !== active.subscription.source && updated === undefined;

    function finish(apply = false) {
        if (apply && updated !== undefined) onChange(updated);
        setEdit(undefined);
        editButton.current?.focus();
    }

    return <details className="dw-config-overview">
        <summary>Modules and subscriptions ({overview.modules.length} modules)</summary>
        <p className="dw-meta">From the draft. Local matches show modules declared in this file; parameter names, remote sources and live bindings are unverified. Correct malformed lines in the text editor.</p>
        {!overview.modules.length && <p>No valid module declarations in the draft.</p>}
        <ul className="list-unstyled">
            {overview.modules.map(module => <li key={module.channel} className="dw-config-module">
                <button type="button" className="btn btn-link p-0 text-start" onClick={() => goToLine(module.line)}>
                    {module.type}{module.name && ` · ${module.name}`} · Channel {module.channel}
                </button>
                {!module.subscriptions.length && <p className="dw-meta mb-0">No subscriptions declared.</p>}
                {module.subscriptions.length > 0 && <ul className="list-unstyled mb-0">
                    {module.subscriptions.map(subscription => <li key={subscription.line} className="dw-config-subscription">
                        <div className="dw-toolbar">
                            <button type="button" className="btn btn-link p-0 text-start" onClick={() => goToLine(subscription.line)}>
                                Line {subscription.line}: {subscription.input}
                            </button>
                            <code>{subscription.source}</code>
                            <span className="dw-meta">{subscription.resolution}</span>
                            {editable && <button type="button" ref={active?.subscription === subscription ? editButton : undefined}
                                className="btn btn-outline-secondary" aria-expanded={active?.subscription === subscription} aria-label={`Edit source for ${subscription.input} on channel ${module.channel}`}
                                onClick={() => setEdit({ subscription, text, value: subscription.source })}>Edit source</button>}
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
    </details>;
}
