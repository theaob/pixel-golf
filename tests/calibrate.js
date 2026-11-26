// Not part of `npm test`: estimates how many strokes a decent-but-imperfect
// player needs per hole (aim ±3°, power ±8%), to sanity-check pars.
//   node tests/calibrate.js [courseId] [trials]
import { COURSES } from '../src/levels.js';
import { parseLevel } from '../src/course.js';
import { solve } from './bot.js';

const only = process.argv[2];
const trials = Number(process.argv[3] || 6);
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

for (const c of COURSES) {
  if (only && only !== c.id) continue;
  let total = 0;
  for (const level of c.holes) {
    const course = parseLevel(level);
    let sum = 0;
    for (let i = 0; i < trials; i++) sum += solve(course, 10, 72, { aim: (3 * Math.PI) / 180, power: 0.08, rand }).strokes;
    const avg = sum / trials;
    total += avg;
    const flag = avg > level.par + 0.75 ? '  <- harder than par' : avg < level.par - 1.25 ? '  <- easier than par' : '';
    console.log(`${c.id.padEnd(8)} ${level.name.padEnd(15)} par ${level.par}  avg ${avg.toFixed(1)}${flag}`);
  }
  const par = c.holes.reduce((a, l) => a + l.par, 0);
  console.log(`${c.id.padEnd(8)} TOTAL par ${par}  avg ${total.toFixed(1)}  (${(total - par >= 0 ? '+' : '') + (total - par).toFixed(1)})\n`);
}
