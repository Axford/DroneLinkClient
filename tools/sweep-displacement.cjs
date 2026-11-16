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
const { hullResponse, sweepSpeeds, sweepLeeway } = require('../src/dreamer/sailing/responseSweeps.ts');

function main([input, output]) {
  if (!input || !output)
    throw new Error('Usage: node tools/sweep-displacement.cjs <boat model or revision JSON> <output CSV>');
  const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'));
  const model = snapshot.model ?? snapshot;
  const boat = prepareSailingBoat(model);
  const response = hullResponse(boat);
  const parts = model.parts.filter(part => part.simulationEnabled !== false &&
    (part.role === 'Displacement hull' || part.role === 'Water foil' || part.role === 'Ballast'));
  const indices = new Map(response.parts.map((part, index) => [part.id, index]));
  const rows = ['speed_m_s,leeway_port_deg,part_id,part_name,drag_n,side_port_n,yaw_port_nm,up_n'];
  for (const speed of sweepSpeeds) {
    for (const leeway of sweepLeeway) {
      const values = response.at(speed, leeway);
      for (const part of parts) {
        const { longitudinal: drag, side, yaw, vertical: z } = values[indices.get(part.id)] ?? { longitudinal: 0, side: 0, yaw: 0, vertical: 0 };
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
