import { authenticatedFetch, ApiError } from '../utils/api';

export interface ObservationFacet {
  payload: string; msgType?: number; writable?: boolean; lastReceivedAt: string;
  valueLastChangedAt?: string; nameLastChangedAt?: string;
  origin: { kind: 'http' | 'gateway'; forwarderAddress: number; sourceAddress: number; gatewayId?: string };
}
export interface ObservationNode { nodeAddress: number; generation: number; revision: number; resetAt: string | null; lastReceivedAt?: string | null; droneId?: string }
export interface ObservationChannel { nodeAddress: number; generation: number; revision: number; channel: number; lastReceivedAt: string; params: Record<string, { value?: ObservationFacet; name?: ObservationFacet }> }
export interface ObservationEvent { nodes: ObservationNode[]; channels: ObservationChannel[] }
export interface ObservationView { nodes: ObservationNode[]; channels: ObservationChannel[] }
interface SnapshotData extends ObservationView { schemaVersion: number; activationEpoch: string; startCursor: string; catchUpCursor: string | null }
interface UpdateData { events: ObservationEvent[]; cursor: string; caughtUp: boolean }
interface Page<T> { data: T; pagination: { nextCursor: string | null } }
export type ObservationStatus = 'idle' | 'loading' | 'resynchronising' | 'ready' | 'stopped';

// One cloud observation lifecycle owns paging, catch-up, cancellation and reset.
// Packet history is intentionally absent from this interface.
export class CloudObservations {
  private nodes = new Map<number, ObservationNode>();
  private channels = new Map<string, ObservationChannel>();
  private controllers = new Set<AbortController>();
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private domain?: string;
  private cursor?: string;
  private live = false;
  private lastDiagnostics = 0;
  private diagnosticRequest?: Promise<void>;
  status: ObservationStatus = 'idle';
  failedWrites = 0;

