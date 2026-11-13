import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import NodeInspector from './NodeInspector';

function Draft() {
    const [text, setText] = useState('');
    return <textarea aria-label="File draft" value={text} onChange={event => setText(event.target.value)} />;
}

test('Inspector size is independent of the active tab and preserves the file draft', () => {
    render(<NodeInspector selected modules={<p>Module readings</p>} files={<Draft />} />);
    const inspector = screen.getByRole('region', { name: 'Node Inspector' });
    const controls = within(screen.getByRole('group', { name: 'Inspector size' }));
    const full = controls.getByRole('button', { name: 'Full-window inspector' });
    const normal = controls.getByRole('button', { name: 'Normal inspector' });
    const collapse = controls.getByRole('button', { name: 'Collapse inspector' });
    const files = screen.getByRole('tab', { name: 'Files' });
    const modules = screen.getByRole('tab', { name: 'Modules' });

    expect(normal).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(files);
    expect(inspector).toHaveAttribute('data-size', 'normal');
    fireEvent.change(screen.getByRole('textbox', { name: 'File draft' }), { target: { value: 'Unsaved edit' } });

    fireEvent.click(full);
    expect(inspector).toHaveAttribute('data-size', 'full-window');
    fireEvent.click(modules);
    expect(full).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(files);
    fireEvent.click(collapse);
    expect(inspector).toHaveAttribute('data-size', 'collapsed');
    fireEvent.click(normal);
    expect(files).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'File draft' })).toHaveValue('Unsaved edit');
});
