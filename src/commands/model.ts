import {
  DRONE_LINK_MSG_TYPE_ADDR as ADDR, DRONE_LINK_MSG_TYPE_CHAR as CHAR,
  DRONE_LINK_MSG_TYPE_FLOAT as FLOAT, DRONE_LINK_MSG_TYPE_UINT32_T as UINT32,
  DRONE_LINK_MSG_TYPE_UINT8_T as UINT8
} from '@dronelink/protocol';

export interface Target { nodeAddress: number; channel: number; param: number }
export interface Expected { observationEpoch: string; nodeGeneration: number; msgType: number; payloadBytes: number; writable: true }
export interface Address { source: number; node: number; channel: number; param: number; priority: number }
export type Payload = { values: number[] } | { text: string } | { addresses: Address[] };
export type Query = 'query-value' | 'query-name';
export type Intent = { target: Target } & ({ operation: Query } | { operation: 'write'; expected: Expected; payload: Payload });
interface Attribution { userId: string; displayName: string }
export interface Command {
  id: string; domainId: string; target: Target; operation: Intent['operation']; requested: Payload | null;
  state: 'pending' | 'retrieved' | 'expired' | 'cancelled' | 'superseded' | 'invalidated';
  transport: 'http'; priority: number; acceptedAt: string; expiresAt: string; terminalAt: string | null;
  reason: string | null; submittedBy: Attribution; cancelledBy: Attribution | null;
}
export interface WriteObservation { expected: Expected; bytes: Uint8Array }

export const addressFields = ['source', 'node', 'channel', 'param', 'priority'] as const;
const addressLimits = [255, 255, 255, 63, 3];
export const commandAddress = ({ nodeAddress, channel, param }: Target) => `${nodeAddress}>${channel}.${param}`;
export const operationLabel = (kind: Intent['operation']) => ({ write: 'Write', 'query-value': 'Value query', 'query-name': 'Name query' })[kind];

function visibleText(bytes: Uint8Array): string {
  return Array.from(bytes).slice(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0)).map(code => {
    if (code === 92) return '\\\\';
    if (code === 10) return '\\n';
    if (code === 13) return '\\r';
    if (code === 9) return '\\t';
    if (code < 32 || (code >= 127 && code <= 159)) return '\\x' + code.toString(16).padStart(2, '0');
    return String.fromCharCode(code);
  }).join('');
}
function decodeText(text: string): string {
  return text.replace(/\\(?:x([0-9a-fA-F]{2})|([nrt\\])|.)|\\$/g, (_, byte, short) => {
    if (byte) return String.fromCharCode(Number.parseInt(byte, 16));
    if (short === 'n') return '\n';
    if (short === 'r') return '\r';
    if (short === 't') return '\t';
    if (short === '\\') return '\\';
    throw new Error('Use a valid text escape or enter a double backslash.');
  });
}
export function fieldsFromObservation({ expected, bytes }: WriteObservation): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (expected.msgType) {
    case CHAR: return [visibleText(bytes)];
    case UINT8: return Array.from(bytes, String);
    case ADDR: {
      const result = [];
      for (let i = 0; i < bytes.length; i += 4) result.push(bytes[i], bytes[i+1], bytes[i+2], bytes[i+3] & 63, bytes[i+3] >> 6);
      return result.map(String);
    }
    default: return Array.from({ length: bytes.length / 4 }, (_, i) => {
      const value = expected.msgType === UINT32 ? view.getUint32(i * 4, true) : view.getFloat32(i * 4, true);
      return Number.isFinite(value) ? String(value) : '';
    });
  }
}

export function integer(text: string, min: number, max: number, label: string) {
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
export function typedPayload(expected: Expected, fields: string[]): Payload {
  if (expected.msgType === CHAR) {
    const text = decodeText(fields[0]);
    if (text.length > expected.payloadBytes || /[^\u0001-\u00ff]/.test(text)) throw new Error('Use only single-byte characters and stay within the observed size.');
    return { text };
  }
  if (expected.msgType === ADDR) {
    const addresses: Address[] = [];
    for (let i = 0; i < fields.length; i += 5) {
      const [source, node, channel, param, priority] = addressFields.map((name, n) => integer(fields[i+n], 0, addressLimits[n], name));
      addresses.push({ source, node, channel, param, priority });
    }
    return { addresses };
  }
  if (expected.msgType !== FLOAT) return { values: fields.map((text, i) => integer(text, 0, expected.msgType === UINT8 ? 255 : 0xffffffff, `Value ${i+1}`)) };
  return { values: fields.map(text => {
    const value = Number(text);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Math.fround(value))) throw new Error('Enter a finite FLOAT value.');
    return value;
  }) };
}
export function requestedText(payload: Payload) {
  if ('text' in payload) return JSON.stringify(payload.text);
  if ('values' in payload) return payload.values.join(', ');
  return payload.addresses.map(a => `${a.source}:${a.node}>${a.channel}.${a.param} (priority ${a.priority})`).join(', ');
}
