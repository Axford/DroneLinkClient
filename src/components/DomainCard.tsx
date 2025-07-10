import React, { useState } from 'react';
import { Card, Dropdown, Button, Collapse, Image } from 'react-bootstrap';
import { ThreeDotsVertical, Calendar, Person, Activity, Envelope, Key, Eye, EyeSlash, Copy, ChevronDown, ChevronUp, PersonPlus, Link45deg } from 'react-bootstrap-icons';
import { Domain } from '../App';

interface DomainCardProps {
    domain: Domain;
    onEdit: (domain: Domain) => void;
    onDelete: (domainId: string) => void;
    onRegenerateKey?: (domain: Domain) => void;
    onRegenerateInvite?: (domain: Domain) => void;
    onCopyInviteLink?: (domain: Domain) => void;
    isDeleting?: boolean;
}

const DomainCard: React.FC<DomainCardProps> = ({ domain, onEdit, onDelete, onRegenerateKey, onRegenerateInvite, onCopyInviteLink, isDeleting = false }) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [showUsers, setShowUsers] = useState(false);
    
    const formatDate = (dateString: string | undefined) => {
        if (!dateString) {
            return 'Unknown';
        }
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const copyApiKey = async () => {
        if (!domain.apiKey) {
            console.warn('No API key to copy');
            return;
        }
        try {
            await navigator.clipboard.writeText(domain.apiKey);
            // Could add a toast notification here
        } catch (err) {
            console.error('Failed to copy API key:', err);
        }
    };

    const formatApiKey = (apiKey: string | undefined) => {
        if (!apiKey) {
            return 'No API key';
        }
        if (showApiKey) {
            return apiKey;
        }
        return '•'.repeat(8) + apiKey.slice(-4);
    };

    const copyInviteLink = async () => {
        if (onCopyInviteLink) {
            onCopyInviteLink(domain);
        }
    };



    return (
        <Card className={`h-100 shadow-sm hover-shadow ${isDeleting ? 'loading-overlay' : ''}`}>
            <Card.Body className="d-flex flex-column">
                <div className="d-flex justify-content-between align-items-start mb-3">
                    <div className="flex-grow-1 me-2">
                        <Card.Title className="mb-0" title={domain.name} style={{ 
                            wordBreak: 'break-word',
                            hyphens: 'auto',
                            lineHeight: '1.3'
                        }}>
                            {domain.name}
                        </Card.Title>
                    </div>
                    <Dropdown align="end">
                        <Dropdown.Toggle 
                            as={Button}
                            variant="link" 
                            className="p-0 border-0 text-muted"
                            style={{ boxShadow: 'none' }}
                        >
                            <ThreeDotsVertical />
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item onClick={() => onEdit(domain)}>
                                Edit Name
                            </Dropdown.Item>
                            {onRegenerateKey && (
                                <Dropdown.Item onClick={() => onRegenerateKey(domain)}>
                                    Regenerate API Key
                                </Dropdown.Item>
                            )}
                            {onRegenerateInvite && (
                                <Dropdown.Item onClick={() => onRegenerateInvite(domain)}>
                                    Regenerate Invite Link
                                </Dropdown.Item>
                            )}
                            <Dropdown.Divider />
                            <Dropdown.Item 
                                onClick={() => onDelete(domain._id)}
                                className="text-danger"
                            >
                                Delete
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>

                <div className="mt-auto">
                    {/* API Key Section */}
                    <div className="mb-2 p-2 bg-light rounded">
                        <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center">
                                <Key size={14} className="me-2 text-muted" />
                                <code className="small text-muted" style={{ fontSize: '0.75rem' }}>
                                    {formatApiKey(domain.apiKey)}
                                </code>
                            </div>
                            {domain.apiKey && (
                                <div className="d-flex gap-1">
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="p-0 text-muted"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                                    >
                                        {showApiKey ? <EyeSlash size={12} /> : <Eye size={12} />}
                                    </Button>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="p-0 text-muted"
                                        onClick={copyApiKey}
                                        title="Copy API Key"
                                    >
                                        <Copy size={12} />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Invite Link Section */}
                    <div className="mb-3 p-2 bg-primary bg-opacity-10 rounded">
                        <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center">
                                <PersonPlus size={14} className="me-2 text-primary" />
                                <span className="small text-primary fw-medium" style={{ fontSize: '0.75rem' }}>
                                    Invite Users
                                </span>
                            </div>
                            {domain.inviteToken && (
                                <div className="d-flex gap-1">
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="p-0 text-primary"
                                        onClick={copyInviteLink}
                                        title="Copy Invite Link"
                                    >
                                        <Link45deg size={12} />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center text-muted small mb-2">
                        <span className="d-flex align-items-center">
                            <Activity size={14} className="me-1" />
                            {domain.stats?.nodeCount || 0} nodes
                        </span>
                        <span className="d-flex align-items-center">
                            <Envelope size={14} className="me-1" />
                            {domain.stats?.packetCount || 0} packets
                        </span>
                    </div>
                    
                    <div className="d-flex justify-content-between align-items-center text-muted small">
                        <Button
                            variant="link"
                            size="sm"
                            className="p-0 text-muted d-flex align-items-center user-count-button"
                            onClick={() => setShowUsers(!showUsers)}
                            style={{ textDecoration: 'none' }}
                        >
                            <Person size={14} className="me-1" />
                            {domain.users?.length || 0} user{(domain.users?.length || 0) !== 1 ? 's' : ''}
                            {showUsers ? <ChevronUp size={12} className="ms-1" /> : <ChevronDown size={12} className="ms-1" />}
                        </Button>
                        <span className="d-flex align-items-center">
                            <Calendar size={14} className="me-1" />
                            {formatDate(domain.createdAt)}
                        </span>
                    </div>

                    {/* Expandable Users Section */}
                    <Collapse in={showUsers}>
                        <div className="mt-3 pt-3 border-top">
                            <h6 className="text-muted mb-2" style={{ fontSize: '0.8rem' }}>Domain Users</h6>
                            {domain.users && domain.users.length > 0 ? (
                                <div className="d-flex flex-column gap-2">
                                    {domain.users.map(user => (
                                        <div key={user._id} className="d-flex align-items-center user-list-item">
                                            {user.profilePicture ? (
                                                <Image 
                                                    src={user.profilePicture} 
                                                    roundedCircle 
                                                    width="24" 
                                                    height="24" 
                                                    className="me-2"
                                                />
                                            ) : (
                                                <div 
                                                    className="rounded-circle bg-secondary d-flex align-items-center justify-content-center me-2"
                                                    style={{ width: '24px', height: '24px', fontSize: '0.7rem', color: 'white' }}
                                                >
                                                    {user.displayName?.charAt(0).toUpperCase() || '?'}
                                                </div>
                                            )}
                                            <div className="flex-grow-1" style={{ fontSize: '0.75rem' }}>
                                                <div className="text-dark fw-medium">{user.displayName}</div>
                                                <div className="text-muted">{user.email}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                    No users associated with this domain
                                </div>
                            )}
                        </div>
                    </Collapse>
                </div>
            </Card.Body>
        </Card>
    );
};

export default DomainCard;