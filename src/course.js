// Pure course model: parsing, surface heights and collision geometry.
// No rendering code here so the physics can be tested headlessly in Node.

export const T = { VOID: 0, GRASS: 1, SAND: 2, WATER: 3, SLOPE: 4, ICE: 5, BOOST: 6 };

export const LEVEL_H = 0.45; // world height of one elevation level
export const WALL_H = 0.22; // wall height above the playing surface
export const WALL_T = 0.14; // wall thickness
export const BALL_R = 0.11;
export const HOLE_R = 0.19;
export const BUMPER_R = 0.2;
export const SPINNER_LEN = 1.1; // half length
export const SPINNER_T = 0.07; // half thickness
export const PORTAL_R = 0.3; // trigger radius of a portal entrance

const SLOPE_DIRS = { '>': [1, 0], '<': [-1, 0], v: [0, 1], '^': [0, -1] };
// Boost pads push the ball along the arrow.
const BOOST_DIRS = { '→': [1, 0], '←': [-1, 0], '↓': [0, 1], '↑': [0, -1] };

export function parseLevel(level) {
  const rows = level.map;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const tiles = [];
  const course = {
    name: level.name,
    par: level.par,
    w,
    h,
    tiles,
    tee: null,
    hole: null,
    bumpers: [],
    spinners: [],
    walls: [],
    portals: [], // { from: {x,z}, to: {x,z} }
  };
  let portalIn = null;
  let portalOut = null;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c] ?? ' ';
      const hc = level.heights?.[r]?.[c];
      const lvl = hc && hc >= '0' && hc <= '9' ? Number(hc) : 0;
      const tile = { c, r, type: T.VOID, lvl, dir: null, checker: (c + r) % 2 };
      const cx = c + 0.5;
      const cz = r + 0.5;
      switch (ch) {
        case '.':
          tile.type = T.GRASS;
          break;
        case 'S':
          tile.type = T.GRASS;
          course.tee = { x: cx, z: cz };
          break;
        case 'O':
          tile.type = T.GRASS;
          tile.cup = true;
          course.hole = { x: cx, z: cz };
          break;
        case 's':
          tile.type = T.SAND;
          break;
        case '~':
          tile.type = T.WATER;
          break;
        case 'i':
          tile.type = T.ICE;
          break;
        case '@':
          tile.type = T.GRASS;
          tile.portal = 'in';
          portalIn = { x: cx, z: cz };
          break;
        case '&':
          tile.type = T.GRASS;
          tile.portal = 'out';
          portalOut = { x: cx, z: cz };
          break;
        case 'o':
          tile.type = T.GRASS;
          course.bumpers.push({ x: cx, z: cz, r: BUMPER_R });
          break;
        case '+':
          tile.type = T.GRASS;
          course.spinners.push({
            x: cx,
            z: cz,
            len: SPINNER_LEN,
            speed: 1.3 * (course.spinners.length % 2 ? -1 : 1),
            phase: 0.4,
          });
          break;
        default:
          if (SLOPE_DIRS[ch]) {
            tile.type = T.SLOPE;
            tile.dir = SLOPE_DIRS[ch];
          } else if (BOOST_DIRS[ch]) {
            tile.type = T.BOOST;
            tile.dir = BOOST_DIRS[ch];
          }
      }
      tiles.push(tile);
    }
  }
  if (!course.tee || !course.hole) throw new Error(`Level "${level.name}" needs S and O`);
  if (!!portalIn !== !!portalOut) throw new Error(`Level "${level.name}": portals need both @ and &`);
  if (portalIn) course.portals.push({ from: portalIn, to: portalOut });
  buildWalls(course);
  return course;
}

export function tileAt(course, x, z) {
  const c = Math.floor(x);
  const r = Math.floor(z);
  if (c < 0 || r < 0 || c >= course.w || r >= course.h) return null;
  return course.tiles[r * course.w + c];
}

export function isPlayable(tile) {
  return !!tile && tile.type !== T.VOID;
}

// Surface height inside a tile at local coords fx, fz in [0, 1].
export function localHeight(tile, fx, fz) {
  if (tile.type !== T.SLOPE) return tile.lvl * LEVEL_H;
  const [dx, dz] = tile.dir;
  // Fraction of the way "downhill" across the tile.
  let down;
  if (dx === 1) down = fx;
  else if (dx === -1) down = 1 - fx;
  else if (dz === 1) down = fz;
  else down = 1 - fz;
  return (tile.lvl + 1 - down) * LEVEL_H;
}

export function heightAt(course, x, z) {
  const t = tileAt(course, x, z);
  if (!isPlayable(t)) return 0;
  return localHeight(t, x - t.c, z - t.r);
}

// Downhill acceleration direction * magnitude (unit: height per unit distance).
export function gradientOf(tile) {
  if (!tile || tile.type !== T.SLOPE) return [0, 0];
  // Height decreases along dir, so the gradient points against dir.
  return [-tile.dir[0] * LEVEL_H, -tile.dir[1] * LEVEL_H];
}

function edgeHeights(tile, side) {
  // Heights at the two endpoints of the given side, ordered by increasing x or z.
  switch (side) {
    case 'N':
      return [localHeight(tile, 0, 0), localHeight(tile, 1, 0)];
    case 'S':
      return [localHeight(tile, 0, 1), localHeight(tile, 1, 1)];
    case 'W':
      return [localHeight(tile, 0, 0), localHeight(tile, 0, 1)];
    case 'E':
      return [localHeight(tile, 1, 0), localHeight(tile, 1, 1)];
  }
}

const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
const STEP = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

function buildWalls(course) {
  const walls = course.walls;
  for (const tile of course.tiles) {
    if (!isPlayable(tile)) continue;
    for (const side of ['N', 'S', 'W', 'E']) {
      const [dc, dr] = STEP[side];
      const nb = course.tiles[(tile.r + dr) * course.w + (tile.c + dc)];
      const nbInside =
        tile.c + dc >= 0 && tile.c + dc < course.w && tile.r + dr >= 0 && tile.r + dr < course.h;
      const other = nbInside && isPlayable(nb) ? nb : null;
      // Shared edges between two playable tiles are handled once (from N/W side).
      if (other && (side === 'S' || side === 'E')) continue;
      const a = edgeHeights(tile, side);
      let tops = [a[0] + WALL_H, a[1] + WALL_H];
      let lows = [a[0], a[1]];
      if (other) {
        const b = edgeHeights(other, OPP[side]);
        if (Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) continue;
        tops = [Math.max(a[0], b[0]) + WALL_H, Math.max(a[1], b[1]) + WALL_H];
        lows = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
      }
      let ax, az, bx, bz;
      if (side === 'N') [ax, az, bx, bz] = [tile.c, tile.r, tile.c + 1, tile.r];
      if (side === 'S') [ax, az, bx, bz] = [tile.c, tile.r + 1, tile.c + 1, tile.r + 1];
      if (side === 'W') [ax, az, bx, bz] = [tile.c, tile.r, tile.c, tile.r + 1];
      if (side === 'E') [ax, az, bx, bz] = [tile.c + 1, tile.r, tile.c + 1, tile.r + 1];
      walls.push({ ax, az, bx, bz, tops, lows, outer: !other });
    }
  }
}

export function spinnerAngle(sp, t) {
  return sp.phase + sp.speed * t;
}
