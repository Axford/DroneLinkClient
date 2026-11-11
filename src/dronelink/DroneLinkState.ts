import { encodeLinkPacket, ProtocolValidationError, PacketBytes } from '@dronelink/protocol';
import { WriteObservation } from '../commands/model';
import { CloudObservations, ObservationView } from './CloudObservations';
/**
 * DroneLink State Management - React/TypeScript Port
 * 
 * Manages the global state of all nodes, channels, and parameters in the mesh network.
 * Provides event-driven updates as messages are received and processed.
 */

import { DroneLinkMsg, DRONE_LINK_MSG_TYPE_NAME, DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_QUERY, DRONE_MODULE_PARAM_TYPE, DRONE_MODULE_PARAM_NAME, sendDroneLinkMsg } from './DroneLinkMsg';

export interface ParameterState {
  msgType: number;
  bytesPerValue: number;
  numValues: number;
  values: number[] | string[];
  writable: boolean;
  writeObservation?: WriteObservation;
  param: number;
  name?: string;
  timestamp?: number;
  lastHeard?: number;
  source?: string;
  nameLastHeard?: number;
  nameSource?: string;
  unavailable?: { value?: string; name?: string };
}

export interface ChannelState {
  channel: number;
  params: { [paramId: number]: ParameterState };
  lastHeard: number;
  name?: string;
  type?: number | string;
  enabled?: boolean;
  status?: number;
}

export interface NodeState {
  id: number;
  observationGeneration?: number;
  droneId?: string;
  channels: { [channelId: number]: ChannelState };
  lastHeard: number;
  name?: string;
  interface?: string;
}

export interface GlobalState {
  [nodeId: number]: NodeState;
}

export type StateEventType = 
  | 'state.changed'
  | 'node.new'
  | 'module.new' 
  | 'module.heard'
  | 'module.type'
  | 'module.name'
  | 'param.new'
  | 'param.value'
  | 'param.name'
  | 'raw';

export interface StateEventData {
  node?: number;
  channel?: number;
  param?: number;
  type?: number;
  name?: string;
  msgType?: number;
  values?: number[] | string[];
  priority?: number;
  timestamp?: number;
}

export type StateEventCallback = (data?: StateEventData | number | DroneLinkMsg) => void;

export class DroneLinkState {
  private state: GlobalState = {};
  private callbacks: { [eventType: string]: StateEventCallback[] } = {};
  private localAddress: number = 250;
  private liveMode: boolean = true;
  private received: number = 0;
  private discoveryQueue: DroneLinkMsg[] = [];
  private discoveryInterval?: NodeJS.Timeout;
  private queueProcessInterval?: NodeJS.Timeout;
  private pollingActive: boolean = false;

  unavailableObservationParts = 0;
  rejectedMessages = 0;

  private cloud = new CloudObservations(view => this.applyCloudView(view));

  get observationStatus() { return this.cloud.status; }
  get snapshotWriteFailures() { return this.cloud.failedWrites; }
  resetNodeObservations(node: number) { return this.cloud.resetNode(node); }

  constructor() {
    // Initialize periodic tasks
    this.startPeriodicTasks();
  }

  /**
   * Initialize the state management system
   */
  init(): void {
    console.log('DroneLinkState.init()');
    this.liveMode = true;
    
    // Start discovery and queue processing
    this.discoveryInterval = setInterval(() => {
      this.discovery();
    }, 1000);
    
    this.queueProcessInterval = setInterval(() => {
      this.processDiscoveryQueue();
    }, 50);
  }

  /**
   * Reset the entire state
   */
  reset(): void {
    this.stopStreaming();
    this.state = {};
    this.unavailableObservationParts = 0;
    this.received = 0;
    this.discoveryQueue = [];
  }

