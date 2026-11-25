// Every hand-made hole parses, the ball never escapes, and the bot sinks it
// within par + 1.
import { COURSES } from '../src/levels.js';
import { parseLevel } from '../src/course.js';
import { solve } from './bot.js';

let failed = 0;
let totalStrokes = 0, totalPar = 0;
for (const level of COURSES.flatMap((c) => c.holes)) {
  const course = parseLevel(level);
  const r = solve(course);
  totalStrokes += r.strokes;
  totalPar += course.par;
  const ok = r.sunk && r.strokes <= course.par + 1 && !r.escaped;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${course.name.padEnd(14)} par ${course.par}  bot ${r.sunk ? r.strokes : 'DNF'}${r.escaped ? ' ESCAPED' : ''}`);
}
console.log(`bot total ${totalStrokes} vs par ${totalPar}`);
process.exit(failed ? 1 : 0);
