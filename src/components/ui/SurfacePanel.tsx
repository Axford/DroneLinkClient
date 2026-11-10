import React from 'react';
export interface SurfacePanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}
/** Related content is grouped by a shared surface tone and spacing, not outlines. */
export default function SurfacePanel({ title, children, className = '' }: SurfacePanelProps) {
  return <section className={`dw-panel ${className}`}>
    {title && <h3 className="dw-panel-title">{title}</h3>}
    {children}
  </section>;
}
