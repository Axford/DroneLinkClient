const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Use the same TypeScript solver that runs in the browser.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(outputText, filename);
};

const { prepareSailingBoat } = require('../src/dreamer/sailing/sailingModel.ts');
const { initialState, loads, makeWeather, weatherPresets } = require('../src/dreamer/sailing/sailingPhysics.ts');
const { neutralControls } = require('../src/dreamer/sailing/sailingRun.ts');

function angles({ minimum, maximum }) {
  const grid = new Set([minimum, maximum]);
  for (let angle = Math.ceil(minimum / 5) * 5; angle <= maximum; angle += 5) grid.add(angle);
  return [...grid].sort((a, b) => a - b);
}

function main([input, output, wind = '5']) {
  if (!input || !output || !wind.trim() || !Number.isFinite(Number(wind)) || Number(wind) < 0)
    throw new Error('Usage: node tools/sweep-sail-trim.cjs <boat model or revision JSON> <output CSV> [wind speed m/s]');
  const snapshot = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const boat = prepareSailingBoat(snapshot.model ?? snapshot);
  const sails = boat.parts.filter(part => part.sailStrips);
  if (sails.length !== 2 || sails.some(part => !part.joint))
    throw new Error('The sweep requires exactly two rigid sails with joints.');
  const [first, second] = sails;
  const weather = makeWeather(weatherPresets['Smooth water · light wind'], 1, Number(wind));
  const state = initialState(boat, weather);
  const neutral = neutralControls(boat);
  const rows = ['sail_1_deg,sail_2_deg,drive_n,side_port_n,yaw_port_nm,sail_1_drive_n,sail_1_side_port_n,sail_1_yaw_port_nm,sail_2_drive_n,sail_2_side_port_n,sail_2_yaw_port_nm,sail_1_shadow_fraction,sail_2_shadow_fraction'];
  for (const a of angles(first.joint)) {
    for (const b of angles(second.joint)) {
      const controls = { ...neutral, [first.id]: a, [second.id]: b };
      const { components } = loads(boat, state, controls, weather, true);
      const sailLoads = sails.map(({ id }) => components.find(component => component.partId === id));
      const perSail = sailLoads.map(load => load ? [load.force[0], load.force[1], load.moment[2]] : [0, 0, 0]);
      const shadows = sailLoads.map(load => load?.shadow ?? 0);
      const [one, two] = perSail;
      const totals = one.map((value, i) => value + two[i]);
      if (![...one, ...two, ...totals, ...shadows].every(Number.isFinite))
        throw new Error(`Non-finite sail load at ${a}°, ${b}°.`);
      rows.push([a, b, ...totals, ...one, ...two, ...shadows].join(','));
    }
  }
  fs.writeFileSync(output, rows.join('\n') + '\n');
  console.log(`${rows.length-1} trim combinations at ${wind} m/s from 045°, upright and stationary.`);
  for (const sail of sails) {
    const area = sail.sailStrips.reduce((total, strip) => total + strip.area, 0);
    console.log(`${sail.name}: ${sail.sailStrips.length} strips, ${area.toFixed(4)} m², ${sail.joint.minimum}° to ${sail.joint.maximum}°.`);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
