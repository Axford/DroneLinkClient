export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
}
export const affectsDomain = (event: Event, domainId: string) => {
    const detail = (event as CustomEvent).detail || {};
    return detail.status === 401 || detail.domainId === domainId || detail.url === '/api/user' || detail.url === '/api/session' || (typeof detail.url === 'string' && (detail.url === `/api/domains/${domainId}` || detail.url.startsWith(`/api/domains/${domainId}/`)));
};
export const accessEvent = 'dronelink:access-changed';
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
        const session = await fetch('/api/session', { credentials: 'include', signal: options.signal });
        if (!session.ok) {
            if (!options.signal?.aborted) window.dispatchEvent(new CustomEvent(accessEvent, { detail: { status: session.status, url } }));
            throw new ApiError(session.status, 'unauthenticated', 'Sign in again to continue.');
        }
        headers.set('X-CSRF-Token', (await session.json()).data.csrfToken);
        headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, { ...options, credentials: 'include', headers });
    if (!options.signal?.aborted && [401, 403].includes(response.status)) window.dispatchEvent(new CustomEvent(accessEvent, { detail: { status: response.status, url } }));
    return response;
};
export const authenticatedFetchJson = async (url: string, options: RequestInit = {}): Promise<any> => {
    const response = await authenticatedFetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, result.code || 'request-failed', response.status === 409 ? (result.message || 'The record changed.') + ' Refresh, review the latest state, and repeat your action.' : result.message || 'Request failed');
    return result;
};
export const mutate = (url: string, body: unknown = {}, method = 'POST') => authenticatedFetchJson(url, { method, body: JSON.stringify(body) });
export const logout = async (returnTo?: string) => { await authenticatedFetch('/auth/logout', { method: 'POST', body: '{}' }); const valid = typeof returnTo === 'string' && /^\/invite\/[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9_-]{43}$/.test(returnTo); window.location.assign(valid ? '/auth/google?returnTo=' + encodeURIComponent(returnTo!) : '/public'); };
