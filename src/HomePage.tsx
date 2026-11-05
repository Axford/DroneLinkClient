import React, { useState } from 'react';
import { Container, Row, Col, Button, Pagination } from 'react-bootstrap';
import { Domain } from './App';
import DomainModal from './DomainModal';
import DomainCard from './components/DomainCard';
import EmptyState from './components/EmptyState';
import { DomainCardSkeleton } from './components/SkeletonLoader';
import { useToast } from './contexts/ToastContext';
import { Folder } from 'react-bootstrap-icons';

interface HomePageProps {
    domains: Domain[];
    onDomainUpdate: (domain: Domain) => void;
    onDomainDelete: (domainId: string) => void;
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
    onPageChange: (page: number, limit: number) => void;
    loading: boolean;
}

const HomePage: React.FC<HomePageProps> = ({ 
    domains, 
    onDomainUpdate, 
    onDomainDelete, 
    pagination, 
    onPageChange, 
    loading 
}) => {
    const [showModal, setShowModal] = useState(false);
    const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const toast = useToast();

    const handleEdit = (domain: Domain) => {
        setEditingDomain(domain);
        setShowModal(true);
    };

    const handleCreate = () => {
        setEditingDomain(null);
        setShowModal(true);
    };

    const handleSave = (domain: Domain) => {
        onDomainUpdate(domain);
        toast.showSuccess(
            editingDomain ? 'Domain updated successfully!' : 'Domain created successfully!'
        );
    };

    const handleDelete = async (domainId: string) => {
        if (!window.confirm('Are you sure you want to delete this domain? This action cannot be undone.')) {
            return;
        }

        setIsDeleting(domainId);
        try {
            const response = await fetch(`/api/domains/${domainId}`, { 
                method: 'DELETE' 
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Failed to delete domain');
            }

            onDomainDelete(domainId);
            toast.showSuccess('Domain deleted successfully!');
        } catch (error) {
            console.error('Delete error:', error);
            toast.showError(
                error instanceof Error ? error.message : 'Failed to delete domain'
            );
        } finally {
            setIsDeleting(null);
        }
    };

    const handlePageChange = (page: number) => {
        onPageChange(page, pagination.limit);
    };

    const handleRegenerateKey = async (domain: Domain) => {
        if (!window.confirm(`Are you sure you want to regenerate the API key for "${domain.name}"? This will invalidate the current key and may break existing integrations.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/domains/${domain._id}/regenerate-key`, {
                method: 'POST'
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to regenerate API key');
            }

            onDomainUpdate(result.data);
            toast.showSuccess('API key regenerated successfully!');
        } catch (error) {
            console.error('Regenerate key error:', error);
            toast.showError(
                error instanceof Error ? error.message : 'Failed to regenerate API key'
            );
        }
    };

    const handleRegenerateInvite = async (domain: Domain) => {
        if (!window.confirm(`Are you sure you want to regenerate the invite link for "${domain.name}"? This will invalidate the current invite link.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/domains/${domain._id}/regenerate-invite`, {
                method: 'POST'
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to regenerate invite link');
            }

            onDomainUpdate(result.data);
            toast.showSuccess('Invite link regenerated successfully!');
        } catch (error) {
            console.error('Regenerate invite error:', error);
            toast.showError(
                error instanceof Error ? error.message : 'Failed to regenerate invite link'
            );
        }
    };

    const handleCopyInviteLink = async (domain: Domain) => {
        if (!domain.inviteToken) {
            toast.showError('No invite link available for this domain');
            return;
        }

        const inviteLink = `${window.location.origin}/invite/${domain.inviteToken}`;
        
        try {
            await navigator.clipboard.writeText(inviteLink);
            toast.showSuccess('Invite link copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy invite link:', err);
            toast.showError('Failed to copy invite link');
        }
    };

    const renderPagination = () => {
        if (pagination.pages <= 1) return null;

        const items = [];
        const maxVisiblePages = 5;
        const startPage = Math.max(1, pagination.page - Math.floor(maxVisiblePages / 2));
        const endPage = Math.min(pagination.pages, startPage + maxVisiblePages - 1);

        // Previous button
        items.push(
            <Pagination.Prev
                key="prev"
                disabled={!pagination.hasPrev}
                onClick={() => handlePageChange(pagination.page - 1)}
            />
        );

        // Page numbers
        for (let page = startPage; page <= endPage; page++) {
            items.push(
                <Pagination.Item
                    key={page}
                    active={page === pagination.page}
                    onClick={() => handlePageChange(page)}
                >
                    {page}
                </Pagination.Item>
            );
        }

        // Next button
        items.push(
            <Pagination.Next
                key="next"
                disabled={!pagination.hasNext}
                onClick={() => handlePageChange(pagination.page + 1)}
            />
        );

        return (
            <div className="d-flex justify-content-center mt-4">
                <Pagination>{items}</Pagination>
            </div>
        );
    };

    return (
        <Container fluid className="p-4">
            <Row className="mb-4">
                <Col>
                    <p className="text-muted">
                        Manage your DroneLink domains and monitor their activity
                    </p>
                </Col>
                <Col className="text-end">
                    <Button 
                        variant="outline-primary" 
                        onClick={handleCreate}
                        size="sm"
                    >
                        + New Domain
                    </Button>
                </Col>
            </Row>

            {loading ? (
                <DomainCardSkeleton count={6} />
            ) : domains.length > 0 ? (
                <>
                    <Row>
                        {domains.map(domain => (
                            <Col sm={12} md={6} lg={6} xl={4} key={domain._id} className="mb-4">
                                <DomainCard
                                    domain={domain}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    onRegenerateKey={handleRegenerateKey}
                                    onRegenerateInvite={handleRegenerateInvite}
                                    onCopyInviteLink={handleCopyInviteLink}
                                    isDeleting={isDeleting === domain._id}
                                />
                            </Col>
                        ))}
                    </Row>
                    {renderPagination()}
                </>
            ) : (
                <EmptyState
                    title="No domains yet"
                    description="Create your first domain to start managing your DroneLink network. Domains help you organize and control access to your drone data."
                    actionText="Create Your First Domain"
                    onAction={handleCreate}
                    icon={<Folder size={64} className="text-muted mb-3" />}
                />
            )}

            <DomainModal
                show={showModal}
                handleClose={() => setShowModal(false)}
                handleSave={handleSave}
                domain={editingDomain}
            />
        </Container>
    );
};

export default HomePage; 