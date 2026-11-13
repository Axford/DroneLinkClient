import { authenticatedFetchJson, mutate } from '../utils/api';

export interface CloudFileEntry { path: string; modifiedAt: string }
export interface CloudFile extends CloudFileEntry { text: string; revision: string }

export function cloudNodeFiles(domainId: string, node: number) {
    const endpoint = `/api/domains/${encodeURIComponent(domainId)}/nodes/${node}/cloud-files`;
    return {
        async list(): Promise<CloudFileEntry[]> {
            return (await authenticatedFetchJson(endpoint)).data;
        },
        async open(path: string): Promise<CloudFile> {
            return (await authenticatedFetchJson(`${endpoint}?${new URLSearchParams({ path })}`)).data;
        },
        async save(path: string, text: string, revision: string | null): Promise<CloudFile> {
            return (await mutate(endpoint, { path, text, revision }, 'PUT')).data;
        },
    };
}
