import { createPassiveSearch } from './passiveHeading';
import { PassiveCandidate, PassiveTrial } from './passiveStudy';
import { SailingBoat } from './sailingModel';

type Request = { boat: SailingBoat } | { trial: PassiveTrial } | { candidate: PassiveCandidate };
const worker = globalThis as unknown as { onmessage: (event: MessageEvent<Request>) => void; postMessage: (response: unknown) => void };
let search: ReturnType<typeof createPassiveSearch>;
worker.onmessage = ({ data }) => {
  try {
    if ('boat' in data) {
      search = createPassiveSearch(data.boat);
      return;
    }
    if ('trial' in data) {
      const { trial } = data;
      const result = search.run(trial.trim,trial.initialHeading,trial.initialSpeed);
      worker.postMessage({ result: result.status === 'forward' && result.state
        ? { ...trial, state: result.state, outcome: search.describe(result.state,trial.trim) } : null });
      return;
    }
    worker.postMessage({ result: search.verify(data.candidate.state,data.candidate.trim) });
  } catch (error) {
    worker.postMessage({ error: error instanceof Error ? error.message : 'The trim search failed.' });
  }
};
