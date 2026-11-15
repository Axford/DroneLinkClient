import { useState } from 'react';

export default function ConfigurationParameterInput({ value, placeholder, hint, label, disabled, onCommit }: {
    value: string;
    placeholder?: string;
    hint?: string;
    label: string;
    disabled?: boolean;
    onCommit: (value: string) => boolean;
}) {
    const [edit, setEdit] = useState<{ original: string; pending: string; invalid?: boolean }>();
    const active = edit?.original === value ? edit : undefined;

    function commit() {
        if (!active) return;
        if (active.pending === value || onCommit(active.pending)) setEdit(undefined);
        else setEdit({ ...active, invalid: true });
    }

    return <input type="text" className="form-control form-control-sm font-monospace nodrag nopan"
        aria-label={label} aria-invalid={active?.invalid || undefined}
        title={active?.invalid ? 'Invalid value or ambiguous declaration. Review the setting in Code.' : hint}
        placeholder={placeholder} value={active?.pending ?? value} readOnly={disabled} spellCheck={false}
        onChange={event => setEdit({ original: value, pending: event.target.value })}
        onBlur={commit}
        onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            event.stopPropagation();
            event.preventDefault();
            if (event.key === 'Enter') commit();
            else setEdit(undefined);
        }} />;
}
