import React, { cloneElement, useId } from 'react';
export interface DangerActionProps {
  label: string;
  warning: string;
  compact?: boolean;
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
}
/** An impact warning stays visible and is announced with its dangerous control. */
export default function DangerAction({ label, warning, compact = false, children }: DangerActionProps) {
  const warningId = useId();
  return <section role="group" aria-label={label} className={`dw-danger-action ${compact ? 'dw-danger-action-compact' : ''}`}>
    <div className="dw-danger-copy">{!compact && <strong>{label}</strong>}<p id={warningId} className="dw-danger-warning">{warning}</p></div>
    {cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], warningId].filter(Boolean).join(' ') })}
  </section>;
}
