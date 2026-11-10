import React, { useEffect, useState } from 'react';
import { Domain, User } from '../App';
import { accessEvent, authenticatedFetchJson } from '../utils/api';
import PrimaryNavBar from '../PrimaryNavBar';

export interface WorkspaceShellProps {
  user: User;
  activeDomain?: Domain;
  shortcuts?: Domain[];
  children: React.ReactNode;
}
export default function WorkspaceShell({ user, activeDomain, shortcuts, children }: WorkspaceShellProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  useEffect(() => {
    if (shortcuts) { setDomains(shortcuts); return; }
    const controller = new AbortController(); let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      try {
        const rows: Domain[] = []; let cursor: string | null = null;
        do {
          const result: { data: Domain[]; pagination: { nextCursor: string | null } } = await authenticatedFetchJson(`/api/domains?status=active&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { signal: controller.signal });
          if (!Array.isArray(result.data)) return;
          rows.push(...result.data); cursor = result.pagination.nextCursor;
        } while (cursor && !controller.signal.aborted && current === generation);
        if (!controller.signal.aborted && current === generation) setDomains(rows);
      } catch { /* Existing workspace feedback owns access/network failures. */ }
    };
    const changed = () => { generation++; setDomains([]); void refresh(); };
    const timer = setInterval(() => { void refresh(); }, 15000);
    void refresh(); window.addEventListener('focus', changed); window.addEventListener(accessEvent, changed);
    return () => { generation++; clearInterval(timer); controller.abort(); window.removeEventListener('focus', changed); window.removeEventListener(accessEvent, changed); };
  }, [shortcuts]);
  return <div className="dw-workspace" data-bs-theme="dark">
    <PrimaryNavBar user={user} domains={domains} activeDomainId={activeDomain?._id} />
    <main className={`content-wrapper ${activeDomain ? 'workspace-operations' : ''}`}>{children}</main>
  </div>;
}
