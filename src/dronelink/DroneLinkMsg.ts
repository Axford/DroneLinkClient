/**
 * DroneLink Message System - React/TypeScript Port
 * 
 * Handles parsing and creation of DroneLink messages for the mesh network protocol.
 * Each message addresses a specific parameter within a channel of a node.
 */

// Message Type Constants
export const DRONE_LINK_MSG_TYPE_UINT8_T = 0;
export const DRONE_LINK_MSG_TYPE_ADDR = 1;
export const DRONE_LINK_MSG_TYPE_UINT32_T = 2;
export const DRONE_LINK_MSG_TYPE_FLOAT = 3;
export const DRONE_LINK_MSG_TYPE_CHAR = 4;
export const DRONE_LINK_MSG_TYPE_NAME = 5;
export const DRONE_LINK_MSG_TYPE_NAMEQUERY = 6;
export const DRONE_LINK_MSG_TYPE_QUERY = 7;

// Message Priority Constants
export const DRONE_LINK_MSG_PRIORITY_LOW = 0;
export const DRONE_LINK_MSG_PRIORITY_MEDIUM = 1;
export const DRONE_LINK_MSG_PRIORITY_HIGH = 2;
export const DRONE_LINK_MSG_PRIORITY_CRITICAL = 3;

// Module Parameter Constants
export const DRONE_MODULE_PARAM_STATUS = 1;
export const DRONE_MODULE_PARAM_NAME = 2;
export const DRONE_MODULE_PARAM_ERROR = 3;
export const DRONE_MODULE_PARAM_RESETCOUNT = 4;
export const DRONE_MODULE_PARAM_TYPE = 5;

// Utility Constants
export const DRONE_LINK_MSG_WRITABLE = 0b10000000;

export const DRONE_LINK_MSG_TYPE_NAMES = [
  'u8', 'a', 'u32', 'f', 'c', 'n', 'nq', 'q'
];

