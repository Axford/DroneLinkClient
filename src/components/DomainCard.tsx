import React, { useState } from 'react';
import { Card, Button, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { Domain } from '../App';
import { authenticatedFetchJson } from '../utils/api';
export default function DomainCard({ domain }: { domain: Domain }) {
  const [count, setCount] = useState<string>('Count retained packets');
  const load = async () => { try { const value = await authenticatedFetchJson(`/api/domains/${domain._id}/packet-count`); setCount(`${value.data.retainedPacketCount} retained packets · Refresh`); } catch { setCount('Retry packet count'); } };
  return <Card className="h-100 shadow-sm"><Card.Body><Card.Title><Link to={`/private/domain/${domain._id}`}>{domain.name}</Link></Card.Title>
    <Badge bg="secondary">{domain.myRole || 'Platform Admin'}</Badge> <Badge bg={domain.status === 'archived' ? 'warning' : 'success'}>{domain.status}</Badge>
    <p className="mt-3"><small>Domain {domain._id}</small></p><Button variant="link" onClick={load}>{count}</Button>
    <p className="mb-0"><Link to={`/private/domain/${domain._id}`}>Open map, inspector and collaboration</Link></p>
  </Card.Body></Card>;
}
