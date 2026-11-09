import { ProtocolValidationError, readLinkPacket, readLinkLog, encodeLinkPacket, encodeLinkLog, typedPayload, textPayload, integerField } from '@dronelink/protocol';
import type { PacketBytes, DecodedLink } from '@dronelink/protocol';
import {
  DRONE_LINK_MSG_TYPE_UINT8_T,
  DRONE_LINK_MSG_TYPE_ADDR,
  DRONE_LINK_MSG_TYPE_UINT32_T,
  DRONE_LINK_MSG_TYPE_FLOAT,
  DRONE_LINK_MSG_TYPE_CHAR,
  DRONE_LINK_MSG_TYPE_NAME,
  DRONE_LINK_MSG_TYPE_NAMEQUERY,
  DRONE_LINK_MSG_TYPE_QUERY,
  DRONE_LINK_MSG_PRIORITY_LOW,
  DRONE_LINK_MSG_PRIORITY_MEDIUM,
  DRONE_LINK_MSG_PRIORITY_HIGH,
  DRONE_LINK_MSG_PRIORITY_CRITICAL,
  DRONE_MODULE_PARAM_STATUS,
  DRONE_MODULE_PARAM_NAME,
  DRONE_MODULE_PARAM_ERROR,
  DRONE_MODULE_PARAM_RESETCOUNT,
  DRONE_MODULE_PARAM_TYPE,
  DRONE_LINK_MSG_WRITABLE,
  DRONE_LINK_MSG_TYPE_SIZES,
  DRONE_LINK_MSG_MAX_PAYLOAD,
  DRONE_LINK_MSG_HEADER_BYTES
} from '@dronelink/protocol';

export { ProtocolValidationError } from '@dronelink/protocol';
export {
  DRONE_LINK_MSG_TYPE_UINT8_T,
  DRONE_LINK_MSG_TYPE_ADDR,
  DRONE_LINK_MSG_TYPE_UINT32_T,
  DRONE_LINK_MSG_TYPE_FLOAT,
  DRONE_LINK_MSG_TYPE_CHAR,
  DRONE_LINK_MSG_TYPE_NAME,
  DRONE_LINK_MSG_TYPE_NAMEQUERY,
  DRONE_LINK_MSG_TYPE_QUERY,
  DRONE_LINK_MSG_PRIORITY_LOW,
  DRONE_LINK_MSG_PRIORITY_MEDIUM,
  DRONE_LINK_MSG_PRIORITY_HIGH,
  DRONE_LINK_MSG_PRIORITY_CRITICAL,
  DRONE_MODULE_PARAM_STATUS,
  DRONE_MODULE_PARAM_NAME,
  DRONE_MODULE_PARAM_ERROR,
  DRONE_MODULE_PARAM_RESETCOUNT,
  DRONE_MODULE_PARAM_TYPE,
  DRONE_LINK_MSG_WRITABLE,
  DRONE_LINK_MSG_TYPE_SIZES,
  DRONE_LINK_MSG_MAX_PAYLOAD,
  DRONE_LINK_MSG_HEADER_BYTES
};

/**
 * DroneLink Message System - React/TypeScript Port
 * 
 * Handles parsing and creation of DroneLink messages for the mesh network protocol.
 * Each message addresses a specific parameter within a channel of a node.
 */

export const DRONE_LINK_MSG_TYPE_NAMES = [
  'u8', 'a', 'u32', 'f', 'c', 'n', 'nq', 'q'
];

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

  constructor(buffer?: PacketBytes) {
    this.rawPayload = new ArrayBuffer(DRONE_LINK_MSG_MAX_PAYLOAD);
    this.uint8Payload = new Uint8Array(this.rawPayload);
    
    if (buffer !== undefined) {
      this.parse(buffer);
    }
  }

  /**
   * Parse a raw message buffer into this message object
   */
  parse(rawBuffer: PacketBytes): void {
    this.assignDecoded(readLinkPacket(rawBuffer));
  }

  /**
   * Parse legacy binary log (size byte, unsigned low32-bit timestamp, link packet)
   */
  parseFromLog(buffer: PacketBytes): void {
    this.assignDecoded(readLinkLog(buffer));
  }

  /**
   * Get the unique signature for this message type
   */
  private assignDecoded(packet: DecodedLink & {timestamp?:number}): void {
    const {payload, ...fields}=packet;
    this.uint8Payload.fill(0);this.uint8Payload.set(payload);
    Object.assign(this,fields);
  }

  private replacePayload(type: number, bytes: Uint8Array, resetWritable: boolean = true): void {
    this.uint8Payload.fill(0);this.uint8Payload.set(bytes);
    this.msgType=type;this.msgLength=bytes.length;
    if(resetWritable)this.writable=false;
  }

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
        const temp = new Uint8Array(this.rawPayload, 0, this.msgLength);
        return Array.from(temp);
      }
      
      case DRONE_LINK_MSG_TYPE_UINT32_T: {
        const temp = Array.from({length:numValues},(_,i)=>new DataView(this.rawPayload).getUint32(i*4,true));
        return Array.from(temp);
      }
      
      case DRONE_LINK_MSG_TYPE_FLOAT: {
        const temp = Float32Array.from(Array.from({length:numValues},(_,i)=>new DataView(this.rawPayload).getFloat32(i*4,true)));
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
    this.replacePayload(0,typedPayload(0,values));
  }

  /**
   * Set uint32 values
   */
  setUint32(values: number[]): void {
    this.replacePayload(2,typedPayload(2,values));
  }

  /**
   * Set float values
   */
  setFloat(values: number[]): void {
    this.replacePayload(3,typedPayload(3,values));
  }

  /**
   * Set string value
   */
  setString(s: string): void {
    this.replacePayload(4,textPayload(s),false);
  }

  /**
   * Set address values
   */
  setAddr(values: number[]): void {
    this.replacePayload(1,typedPayload(1,values));
  }

  /**
   * Parse address string (e.g., "1>2.3") into components
   */
  parseAddress(addr: string): DroneLinkAddress {
    if(typeof addr!=='string'||!/^\d+>\d+\.\d+$/.test(addr))throw new ProtocolValidationError('invalid-field','address');
    const [node,channel,param]=addr.split(/[>.]/).map(Number);
    integerField(node,0,255,'node');integerField(channel,0,255,'channel');integerField(param,0,63,'param');
    return {node,channel,param};
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
    const packet=readLinkPacket(msg.encodeUnframed());
    this.assignDecoded(packet);
    this.timestamp=msg.timestamp;
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
    return DRONE_LINK_MSG_HEADER_BYTES + this.msgLength;
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
    const payload = this.encodeUnframed();
    const frame = new Uint8Array(payload.length + 2);
    frame[0] = 0xFE;
    frame.set(payload, 1);
    // CRC-8, polynomial 0x07, initial 0; exclude marker and CRC byte.
    let crc = 0;
    for (let index = 0; index < payload.length; index++) {
      crc ^= payload[index];
      for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x80) ? 0x07 : 0)) & 0xFF;
    }
    frame[frame.length - 1] = crc;
    return frame;
  }

  /**
   * Encode message without framing
   */
  encodeUnframed(): Uint8Array {
    return encodeLinkPacket(this,this.uint8Payload.subarray(0,this.msgLength));
  }

  /**
   * Encode message for logging with timestamp
   */
  encodeForLog(): Uint8Array {
    return encodeLinkLog(this,this.uint8Payload.subarray(0,this.msgLength),this.timestamp);
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