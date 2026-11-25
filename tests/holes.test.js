// Headless check: every hole parses, the ball never escapes the course, and a
// simple greedy "bot" can sink every hole within a reasonable number of strokes.
import { COURSES } from '../src/levels.js';
import { parseLevel, tileAt, T } from '../src/course.js';
import { createBall, shoot, stepBall, DT } from '../src/physics.js';

function distanceField(course) {
  // BFS over tile centres; neighbours connected when no wall separates them.
  const key = (c, r) => r * course.w + c;
  const blocked = new Set();
  for (const w of course.walls) {
    if (w.ax === w.bx) blocked.add(`v${w.ax},${w.az}`);
    else blocked.add(`h${w.ax},${w.az}`);
  }
  const dist = new Map();
  const hc = Math.floor(course.hole.x), hr = Math.floor(course.hole.z);
  const q = [[hc, hr]];
  dist.set(key(hc, hr), 0);
  while (q.length) {
    const [c, r] = q.shift();
    const d = dist.get(key(c, r));
    const nbs = [
      [c + 1, r, `v${c + 1},${r}`], [c - 1, r, `v${c},${r}`],
      [c, r + 1, `h${c},${r + 1}`], [c, r - 1, `h${c},${r}`],
    ];
    for (const [nc, nr, wk] of nbs) {
      const t = tileAt(course, nc + 0.5, nr + 0.5);
      if (!t || t.type === T.VOID || t.type === T.WATER || blocked.has(wk)) continue;
      if (dist.has(key(nc, nr))) continue;
      dist.set(key(nc, nr), d + 1);
      q.push([nc, nr]);
    }
  }
  return (x, z) => {
    const d = dist.get(key(Math.floor(x), Math.floor(z)));
    return d === undefined ? 999 : d + Math.hypot(x - course.hole.x, z - course.hole.z) * 0.1;
  };
}

function simulate(course, ball, dir, power, t0) {
  const b = { ...ball, lastSafe: { ...ball.lastSafe } };
  shoot(b, Math.cos(dir), Math.sin(dir), power);
  let t = t0;
  const events = [];
  let result = 'stop';
  let steps = 0;
  while (b.moving) {
    stepBall(b, course, t, events);
    t += DT;
    if (++steps > 240 * 30) throw new Error('ball never stopped');
  }
  for (const e of events) if (e.type === 'sink' || e.type === 'water') result = e.type;
  if (result === 'water') { b.x = b.lastSafe.x; b.z = b.lastSafe.z; }
  // Escape check
  const tile = tileAt(course, b.x, b.z);
  if (!tile || tile.type === T.VOID) throw new Error(`ball escaped at ${b.x},${b.z}`);
  return { ball: b, result, t };
}

let failed = 0;
let totalStrokes = 0, totalPar = 0;
for (const level of COURSES.flatMap((c) => c.holes)) {
  const course = parseLevel(level);
  const df = distanceField(course);
  let ball = createBall(course.tee.x, course.tee.z);
  let t = 0;
  let strokes = 0;
  let sunk = false;
  while (strokes < 10 && !sunk) {
    strokes++;
    let best = null;
    for (let a = 0; a < 144; a++) {
      for (const p of [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.8, 1]) {
        const dir = (a / 144) * Math.PI * 2;
        const r = simulate(course, ball, dir, p, t);
        let score = r.result === 'sink' ? -1000 : r.result === 'water' ? 1e6 : df(r.ball.x, r.ball.z);
        if (!best || score < best.score) best = { score, r };
      }
    }
    ball = best.r.ball;
    t = best.r.t;
    if (best.r.result === 'sink') sunk = true;
  }
  totalStrokes += strokes; totalPar += course.par;
  const ok = sunk && strokes <= course.par + 1;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${course.name.padEnd(14)} par ${course.par}  bot ${sunk ? strokes : 'DNF'}  walls ${course.walls.length}`);
}
console.log(`bot total ${totalStrokes} vs par ${totalPar}`);
process.exit(failed ? 1 : 0);
