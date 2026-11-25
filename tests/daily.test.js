// Daily generator: deterministic, parses, and a bot can sink it for many days.
import { dailyLevel, dateKey, addDays, dayNumber } from '../src/daily.js';
import { parseLevel } from '../src/course.js';
import { solve } from './bot.js';

const days = Number(process.argv[2] || 60);
const start = '2026-11-25';
if (dayNumber(start) !== 1) throw new Error('epoch');
if (addDays('2026-12-31', 1) !== '2027-01-01') throw new Error('addDays');
const a = JSON.stringify(dailyLevel('2027-03-14'));
if (a !== JSON.stringify(dailyLevel('2027-03-14'))) throw new Error('not deterministic');

let failed = 0;
const feat = {};
const pars = {};
for (let i = 0; i < days; i++) {
  const key = addDays(start, i);
  const level = dailyLevel(key);
  const course = parseLevel(level);
  const r = solve(course, 8);
  for (const f of level.features) feat[f] = (feat[f] || 0) + 1;
  pars[level.par] = (pars[level.par] || 0) + 1;
  const ok = r.sunk && r.strokes <= level.par + 1 && !r.escaped;
  if (!ok) {
    failed++;
    console.log(`FAIL ${key} #${level.daily.number} ${level.name} par ${level.par} bot ${r.sunk ? r.strokes : 'DNF'}`);
    console.log(level.map.join('\n'));
    console.log(level.heights.join('\n'));
  }
}
console.log(`daily: ${days - failed}/${days} ok · features ${JSON.stringify(feat)} · pars ${JSON.stringify(pars)}`);
process.exit(failed ? 1 : 0);
