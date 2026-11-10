import React, { useState, useEffect } from 'react';
import { Form, Alert } from 'react-bootstrap';
import { CheckLg, Plus } from 'react-bootstrap-icons';
import SettingsDialog from './components/ui/SettingsDialog';
import IconButton from './components/ui/IconButton';
import SurfacePanel from './components/ui/SurfacePanel';
import { Domain } from './App';
import { authenticatedFetch } from './utils/api';
import { useToast } from './contexts/ToastContext';

interface DomainModalProps {
    show: boolean;
    handleClose: () => void;
    handleSave: (domain: Domain) => void;
    domain: Domain | null;
}

const DomainModal: React.FC<DomainModalProps> = ({ show, handleClose, handleSave, domain }) => {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const toast = useToast();

    useEffect(() => {
        if (domain) {
            setName(domain.name || '');
        } else {
            setName('');
        }
        setErrors([]);
    }, [domain, show]);

    const validateForm = () => {
        const newErrors: string[] = [];
        
        if (!name.trim()) {
            newErrors.push('Domain name is required');
        } else if (name.length > 100) {
            newErrors.push('Domain name must be less than 100 characters');
        }
        
        setErrors(newErrors);
        return newErrors.length === 0;
    };

    const onSave = async () => {
        if (!validateForm()) {
            return;
        }

        const isEditing = domain !== null;
        const url = isEditing ? `/api/domains/${domain?._id}` : '/api/domains';
        const method = isEditing ? 'PUT' : 'POST';

        const payload = {
            name: name.trim(), ...(domain ? { revision: domain.revision } : {})
        };

        setLoading(true);
        setErrors([]);

        try {
            const response = await authenticatedFetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.errors) {
                    setErrors(result.errors.map((err: any) => err.message));
                } else {
                    throw new Error(result.message || 'Failed to save domain');
                }
                return;
            }

            handleSave(result.data);
            handleClose();
        } catch (error) {
            console.error('Save error:', error);
            toast.showError(
                error instanceof Error ? error.message : 'Failed to save domain'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <SettingsDialog title={domain ? 'Edit Domain' : 'Create Domain'} show={show} onHide={handleClose}>
                {errors.length > 0 && (
                    <Alert variant="danger">
                        <ul className="mb-0">
                            {errors.map((error, index) => (
                                <li key={index}>{error}</li>
                            ))}
                        </ul>
                    </Alert>
                )}
                
            <SurfacePanel>
                <Form>
                    <Form.Group className="mb-3" controlId="domainName">
                        <Form.Label>Domain Name</Form.Label>
                        <Form.Control
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter domain name"
                            isInvalid={errors.some(e => e.includes('name'))}
                            disabled={loading}
                            autoFocus
                        />
                    </Form.Group>
                </Form>

            <div className="dw-toolbar justify-content-end">
                <IconButton label={domain ? 'Update Domain' : 'Create Domain'} variant="primary" icon={domain ? <CheckLg /> : <Plus />} onClick={onSave} disabled={loading || !name.trim()} />
            </div>
            </SurfacePanel>
        </SettingsDialog>
    );
};

export default DomainModal;
