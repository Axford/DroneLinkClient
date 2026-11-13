import React, { createContext, useContext, useState } from 'react';
import { Form } from 'react-bootstrap';
import { Gear } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';

const Context = createContext<{
  showPreviousRadius: (node: number) => boolean;
  setPreviousRadius: (node: number, visible: boolean) => void;
} | null>(null);

export function NodeMapSettingsProvider({ domainId, userId, children }: React.PropsWithChildren<{domainId: string; userId: string}>) {
  const storageKey = `dronewright:previous-waypoint-radii:${JSON.stringify([userId, domainId])}`;
  const [visible, setVisible] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) return saved.filter(value => Number.isInteger(value) && value >= 1 && value <= 254);
    } catch { /* Browser storage is optional. */ }
    return [];
  });
  const showPreviousRadius = React.useCallback((node: number) => visible.includes(node), [visible]);
  const setPreviousRadius = (node: number, show: boolean) => {
    const next = show ? [...visible.filter(value => value !== node), node] : visible.filter(value => value !== node);
    setVisible(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the session preference. */ }
  };
  return <Context.Provider value={{ showPreviousRadius, setPreviousRadius }}>{children}</Context.Provider>;
}

export function useNodeMapSettings() {
  return useContext(Context);
}

export function NodeMapSettings({ nodeId }: {nodeId: number}) {
  const settings = useNodeMapSettings();
  const [open, setOpen] = useState(false);
  if (!settings) return null;
  return <>
    <IconButton label="Node settings" icon={<Gear />} data-inspector-focus="node-settings" onClick={() => setOpen(true)} />
    <SettingsDialog title={`Node ${nodeId} settings`} show={open} onHide={() => setOpen(false)} compact>
      <Form.Check id={`previous-waypoint-radius-${nodeId}`} label="Show previous waypoint radius" checked={settings.showPreviousRadius(nodeId)}
        onChange={event => settings.setPreviousRadius(nodeId, event.currentTarget.checked)} />
    </SettingsDialog>
  </>;
}
