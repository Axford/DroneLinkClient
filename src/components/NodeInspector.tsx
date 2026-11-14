import React, { useId, useState } from 'react';
import { Nav, Tab } from 'react-bootstrap';
import { ArrowsFullscreen, LayoutSidebarReverse, DashLg } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import './InspectorPanel.css';

type InspectorView = 'modules' | 'files';
const inspectorSizes = [
    { id: 'full-window', label: 'Full-window inspector', Icon: ArrowsFullscreen },
    { id: 'normal', label: 'Normal inspector', Icon: LayoutSidebarReverse },
    { id: 'collapsed', label: 'Collapse inspector', Icon: DashLg },
] as const;
type InspectorSize = typeof inspectorSizes[number]['id'];

export default function NodeInspector({ selected, heading, actions, context, moduleActions, modules, files, filesAvailable = true, focusTracking }: {
    selected: boolean;
    heading?: React.ReactNode;
    moduleActions?: React.ReactNode;
    actions?: React.ReactNode;
    context?: React.ReactNode;
    modules: React.ReactNode;
    files?: React.ReactNode;
    filesAvailable?: boolean;
    focusTracking?: React.HTMLAttributes<HTMLDivElement>;
}) {
    const id = useId();
    const [view, setView] = useState<InspectorView>('modules');
    const [size, setSize] = useState<InspectorSize>('normal');
    const collapsed = size === 'collapsed';
    const active = files && filesAvailable ? view : 'modules';
    return <section aria-label="Node Inspector" className="inspector-panel text-white" data-size={size} {...focusTracking}>
        <header className="inspector-header">
            {heading && !collapsed && <h2 className="dw-inspector-heading">{heading}</h2>}
            {context && <div className="dw-inspector-context" hidden={collapsed}>{context}</div>}
            {actions && <div hidden={collapsed}>{actions}</div>}
            <div className="dw-inspector-size" role="group" aria-label="Inspector size">
                {inspectorSizes.map(({ id, label, Icon }) =>
                    <IconButton key={id} type="button" label={label} icon={<Icon aria-hidden="true" />}
                        aria-pressed={size === id} onClick={() => setSize(id)} />)}
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
