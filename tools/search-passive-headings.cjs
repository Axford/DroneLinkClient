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

const { prepareSailingBoat, jointAngle } = require('../src/dreamer/sailing/sailingModel.ts');
const { createPassiveSearch, headingDifference, passiveHeadingSettings: settings } = require('../src/dreamer/sailing/passiveHeading.ts');

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
  const [first, second] = search.sails;
  const coarse = [-75,-45,-15,0,15,45,75];
  const angles = ({ joint }) => [...new Set([joint.minimum, ...coarse.map(a => jointAngle(joint,a)), joint.maximum])].sort((a,b) => a-b);
  const starts = [0,60,120,180,240,300].map(offset => ({
    initialHeading: (settings.windFrom+offset)%360, initialSpeed: 0,
  }));
  const movingStarts = [30,90,150,210,270,330].map(offset => ({
    initialHeading: (settings.windFrom+offset)%360, initialSpeed: 0.35,
  }));
  const trials = angles(first).flatMap(a => angles(second).flatMap(b => starts.map(start =>
    ({ trim: { first:a, second:b }, ...start }))));
  // These fixed trims cover useful alternative starts that emerged in the first probe.
  for (const [a,b] of [[-75,-75],[-65,-55],[-55,-65],[-45,-45],[-75,0],[0,-75],[45,45],[65,60],[60,65],[75,75]]) {
    for (const start of movingStarts)
      trials.push({ trim: { first: jointAngle(first.joint,a), second: jointAngle(second.joint,b) }, ...start });
  }

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
    const candidates = [];
    for (const trial of observed) {
      const { outcome, state } = trial.result;
      if (!outcome) continue;
      const matches = candidates.find(candidate =>
        candidate.trim.first === trial.trim.first && candidate.trim.second === trial.trim.second &&
        Math.abs(headingDifference(candidate.outcome.heading,outcome.heading)) < 2 &&
        Math.abs(candidate.outcome.speed-outcome.speed) < 0.04);
      const initial = { heading: trial.initialHeading, speed: trial.initialSpeed };
      if (matches) matches.starts.push(initial);
      else candidates.push({ trim: trial.trim, outcome, state, starts: [initial] });
    }
    const verified = (await batch('verify', candidates)).map(({ state, result, ...candidate }) =>
      ({ ...candidate, disturbances: result, verified: result.every(item => item.recovered) }));
    const wins = verified.filter(entry => entry.verified);
    const bins = Array.from({ length: 360/settings.headingBin }, (_, index) => {
      const center = headingDifference(index*settings.headingBin,0);
      const matches = wins.filter(candidate => {
        const offset = headingDifference(candidate.outcome.windAngle,center);
        return offset >= -settings.headingBin/2 && offset < settings.headingBin/2;
      });
      matches.sort((a,b) => b.outcome.speed-a.outcome.speed);
      return { center, candidates: matches.length, best: matches[0] ?? null };
    }).sort((a,b) => a.center-b.center);
    const counts = {};
    for (const trial of observed) counts[trial.result.status] = (counts[trial.result.status] ?? 0)+1;
    const result = {
      model: { name: snapshot.model?.name ?? snapshot.name, modelId: snapshot.modelId, revisionId: snapshot.revisionId, number: snapshot.number },
      settings, sails: search.sails.map(({ id,name }) => ({ id,name })), starts, movingStarts,
      angles: [angles(first),angles(second)], trials: observed.map(({ result: trial, ...inputs }) =>
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
