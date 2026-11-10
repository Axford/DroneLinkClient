import React, { useEffect, useState } from 'react';
import { Alert, Card, Badge } from 'react-bootstrap';
import { ArrowClockwise } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { Domain, User } from '../App';
import { authenticatedFetchJson } from '../utils/api';
import IconButton from './ui/IconButton';
import DomainCollaboration from './DomainCollaboration';

interface DomainCounts { users: number; drones: number; nodes: number }

export default function DomainCard({ domain, user, onRefresh }: { domain: Domain; user: User; onRefresh: () => Promise<void> }) {
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
    <div className="dw-domain-header">
      <Card.Title className="domain-card-title mb-0"><Link to={`/private/domain/${domain._id}`}>{domain.name}</Link></Card.Title>
      <div className="dw-domain-badges" aria-label="Domain role and status">
        <Badge bg="secondary">{domain.myRole || 'Platform Admin'}</Badge>
        <Badge bg={domain.status === 'archived' ? 'warning' : 'success'}>{domain.status}</Badge>
      </div>
    </div>
    <div className="dw-domain-counts" aria-label="Domain totals">
      <div><strong>{counts?.users ?? '—'}</strong> {counts?.users === 1 ? 'user' : 'users'}</div>
      <div><strong>{counts?.drones ?? '—'}</strong> {counts?.drones === 1 ? 'Drone' : 'Drones'}</div>
      <div><strong>{counts?.nodes ?? '—'}</strong> {counts?.nodes === 1 ? 'node' : 'nodes'}</div>
      <IconButton label="Refresh totals" variant="link" className="dw-domain-actions" icon={<ArrowClockwise />} onClick={() => setReload(value => value + 1)} />
    </div>
    {countsError && <Alert variant="warning">Totals unavailable.</Alert>}
    <div className="dw-toolbar justify-content-end">
      <details className="dw-meta"><summary>Details</summary><p>Domain {domain._id}</p><p>Retained device identities · Accepted members</p><button className="btn btn-link p-0" onClick={loadPackets}>{packets}</button></details>
      <DomainCollaboration key={`${domain._id}:${domain.myRole}:${domain.status}`} domain={domain} user={user} onRefresh={onRefresh} />
    </div>
  </Card.Body></Card>;
}
