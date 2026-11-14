import React, { useEffect, useState } from 'react';
import { Dropdown, Image, Nav } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { BoxArrowRight, Compass, HouseDoor, LayoutSidebar, List, PersonCircle, Tools } from 'react-bootstrap-icons';
import type { Domain, User } from './App';
import IconButton from './components/ui/IconButton';
import useMediaQuery from './components/ui/useMediaQuery';
import { logout } from './utils/api';
import './PrimaryNavBar.css';

interface PrimaryNavBarProps {
  user?: User;
  domains: Domain[];
  activeDomainId?: string;
  standalone?: boolean;
  workspaceTitle?: string;
}

const compactPortraitQuery = '(orientation: portrait) and (max-width: 480px)';
export const useCompactPortraitNav = () => useMediaQuery(compactPortraitQuery);

export default function PrimaryNavBar({ user, domains, activeDomainId, standalone = false, workspaceTitle }: PrimaryNavBarProps) {
  const portrait = useMediaQuery('(orientation: portrait)');
  const compact = useMediaQuery(`${compactPortraitQuery}, (orientation: landscape) and (max-height: 480px)`);
  const showWorkspaceTitle = compact && portrait && !!workspaceTitle;
  const [domainExpanded, setDomainExpanded] = useState(false);
  const [homeCollapsed, setHomeCollapsed] = useState(false);
  useEffect(() => setDomainExpanded(false), [activeDomainId]);

  const workspaceOpen = standalone || !!activeDomainId;
  const collapsed = workspaceOpen ? !domainExpanded : homeCollapsed;
  const showLabels = !compact && !portrait && !collapsed;
  const Destination = compact ? Dropdown.Item : Nav.Link;
  const destinations = <>
    {!standalone && <Destination as={Link} to="/private/" className="primary-nav-link" title="Home" aria-label="Home" aria-current={!activeDomainId ? 'page' : undefined}>
      <HouseDoor aria-hidden="true" /><span className="primary-nav-label">Home</span>
    </Destination>}
    <Destination href={standalone ? "/workbench/" : "http://localhost:8002/workbench/"} aria-current={standalone ? "page" : undefined} className="primary-nav-link primary-nav-workbench" title="Open local Workbench" aria-label="Workbench">
      <Tools aria-hidden="true" /><span className="primary-nav-label">Workbench</span>
    </Destination>
    {domains.filter(domain => domain.status === 'active').map(domain => (
      <Destination as={Link} key={domain._id} to={`/private/domain/${domain._id}`} className="primary-nav-link" title={domain.name} aria-label={`Open ${domain.name}`} aria-current={domain._id === activeDomainId ? 'page' : undefined}>
        <Compass aria-hidden="true" /><span className="primary-nav-label">{domain.name}</span>
      </Destination>
    ))}
  </>;

  return <nav className={`primary-nav-bar${showLabels ? ' primary-nav-bar-expanded' : ''}${showWorkspaceTitle ? ' primary-nav-bar-with-title' : ''}`} aria-label="Primary navigation">
    {compact ? (
      <Dropdown drop={portrait ? 'down' : 'end'} focusFirstItemOnShow="keyboard" className="primary-nav-header">
        <Dropdown.Toggle as={IconButton} label="Open navigation" icon={<List aria-hidden="true" />} id="primary-nav-toggle" />
        <Dropdown.Menu className="primary-nav-popup">{destinations}</Dropdown.Menu>
      </Dropdown>
    ) : (
      <>
        {!portrait && <div className="primary-nav-header">
          <IconButton label={collapsed ? 'Expand navigation' : 'Collapse navigation'} icon={<LayoutSidebar aria-hidden="true" />} onClick={() => workspaceOpen ? setDomainExpanded(value => !value) : setHomeCollapsed(value => !value)} />
          {showLabels && <strong>DroneWright</strong>}
        </div>}
        <Nav className="primary-nav-links">{destinations}</Nav>
      </>
    )}
    {showWorkspaceTitle && <h1 className="primary-nav-title">{workspaceTitle}</h1>}
    {user && <Dropdown drop={portrait ? 'down' : 'up'} className="primary-nav-account" focusFirstItemOnShow="keyboard">
      <Dropdown.Toggle variant="link" className="primary-nav-profile" aria-label={`Account: ${user.displayName}`} title={user.displayName}>
        {user.profilePicture ? <Image src={user.profilePicture} roundedCircle alt="" /> : <PersonCircle aria-hidden="true" />}
        {showLabels && <span className="primary-nav-label">{user.displayName}</span>}
      </Dropdown.Toggle>
      <Dropdown.Menu align={portrait ? 'end' : 'start'} className="primary-nav-account-menu">
        <Dropdown.Header>{user.email}</Dropdown.Header>
        <Dropdown.Item onClick={() => void logout()}><BoxArrowRight className="me-2" aria-hidden="true" />Sign out</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>}
  </nav>;
}
