import React, { useContext } from 'react';
import { MotionExiting } from './CardMotion';
import { Modal } from 'react-bootstrap';
export interface SettingsDialogProps {
  title: string;
  show: boolean;
  onHide: () => void;
  children: React.ReactNode;
  compact?: boolean;
}
/** A single dark, scrollable, keyboard/focus-managed dialog across surfaces. */
export default function SettingsDialog({ title, show, onHide, children, compact = false }: SettingsDialogProps) {
  const exiting = useContext(MotionExiting);
  return <Modal className="dw-modal" backdropClassName="dw-modal-backdrop" data-bs-theme="dark" show={show && !exiting} animation={!exiting} onHide={onHide} size={compact ? undefined : 'lg'} scrollable aria-label={title}>
    <Modal.Header closeButton closeLabel={`Close ${title}`}><Modal.Title>{title}</Modal.Title></Modal.Header>
    <Modal.Body>{children}</Modal.Body>
  </Modal>;
}
