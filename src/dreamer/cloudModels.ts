import { ApiError, authenticatedFetchJson } from '../utils/api';
import { Axis, BoatPart } from './boatModel';

export interface BoatDocument {
  version: 1;
  name: string;
  forward: Axis;
  up: Axis;
  parts: BoatPart[];
}
export interface Revision {
  modelId: string;
  revisionId: string;
  number: number;
  name: string;
  savedAt: string;
}
export interface Snapshot extends Revision { model: BoatDocument }
interface RevisionPage { data: Revision[]; nextCursor: string | null }

export function cloudModels(domainId: string, signal?: AbortSignal) {
  const root = '/api/domains/' + encodeURIComponent(domainId) + '/dreamer-models';
  const history = (id: string) => root + '/' + encodeURIComponent(id) + '/revisions';
  const cursor = (after?: string) => after ? '?after=' + encodeURIComponent(after) : '';
  const revisionPath = (modelId: string, revisionId: string) => history(modelId) + '/' + encodeURIComponent(revisionId);
  return {
    list: (after?: string): Promise<RevisionPage> => authenticatedFetchJson(root + cursor(after), { signal }),
    history: (modelId: string, after?: string): Promise<RevisionPage> => authenticatedFetchJson(history(modelId) + cursor(after), { signal }),
    async open(modelId: string, revisionId: string): Promise<Snapshot> {
      return (await authenticatedFetchJson(revisionPath(modelId, revisionId), { signal })).data;
    },
    async save(modelId: string, revisionId: string, baseRevisionId: string | null, model: BoatDocument): Promise<Revision> {
      try {
        return (await authenticatedFetchJson(revisionPath(modelId, revisionId), {
          method: 'PUT', body: JSON.stringify({ baseRevisionId, model }), signal,
        })).data;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'domain-archived')
          throw new ApiError(error.status, error.code, 'This Domain is archived. Saved revisions are available to read.');
        if (error instanceof ApiError && error.status === 409)
          throw new ApiError(error.status, error.code, 'A newer revision exists. This draft is still open. Reopen the latest revision before saving further changes.');
        if (error instanceof ApiError && error.status === 413)
          throw new ApiError(error.status, error.code, 'The assembly is too large to save. Simplify the geometry and try again.');
        if (error instanceof ApiError && error.status === 400)
          throw new ApiError(error.status, error.code, 'The model could not be saved. Check the axes, geometry and joint settings.');
        throw error;
      }
    },
  };
}
