import React from 'react';
import { Nav, Image, Dropdown } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { HouseDoor, Compass, LayoutSidebar, PersonCircle, BoxArrowRight } from 'react-bootstrap-icons';
import { Domain, User } from './App';
import { logout } from './utils/api';
import IconButton from './components/ui/IconButton';
import './Sidebar.css';
export interface SidebarProps {
  user: User; domains: Domain[]; activeDomainId?: string;
  isCollapsed: boolean; canExpand: boolean; toggleSidebar: () => void;
}
export default function Sidebar({ user, domains, activeDomainId, isCollapsed, canExpand, toggleSidebar }: SidebarProps) {
  return <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`} aria-label="Workspace navigation">
    <div className="sidebar-header">
      {canExpand && <IconButton label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'} icon={<LayoutSidebar />} onClick={toggleSidebar} />}
      {!isCollapsed && <strong>DroneWright</strong>}
    </div>
    <Nav as="nav" className="sidebar-links" aria-label="Workspaces">
      <Nav.Link as={Link} to="/private/" className="sidebar-link" aria-label="Home" title="Home" aria-current={!activeDomainId ? 'page' : undefined}><HouseDoor /><span className="nav-link-text">Home</span></Nav.Link>
      {domains.filter(domain => domain.status === 'active').map(domain => <Nav.Link as={Link} key={domain._id} to={`/private/domain/${domain._id}`} className="sidebar-link" aria-label={`Open ${domain.name}`} title={domain.name} aria-current={domain._id === activeDomainId ? 'page' : undefined}><Compass /><span className="nav-link-text">{domain.name}</span></Nav.Link>)}
    </Nav>
    <Dropdown drop="up" className="sidebar-footer">
      <Dropdown.Toggle variant="link" className="user-profile" aria-label={`Account: ${user.displayName}`} title={user.displayName}>
        {user.profilePicture ? <Image src={user.profilePicture} roundedCircle alt="" /> : <PersonCircle aria-hidden="true" />}
        <span className="nav-link-text">{user.displayName}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu><Dropdown.Header>{user.email}</Dropdown.Header><Dropdown.Item onClick={() => void logout()}><BoxArrowRight className="me-2" />Sign out</Dropdown.Item></Dropdown.Menu>
    </Dropdown>
  </aside>;
}
