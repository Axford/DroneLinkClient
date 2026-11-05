import React from 'react';
import { Nav, Image, Dropdown, Button } from 'react-bootstrap';
import { HouseDoorFill, List } from 'react-bootstrap-icons';
import { User } from './App';
import './Sidebar.css';

interface SidebarProps {
    user: User;
    isCollapsed: boolean;
    toggleSidebar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, isCollapsed, toggleSidebar }) => {
    return (
        <Nav as="nav" className={`sidebar-container d-flex flex-column ${isCollapsed ? 'collapsed' : ''}`}>
            <Button variant="dark" onClick={toggleSidebar} className="sidebar-toggle d-block d-md-none">
                <List />
            </Button>
            <div className="sidebar-header">
                {/* Header content can go here if needed */}
            </div>
            <div className="flex-grow-1">
                <Nav.Link href="#home" className="sidebar-link">
                    <HouseDoorFill size={20} />
                    <span className="nav-link-text">Home</span>
                </Nav.Link>
                {/* Add other nav links here */}
            </div>
            <div className="sidebar-footer mt-auto">
                <Dropdown drop="up">
                    <Dropdown.Toggle as="div" className="user-profile">
                        <Image src={user.profilePicture} roundedCircle width="32" height="32" />
                        <span className="user-name">{user.displayName}</span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                        <Dropdown.Item href="/auth/logout">Logout</Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown>
            </div>
        </Nav>
    );
};

export default Sidebar; 