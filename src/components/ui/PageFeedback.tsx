import React from 'react';
import { Alert, Spinner } from 'react-bootstrap';
export interface PageFeedbackProps { loading?: boolean; message: string; children?: React.ReactNode }
export default function PageFeedback({ loading = false, message, children }: PageFeedbackProps) {
  return <div className="dw-feedback"><div className="dw-feedback-content">
    {loading ? <div role="status"><Spinner animation="border" size="sm" className="me-2" />{message}</div> : <Alert variant="danger">{message}</Alert>}
    {children}
  </div></div>;
}
