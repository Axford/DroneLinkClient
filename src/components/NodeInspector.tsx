import React, { useId, useState } from 'react';
import { Tab, Tabs } from 'react-bootstrap';
import './InspectorPanel.css';

type InspectorView = 'modules' | 'files';

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
    const active = files && filesAvailable ? view : 'modules';
    return <section aria-label="Node Inspector" className="inspector-panel text-white" {...focusTracking}>
        <header className="inspector-header"><h2>Inspector</h2>{actions}</header>
        {context && <div className="dw-inspector-context">{context}</div>}
        {selected ? <Tabs id={id} activeKey={active} onSelect={key => setView(key === 'files' ? 'files' : 'modules')}
            transition={false} className="dw-inspector-tabs" aria-label="Node views">
            <Tab eventKey="modules" title="Modules">{modules}</Tab>
            {files && <Tab eventKey="files" title={filesAvailable ? 'Files' : null} mountOnEnter>{files}</Tab>}
        </Tabs> : <div className="inspector-content">{modules}</div>}
    </section>;
}
