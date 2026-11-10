import React, { useState } from 'react';
import { Container, Alert, Row, Col, Nav } from 'react-bootstrap';
import { Domain, User } from './App';
import DomainModal from './DomainModal';
import DomainCard from './components/DomainCard';
import IconButton from './components/ui/IconButton';
import { Plus, ChevronLeft, ChevronRight } from 'react-bootstrap-icons';
interface HomePageProps {
  user: User; onRefresh: () => Promise<void>; domains: Domain[]; onDomainUpdate: (domain: Domain) => void; onDomainDelete: (id: string) => void;
  pagination: { limit: number; nextCursor: string | null; hasPrev: boolean };
  onPageChange: (direction: 'next' | 'previous' | 'reset') => void; loading: boolean;
  canCreate: boolean; status: 'active' | 'archived'; onStatusChange: (status: 'active' | 'archived') => void;
}
export default function HomePage({ user, onRefresh, domains, onDomainUpdate, pagination, onPageChange, loading, canCreate, status, onStatusChange }: HomePageProps) {
  const [creating, setCreating] = useState(false);
  return <Container fluid className="p-0 domain-home">
    <div className="d-flex align-items-center justify-content-between gap-3 mb-4">
      <h2 className="mb-0">Domains</h2>
      {canCreate && <IconButton label="New Domain" variant="primary" icon={<Plus />} onClick={() => setCreating(true)} />}
    </div>
    <Nav variant="tabs" role="tablist" aria-label="Domain status" activeKey={status} onSelect={key => { if (key === 'active' || key === 'archived') onStatusChange(key); }} className="mb-4">
      <Nav.Item><Nav.Link as="button" eventKey="active" role="tab" id="domain-tab-active" aria-controls="domain-list" aria-selected={status === 'active'}>Active domains</Nav.Link></Nav.Item>
      <Nav.Item><Nav.Link as="button" eventKey="archived" role="tab" id="domain-tab-archived" aria-controls="domain-list" aria-selected={status === 'archived'}>Archived domains</Nav.Link></Nav.Item>
    </Nav>
    <div id="domain-list" role="tabpanel" aria-labelledby={`domain-tab-${status}`}>
    {loading ? <p>Loading domains…</p> : domains.length ? <Row>{domains.map(domain => <Col md={6} xl={4} key={domain._id} className="mb-3"><DomainCard domain={domain} user={user} onRefresh={onRefresh} /></Col>)}</Row> : <Alert variant="info">{status === 'archived' ? 'No archived domains.' : 'No domains yet. Accept an invitation to join a domain.'}</Alert>}
    <div className="d-flex gap-2"><IconButton label="Previous" icon={<ChevronLeft />} disabled={!pagination.hasPrev} onClick={() => onPageChange('previous')} /><IconButton label="Next" icon={<ChevronRight />} disabled={!pagination.nextCursor} onClick={() => onPageChange('next')} /></div>
    </div>
    <DomainModal show={creating} handleClose={() => setCreating(false)} handleSave={onDomainUpdate} domain={null} />
  </Container>;
}