  constructor(private changed: (view: ObservationView) => void) {}
  private publish() { this.changed({ nodes: Array.from(this.nodes.values()), channels: Array.from(this.channels.values()) }); }
  private apply(event: ObservationEvent) {
    for (const row of event.nodes) {
      const old = this.nodes.get(row.nodeAddress);
      if (old && (row.generation < old.generation || row.generation === old.generation && row.revision < old.revision)) continue;
      if (!old || row.generation > old.generation) for (const [key, channel] of Array.from(this.channels)) if (channel.nodeAddress === row.nodeAddress) this.channels.delete(key);
      this.nodes.set(row.nodeAddress, { ...old, ...row });
    }
    for (const row of event.channels) {
      const node = this.nodes.get(row.nodeAddress); if (!node || node.generation !== row.generation) continue;
      const key = `${row.nodeAddress}:${row.channel}`; const old = this.channels.get(key);
      if (!old || row.generation > old.generation || row.revision > old.revision) this.channels.set(key, row);
    }
  }
  private async request<T>(domain: string, path: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Page<T>> {
    const controller = new AbortController(); this.controllers.add(controller);
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await authenticatedFetch(`/api/domains/${encodeURIComponent(domain)}/${path}`, { ...options, signal: controller.signal, headers: { 'X-Observation-Contract': '1', ...options.headers } });
      const body = await response.json();
      if (!response.ok) throw new ApiError(response.status, body.code || 'request-failed', body.message || 'Shared observation request failed');
      return body;
    } finally { clearTimeout(deadline); this.controllers.delete(controller); }
  }
  stop() {
    this.generation++; this.live = false; this.domain = undefined;
    clearTimeout(this.timer); this.timer = undefined;
    for (const controller of Array.from(this.controllers)) controller.abort();
    this.controllers.clear(); this.status = 'stopped'; this.publish();
  }
  async load(domain: string, live = true, resynchronising = false): Promise<void> {
    this.stop(); const generation = this.generation; this.domain = domain; this.live = live;
    this.nodes.clear(); this.channels.clear(); this.failedWrites = 0; this.lastDiagnostics = 0;
    this.status = resynchronising ? 'resynchronising' : 'loading'; this.publish();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let pageCursor: string | null = null; let start = ''; let through = '';
        do {
          const page: Page<SnapshotData> = await this.request<SnapshotData>(domain, `observations${pageCursor ? '?cursor=' + encodeURIComponent(pageCursor) : ''}`);
          if (generation !== this.generation) return;
          if (page.data.schemaVersion !== 1 || page.data.activationEpoch !== 'm1-c-1') throw new ApiError(426, 'client-refresh-required', 'Refresh the application: the shared observation contract differs.');
          this.apply(page.data); if (!start) start = page.data.startCursor;
          through = page.data.catchUpCursor || ''; pageCursor = page.pagination.nextCursor;
        } while (pageCursor);
        this.cursor = start;
        while (true) {
          const page: Page<UpdateData> = await this.request<UpdateData>(domain, `observations/updates?cursor=${encodeURIComponent(this.cursor!)}&through=${encodeURIComponent(through)}&timeoutMs=0`);
          if (generation !== this.generation) return;
          for (const event of page.data.events) this.apply(event);
          this.cursor = page.data.cursor; if (page.data.caughtUp) break;
        }
        this.status = 'ready'; this.publish();
        void this.diagnostics(domain, generation);
        if (generation === this.generation && live) void this.poll(domain, generation);
        return;
      } catch (error) {
        if (generation !== this.generation) return;
        if (error instanceof ApiError && error.status === 410 && attempt < 2) { this.nodes.clear(); this.channels.clear(); this.status = 'resynchronising'; this.publish(); continue; }
        this.status = 'stopped'; this.publish(); throw error;
      }
    }
  }
  private diagnostics(domain: string, generation: number): Promise<void> {
    if (this.diagnosticRequest || Date.now() - this.lastDiagnostics < 60000) return Promise.resolve();
    this.lastDiagnostics = Date.now();
    const task = (async () => {
      try {
        const result = await this.request<{ snapshotWriteFailures: number }>(domain, 'observation-diagnostics', {}, 5000);
        if (generation === this.generation) { this.failedWrites = result.data.snapshotWriteFailures; this.publish(); }
      } catch { /* Diagnostics are passive, cancellable and never block update polling. */ }
    })().finally(() => { if (this.diagnosticRequest === task) this.diagnosticRequest = undefined; });
    this.diagnosticRequest = task; return task;
  }
  private async poll(domain: string, generation: number): Promise<void> {
    if (!this.live || generation !== this.generation) return;
    let delay = 100;
    try {
      const page: Page<UpdateData> = await this.request<UpdateData>(domain, `observations/updates?cursor=${encodeURIComponent(this.cursor!)}&timeoutMs=25000`);
      if (generation !== this.generation) return;
      for (const event of page.data.events) this.apply(event);
      this.cursor = page.data.cursor; this.publish(); void this.diagnostics(domain, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof ApiError && error.status === 410) { await this.resynchronise(domain); return; }
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { this.stop(); return; }
      delay = 5000;
    }
    if (generation === this.generation && this.live) this.timer = setTimeout(() => { void this.poll(domain, generation); }, delay);
  }
  private async resynchronise(domain: string): Promise<void> {
    try { await this.load(domain, true, true); }
    catch (error) {
      if (error instanceof ApiError && [400, 401, 403, 404, 426].includes(error.status)) { this.stop(); return; }
      const generation = this.generation;
      if (this.domain === domain && this.live) { this.status = 'resynchronising'; this.publish(); }
      if (this.domain === domain && this.live) this.timer = setTimeout(() => {
        if (generation === this.generation) void this.resynchronise(domain);
      }, 5000);
    }
  }
  async resetNode(nodeAddress: number): Promise<void> {
    const domain = this.domain, generation = this.generation; const node = this.nodes.get(nodeAddress);
    if (!domain || !node) throw new Error('Load this node before resetting its observations.');
    try {
      const result = await this.request<ObservationNode>(domain, `nodes/${nodeAddress}/reset`, { method: 'POST', body: JSON.stringify({ expectedGeneration: node.generation }) });
      if (generation !== this.generation) return;
      this.apply({ nodes: [{ ...result.data, lastReceivedAt: null }], channels: [] }); this.publish();
    } catch (error) {
      if (generation === this.generation && error instanceof ApiError && error.status === 409) await this.load(domain, this.live);
      throw error;
    }
  }
}
