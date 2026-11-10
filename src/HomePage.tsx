import React, { useState } from 'react';
import { Container, Button, Alert, Row, Col, Nav } from 'react-bootstrap';
import { Domain, User } from './App';
import DomainModal from './DomainModal';
import DomainCard from './components/DomainCard';
interface HomePageProps {
  user: User; onRefresh: () => Promise<void>; domains: Domain[]; onDomainUpdate: (domain: Domain) => void; onDomainDelete: (id: string) => void;
  pagination: { limit: number; nextCursor: string | null; hasPrev: boolean };
  onPageChange: (direction: 'next' | 'previous' | 'reset') => void; loading: boolean;
  canCreate: boolean; status: 'active' | 'archived'; onStatusChange: (status: 'active' | 'archived') => void;
}
export default function HomePage({ user, onRefresh, domains, onDomainUpdate, pagination, onPageChange, loading, canCreate, status, onStatusChange }: HomePageProps) {
  const [creating, setCreating] = useState(false);
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  return <Container fluid className="p-4 domain-home">
    <div className="d-flex align-items-center justify-content-between gap-3 mb-4">
      <h2 className="mb-0">Domains</h2>
      {canCreate && <Button onClick={() => setCreating(true)}>New Domain</Button>}
    </div>
    <Nav variant="tabs" role="tablist" aria-label="Domain status" activeKey={status} onSelect={key => { if (key === 'active' || key === 'archived') onStatusChange(key); }} className="mb-4">
      <Nav.Item><Nav.Link as="button" eventKey="active" role="tab" id="domain-tab-active" aria-controls="domain-list" aria-selected={status === 'active'}>Active domains</Nav.Link></Nav.Item>
      <Nav.Item><Nav.Link as="button" eventKey="archived" role="tab" id="domain-tab-archived" aria-controls="domain-list" aria-selected={status === 'archived'}>Archived domains</Nav.Link></Nav.Item>
    </Nav>
    <div id="domain-list" role="tabpanel" aria-labelledby={`domain-tab-${status}`}>
    {loading ? <p>Loading domains…</p> : domains.length ? <Row>{domains.map(domain => <Col md={expandedDomains[domain._id] ? 12 : 6} lg={expandedDomains[domain._id] ? 12 : 4} key={domain._id} className="mb-3"><DomainCard domain={domain} user={user} onRefresh={onRefresh} onExpansionChange={expanded => setExpandedDomains(previous => ({ ...previous, [domain._id]: expanded }))} /></Col>)}</Row> : <Alert variant="info">{status === 'archived' ? 'No archived domains.' : 'No domains yet. Accept an invitation to join a domain.'}</Alert>}
    <div className="d-flex gap-2"><Button disabled={!pagination.hasPrev} onClick={() => onPageChange('previous')}>Previous</Button><Button disabled={!pagination.nextCursor} onClick={() => onPageChange('next')}>Next</Button></div>
    </div>
    <DomainModal show={creating} handleClose={() => setCreating(false)} handleSave={onDomainUpdate} domain={null} />
  </Container>;
}
