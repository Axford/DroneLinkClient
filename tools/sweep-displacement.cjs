const fs = require('node:fs');
const ts = require('typescript');

// Run the production physics without browser timing or control inputs.
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

function main([input, output]) {
  if (!input || !output)
    throw new Error('Usage: node tools/sweep-displacement.cjs <boat model or revision JSON> <output CSV>');
  const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
  const model = snapshot.model ?? snapshot;
  const boat = prepareSailingBoat(model);
  const weather = makeWeather(weatherPresets['Flat calm'], 1);
  const initial = initialState(boat, weather);
  const controls = neutralControls(boat);
  const parts = model.parts.filter(part => part.role === 'Displacement hull' ||
    part.role === 'Water foil' || part.role === 'Ballast');
  const rows = ['speed_m_s,leeway_port_deg,part_id,part_name,drag_n,side_port_n,yaw_port_nm,up_n'];
  for (const speed of [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]) {
    for (let leeway = -30; leeway <= 30; leeway += 5) {
      const angle = leeway*Math.PI/180;
      const along = [Math.cos(angle), Math.sin(angle)];
      const across = [-along[1], along[0]];
      const state = { ...initial, velocity: [speed*along[0], speed*along[1], 0] };
      const { components } = loads(boat, state, controls, weather, true);
      for (const part of parts) {
        const component = components.find(load => load.partId === part.id && load.medium === 'water');
        const [x,y,z] = component?.force ?? [0,0,0];
        const drag = -along[0]*x - along[1]*y;
        const side = across[0]*x + across[1]*y;
        const yaw = component?.moment[2] ?? 0;
        if (![drag,side,yaw,z].every(Number.isFinite))
          throw new Error(`Non-finite water load on ${part.name} at ${speed} m/s and ${leeway}°.`);
        const csvName = '"' + part.name.replaceAll('"', '""') + '"';
        rows.push([speed, leeway, part.id, csvName, drag, side, yaw, z].join(','));
      }
    }
  }
  fs.writeFileSync(output, rows.join('\n') + '\n');
  console.log(`Swept ${parts.length} water or ballast parts across ${(rows.length-1)/parts.length} conditions.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
