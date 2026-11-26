// Daily Challenge: one procedurally generated hole per calendar day.
// Everyone gets the same hole on the same date (seeded by the date), so scores
// are comparable when shared. Output uses the same format as src/levels.js.
import { parseLevel, T } from './course.js';

const EPOCH = Date.UTC(2026, 10, 25); // Daily #1 = 25 Nov 2026

// Local calendar date as "YYYY-MM-DD".
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const NAMES_A = ['Sunny', 'Mossy', 'Windy', 'Lucky', 'Pebble', 'Cosy', 'Breezy', 'Maple', 'Clover', 'Misty', 'Copper', 'Velvet'];
const NAMES_B = ['Bend', 'Drift', 'Hollow', 'Lane', 'Loop', 'Ridge', 'Nook', 'Trail', 'Meadow', 'Gully', 'Steps', 'Cove'];

const W = 9;
const H = 14;

// Build one candidate hole from a random stream. Returns null if the layout
// breaks a rule; the caller then tries the next seed.
function attempt(rand) {
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // --- 1. Centre line: alternate north and east/west legs, bottom to top.
  let x = ri(2, W - 3);
  let z = H - 3;
  const line = [[x, z]];
  const legs = [];
  let goNorth = true;
  while (z > 2) {
    if (goNorth) {
      const len = Math.min(z - 2, ri(2, 5));
      const leg = { dir: 'N', cells: [] };
      for (let i = 0; i < len; i++) {
        z--;
        line.push([x, z]);
        leg.cells.push(line.length - 1);
      }
      legs.push(leg);
    } else {
      const options = [];
      for (let nx = 2; nx <= W - 3; nx++) if (Math.abs(nx - x) >= 2) options.push(nx);
      const tx = pick(options);
      const leg = { dir: tx > x ? 'E' : 'W', cells: [] };
      while (x !== tx) {
        x += Math.sign(tx - x);
        line.push([x, z]);
        leg.cells.push(line.length - 1);
      }
      legs.push(leg);
    }
    goNorth = !goNorth;
    if (legs.length > 6) return null;
  }
  const tee = line[0];
  const cup = line[line.length - 1];
  if (Math.hypot(tee[0] - cup[0], tee[1] - cup[1]) < 6) return null;

  // --- 2. Carve a 3-wide corridor around the line; record path order.
  const order = new Map(); // "x,z" -> first index along the line
  const key = (cx, cz) => `${cx},${cz}`;
  line.forEach(([lx, lz], i) => {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = key(lx + dx, lz + dz);
        if (!order.has(k)) order.set(k, i);
      }
  });
  const map = Array.from({ length: H }, () => Array(W).fill(' '));
  for (const k of order.keys()) {
    const [cx, cz] = k.split(',').map(Number);
    map[cz][cx] = '.';
  }
  const lvl = Array.from({ length: H }, () => Array(W).fill(0));
  const isLine = new Set(line.map(([a, b]) => key(a, b)));
  const reserved = new Set(); // cells no hazard may use
  for (const p of [tee, cup])
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) reserved.add(key(p[0] + dx, p[1] + dz));

  const features = [];

  // --- 3. Optional slope across a north leg (up or down), shifting later cells.
  const northLegs = legs.filter((l) => l.dir === 'N' && l.cells.length >= 3);
  if (northLegs.length && rand() < 0.45) {
    const leg = pick(northLegs);
    const at = leg.cells[1 + Math.floor(rand() * (leg.cells.length - 2))];
    const [sx, sz] = line[at];
    const up = rand() < 0.6; // ball climbs going north
    // Moving north, point `at` is the first to carve the row just north of it.
    const rowCells = [-1, 0, 1].map((dx) => key(sx + dx, sz - 1));
    const ownCells = [...order].filter(([, i]) => i === at).map(([k]) => k);
    if (ownCells.length === 3 && rowCells.every((k) => order.get(k) === at && !reserved.has(k))) {
      for (const [k, i] of order) {
        if (i > at) {
          const [cx, cz] = k.split(',').map(Number);
          lvl[cz][cx] += up ? 1 : -1;
        }
      }
      for (const k of rowCells) {
        const [cx, cz] = k.split(',').map(Number);
        map[cz][cx] = up ? 'v' : '^';
        // A slope's digit is its LOW side.
        lvl[cz][cx] = up ? 0 : -1;
        reserved.add(k);
      }
      features.push('slope');
    }
  }

  const flatFree = (cx, cz) =>
    map[cz]?.[cx] === '.' && !reserved.has(key(cx, cz));

  // --- 4. Spinner in a fully open 3x3 block on the centre line.
  if (rand() < 0.35) {
    const spots = line.filter(([lx, lz], i) => {
      if (i < 3 || i > line.length - 4) return false;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!flatFree(lx + dx, lz + dz)) return false;
          if (lvl[lz + dz][lx + dx] !== lvl[lz][lx]) return false;
        }
      return true;
    });
    if (spots.length) {
      const [sx, sz] = pick(spots);
      map[sz][sx] = '+';
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) reserved.add(key(sx + dx, sz + dz));
      features.push('spinner');
    }
  }

  // --- 5. Water along one edge of a straight stretch (never on the centre line).
  if (rand() < 0.4) {
    const edges = [];
    for (const [k] of order) {
      const [cx, cz] = k.split(',').map(Number);
      if (!isLine.has(k) && flatFree(cx, cz)) edges.push([cx, cz]);
    }
    if (edges.length) {
      const [wx, wz] = pick(edges);
      // Grow into a short run of edge cells.
      const run = [[wx, wz]];
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = wx + dx, nz = wz + dz;
        if (run.length < 3 && flatFree(nx, nz) && !isLine.has(key(nx, nz))) run.push([nx, nz]);
      }
      for (const [cx, cz] of run) {
        map[cz][cx] = '~';
        reserved.add(key(cx, cz));
      }
      features.push('water');
    }
  }

  // --- 6. Sand blob.
  if (rand() < 0.5) {
    const free = [...order.keys()].map((k) => k.split(',').map(Number)).filter(([cx, cz]) => flatFree(cx, cz));
    if (free.length) {
      const [sx, sz] = pick(free);
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        if (flatFree(sx + dx, sz + dz) && rand() < 0.8) {
          map[sz + dz][sx + dx] = 's';
          reserved.add(key(sx + dx, sz + dz));
        }
      features.push('sand');
    }
  }

  // --- 7. A few bumpers on open grass, never in a 1-wide gap.
  const nBumpers = rand() < 0.55 ? ri(1, 3) : 0;
  for (let b = 0; b < nBumpers; b++) {
    const free = [...order.keys()].map((k) => k.split(',').map(Number)).filter(([cx, cz]) => {
      if (!flatFree(cx, cz)) return false;
      let open = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map[cz + dz]?.[cx + dx] === '.') open++;
      return open >= 3;
    });
    if (!free.length) break;
    const [bx, bz] = pick(free);
    map[bz][bx] = 'o';
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) reserved.add(key(bx + dx, bz + dz));
    if (!features.includes('bumpers')) features.push('bumpers');
  }

  map[tee[1]][tee[0]] = 'S';
  map[cup[1]][cup[0]] = 'O';

  // Normalise heights to start at 0.
  let min = Infinity;
  for (const k of order.keys()) {
    const [cx, cz] = k.split(',').map(Number);
    min = Math.min(min, lvl[cz][cx]);
  }
  const heights = lvl.map((row, cz) =>
    row.map((v, cx) => (map[cz][cx] === ' ' ? ' ' : String(v - min))).join(''),
  );

  const turns = legs.length - 1;
  const hazard = features.includes('water') || features.includes('spinner');
  const par = Math.min(5, Math.max(2, 1 + Math.ceil(turns / 2) + (hazard ? 1 : 0) + (line.length > 16 ? 1 : 0)));

  return { map: map.map((r) => r.join('')), heights, par, features };
}

