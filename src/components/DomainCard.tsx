import React, { useEffect, useState } from 'react';
import { Alert, Card, Button, Badge } from 'react-bootstrap';
import { ArrowClockwise } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { Domain, User } from '../App';
import { authenticatedFetchJson } from '../utils/api';
import DomainCollaboration from './DomainCollaboration';

interface DomainCounts { users: number; drones: number; nodes: number }

export default function DomainCard({ domain, user, onRefresh, onExpansionChange }: { domain: Domain; user: User; onRefresh: () => Promise<void>; onExpansionChange: (expanded: boolean) => void }) {
  const [counts, setCounts] = useState<DomainCounts | null>(null);
  const [countsError, setCountsError] = useState(false);
  const [reload, setReload] = useState(0);
  const [packets, setPackets] = useState<string>('Count retained packets');
  useEffect(() => {
    const controller = new AbortController();
    setCounts(null); setCountsError(false);
    const root = `/api/domains/${domain._id}`;
    const memberCount = async () => {
      let total = 0; let cursor: string | null = null;
      do {
        const result: { data: unknown[]; pagination: { nextCursor: string | null } } = await authenticatedFetchJson(`${root}/members?limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { signal: controller.signal });
        total += result.data.length; cursor = result.pagination.nextCursor;
      } while (cursor && !controller.signal.aborted);
      return total;
    };
    void Promise.all([memberCount(), authenticatedFetchJson(root + '/identities', { signal: controller.signal })])
      .then(([users, identities]) => { if (!controller.signal.aborted) setCounts({ users, drones: identities.data.drones.length, nodes: identities.data.nodes.length }); })
      .catch(() => { if (!controller.signal.aborted) setCountsError(true); });
    return () => controller.abort();
  }, [domain._id, domain.revision, domain.myRole, domain.status, reload]);
  const loadPackets = async () => {
    try { const value = await authenticatedFetchJson(`/api/domains/${domain._id}/packet-count`); setPackets(`${value.data.retainedPacketCount} retained packets · Refresh`); }
    catch { setPackets('Retry packet count'); }
  };
  return <Card className="shadow-sm"><Card.Body>
    <div className="d-flex align-items-start justify-content-between gap-3">
      <Card.Title className="domain-card-title mb-0"><Link to={`/private/domain/${domain._id}`}>{domain.name}</Link></Card.Title>
      <div className="d-flex flex-wrap justify-content-end gap-1 flex-shrink-0" aria-label="Domain role and status">
        <Badge bg="secondary">{domain.myRole || 'Platform Admin'}</Badge>
        <Badge bg={domain.status === 'archived' ? 'warning' : 'success'}>{domain.status}</Badge>
      </div>
    </div>
    <div className="d-flex align-items-center flex-wrap gap-3 mt-3" aria-label="Domain totals">
      <div><strong>{counts?.users ?? '—'}</strong> {counts?.users === 1 ? 'user' : 'users'}</div>
      <div><strong>{counts?.drones ?? '—'}</strong> {counts?.drones === 1 ? 'Drone' : 'Drones'}</div>
      <div><strong>{counts?.nodes ?? '—'}</strong> {counts?.nodes === 1 ? 'node' : 'nodes'}</div>
      <Button variant="link" size="sm" className="ms-auto p-1" aria-label="Refresh totals" title="Refresh totals" onClick={() => setReload(value => value + 1)}><ArrowClockwise size={18} aria-hidden="true" /></Button>
    </div>
    <small className="text-muted">Accepted members and retained device identities</small>
    {countsError && <Alert variant="warning" className="mt-2">Domain totals unavailable.</Alert>}
    <div className="mt-1 mb-3"><Button variant="link" size="sm" className="p-0" onClick={loadPackets}>{packets}</Button></div>
    <p className="text-muted"><small>Domain {domain._id}</small></p>
    <DomainCollaboration key={`${domain._id}:${domain.myRole}:${domain.status}`} domain={domain} user={user} onRefresh={onRefresh} onExpansionChange={onExpansionChange} />
  </Card.Body></Card>;
}