  /**
   * Cleanup intervals and resources
   */
  destroy(): void {
    this.stopStreaming();
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }
    if (this.queueProcessInterval) {
      clearInterval(this.queueProcessInterval);
    }
    this.pollingActive = false;
  }

  /**
   * Set live mode (enables/disables real-time processing)
   */
  setLiveMode(live: boolean): void {
    this.liveMode = live;
  }

  /**
   * Get the current global state
   */
  getState(): GlobalState {
    return this.state;
  }

  /**
   * Get state for a specific node
   */
  getNodeState(nodeId: number): NodeState | null {
    return this.state[nodeId] || null;
  }

  /**
   * Get state for a specific channel
   */
  getChannelState(nodeId: number, channelId: number): ChannelState | null {
    const node = this.getNodeState(nodeId);
    return node?.channels[channelId] || null;
  }

  /**
   * Get state for a specific parameter
   */
  getParameterState(nodeId: number, channelId: number, paramId: number): ParameterState | null {
    const channel = this.getChannelState(nodeId, channelId);
    return channel?.params[paramId] || null;
  }

  /**
   * Get parameter values with default fallback
   */
  getParamValues(node: number, channel: number, param: number, defaultValues: number[]): number[] {
    const paramObj = this.getParameterState(node, channel, param);
    if (paramObj && paramObj.values && Array.isArray(paramObj.values) && paramObj.values.length === defaultValues.length) {
      return paramObj.values as number[];
    }
    return defaultValues;
  }

  /**
   * Handle incoming DroneLink message
   */
  handleLinkMsg(msg: DroneLinkMsg, queryNames: boolean = true, interfaceName: string = 'socket'): void {
    if (!this.liveMode) return;
    try { msg.encodeUnframed(); } catch (error) {
      if (!(error instanceof ProtocolValidationError)) throw error;
      this.rejectedMessages++; return;
    }

    const now = Date.now();
    this.received++;

    // Trigger raw message event
    this.trigger('raw', msg);

    // Check for new node
    if (!this.state[msg.node]) {
      this.trigger('node.new', msg.node);
      this.createNodeState(msg.node, interfaceName, now);
      
      // Query for hostname if this is a new node
      if (queryNames) {
        this.queryParameter(msg.node, 1, 8); // hostname query
      }
    }

    // Check for new channel
    if (!this.state[msg.node].channels[msg.channel]) {
      this.trigger('module.new', { node: msg.node, channel: msg.channel });
      this.createChannelState(msg.node, msg.channel, now);
      
      // Query for module type and name if this is a new channel
      if (queryNames) {
        this.queryParameter(msg.node, msg.channel, DRONE_MODULE_PARAM_TYPE);
        this.queryParameter(msg.node, msg.channel, DRONE_MODULE_PARAM_NAME);
      }
    } else {
      this.trigger('module.heard', { node: msg.node, channel: msg.channel });
    }

    // Check for new parameter
    const isNewParam = !this.state[msg.node].channels[msg.channel].params[msg.param];
    if (isNewParam && msg.msgType <= DRONE_LINK_MSG_TYPE_NAME) {
      this.trigger('param.new', { node: msg.node, channel: msg.channel, param: msg.param });
      this.createParameterState(msg.node, msg.channel, msg.param);
    }

    // Process message based on type
    if (msg.msgType <= DRONE_LINK_MSG_TYPE_NAME) {
      this.processValueMessage(msg, isNewParam, now, interfaceName);
    }

    // Update last heard timestamps
    this.state[msg.node].lastHeard = interfaceName === 'firebase' ? now - 240000 : now;
    this.state[msg.node].channels[msg.channel].lastHeard = interfaceName === 'firebase' ? now - 240000 : now;
  }

  /**
   * Process messages from MongoDB rxPackets collection
   */
  async processHistoricalMessages(packets: any[]): Promise<void> {
    console.log(`Processing ${packets.length} historical messages`);
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (const packet of packets) {
      try {
        if (!packet || typeof packet !== 'object') throw new ProtocolValidationError('invalid-input', 'packet');
        const msg = new DroneLinkMsg();
        
        // Convert MongoDB packet to ArrayBuffer
        // Packets are stored as base64 encoded strings from encodeUnframed() output
        let buffer: PacketBytes;
        
        if (!packet.packet) {
          throw new ProtocolValidationError('invalid-input', 'packet');
        }
        
        if (typeof packet.packet === 'string') {
          // Base64 encoded string - decode it
          try {
            const binaryString = atob(packet.packet);
            buffer = Uint8Array.from(binaryString, c => c.charCodeAt(0));
          } catch (error) {
            throw new ProtocolValidationError('invalid-input', 'base64');
          }
        } else if (packet.packet.type === 'Buffer' && Array.isArray(packet.packet.data)) {
          // MongoDB buffer serialized as { type: 'Buffer', data: [1,2,3...] }
          buffer = packet.packet.data;
        } else if (packet.packet.buffer) {
          // Direct buffer object
          buffer = ArrayBuffer.isView(packet.packet) ? packet.packet : packet.packet.buffer;
        } else if (Array.isArray(packet.packet)) {
          // Direct array
          buffer = packet.packet;
        } else {
          throw new ProtocolValidationError('invalid-input', 'packet');
        }
        
        msg.parse(buffer);
        
        // Handle different time formats from MongoDB
        if (packet.time) {
          if (typeof packet.time.getTime === 'function') {
            msg.timestamp = packet.time.getTime();
          } else if (typeof packet.time === 'string') {
            msg.timestamp = new Date(packet.time).getTime();
          } else if (typeof packet.time === 'number') {
            msg.timestamp = packet.time;
          } else {
            msg.timestamp = Date.now();
          }
        } else {
          msg.timestamp = Date.now();
        }
        
        this.handleLinkMsg(msg, false, 'mongodb');
        processedCount++;
        
      } catch (error) {
        if (!(error instanceof ProtocolValidationError)) throw error;
        errorCount++; this.rejectedMessages++;
        if (errorCount < 5) console.warn('Rejected historical message:', error.code);
      }
    }
    
    console.log(`Processed ${processedCount} messages successfully, ${errorCount} errors. State now contains ${Object.keys(this.state).length} nodes`);
  }

  /**
   * Register event callback
   */
  on(eventType: StateEventType, callback: StateEventCallback): void {
    if (!this.callbacks[eventType]) {
      this.callbacks[eventType] = [];
    }
    this.callbacks[eventType].push(callback);
  }

  /**
   * Remove event callback
   */
  off(eventType: StateEventType, callback: StateEventCallback): void {
    if (this.callbacks[eventType]) {
      const index = this.callbacks[eventType].indexOf(callback);
      if (index > -1) {
        this.callbacks[eventType].splice(index, 1);
      }
    }
  }

  /**
   * Trigger event with data
   */
  private trigger(eventType: StateEventType, data?: StateEventData | number | DroneLinkMsg): void {
    if (this.callbacks[eventType]) {
      this.callbacks[eventType].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${eventType} callback:`, error);
        }
      });
    }
  }

  /**
   * Create new node state
   */
  private createNodeState(nodeId: number, interfaceName: string, timestamp: number): void {
    this.state[nodeId] = {
      id: nodeId,
      channels: {},
      lastHeard: interfaceName === 'firebase' ? timestamp - 240000 : timestamp,
      interface: interfaceName
    };
  }

  /**
   * Create new channel state
   */
  private createChannelState(nodeId: number, channelId: number, timestamp: number): void {
    this.state[nodeId].channels[channelId] = {
      channel: channelId,
      params: {},
      lastHeard: timestamp
    };
  }

  /**
   * Create new parameter state
   */
  private createParameterState(nodeId: number, channelId: number, paramId: number): void {
    this.state[nodeId].channels[channelId].params[paramId] = {
      msgType: 0,
      bytesPerValue: 0,
      numValues: 0,
      values: [],
      writable: false,
      param: paramId
    };
  }

  /**
   * Process value messages and update state
   */
  private processValueMessage(msg: DroneLinkMsg, isNewParam: boolean, timestamp: number, interfaceName: string): void {
    const param = this.state[msg.node].channels[msg.channel].params[msg.param];
    
    if (msg.msgType === DRONE_LINK_MSG_TYPE_NAME) {
      // Handle parameter name
      param.name = msg.payloadToString();
      this.trigger('param.name', {
        node: msg.node,
        channel: msg.channel,
        param: msg.param,
        msgType: msg.msgType,
        name: param.name
      });
    } else {
      // Handle parameter value
      const newValues = msg.valueArray();
      const valuesChanged = isNewParam || !this.arraysEqual(param.values, newValues);
      
      if (valuesChanged) {
        // Update parameter state
        param.msgType = msg.msgType;
        param.bytesPerValue = msg.bytesPerValue();
        param.numValues = msg.numValues();
        param.values = newValues as number[] | string[];
        param.writable = msg.writable;
        param.timestamp = msg.timestamp || timestamp;

        // Handle special parameter types
        this.handleSpecialParameters(msg, newValues);

        // Trigger value change event
        this.trigger('param.value', {
          node: msg.node,
          channel: msg.channel,
          param: msg.param,
          msgType: msg.msgType,
          values: param.values,
          priority: msg.priority,
          timestamp: param.timestamp
        });
      }
    }
  }

  /**
   * Handle special parameter types (module type, module name, node name)
   */
  private handleSpecialParameters(msg: DroneLinkMsg, values: number[] | string[]): void {
    // Module type
    if (msg.param === DRONE_MODULE_PARAM_TYPE && msg.msgType <= DRONE_LINK_MSG_TYPE_CHAR) {
      const type = Array.isArray(values) ? values[0] as number : 0;
      this.state[msg.node].channels[msg.channel].type = type;
      this.trigger('module.type', { node: msg.node, channel: msg.channel, type });
    }

    // Module name
    if (msg.param === DRONE_MODULE_PARAM_NAME && msg.msgType === DRONE_LINK_MSG_TYPE_CHAR) {
      const name = msg.payloadToString();
      this.state[msg.node].channels[msg.channel].name = name;
      this.trigger('module.name', { node: msg.node, channel: msg.channel, name });
    }

    // Node name (hostname)
    if (msg.msgType === DRONE_LINK_MSG_TYPE_CHAR && msg.channel === 1 && msg.param === 8) {
      const name = msg.payloadToString();
      this.state[msg.node].name = name;
    }
  }

  /**
   * Compare arrays for equality
   */
  private arraysEqual(a: number[] | string[], b: number[] | string[]): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Start periodic background tasks
   */
  private startPeriodicTasks(): void {
    // Discovery and maintenance tasks can be added here
    // For now, just log state periodically in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const nodeCount = Object.keys(this.state).length;
        if (nodeCount > 0) {
          console.log(`DroneLinkState: ${nodeCount} nodes, ${this.received} messages received`);
        }
      }, 30000); // Every 30 seconds
    }
  }

  /**
   * Export state as JSON for debugging
   */
  exportAsJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * Get statistics about the current state
   */
  getStats(): { nodes: number; channels: number; parameters: number; received: number } {
    let channelCount = 0;
    let parameterCount = 0;

    Object.values(this.state).forEach((node: NodeState) => {
      channelCount += Object.keys(node.channels).length;
      Object.values(node.channels).forEach((channel: ChannelState) => {
        parameterCount += Object.keys(channel.params).length;
      });
    });

    return {
      nodes: Object.keys(this.state).length,
      channels: channelCount,
      parameters: parameterCount,
      received: this.received
    };
  }

  /**
   * Send a DroneLink message
   */
  async send(msg: DroneLinkMsg): Promise<void> {
    if (!this.liveMode) return;
    
    try {
      await sendDroneLinkMsg({
        addr: `${msg.node}>${msg.channel}.${msg.param}`,
        msgType: msg.msgType,
        values: msg.valueArray()
      });
    } catch (error) {
      console.error('Failed to send DroneLink message:', error);
    }
  }

  /**
   * Queue a message for discovery
   */
  private queueMessage(msg: DroneLinkMsg): void {
    this.discoveryQueue.push(msg);
  }

  /**
   * Query a specific parameter
   */
  private queryParameter(node: number, channel: number, param: number): void {
    const qm = new DroneLinkMsg();
    qm.source = this.localAddress;
    qm.node = node;
    qm.channel = channel;
    qm.param = param;
    qm.msgType = DRONE_LINK_MSG_TYPE_QUERY;
    qm.msgLength = 1;
    this.queueMessage(qm);
  }

  /**
   * Process discovery queue
   */
  private processDiscoveryQueue(): void {
    if (this.discoveryQueue.length > 0) {
      const msg = this.discoveryQueue.shift();
      if (msg) {
        this.send(msg).catch(error => {
          console.error('Error processing discovery queue:', error);
        });
      }
    }
  }

  /**
   * Periodic discovery process
   */
  private discovery(): void {
    // Discovery logic can be implemented here
    // For now, just maintain the queue processing
  }

  /**
   * Start streaming real-time messages for a domain using long-polling
   */
  /** Compatibility alias: this loads shared observations, never packet history. */
  async loadHistory(domainId: string, live = true): Promise<void> { return this.loadObservations(domainId, live); }

  async loadObservations(domainId: string, live = true): Promise<void> {
    this.reset();
    await this.cloud.load(domainId, live);
  }

  private applyCloudView(view: ObservationView): void {
    const state: GlobalState = {};
    let unavailable = 0;
    for (const row of view.nodes) state[row.nodeAddress] = { id: row.nodeAddress, observationGeneration: row.generation, droneId: row.droneId,
      channels: {}, lastHeard: row.lastReceivedAt ? Date.parse(row.lastReceivedAt) : 0, interface: 'cloud' };
    for (const row of view.channels) {
      const node = state[row.nodeAddress]; if (!node || node.observationGeneration !== row.generation) continue;
      const channel: ChannelState = { channel: row.channel, params: {}, lastHeard: Date.parse(row.lastReceivedAt) };
      for (const [id, facets] of Object.entries(row.params)) {
        const parameter: ParameterState = { param: Number(id), msgType: 0, bytesPerValue: 0, numValues: 0, values: [], writable: false };
        for (const kind of ['value', 'name'] as const) {
          const facet = facets[kind]; if (!facet) continue;
          try {
          let payload: Uint8Array;
          try {
            if (typeof facet.payload !== 'string') throw new ProtocolValidationError('invalid-input', 'base64');
            payload = Uint8Array.from(atob(facet.payload), c => c.charCodeAt(0));
          }
          catch { throw new ProtocolValidationError('invalid-input', 'base64'); }
          const type = kind === 'name' ? DRONE_LINK_MSG_TYPE_NAME : facet.msgType!;
          const bytes = encodeLinkPacket({ source: facet.origin.sourceAddress, node: row.nodeAddress, channel: row.channel, param: Number(id), priority: 0, msgType: type, msgLength: payload.length, writable: kind === 'value' ? facet.writable ?? false : false }, payload);
          const msg = new DroneLinkMsg(); msg.parse(bytes.buffer);
          if (kind === 'name') { parameter.name = msg.payloadToString(); parameter.nameLastHeard = Date.parse(facet.lastReceivedAt); parameter.nameSource = facet.origin.kind === 'gateway' ? `Gateway ${facet.origin.forwarderAddress}` : 'HTTP'; }
          else {
            parameter.msgType = type; parameter.bytesPerValue = msg.bytesPerValue(); parameter.numValues = msg.numValues();
            parameter.values = msg.valueArray() as number[] | string[]; parameter.writable = !!facet.writable;
            if (facet.writable === true && type <= DRONE_LINK_MSG_TYPE_CHAR && view.activationEpoch) {
              parameter.writeObservation = { bytes: payload, expected: { observationEpoch: view.activationEpoch,
                nodeGeneration: row.generation, msgType: type, payloadBytes: payload.length, writable: true } };
            }
            parameter.lastHeard = Date.parse(facet.lastReceivedAt); parameter.timestamp = Date.parse(facet.valueLastChangedAt!);
            parameter.source = facet.origin.kind === 'gateway' ? `Gateway ${facet.origin.forwarderAddress}` : 'HTTP';
            if (Number(id) === DRONE_MODULE_PARAM_TYPE && type <= DRONE_LINK_MSG_TYPE_CHAR) channel.type = parameter.values[0];
            if (Number(id) === DRONE_MODULE_PARAM_NAME && type === DRONE_LINK_MSG_TYPE_CHAR) channel.name = msg.payloadToString();
            if (row.channel === 1 && Number(id) === 8 && type === DRONE_LINK_MSG_TYPE_CHAR) node.name = msg.payloadToString();
          }
          } catch (error) {
            if (!(error instanceof ProtocolValidationError)) throw error;
            parameter.unavailable = { ...parameter.unavailable, [kind]: error.code };
            unavailable++;
          }
        }
        channel.params[Number(id)] = parameter;
      }
      node.channels[row.channel] = channel;
    }
    this.unavailableObservationParts = unavailable;
    this.state = state; this.received = view.channels.reduce((count, row) => count + Object.keys(row.params).length, 0); this.trigger('state.changed');
  }

  startStreaming(domainId: string, cursor?: string): void {
    void this.loadObservations(domainId, true).catch(error => console.error('Shared observations unavailable', error));
  }

  stopStreaming(): void {
    this.cloud.stop();
    this.pollingActive = false;
  }
}