// True when the cup can be reached from the tee over dry tiles without
// crossing a wall (walls appear between tiles whose surfaces don't meet).
export function isConnected(level) {
  const course = parseLevel(level);
  const blocked = new Set();
  for (const w of course.walls) blocked.add(w.ax === w.bx ? `v${w.ax},${w.az}` : `h${w.ax},${w.az}`);
  const ok = (c, r) => {
    const t = course.tiles[r * course.w + c];
    return c >= 0 && r >= 0 && c < course.w && r < course.h && t.type !== T.VOID && t.type !== T.WATER;
  };
  const start = [Math.floor(course.tee.x), Math.floor(course.tee.z)];
  const goal = `${Math.floor(course.hole.x)},${Math.floor(course.hole.z)}`;
  const seen = new Set([start.join(',')]);
  const q = [start];
  while (q.length) {
    const [c, r] = q.shift();
    if (`${c},${r}` === goal) return true;
    for (const p of course.portals) {
      if (Math.floor(p.from.x) === c && Math.floor(p.from.z) === r) {
        const k = `${Math.floor(p.to.x)},${Math.floor(p.to.z)}`;
        if (!seen.has(k)) {
          seen.add(k);
          q.push([Math.floor(p.to.x), Math.floor(p.to.z)]);
        }
      }
    }
    for (const [nc, nr, wk] of [
      [c + 1, r, `v${c + 1},${r}`],
      [c - 1, r, `v${c},${r}`],
      [c, r + 1, `h${c},${r + 1}`],
      [c, r - 1, `h${c},${r}`],
    ]) {
      const k = `${nc},${nr}`;
      if (seen.has(k) || blocked.has(wk) || !ok(nc, nr)) continue;
      seen.add(k);
      q.push([nc, nr]);
    }
  }
  return false;
}

const cache = new Map();

export function dailyLevel(key = dateKey()) {
  if (cache.has(key)) return cache.get(key);
  const base = hash(`pixel-golf:${key}`);
  let level = null;
  for (let i = 0; !level && i < 50; i++) {
    level = attempt(rng(base + i * 7919));
    if (level && !isConnected(level)) level = null;
  }
  const r = rng(base ^ 0x9e3779b9);
  const n = dayNumber(key);
  const out = {
    name: `${NAMES_A[Math.floor(r() * NAMES_A.length)]} ${NAMES_B[Math.floor(r() * NAMES_B.length)]}`,
    par: level.par,
    map: level.map,
    heights: level.heights,
    features: level.features,
    daily: { key, number: n },
  };
  cache.set(key, out);
  return out;
}