export const DRONE_LINK_MSG_TYPE_SIZES = [1, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export interface DroneLinkAddress {
  node: number;
  channel: number;
  param: number;
}

export interface DroneLinkMessageData {
  source: number;
  node: number;
  channel: number;
  param: number;
  priority: number;
  msgType: number;
  msgLength: number;
  writable: boolean;
  values: number[] | string[];
  timestamp: number;
}

export class DroneLinkMsg {
  public source: number = 0;
  public node: number = 0;
  public channel: number = 0;
  public param: number = 0;
  public priority: number = DRONE_LINK_MSG_PRIORITY_LOW;
  public msgType: number = 0;
  public msgLength: number = 0;
  public writable: boolean = false;
  public timestamp: number = Date.now();
  
  private rawPayload: ArrayBuffer;
  private uint8Payload: Uint8Array;

  constructor(buffer?: ArrayBuffer) {
    this.rawPayload = new ArrayBuffer(16);
    this.uint8Payload = new Uint8Array(this.rawPayload);
    
    if (buffer) {
      this.parse(buffer);
    }
  }

  /**
   * Parse a raw message buffer into this message object
   */
  parse(rawBuffer: ArrayBuffer): void {
    const buffer = new Uint8Array(rawBuffer, 0);
    this.source = buffer[0];
    this.node = buffer[1];
    this.channel = buffer[2];
    this.param = buffer[3] & 0b00111111;
    this.priority = buffer[3] >> 6;
    this.msgType = (buffer[4] >> 4) & 0x07;
    this.msgLength = (buffer[4] & 0x0F) + 1;
    this.writable = (buffer[4] & DRONE_LINK_MSG_WRITABLE) > 0;
    
    for (let i = 0; i < this.msgLength; i++) {
      this.uint8Payload[i] = buffer[5 + i];
    }
  }

  /**
   * Parse from MongoDB log format (includes timestamp)
   */
  parseFromLog(buffer: Uint8Array): void {
    const t = (buffer[1] << 24) + (buffer[2] << 16) + (buffer[3] << 8) + buffer[4];
    this.timestamp = t;

    this.source = buffer[5 + 0];
    this.node = buffer[5 + 1];
    this.channel = buffer[5 + 2];
    this.param = buffer[5 + 3] & 0b00111111;
    this.priority = buffer[5 + 3] >> 6;
    this.msgType = (buffer[5 + 4] >> 4) & 0x07;
    this.msgLength = (buffer[5 + 4] & 0x0F) + 1;
    this.writable = (buffer[5 + 4] & DRONE_LINK_MSG_WRITABLE) > 0;
    
    for (let i = 0; i < this.msgLength; i++) {
      this.uint8Payload[i] = buffer[5 + 5 + i];
    }
  }

  /**
   * Get the unique signature for this message type
   */
  getSignature(): string {
    return `${this.node}>${this.channel}.${this.param}_${this.msgType}`;
  }

  /**
   * Get the address as a string
   */
  addressAsString(): string {
    return `${this.source}:${this.node}>${this.channel}.${this.param}`;
  }

  /**
   * Get a human-readable string representation
   */
  asString(): string {
    const typeName = DRONE_LINK_MSG_TYPE_NAMES[this.msgType] || 'unknown';
    const writableFlag = this.writable ? ',W' : '';
    return `${this.addressAsString()} (${typeName}${writableFlag})=${this.payloadToString()}`;
  }

  /**
   * Check if this message has the same signature as another
   */
  sameSignature(msg: DroneLinkMsg): boolean {
    return this.source === msg.source &&
           this.node === msg.node &&
           this.channel === msg.channel &&
           this.param === msg.param &&
           this.msgType === msg.msgType;
  }

  /**
   * Check if this message has the same address as another
   */
  sameAddress(msg: DroneLinkMsg): boolean {
    return this.node === msg.node &&
           this.channel === msg.channel &&
           this.param === msg.param;
  }

  /**
   * Get the number of bytes per value for this message type
   */
  bytesPerValue(): number {
    return DRONE_LINK_MSG_TYPE_SIZES[this.msgType];
  }

  /**
   * Get the number of values in this message
   */
  numValues(): number {
    return this.msgLength / this.bytesPerValue();
  }

  /**
   * Extract values as an array based on message type
   */
  valueArray(): number[] | string[] {
    const numValues = this.numValues();
    
    switch (this.msgType) {
      case DRONE_LINK_MSG_TYPE_UINT8_T: {
        const temp = new Uint8Array(this.rawPayload, 0, numValues);
        return Array.from(temp);
      }
      
      case DRONE_LINK_MSG_TYPE_ADDR: {
        const temp = new Uint8Array(this.rawPayload, 0, 4);
        return Array.from(temp);
      }
      
      case DRONE_LINK_MSG_TYPE_UINT32_T: {
        const temp = new Uint32Array(this.rawPayload, 0, numValues);
        return Array.from(temp);
      }
      
      case DRONE_LINK_MSG_TYPE_FLOAT: {
        const temp = new Float32Array(this.rawPayload, 0, numValues);
        return Array.from(temp);
      }
      
      case DRONE_LINK_MSG_TYPE_CHAR:
      case DRONE_LINK_MSG_TYPE_NAME: {
        return [this.payloadToString()];
      }
      
      default:
        return [];
    }
  }

  /**
   * Convert payload to string representation
   */
  payloadToString(): string {
    if (this.msgType === DRONE_LINK_MSG_TYPE_CHAR || this.msgType === DRONE_LINK_MSG_TYPE_NAME) {
      let s = '';
      for (let i = 0; i < this.msgLength; i++) {
        s += String.fromCharCode(this.uint8Payload[i]);
      }
      return this.trimNull(s);
    } else {
      let s = '';
      for (let i = 0; i < this.msgLength; i++) {
        s += this.uint8Payload[i].toString(16) + ' ';
      }
      return s.trim();
    }
  }

  /**
   * Set uint8 values
   */
  setUint8(values: number[]): void {
    this.msgType = DRONE_LINK_MSG_TYPE_UINT8_T;
    this.msgLength = values.length;
    this.writable = false;
    for (let i = 0; i < values.length; i++) {
      this.uint8Payload[i] = values[i];
    }
  }

  /**
   * Set uint32 values
   */
  setUint32(values: number[]): void {
    this.msgType = DRONE_LINK_MSG_TYPE_UINT32_T;
    this.msgLength = values.length * 4;
    this.writable = false;
    const vv = new Uint32Array(this.rawPayload, 0, values.length);
    for (let i = 0; i < values.length; i++) {
      vv[i] = values[i];
    }
  }

  /**
   * Set float values
   */
  setFloat(values: number[]): void {
    this.msgType = DRONE_LINK_MSG_TYPE_FLOAT;
    this.msgLength = values.length * 4;
    this.writable = false;
    const vv = new Float32Array(this.rawPayload, 0, values.length);
    for (let i = 0; i < values.length; i++) {
      vv[i] = values[i];
    }
  }

  /**
   * Set string value
   */
  setString(s: string): void {
    this.msgType = DRONE_LINK_MSG_TYPE_CHAR;
    this.msgLength = s.length;
    for (let i = 0; i < this.msgLength; i++) {
      this.uint8Payload[i] = s.charCodeAt(i);
    }
  }

  /**
   * Set address values
   */
  setAddr(values: number[]): void {
    this.msgType = DRONE_LINK_MSG_TYPE_ADDR;
    this.msgLength = 4;
    this.writable = false;
    for (let i = 0; i < values.length && i < 4; i++) {
      this.uint8Payload[i] = values[i];
    }
  }

  /**
   * Parse address string (e.g., "1>2.3") into components
   */
  parseAddress(addr: string): DroneLinkAddress {
    const gti = addr.indexOf('>');
    const pi = addr.indexOf('.');
    return {
      node: parseInt(addr.substring(0, gti)),
      channel: parseInt(addr.substring(gti + 1, pi)),
      param: parseInt(addr.substring(pi + 1))
    };
  }

  /**
   * Set address from string
   */
  setAddress(addr: string): void {
    const a = this.parseAddress(addr);
    this.node = a.node;
    this.channel = a.channel;
    this.param = a.param;
  }

  /**
   * Convert to data object for serialization
   */
  toData(): DroneLinkMessageData {
    return {
      source: this.source,
      node: this.node,
      channel: this.channel,
      param: this.param,
      priority: this.priority,
      msgType: this.msgType,
      msgLength: this.msgLength,
      writable: this.writable,
      values: this.valueArray(),
      timestamp: this.timestamp
    };
  }

  /**
   * Create from data object
   */
  static fromData(data: DroneLinkMessageData): DroneLinkMsg {
    const msg = new DroneLinkMsg();
    msg.source = data.source;
    msg.node = data.node;
    msg.channel = data.channel;
    msg.param = data.param;
    msg.priority = data.priority;
    msg.msgType = data.msgType;
    msg.msgLength = data.msgLength;
    msg.writable = data.writable;
    msg.timestamp = data.timestamp;

    // Set values based on type
    if (Array.isArray(data.values) && typeof data.values[0] === 'string') {
      msg.setString(data.values[0]);
    } else if (Array.isArray(data.values)) {
      const numericValues = data.values as number[];
      switch (data.msgType) {
        case DRONE_LINK_MSG_TYPE_UINT8_T:
          msg.setUint8(numericValues);
          break;
        case DRONE_LINK_MSG_TYPE_UINT32_T:
          msg.setUint32(numericValues);
          break;
        case DRONE_LINK_MSG_TYPE_FLOAT:
          msg.setFloat(numericValues);
          break;
        case DRONE_LINK_MSG_TYPE_ADDR:
          msg.setAddr(numericValues);
          break;
      }
    }

    return msg;
  }

  /**
   * Copy values from another message
   */
  copy(msg: DroneLinkMsg): void {
    this.source = msg.source;
    this.node = msg.node;
    this.channel = msg.channel;
    this.param = msg.param;
    this.priority = msg.priority;
    this.msgType = msg.msgType;
    this.msgLength = msg.msgLength;
    this.writable = msg.writable;
    this.timestamp = msg.timestamp;
    
    for (let i = 0; i < this.msgLength; i++) {
      this.uint8Payload[i] = msg.uint8Payload[i];
    }
  }

  /**
   * Check if values are equal to another message
   */
  valuesEqual(msg: DroneLinkMsg): boolean {
    const a = this.valueArray();
    const b = msg.valueArray();
    
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Get total message size including header
   */
  totalSize(): number {
    return 5 + this.msgLength;
  }

  /**
   * Get size needed for log encoding
   */
  getLogEncodingSize(): number {
    return this.msgLength + 5 + 4 + 1;
  }

  /**
   * Encode message as framed packet for transmission
   */
  encode(): Uint8Array {
    const buffer = new Uint8Array(this.msgLength + 4 + 2);
    buffer[0] = 0xFE; // Frame start
    buffer[1] = this.source;
    buffer[2] = this.node;
    buffer[3] = this.channel;
    buffer[4] = (this.priority << 6) | (this.param & 0b00111111);
    buffer[5] = (this.writable ? DRONE_LINK_MSG_WRITABLE : 0) | 
                (this.msgType << 4) | 
                ((this.msgLength - 1) & 0x0F);

    for (let i = 0; i < this.msgLength; i++) {
      buffer[6 + i] = this.uint8Payload[i];
    }
    
    // Note: CRC calculation would need to be implemented separately
    // buffer[buffer.length - 1] = crc8.calc(buffer.slice(1, this.msgLength + 6), this.msgLength + 5);
    
    return buffer;
  }

  /**
   * Encode message without framing
   */
  encodeUnframed(): Uint8Array {
    const buffer = new Uint8Array(this.msgLength + 5);
    buffer[0] = this.source;
    buffer[1] = this.node;
    buffer[2] = this.channel;
    buffer[3] = (this.priority << 6) | (this.param & 0b00111111);
    buffer[4] = (this.writable ? DRONE_LINK_MSG_WRITABLE : 0) | 
                (this.msgType << 4) | 
                ((this.msgLength - 1) & 0x0F);

    for (let i = 0; i < this.msgLength; i++) {
      buffer[5 + i] = this.uint8Payload[i];
    }
    
    return buffer;
  }

  /**
   * Encode message for logging with timestamp
   */
  encodeForLog(): Uint8Array {
    const packetSize = this.getLogEncodingSize();
    const buffer = new Uint8Array(packetSize);
    buffer[0] = packetSize;

    // Encode timestamp
    buffer[1] = (this.timestamp >> 24) & 0xFF;
    buffer[2] = (this.timestamp >> 16) & 0xFF;
    buffer[3] = (this.timestamp >> 8) & 0xFF;
    buffer[4] = (this.timestamp) & 0xFF;

    // Encode actual packet
    buffer[5 + 0] = this.source;
    buffer[5 + 1] = this.node;
    buffer[5 + 2] = this.channel;
    buffer[5 + 3] = (this.priority << 6) | (this.param & 0b00111111);
    buffer[5 + 4] = (this.writable ? DRONE_LINK_MSG_WRITABLE : 0) | 
                    (this.msgType << 4) | 
                    ((this.msgLength - 1) & 0x0F);

    for (let i = 0; i < this.msgLength; i++) {
      buffer[5 + 5 + i] = this.uint8Payload[i];
    }
    
    return buffer;
  }

  private trimNull(s: string): string {
    const c = s.indexOf('\0');
    if (c > -1) {
      return s.substr(0, c);
    }
    return s;
  }
}

/**
 * Send a DroneLink message via API
 */
export async function sendDroneLinkMsg(msgObj: {
  addr: string;
  msgType: number;
  values: number[] | string[];
}): Promise<void> {
  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(msgObj)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error sending DroneLink message:', error);
    throw error;
  }
}