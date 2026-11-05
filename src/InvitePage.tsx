import React, { useState, useEffect } from 'react';
import { Container, Card, Button, Spinner } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { PersonPlus, CheckCircle, XCircle } from 'react-bootstrap-icons';

interface InviteInfo {
    domainName: string;
    createdBy: {
        displayName: string;
        email: string;
    };
    createdAt: string;
}

const InvitePage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const fetchInviteInfo = async () => {
            if (!token) {
                setError('Invalid invite link');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/invite/${token}`);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Failed to load invite information');
                }

                setInviteInfo(result.data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load invite information');
            } finally {
                setLoading(false);
            }
        };

        fetchInviteInfo();
    }, [token]);

    const handleAcceptInvite = async () => {
        if (!token) return;

        setAccepting(true);
        try {
            const response = await fetch(`/api/invite/${token}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to accept invite');
            }

            setSuccess(true);
            setTimeout(() => {
                navigate('/private');
            }, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to accept invite');
        } finally {
            setAccepting(false);
        }
    };



    if (loading) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                </Spinner>
            </Container>
        );
    }

    if (success) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <Card className="text-center" style={{ maxWidth: '500px' }}>
                    <Card.Body className="p-5">
                        <CheckCircle size={64} className="text-success mb-3" />
                        <h3 className="text-success mb-3">Welcome to the team!</h3>
                        <p className="text-muted">
                            You have successfully joined <strong>{inviteInfo?.domainName}</strong>.
                            Redirecting you to your dashboard...
                        </p>
                    </Card.Body>
                </Card>
            </Container>
        );
    }

    if (error || !inviteInfo) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <Card className="text-center" style={{ maxWidth: '500px' }}>
                    <Card.Body className="p-5">
                        <XCircle size={64} className="text-danger mb-3" />
                        <h3 className="text-danger mb-3">Invalid Invite</h3>
                        <p className="text-muted mb-4">
                            {error || 'This invite link is invalid or has expired.'}
                        </p>
                        <Button variant="primary" onClick={() => navigate('/')}>
                            Go to Homepage
                        </Button>
                    </Card.Body>
                </Card>
            </Container>
        );
    }

    return (
        <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
            <Card style={{ maxWidth: '500px' }}>
                <Card.Body className="p-5 text-center">
                    <PersonPlus size={64} className="text-primary mb-4" />
                    <h2 className="mb-3">You're Invited!</h2>
                    <p className="text-muted mb-4">
                        <strong>{inviteInfo.createdBy.displayName}</strong> has invited you to join the domain:
                    </p>
                    <h4 className="text-primary mb-4">{inviteInfo.domainName}</h4>
                    {/* TEST: Domain created text removed */}
                    
                    <div className="d-grid gap-2">
                        <Button 
                            variant="primary" 
                            size="lg" 
                            onClick={handleAcceptInvite}
                            disabled={accepting}
                        >
                            {accepting && <Spinner as="span" animation="border" size="sm" className="me-2" />}
                            Accept Invitation
                        </Button>
                        <Button variant="outline-secondary" onClick={() => navigate('/')}>
                            Decline
                        </Button>
                    </div>
                </Card.Body>
            </Card>
        </Container>
    );
};

export default InvitePage;