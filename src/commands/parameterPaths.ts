import { Command, Payload, Target, WriteObservation } from './model';
import { commandRequest, root, Scope, submit } from './session';
import type { Delivery, ParameterPath } from './ParameterEditor';
import { Transport, transportLabel } from '../workbench/useWorkbenchFeed';
import type { GlobalState } from '../dronelink/DroneLinkState';

export function sampleFor(state: GlobalState, target: Target) {
    const parameter = state[target.nodeAddress]?.channels[target.channel]?.params[target.param];
    if (!parameter) return {};
    const { lastHeard: receivedAt, writable, msgType, writeObservation, observationBytes } = parameter;
    const value = observationBytes && { bytes: observationBytes, msgType };
    return { observation: writeObservation, value, receivedAt, writable: receivedAt === undefined ? undefined : writable };
}

export function cloudParameterPath(scope: Scope, state: GlobalState, target: Target, local: boolean): ParameterPath {
    const getDelivery = (command: Command): Delivery => ({
        status: command.state === 'pending' ? 'Pending retrieval' : command.state === 'retrieved' ? 'Retrieved by polling node' : command.state,
        awaitingObservation: command.state === 'retrieved',
        receivedAfterMs: command.terminalAt ? Date.parse(command.terminalAt) : Date.parse(command.acceptedAt),
        refresh: command.state === 'pending' ? async () => getDelivery((await commandRequest<{ data: Command }>(
            `${root(scope.domainId)}/commands/${encodeURIComponent(command.id)}`, { userId: scope.userId })).data) : undefined,
    });
    return {
        id: 'cloud', label: 'Cloud · HTTP', cloudDelivery: getDelivery, available: scope.canSubmit && !local, sample: sampleFor(state, target),
        write: async (observation, payload) => getDelivery(await submit(scope, { target, operation: 'write', expected: observation.expected, payload })),
        query: () => submit(scope, { target, operation: 'query-value' }),
    };
}

export function parameterBody(target: Target, observation?: WriteObservation, payload?: Payload) {
    return observation ? { target, expected: { msgType: observation.expected.msgType,
        payloadBytes: observation.expected.payloadBytes }, payload } : { target };
}

export async function localParameterResponse(response: Response): Promise<Delivery> {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Local parameter operation failed (${response.status}).`);
    if (body.status !== 'queued' || !Number.isSafeInteger(body.receivedAfterMs))
        throw new Error('The gateway response was incomplete.');
    return { status: 'Queued at local gateway', receivedAfterMs: body.receivedAfterMs, local: true, awaitingObservation: true };
}

export function localParameterPath(target: Target, route: {
    id: string; transport: Transport; available: boolean; state: GlobalState;
    send: (endpoint: string, body: unknown) => Promise<Delivery>;
}): ParameterPath {
    return {
        id: route.id, label: `Local · ${transportLabel[route.transport]}`, available: route.available,
        sample: sampleFor(route.state, target),
        write: (observation, payload) => route.send('parameter-write', parameterBody(target, observation, payload)),
        query: () => route.send('parameter-query', parameterBody(target)),
    };
}
