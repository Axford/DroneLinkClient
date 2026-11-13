import React, { useId, useState } from 'react';
import { Tab, Tabs } from 'react-bootstrap';
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

export default function NodeInspector({ selected, actions, context, modules, files, filesAvailable = true, focusTracking }: {
    selected: boolean;
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
            {context && <div className="dw-inspector-context" hidden={collapsed}>{context}</div>}
            {actions && <div hidden={collapsed}>{actions}</div>}
            <div className="dw-inspector-size" role="group" aria-label="Inspector size">
                {inspectorSizes.map(({ id, label, Icon }) =>
                    <IconButton key={id} type="button" label={label} icon={<Icon aria-hidden="true" />}
                        aria-pressed={size === id} onClick={() => setSize(id)} />)}
            </div>
        </header>
        {selected || files ? <Tabs id={id} activeKey={active} onSelect={key => setView(key === 'files' ? 'files' : 'modules')}
            transition={false} className="dw-inspector-tabs" aria-label="Node views">
            <Tab eventKey="modules" title="Modules">{modules}</Tab>
            {files && <Tab eventKey="files" title={filesAvailable ? 'Files' : null} mountOnEnter>{files}</Tab>}
        </Tabs> : <div className="inspector-content">{modules}</div>}
    </section>;
}
