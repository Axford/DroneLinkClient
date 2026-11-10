import React from 'react';
import { Button, ButtonProps } from 'react-bootstrap';
export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  label: string;
  icon: React.ReactNode;
}
/** Every icon action carries a keyboard-accessible name and hover explanation. */
export default function IconButton({ label, icon, className = '', ...props }: IconButtonProps) {
  return <Button variant="outline-secondary" {...props} className={`dw-icon-button ${className}`} aria-label={label} title={label}>{icon}</Button>;
}
