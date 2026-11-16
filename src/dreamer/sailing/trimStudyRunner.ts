import { createPassiveSearch } from './passiveHeading';
import {
  collectCandidates, headingBins, PassiveCandidate, PassiveTrial, Recovery,
  passiveTrials, reflectVerified, sameOutcome, symmetricTrials, trimReflection, VerifiedTrim,
} from './passiveStudy';
import { SailingBoat } from './sailingModel';

export interface StudyProgress { phase: 'Searching trims' | 'Checking recovery'; done: number; total: number }
export type TrimStudy = Awaited<ReturnType<typeof runTrimStudy>>;

export async function runTrimStudy(boat: SailingBoat, symmetric: boolean, signal: AbortSignal, progress: (state: StudyProgress) => void) {
  const search = createPassiveSearch(boat);
  const full = passiveTrials(search.sails).trials;
  const reflect = symmetric ? trimReflection(search.sails, Math.sqrt(boat.inertia[1]/boat.mass)*3.5) : null;
  if (symmetric && !reflect) throw new Error('The sail joint lines have no matching port–starboard reflection. Turn off symmetry to search both sides.');
  const trials = reflect ? symmetricTrials(full,reflect) : full;
  const workers: Worker[] = [];
  const count = Math.min(4, Math.max(1,(navigator.hardwareConcurrency || 2)-1));
  try {
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./passiveStudy.worker.ts', import.meta.url));
      workers.push(worker);
      worker.postMessage({ boat });
    }

    const batch = async <Job, Result>(phase: StudyProgress['phase'], jobs: Job[], key: 'trial' | 'candidate') => {
      let next = 0, done = 0;
      const results: Result[] = [];
      progress({ phase, done, total: jobs.length });
      await Promise.all(workers.map(async worker => {
        while (next < jobs.length && !signal.aborted) {
          const i = next++;
          results[i] = await new Promise<Result>((resolve,reject) => {
            function cleanup() {
              worker.removeEventListener('message', message);
              worker.removeEventListener('error', failed);
              signal.removeEventListener('abort', cancelled);
            }
            function failed() { cleanup(); reject(new Error('A trim search worker stopped.')); }
            function cancelled() { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); }
            function message(event: MessageEvent<{ result: Result; error?: string }>) {
              cleanup();
              if (event.data.error) reject(new Error(event.data.error));
              else resolve(event.data.result);
            }
            worker.addEventListener('message',message);
            worker.addEventListener('error',failed);
            signal.addEventListener('abort',cancelled,{ once:true });
            worker.postMessage({ [key]: jobs[i] });
          });
          if (++done % 4 === 0 || done === jobs.length) progress({ phase, done, total: jobs.length });
        }
      }));
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return results;
    };

    type Observation = PassiveTrial & Pick<PassiveCandidate,'outcome' | 'state'>;
    const observed = await batch<PassiveTrial, Observation | null>('Searching trims',trials,'trial');
    const candidates = collectCandidates(observed.filter((row): row is Observation => row !== null));
    const recoveries = await batch<PassiveCandidate, Recovery>('Checking recovery',candidates,'candidate');
    const results: VerifiedTrim[] = candidates.flatMap((candidate,index) => {
      const disturbances = recoveries[index];
      return disturbances.every(test => test.recovered)
        ? [{ ...candidate, evidence: 'simulated' as const, disturbances }] : [];
    });
    if (reflect) {
      for (const candidate of results.slice()) {
        const trim = reflect(candidate.trim);
        if (!trim) continue;
        const mirrored = reflectVerified(candidate,trim,search.describe);
        if (!results.some(existing => sameOutcome(existing,mirrored))) results.push(mirrored);
      }
    }
    return { bins: headingBins(results), results, candidates: candidates.length, trials: trials.length, fullTrials: full.length };
  } finally {
    workers.forEach(worker => worker.terminate());
  }
}
