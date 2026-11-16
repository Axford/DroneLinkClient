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
const { sailResponse, trimAngles } = require('../src/dreamer/sailing/responseSweeps.ts');

function main([input, output, wind = '5']) {
  if (!input || !output || !wind.trim() || !Number.isFinite(Number(wind)) || Number(wind) < 0)
    throw new Error('Usage: node tools/sweep-sail-trim.cjs <boat model or revision JSON> <output CSV> [wind speed m/s]');
  const snapshot = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const boat = prepareSailingBoat(snapshot.model ?? snapshot);
  const sails = boat.parts.filter(part => part.sailStrips);
  if (sails.length !== 2 || sails.some(part => !part.joint))
    throw new Error('The sweep requires exactly two rigid sails with joints.');
  const [first, second] = sails;
  const response = sailResponse(boat, Number(wind));
  const rows = ['sail_1_deg,sail_2_deg,drive_n,side_port_n,yaw_port_nm,sail_1_drive_n,sail_1_side_port_n,sail_1_yaw_port_nm,sail_2_drive_n,sail_2_side_port_n,sail_2_yaw_port_nm,sail_1_shadow_fraction,sail_2_shadow_fraction'];
  for (const a of trimAngles(first.joint)) {
    for (const b of trimAngles(second.joint)) {
      const { byPart, total } = response.at({ [first.id]: a, [second.id]: b });
      const horizontal = load => [load.longitudinal, load.side, load.yaw];
      const [one, two] = byPart.map(horizontal);
      const totals = horizontal(total);
      const shadows = byPart.map(load => load.shadow);
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
