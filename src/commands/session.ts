import { createContext, useContext, useSyncExternalStore } from 'react';
import { ApiError, authenticatedFetch } from '../utils/api';
import { Command, Intent } from './model';

export interface Scope { domainId: string; userId: string; canSubmit: boolean; canSettings: boolean }
export const CommandScope = createContext<Scope | null>(null);
export const useCommandScope = () => useContext(CommandScope);
export const root = (domainId: string) => '/api/domains/' + encodeURIComponent(domainId);
export const message = (error: unknown) => error instanceof Error ? error.message : 'Command request failed.';
export class CommandError extends ApiError {
  constructor(status: number, code: string, message: string, public command?: Command) { super(status, code, message); }
}
export async function commandRequest<T>(url: string, options: RequestInit & { userId?: string } = {}): Promise<T> {
  const timeout = new AbortController();
  const cancel = () => timeout.abort();
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 20000);
  try {
    const { userId, ...request } = options;
    const headers = new Headers(request.headers);
    if (userId) headers.set('X-Command-User', userId);
    const response = await authenticatedFetch(url, { ...request, headers, signal: timeout.signal });
    const body = await response.json();
    if (!response.ok) throw new CommandError(response.status, body.code || 'request-failed', body.message || 'Command request failed.', body.data?.command);
    if (body?.success !== true || !body.data || typeof body.data !== 'object') throw new Error('The command response was incomplete.');
    return body as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

interface Reservation { submissionId: string; firstUseExpiresAt: string }
interface Attempt {
  status: 'preparing' | 'sending' | 'uncertain' | 'rejected' | 'checking';
  reservation?: Reservation;
  request?: Intent & { submissionId: string };
  error?: string;
}
interface Journal { attempt?: Attempt; last?: Command; notice?: string }
const empty: Journal = {};
const records = new Map<string, Journal>();
const listeners = new Set<() => void>();
const key = (scope: Scope) => JSON.stringify([scope.userId, scope.domainId]);
const current = (scope: Scope | null) => scope ? records.get(key(scope)) || empty : empty;
function update(scope: Scope, change: Journal) {
  records.set(key(scope), change);
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const useCommandJournal = (scope: Scope | null) => useSyncExternalStore(subscribe, () => current(scope));
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const rejectionCodes = new Set(['validation', 'invalid-id', 'metadata-conflict', 'command-capacity', 'domain-archived', 'conflict', 'not-found', 'forbidden', 'unauthenticated', 'csrf']);
const retryRejectionCodes = new Set(['metadata-conflict', 'command-capacity']);
const definitive = (error: unknown) => error instanceof ApiError && rejectionCodes.has(error.code);
const validCommand = (command: Command, scope: Scope) => command?.domainId === scope.domainId &&
  typeof command.id === 'string' && !!command.target && !!command.submittedBy && typeof command.acceptedAt === 'string';
function uncertain(scope: Scope, attempt: Attempt, error: string) {
  update(scope, { ...current(scope), attempt: { ...attempt, status: 'uncertain', error } });
}
async function send(scope: Scope, attempt: Attempt, recovering: boolean) {
  update(scope, { last: current(scope).last, attempt: { ...attempt, status: 'sending' } });
  try {
    const result = await commandRequest<{ data: Command }>(root(scope.domainId) + '/commands', { ...json(attempt.request), userId: scope.userId });
    if (!validCommand(result.data, scope)) throw new Error('The command response was incomplete.');
    update(scope, { last: result.data });
    return result.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 410) {
      update(scope, { last: current(scope).last, notice: 'The reservation is unavailable. Its outcome could not be confirmed.' });
    } else if (definitive(error) && (!recovering || error instanceof ApiError && retryRejectionCodes.has(error.code))) {
      update(scope, { ...current(scope), attempt: { ...attempt, status: 'rejected', error: message(error) } });
    } else {
      uncertain(scope, attempt, recovering ? message(error) : 'Submission outcome is unknown. Check the reservation or retry the same request.');
    }
    throw error;
  }
}
export async function submit(scope: Scope, intent: Intent) {
  if (!scope.canSubmit) throw new Error('Command submission requires current edit access.');
  const prior = current(scope);
  if (prior.attempt && prior.attempt.status !== 'rejected') throw new Error('Resolve the current submission first.');
  let reservation = prior.attempt?.reservation;
  if (!reservation || Date.parse(reservation.firstUseExpiresAt) <= Date.now()) {
    update(scope, { last: prior.last, attempt: { status: 'preparing' } });
    try {
      const prepared = await commandRequest<{ data: Reservation }>(root(scope.domainId) + '/command-submissions', { ...json({}), userId: scope.userId });
      if (!/^[\w-]{43}$/.test(prepared.data.submissionId) || !Number.isFinite(Date.parse(prepared.data.firstUseExpiresAt))) throw new Error('The submission reservation response was incomplete.');
      reservation = prepared.data;
    } catch (error) {
      update(scope, { last: prior.last });
      throw error;
    }
  }
  return send(scope, { status: 'sending', reservation, request: { ...intent, submissionId: reservation.submissionId } }, false);
}
export async function resolveAttempt(scope: Scope, retry = false) {
  const attempt = current(scope).attempt;
  if (attempt?.status !== 'uncertain' || !attempt.reservation) return;
  if (retry) {
    if (!scope.canSubmit) throw new Error('Current edit access is required to retry.');
    return send(scope, attempt, true);
  }
  update(scope, { ...current(scope), attempt: { ...attempt, status: 'checking' } });
  try {
    const { data } = await commandRequest<{ data: { status: 'unused' } | { status: 'accepted'; command: Command } }>(
      root(scope.domainId) + '/command-submissions/' + encodeURIComponent(attempt.reservation.submissionId), { userId: scope.userId });
    if (data.status === 'accepted') {
      if (!validCommand(data.command, scope)) throw new Error('The command response was incomplete.');
      update(scope, { last: data.command });
      return data.command;
    }
    if (data.status !== 'unused') throw new Error('The reservation response was incomplete.');
    uncertain(scope, attempt, 'The reservation is still unused. Check again or retry the same request.');
  } catch (error) {
    if (error instanceof ApiError && error.status === 410) update(scope, { last: current(scope).last, notice: 'The reservation is unavailable. Its outcome could not be confirmed.' });
    else uncertain(scope, attempt, message(error));
    throw error;
  }
}
