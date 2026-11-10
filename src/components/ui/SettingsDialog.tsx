import React from 'react';
import { Modal } from 'react-bootstrap';
export interface SettingsDialogProps {
  title: string;
  show: boolean;
  onHide: () => void;
  children: React.ReactNode;
}
/** A single dark, scrollable, keyboard/focus-managed dialog across surfaces. */
export default function SettingsDialog({ title, show, onHide, children }: SettingsDialogProps) {
  return <Modal data-bs-theme="dark" show={show} onHide={onHide} size="lg" scrollable aria-label={title}>
    <Modal.Header closeButton closeLabel={`Close ${title}`}><Modal.Title>{title}</Modal.Title></Modal.Header>
    <Modal.Body>{children}</Modal.Body>
  </Modal>;
}
