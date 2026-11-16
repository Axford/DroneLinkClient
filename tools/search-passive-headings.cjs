const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(outputText, filename);
};

const { prepareSailingBoat } = require('../src/dreamer/sailing/sailingModel.ts');
const { createPassiveSearch, passiveHeadingSettings: settings } = require('../src/dreamer/sailing/passiveHeading.ts');

const { passiveTrials, collectCandidates, headingBins } = require('../src/dreamer/sailing/passiveStudy.ts');

function setup(file) {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { snapshot, search: createPassiveSearch(prepareSailingBoat(snapshot.model ?? snapshot)) };
}

if (!isMainThread) {
  const { search } = setup(workerData.file);
  parentPort.on('message', ({ phase, job }) => {
    if (phase === 'verify') {
      parentPort.postMessage(search.verify(job.state, job.trim));
      return;
    }
    const result = search.run(job.trim, job.initialHeading, job.initialSpeed);
    const candidate = result.status === 'forward' && result.state
      ? { outcome: search.describe(result.state, job.trim), state: result.state } : {};
    parentPort.postMessage({ status: result.status, ...candidate });
  });
}

async function run(input, output) {
  if (!input || !output) throw new Error('Usage: node tools/search-passive-headings.cjs <revision JSON> <new directory>');
  const file = path.resolve(input);
  const { snapshot, search } = setup(file);
  fs.mkdirSync(output);
  const { trials, starts, movingStarts, angles } = passiveTrials(search.sails);
  const count = Math.min(8, Math.max(1, os.availableParallelism()-1));
  const workers = Array.from({ length: count }, () => new Worker(__filename, { workerData: { file } }));
  async function batch(phase, jobs) {
    let next = 0, finished = 0;
    const results = [];
    await Promise.all(workers.map(async worker => {
      while (next < jobs.length) {
        const index = next++;
        const job = jobs[index];
        const result = await new Promise((resolve,reject) => {
          const onError = error => { worker.off('message',onMessage); reject(error); };
          const onMessage = result => { worker.off('error',onError); resolve(result); };
          worker.once('message',onMessage);
          worker.once('error',onError);
          worker.postMessage({ phase, job });
        });
        results[index] = { ...job, result };
        if (++finished%50 === 0 || finished === jobs.length) console.log(`${phase}: ${finished}/${jobs.length}`);
      }
    }));
    return results;
  }

  try {
    const observed = await batch('search', trials);
    const candidates = collectCandidates(observed.flatMap(({ result, ...trial }) =>
      result.outcome ? [{ ...trial, outcome: result.outcome, state: result.state }] : []));
    const verified = (await batch('verify', candidates)).map(({ state, result, starts, ...candidate }) =>
      ({ ...candidate, starts: starts.map(start => ({ heading: start.initialHeading, speed: start.initialSpeed })),
        disturbances: result, verified: result.every(item => item.recovered) }));
    const wins = verified.filter(entry => entry.verified);
    const bins = headingBins(wins).map(({ center, entries }) => ({ center, candidates: entries.length, best: entries[0] ?? null }));
    const counts = {};
    for (const trial of observed) counts[trial.result.status] = (counts[trial.result.status] ?? 0)+1;
    const result = {
      model: { name: snapshot.model?.name ?? snapshot.name, modelId: snapshot.modelId, revisionId: snapshot.revisionId, number: snapshot.number },
      settings, sails: search.sails.map(({ id,name }) => ({ id,name })), starts, movingStarts,
      angles, trials: observed.map(({ result: trial, ...inputs }) =>
        ({ ...inputs, status: trial.status, outcome: trial.outcome })),
      counts, candidates: verified, bins,
    };
    fs.writeFileSync(path.join(output,'results.json'), JSON.stringify(result,null,2)+'\n');
    console.log(`${wins.length} verified trim/heading outcomes in ${bins.filter(bin => bin.best).length} of ${bins.length} heading bins.`);
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}

if (isMainThread) run(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode=1; });
