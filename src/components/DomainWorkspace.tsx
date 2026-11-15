import { FloatingInspector } from './ui/useFloatingInspectorMotion';
import React, { useId, useRef, useState } from 'react';
import { InspectorSizePreference, type InspectorSize } from './NodeInspector';
import { Dropdown } from 'react-bootstrap';
import { ChevronDown } from 'react-bootstrap-icons';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import useNarrowLayout from './ui/useNarrowLayout';
import { useCompactPortraitNav } from '../PrimaryNavBar';

const lenses = [{ id: 'map', label: 'Map' }, { id: 'network', label: 'Network' }] as const;
export type DomainLens = typeof lenses[number]['id'];

export function DomainWorkspace({ name, status, notices, activeLens, onLensChange, lensAction, children }: {
    name: string;
    status?: React.ReactNode;
    notices?: React.ReactNode;
    lensAction?: React.ReactNode;
    activeLens?: DomainLens;
    onLensChange: (id: DomainLens) => void;
    children: React.ReactNode;
}) {
    const titleInNav = useCompactPortraitNav();
    return <div className="dw-operations">
        {!titleInNav && <header className="dw-operations-header"><h1>{name}</h1></header>}
        {notices}
        <nav className="nav nav-tabs dw-workspace-tabs" aria-label="Domain lenses">
            {lenses.map(({ id, label }) => <button key={id} type="button" className={id === activeLens ? 'nav-link active' : 'nav-link'} aria-current={id === activeLens ? 'page' : undefined}
                onClick={() => onLensChange(id)}>{label}</button>)}
            {lensAction}
            {status && <div className="dw-lens-status">{status}</div>}
        </nav>
        <div className="dw-operation-panels">{children}</div>
    </div>;
}

export function WorkspaceStatus({ label, shortLabel, warning = false, children }: {
    label: string;
    shortLabel?: string;
    warning?: boolean;
    children?: React.ReactNode;
}) {
    const id = useId();
    const toggle = useRef<HTMLButtonElement>(null);
    const className = `dw-workspace-status${warning ? ' dw-workspace-status-warning' : ''}`;
    const text = shortLabel ? <>
        <span className="dw-status-full">{label}</span>
        <span className="dw-status-short" aria-hidden="true">{shortLabel}</span>
    </> : label;
    if (!children) return <span role="status" aria-label={label} className={className}>{text}</span>;
    return <Dropdown align="end" onSelect={() => toggle.current?.focus()}>
        <Dropdown.Toggle ref={toggle} id={id} variant="secondary" className={className} aria-label={label}>
            {text}<ChevronDown className="dw-status-chevron" aria-hidden="true" />
        </Dropdown.Toggle>
        <span className="visually-hidden" role="status">{label}</span>
        <Dropdown.Menu className="dw-workspace-status-details">{children}</Dropdown.Menu>
    </Dropdown>;
}

export function DomainLensPanels({ lens, inspector, overMap = false }: {
    lens: React.ReactNode;
    inspector?: React.ReactNode;
    overMap?: boolean;
}) {
    const narrow = useNarrowLayout();
    const inspectorSize = useState<InspectorSize>('collapsed');
    if (!inspector) return <div className="dw-lens-only">{lens}</div>;
    return <PanelGroup className={`dw-lens-panels ${overMap ? 'dw-map-panels' : ''}`} direction={narrow ? 'vertical' : 'horizontal'}>
        <Panel style={overMap ? { overflow: 'visible' } : undefined} defaultSize={narrow ? 50 : 65} minSize={narrow ? 25 : 35}>{lens}</Panel>
        <PanelResizeHandle className={`dw-panel-resize ${narrow ? 'vertical' : ''}`} />
        <Panel defaultSize={narrow ? 50 : 35} minSize={25} maxSize={narrow ? 75 : 65}
            className={`dw-inspector-slot ${overMap ? 'dw-map-inspector-slot' : ''}`}>
            <div className="dw-inspector-frame"><FloatingInspector.Provider value={overMap}>
                <InspectorSizePreference.Provider value={inspectorSize}>{inspector}</InspectorSizePreference.Provider>
            </FloatingInspector.Provider></div>
        </Panel>
    </PanelGroup>;
}
