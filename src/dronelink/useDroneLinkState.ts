/**
 * React Hook for DroneLink State Management
 * 
 * Provides a React-friendly interface to the DroneLink state system
 * with automatic re-rendering when state changes occur.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DroneLinkState, GlobalState, NodeState, StateEventType, StateEventCallback } from './DroneLinkState';

export interface DroneLinkStateHook {
  state: GlobalState;
  nodeCount: number;
  isLoading: boolean;
  error: string | null;
  observationStatus: string;
  snapshotWriteFailures: number;
  resetNodeObservations: (nodeId: number) => Promise<void>;
  stats: {
    nodes: number;
    channels: number;
    parameters: number;
    received: number;
  };
  // Methods
  getNodeState: (nodeId: number) => NodeState | null;
  getParamValues: (node: number, channel: number, param: number, defaultValues: number[]) => number[];
  loadSharedObservations: (domainId: string, live?: boolean) => Promise<void>;
  startStreaming: (domainId: string) => void;
  stopStreaming: () => void;
  reset: () => void;
  // Event subscription
  on: (eventType: StateEventType, callback: StateEventCallback) => void;
  off: (eventType: StateEventType, callback: StateEventCallback) => void;
}

export const useDroneLinkState = (): DroneLinkStateHook => {
  const [state, setState] = useState<GlobalState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observationStatus, setObservationStatus] = useState('idle');
  const [snapshotWriteFailures, setSnapshotWriteFailures] = useState(0);
  const [stats, setStats] = useState({ nodes: 0, channels: 0, parameters: 0, received: 0 });
  
  const droneLinkStateRef = useRef<DroneLinkState | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize DroneLink state on first render
  useEffect(() => {
    if (!droneLinkStateRef.current) {
      droneLinkStateRef.current = new DroneLinkState();
      droneLinkStateRef.current.init();

      // Set up state update handler with debouncing
      const updateState = () => {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
        
        updateTimeoutRef.current = setTimeout(() => {
          if (droneLinkStateRef.current) {
            setState({ ...droneLinkStateRef.current.getState() });
            setObservationStatus(droneLinkStateRef.current.observationStatus);
            setSnapshotWriteFailures(droneLinkStateRef.current.snapshotWriteFailures);
            setStats(droneLinkStateRef.current.getStats());
          }
        }, 100); // Debounce updates by 100ms
      };

      // Subscribe to state changes
      const eventTypes: StateEventType[] = [
        'state.changed',
        'node.new',
        'module.new',
        'module.heard',
        'param.new',
        'param.value',
        'param.name'
      ];

      eventTypes.forEach(eventType => {
        droneLinkStateRef.current!.on(eventType, updateState);
      });
    }

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      // Stop streaming when component unmounts
      if (droneLinkStateRef.current) {
        droneLinkStateRef.current.stopStreaming();
        droneLinkStateRef.current.destroy();
        droneLinkStateRef.current = null;
      }
    };
  }, []);

  // Load persisted shared observations plus their matching continuation
  const loadSharedObservations = useCallback(async (domainId: string, live = true): Promise<void> => {
    if (!droneLinkStateRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      await droneLinkStateRef.current.loadObservations(domainId, live);
      setState({ ...droneLinkStateRef.current.getState() });
      setStats(droneLinkStateRef.current.getStats());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load shared observations';
      setError(errorMessage);
      console.error('Error loading shared observations:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get node state
  const getNodeState = useCallback((nodeId: number): NodeState | null => {
    return droneLinkStateRef.current?.getNodeState(nodeId) || null;
  }, []);

  // Get parameter values with defaults
  const getParamValues = useCallback((node: number, channel: number, param: number, defaultValues: number[]): number[] => {
    return droneLinkStateRef.current?.getParamValues(node, channel, param, defaultValues) || defaultValues;
  }, []);

  // Reset state
  const reset = useCallback(() => {
    if (droneLinkStateRef.current) {
      droneLinkStateRef.current.reset();
      setState({});
      setStats({ nodes: 0, channels: 0, parameters: 0, received: 0 });
      setError(null);
    }
  }, []);

  // Event subscription
  const on = useCallback((eventType: StateEventType, callback: StateEventCallback) => {
    droneLinkStateRef.current?.on(eventType, callback);
  }, []);

  const off = useCallback((eventType: StateEventType, callback: StateEventCallback) => {
    droneLinkStateRef.current?.off(eventType, callback);
  }, []);

  // Start streaming
  const startStreaming = useCallback((domainId: string) => {
    droneLinkStateRef.current?.startStreaming(domainId);
  }, []);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    droneLinkStateRef.current?.stopStreaming();
  }, []);

  return {
    state,
    nodeCount: Object.keys(state).length,
    isLoading,
    error,
    observationStatus,
    snapshotWriteFailures,
    resetNodeObservations: (nodeId: number) => droneLinkStateRef.current!.resetNodeObservations(nodeId),
    stats,
    getNodeState,
    getParamValues,
    loadSharedObservations,
    startStreaming,
    stopStreaming,
    reset,
    on,
    off
  };
};