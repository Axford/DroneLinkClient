import React, { useState, useEffect, useRef } from 'react';
import { Badge, Button, Form, InputGroup } from 'react-bootstrap';
import { Pencil, Check, X, ArrowRepeat } from 'react-bootstrap-icons';
import { ParameterState } from '../dronelink/DroneLinkState';

interface ParameterRowProps {
    nodeId: number;
    channelId: number;
    parameterId: number;
    parameter: ParameterState;
    onParameterEdit?: (value: number[]) => void;
}

const ParameterRow: React.FC<ParameterRowProps> = ({ 
    nodeId, 
    channelId, 
    parameterId, 
    parameter,
    onParameterEdit 
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const previousValuesRef = useRef<number[] | string[] | undefined>(parameter.values);
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Detect when parameter values change for visual feedback
    useEffect(() => {
        const currentValues = parameter.values;
        const previousValues = previousValuesRef.current;
        
        // Check if values have actually changed
        const valuesChanged = JSON.stringify(currentValues) !== JSON.stringify(previousValues);
        
        if (valuesChanged && previousValues !== undefined) {
            setIsUpdating(true);
            
            // Clear any existing timeout
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
            
            // Remove the updating state after a short delay
            updateTimeoutRef.current = setTimeout(() => {
                setIsUpdating(false);
            }, 2000); // Show update indicator for 2 seconds
        }
        
        previousValuesRef.current = currentValues;
        
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [parameter.values]);

    const handleStartEdit = () => {
        if (parameter.values && parameter.values.length > 0) {
            setEditValue(parameter.values.join(', '));
        }
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        try {
            setIsSending(true);
            const values = editValue.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
            
            // Send parameter update via DroneLink
            await sendParameterUpdate(values);
            
            onParameterEdit?.(values);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to update parameter:', error);
        } finally {
            setIsSending(false);
        }
    };

    const sendParameterUpdate = async (values: number[]): Promise<void> => {
        // TODO: Implement parameter update via DroneLink message sending
        // This would use the existing send API endpoint
        const payload = {
            node: nodeId,
            channel: channelId,
            param: parameterId,
            values: values
        };
        
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to send parameter update: ${response.statusText}`);
        }
    };

    const handleRefreshParameter = async () => {
        try {
            setIsSending(true);
            // Send a query message to refresh the parameter value
            await sendParameterQuery();
        } catch (error) {
            console.error('Failed to refresh parameter:', error);
        } finally {
            setIsSending(false);
        }
    };

    const sendParameterQuery = async (): Promise<void> => {
        // TODO: Implement parameter query via DroneLink message sending
        const payload = {
            node: nodeId,
            channel: channelId,
            param: parameterId,
            query: true
        };
        
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to send parameter query: ${response.statusText}`);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditValue('');
    };

    const formatValue = (values: number[] | string[] | undefined): string => {
        if (!values || values.length === 0) return 'N/A';
        
        // Handle string arrays
        if (typeof values[0] === 'string') {
            return (values as string[]).join(', ');
        }
        
        // Handle number arrays
        const numValues = values as number[];
        if (numValues.length === 1) {
            const value = numValues[0];
            // If it's likely an integer, show as integer
            if (Number.isInteger(value)) {
                return value.toLocaleString();
            }
            // Otherwise show as float with appropriate precision
            return value.toFixed(4);
        }
        
        // Multiple values - show as comma-separated
        return numValues.map(v => 
            Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4)
        ).join(', ');
    };

    const getValueBadgeVariant = (): string => {
        if (!parameter.values || parameter.values.length === 0) return 'secondary';
        
        // Show updating state
        if (isUpdating) return 'warning';
        
        // Check if parameter was recently updated
        const isRecent = parameter.lastHeard && (Date.now() - parameter.lastHeard) < 30 * 1000; // 30 seconds
        return isRecent ? 'success' : 'light';
    };

    const isWritable = parameter.writable || false; // TODO: Determine from parameter metadata

    return (
        <div className="parameter-row">
            <div className="parameter-name">
            <div className="parameter-value d-flex align-items-center gap-2">                    <small className="text-white fw-medium">
                        {parameter.name || `Param ${parameterId}`}
                    </small>
                    <small className="text-secondary">({parameterId})</small>
                    
                    {parameter.lastHeard && (
                        <Badge bg="outline-secondary" className="small">
                            {new Date(parameter.lastHeard).toLocaleTimeString()}
                        </Badge>
                    )}
                </div>
            </div>
            
            <div className="d-flex align-items-center gap-2">
                {isEditing ? (
                    <InputGroup size="sm" style={{ width: '120px' }}>
                        <Form.Control
                            type="text"
                            className="bg-dark text-white border-secondary"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="Enter values..."
                            autoFocus
                        />
                        <Button
                            variant="outline-success"
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={isSending}
                        >
                            <Check size={12} />
                        </Button>
                        <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={handleCancelEdit}
                        >
                            <X size={12} />
                        </Button>
                        <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={handleCancelEdit}
                        >
                            <X size={12} />
                        </Button>
                    </InputGroup>
                ) : (
                    <>
                        <Badge 
                            bg={getValueBadgeVariant()}
                            text={getValueBadgeVariant() === 'light' ? 'dark' : 'white'}
                            className="font-monospace small"
                        >
                            {formatValue(parameter.values)}
                        </Badge>
                        
                        {isWritable && (
                            <Button
                                variant="link"
                                size="sm"
                                className="p-0 text-white"
                                onClick={handleStartEdit}
                                title="Edit Parameter"
                            >
                                <Pencil size={12} />
                            </Button>
                        )}
                        
                        <Button
                            variant="link"
                            size="sm"
                            className="p-0 text-white"
                            onClick={handleRefreshParameter}
                            disabled={isSending}
                            title="Refresh Parameter"
                        >
                            <ArrowRepeat size={12} />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ParameterRow;