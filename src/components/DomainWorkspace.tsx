import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import useNarrowLayout from './ui/useNarrowLayout';

export interface DomainLens {
    id: string;
    label: string;
}

export function DomainWorkspace({ name, status, notices, lenses, activeLens, onLensChange, children }: {
    name: string;
    status?: React.ReactNode;
    notices?: React.ReactNode;
    lenses: readonly DomainLens[];
    activeLens: string;
    onLensChange?: (id: string) => void;
    children: React.ReactNode;
}) {
    return <div className="dw-operations">
        <header className="dw-operations-header"><h1>{name}</h1>{status}</header>
        {notices}
        <nav className="dw-lens-nav" aria-label="Domain lenses">
            {lenses.map(({ id, label }) => <button key={id} type="button" aria-current={id === activeLens ? 'page' : undefined} aria-disabled={!onLensChange && id === activeLens ? true : undefined}
                onClick={() => onLensChange?.(id)}>{label}</button>)}
        </nav>
        <div className="dw-operation-panels">{children}</div>
    </div>;
}

export function DomainLensPanels({ lens, inspector, overMap = false }: {
    lens: React.ReactNode;
    inspector?: React.ReactNode;
    overMap?: boolean;
}) {
    const narrow = useNarrowLayout();
    if (!inspector) return <div className="dw-lens-only">{lens}</div>;
    return <PanelGroup className={`dw-lens-panels ${overMap ? 'dw-map-panels' : ''}`} direction={narrow ? 'vertical' : 'horizontal'}>
        <Panel style={overMap ? { overflow: 'visible' } : undefined} defaultSize={narrow ? 50 : 65} minSize={narrow ? 25 : 35}>{lens}</Panel>
        <PanelResizeHandle className={`dw-panel-resize ${narrow ? 'vertical' : ''}`} />
        <Panel defaultSize={narrow ? 50 : 35} minSize={25} maxSize={narrow ? 75 : 65}
            className={`dw-inspector-slot ${overMap ? 'dw-map-inspector-slot' : ''}`}>
            <div className="dw-inspector-frame">{inspector}</div>
        </Panel>
    </PanelGroup>;
}
