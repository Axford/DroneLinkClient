const fs = require('node:fs');
const path = require('node:path');

function main(directory) {
  if (!directory) throw new Error('Usage: node tools/render-passive-headings.cjs <search output directory>');
  const result = JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'));
  const { model, settings, sails, bins, candidates, counts } = result;
  const reached = candidates.filter(candidate => candidate.verified).sort((a,b) => a.outcome.windAngle-b.outcome.windAngle);
  const snowPlough = ({ outcome }) => outcome.windwardAngleToWind !== null && outcome.leewardAngleToWind !== null &&
    outcome.windwardAngleToWind >= 70 && outcome.leewardAngleToWind <= 60 &&
    outcome.windwardAngleToWind-outcome.leewardAngleToWind >= 15;
  const snow = reached.filter(snowPlough).sort((a,b) => b.outcome.upwindVmg-a.outcome.upwindVmg);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const format = (value, digits = 1) => value === null ? '—' : value.toFixed(digits);
  const angle = value => value === null ? '—' : format(value) + '°';
  const recovery = candidate => [
    Math.max(...candidate.disturbances.map(test => test.headingError)),
    Math.max(...candidate.disturbances.map(test => test.speedError)),
  ];
  const row = candidate => {
    const { trim, outcome } = candidate;
    const [headingError, speedError] = recovery(candidate);
    return `<tr>
    <td>${angle(outcome.windAngle)}</td><td>${angle(outcome.heading)}</td><td>${angle(outcome.course)}</td>
    <td>${format(outcome.speed,3)}</td><td>${format(outcome.upwindVmg,3)}</td><td>${angle(outcome.heel)}</td>
    <td>${angle(trim.first)}</td><td>${angle(trim.second)}</td>
    <td>${escape(outcome.windwardSail ?? '—')} ${angle(outcome.windwardAngleToWind)}</td><td>${angle(outcome.leewardAngleToWind)}</td>
    <td>${angle(headingError)}</td><td>${format(speedError,3)}</td>
  </tr>`;
  };
  const heading = '<tr><th>Wind angle</th><th>Heading</th><th>Course</th><th>Speed (m/s)</th><th>Upwind VMG (m/s)</th><th>Heel</th>' +
    sails.map(({ name }) => '<th>'+escape(name)+' trim</th>').join('') + '<th>Windward sail to wind</th><th>Leeward sail to wind</th><th>Max recovery heading error</th><th>Max recovery speed error (m/s)</th></tr>';
  const table = entries => '<div class="scroll"><table><thead>'+heading+'</thead><tbody>'+entries.map(row).join('')+'</tbody></table></div>';
  const gaps = bins.filter(bin => !bin.best).map(bin => angle(bin.center));
  const populated = bins.filter(bin => bin.best);
  const outcomes = Object.entries(counts).map(([name, amount]) => `${amount} ${escape(name)}`).join(' · ');
  const width = settings.headingBin;
  const strips = bins.map(bin => `<a href="#bin-${bin.center}" class="${bin.best ? 'found' : 'gap'}"
    title="${angle(bin.center)} · ${bin.best ? bin.candidates+' verified outcomes' : 'No verified outcome'}">${bin.center}°</a>`).join('');
  const binRows = bins.map(bin => `<tr id="bin-${bin.center}"><th scope="row">${angle(bin.center)}</th>
    <td>${bin.candidates}</td>${bin.best ? `<td>${angle(bin.best.outcome.windAngle)}</td><td>${format(bin.best.outcome.speed,3)}</td>
    <td>${angle(bin.best.trim.first)}</td><td>${angle(bin.best.trim.second)}</td>` : '<td colspan="4">No verified solution found</td>'}</tr>`).join('');

  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dreamer passive-heading search</title>
<style>
body{margin:0;background:#171b20;color:#e6edf3;font:15px system-ui;line-height:1.55}
main{max-width:1140px;margin:auto;padding:1.5rem}
h1{font-size:1.75rem;margin:0}h2{font-size:1.14rem;margin:0 0 .6rem}p{margin:.55rem 0}
section,details{background:#21262d;margin:1rem 0;padding:1rem;border-radius:8px}
.muted{color:#a8b3c2}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
td,th{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #414c5a;white-space:nowrap}
tbody tr:target{background:#273e5a}.coverage{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px}
.coverage a{text-align:center;font-size:.82rem;text-decoration:none;padding:.35rem .12rem;border-radius:4px}
.found{background:#1d5845;color:#e6fff2}.gap{background:#343a40;color:#d0dae4}a{color:#82b7ff}
summary{cursor:pointer;font-weight:bold}@media(max-width:640px){.coverage{grid-template-columns:repeat(6,minmax(0,1fr))}}
</style><main>
<h1>Passive-heading search</h1>
<p class="muted">${escape(model.name)}${model.number === undefined ? '' : ' · Local revision '+escape(model.number)} ·
${settings.windSpeed} m/s from ${String(settings.windFrom).padStart(3,'0')}° · Smooth water · Rudder excluded</p>
<section><h2>Heading coverage</h2>
<p><strong>${populated.length} of ${bins.length}</strong> ${width}° bins had a verified forward solution. Green shows verified coverage and grey shows where this search found none.</p>
<div class="coverage">${strips}</div>
<p class="muted">Angles are signed clockwise from the true wind source. A bin is centred on its label and spans ±${width/2}°. Coverage describes the sampled model and conditions.</p>
<div class="scroll"><table><thead><tr><th>Bin centre</th><th>Verified outcomes</th><th>Actual wind angle</th><th>Speed (m/s)</th>
${sails.map(({name}) => '<th>'+escape(name)+' trim</th>').join('')}</tr></thead><tbody>${binRows}</tbody></table></div>
</section>
<section><h2>Snow-plough trims</h2>
<p>${snow.length} verified outcomes have the windward chord at 70° or more to the wind and the leeward chord at 60° or less, with at least 15° between them. ${snow.filter(candidate => candidate.outcome.upwindVmg > 0).length} made progress upwind. The table ranks these by upwind VMG.</p>
${snow.length ? table(snow) : '<p class="muted">The search found no verified outcome within that geometry.</p>'}
</section>
<details><summary>All ${reached.length} verified trim and heading outcomes</summary>${table(reached)}</details>
<details><summary>Search and verification settings</summary>
<p>${result.trials.length} initial runs · ${outcomes}. Distinct forward candidates tested: ${candidates.length}. Gap bin centres: ${gaps.join(', ') || 'none'}.</p>
<p>Trims used the saved limits, coarse samples and selected refinement pairs. Runs used several starting headings from rest plus a second set at 0.35 m/s. Each ran for ${settings.searchSeconds} s, with fixed trims.</p>
<p>Over the final ${settings.holdSeconds} s, heading and attitude spreads must stay within ${settings.maximumHeadingSpread}°, speed spread within ${settings.maximumSpeedSpread} m/s, and angular speed within ${settings.maximumAngularRate}°/s. Forward speed must exceed ${settings.minimumForwardSpeed} m/s.</p>
<p>All four ${settings.recoverySeconds} s trials must recover within ${settings.recoveryHeadingTolerance}° and ${settings.recoverySpeedTolerance} m/s while meeting the same steady criteria. Disturbances are ±${settings.yawDisturbance}° of yaw, then slower/port and faster/starboard cases with ±${settings.velocityFraction*100}% speed and ±${settings.lateralDisturbance} m/s lateral velocity.</p>
<p><a href="verified-trims.csv">Download verified trims (CSV)</a> · <a href="results.json">Download all trials and recovery results (JSON)</a></p>
</details></main></html>`;
  const csv = ['trim_first_deg,trim_second_deg,heading_deg,true_wind_angle_deg,course_deg,leeway_deg,speed_m_s,upwind_vmg_m_s,heel_deg,pitch_deg,windward_sail,windward_chord_to_wind_deg,leeward_sail,leeward_chord_to_wind_deg,max_recovery_heading_error_deg,max_recovery_speed_error_m_s,snow_plough'];
  const field = value => typeof value === 'string' ? '"'+value.replaceAll('"','""')+'"' : value ?? '';
  for (const candidate of reached) {
    const { trim, outcome } = candidate;
    csv.push([trim.first,trim.second,outcome.heading,outcome.windAngle,outcome.course,outcome.leeway,
      outcome.speed,outcome.upwindVmg,outcome.heel,outcome.pitch,outcome.windwardSail,outcome.windwardAngleToWind,
      outcome.leewardSail,outcome.leewardAngleToWind,...recovery(candidate),snowPlough(candidate)].map(field).join(','));
  }
  fs.writeFileSync(path.join(directory,'index.html'),html);
  fs.writeFileSync(path.join(directory,'verified-trims.csv'),csv.join('\n')+'\n');
}
try { main(process.argv[2]); }
catch (error) { console.error(error.message); process.exitCode=1; }
