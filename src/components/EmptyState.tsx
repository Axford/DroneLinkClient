import React from 'react';
import { Container, Row, Col, Button } from 'react-bootstrap';
import { PlusCircle, Folder } from 'react-bootstrap-icons';

interface EmptyStateProps {
    title: string;
    description: string;
    actionText: string;
    onAction: () => void;
    icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    actionText,
    onAction,
    icon
}) => {
    return (
        <Container className="text-center py-5">
            <Row className="justify-content-center">
                <Col md={6}>
                    <div className="mb-4">
                        {icon || <Folder size={64} className="text-muted mb-3" />}
                    </div>
                    <h3 className="text-muted mb-3">{title}</h3>
                    <p className="text-muted mb-4">{description}</p>
                    <Button 
                        variant="primary" 
                        onClick={onAction}
                        className="d-flex align-items-center justify-content-center mx-auto"
                        style={{ width: 'fit-content' }}
                    >
                        <PlusCircle className="me-2" />
                        {actionText}
                    </Button>
                </Col>
            </Row>
        </Container>
    );
};

export default EmptyState;