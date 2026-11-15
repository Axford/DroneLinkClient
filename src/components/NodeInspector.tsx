import React, { createContext, useContext, useId, useState } from 'react';
import { Nav, Tab } from 'react-bootstrap';
import { ArrowsFullscreen, LayoutSidebarReverse, DashLg } from 'react-bootstrap-icons';
import { useFloatingInspectorMotion } from './ui/useFloatingInspectorMotion';
import IconButton from './ui/IconButton';
import './InspectorPanel.css';

type InspectorView = 'modules' | 'files';
const inspectorSizes = [
    { id: 'full-window', label: 'Full-window inspector', Icon: ArrowsFullscreen },
    { id: 'normal', label: 'Normal inspector', Icon: LayoutSidebarReverse },
    { id: 'collapsed', label: 'Collapse inspector', Icon: DashLg },
] as const;
export type InspectorSize = typeof inspectorSizes[number]['id'];
export const InspectorSizePreference = createContext<[InspectorSize, (size: InspectorSize) => void] | null>(null);

export interface InspectorSource {
    label: 'Local' | 'Cloud';
    transport?: string;
    lastSeen?: boolean;
}

export default function NodeInspector({ selected, identity, actions, context, moduleActions, modules, files, filesAvailable = true, focusTracking }: {
    selected: boolean;
    identity?: { id: number; name?: string; source: InspectorSource };
    moduleActions?: React.ReactNode;
    actions?: React.ReactNode;
    context?: React.ReactNode;
    modules: React.ReactNode;
    files?: React.ReactNode;
    filesAvailable?: boolean;
    focusTracking?: React.HTMLAttributes<HTMLElement> & { ref: React.RefObject<HTMLElement | null> };
}) {
    const id = useId();
    const [view, setView] = useState<InspectorView>('modules');
    const standaloneSize = useState<InspectorSize>('collapsed');
    const [size, setSize] = useContext(InspectorSizePreference) ?? standaloneSize;
    const collapsed = size === 'collapsed';
    const active = files && filesAvailable ? view : 'modules';
    const motion = useFloatingInspectorMotion(size, active);
    const name = identity?.name?.trim();
    return <section aria-label="Node Inspector" className="inspector-panel text-white" data-size={size} {...focusTracking} ref={element => {
        motion.ref.current = element;
        if (focusTracking) focusTracking.ref.current = element;
    }}>
        <header className="inspector-header">
            {identity && !collapsed && <div className="dw-inspector-identity">
                <h2 className="dw-inspector-heading">{name ? <>
                    {identity.id} <span className="dw-inspector-title-arrow" aria-hidden="true">▶</span> {name}
                </> : `Node ${identity.id}`}</h2>
                <div className="dw-inspector-source">
                    {[identity.source.label, identity.source.transport, identity.source.lastSeen && 'Last seen'].filter(Boolean).join(' · ')}
                </div>
            </div>}
            {context && <div className="dw-inspector-context" hidden={collapsed}>{context}</div>}
            {actions && <div hidden={collapsed}>{actions}</div>}
            <div className="dw-inspector-size" role="group" aria-label="Inspector size">
                {inspectorSizes.map(({ id, label, Icon }) =>
                    <IconButton key={id} type="button" label={label} icon={<Icon aria-hidden="true" />}
                        aria-pressed={size === id} onClick={() => { if (size !== id) { motion.begin(id); setSize(id); } }} />)}
            </div>
        </header>
        {selected || files ? <Tab.Container id={id} activeKey={active} onSelect={key => setView(key === 'files' ? 'files' : 'modules')} transition={false}>
            <div className="dw-workspace-tabs dw-inspector-tab-strip">
                <Nav variant="tabs" role="tablist" aria-label="Node views" className="dw-workspace-tabs">
                    <Nav.Item><Nav.Link as="button" type="button" eventKey="modules">Modules</Nav.Link></Nav.Item>
                    {files && filesAvailable && <Nav.Item><Nav.Link as="button" type="button" eventKey="files">Files</Nav.Link></Nav.Item>}
                </Nav>
                {active === 'modules' && moduleActions && <div className="dw-inspector-module-actions" role="group" aria-label="Module list controls">{moduleActions}</div>}
            </div>
            <Tab.Content>
                <Tab.Pane eventKey="modules">{modules}</Tab.Pane>
                {files && <Tab.Pane eventKey="files" mountOnEnter>{files}</Tab.Pane>}
            </Tab.Content>
        </Tab.Container> : <div className="inspector-content">{modules}</div>}
    </section>;
}
