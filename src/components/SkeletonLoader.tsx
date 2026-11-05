import React from 'react';
import { Card, Col, Row, Placeholder } from 'react-bootstrap';

interface DomainCardSkeletonProps {
    count?: number;
}

export const DomainCardSkeleton: React.FC<DomainCardSkeletonProps> = ({ count = 6 }) => {
    return (
        <Row>
            {Array.from({ length: count }).map((_, index) => (
                <Col sm={12} md={6} lg={6} xl={4} key={index} className="mb-4">
                    <Card>
                        <Card.Body>
                            <Placeholder as={Card.Title} animation="glow">
                                <Placeholder xs={7} />
                            </Placeholder>
                            <Placeholder as={Card.Text} animation="glow">
                                <Placeholder xs={4} size="sm" className="mb-2" />
                                <Placeholder xs={6} size="sm" className="mb-2" />
                                <Placeholder xs={5} size="sm" />
                            </Placeholder>
                            <div className="d-flex justify-content-between align-items-center">
                                <Placeholder.Button variant="outline-secondary" xs={3} size="sm" />
                                <Placeholder.Button variant="secondary" xs={2} size="sm" />
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            ))}
        </Row>
    );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
    return (
        <div>
            {Array.from({ length: rows }).map((_, index) => (
                <div key={index} className="mb-3 p-3 border rounded">
                    <Placeholder as="div" animation="glow">
                        <Placeholder xs={3} className="me-3" />
                        <Placeholder xs={4} className="me-3" />
                        <Placeholder xs={2} />
                    </Placeholder>
                </div>
            ))}
        </div>
    );
};