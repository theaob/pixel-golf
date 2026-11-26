// Ball physics on the tile course. Pure JS, fixed timestep, deterministic.
import {
  T,
  BALL_R,
  HOLE_R,
  WALL_T,
  SPINNER_T,
  PORTAL_R,
  tileAt,
  isPlayable,
  gradientOf,
  spinnerAngle,
} from './course.js';

export const DT = 1 / 240;
export const MAX_SPEED = 7.5; // full-power shot, world units / s
const GRAVITY = 9.8 * (5 / 7); // rolling sphere on an incline
const FRICTION = { [T.GRASS]: 1.25, [T.SLOPE]: 1.25, [T.SAND]: 6.0, [T.WATER]: 1.25, [T.ICE]: 0.18, [T.BOOST]: 1.25 };
const BOOST_ACCEL = 16; // world units / s^2 along the pad's arrow
const DAMPING = 0.25; // proportional drag, 1/s
const WALL_E = 0.72;
const BUMPER_E = 1.15;
const SPINNER_E = 0.8;
const STOP_SPEED = 0.07;
const SINK_SPEED = 3.2; // faster than this and the ball lips out
const MAX_ROLL_TIME = 25;

export function createBall(x, z) {
  return { x, z, vx: 0, vz: 0, moving: false, time: 0, lastSafe: { x, z } };
}

// `clubPower` scales the top speed (clubs like the Bruiser hit harder).
export function shoot(ball, dirX, dirZ, power, clubPower = 1) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const s = Math.max(0, Math.min(1, power)) * MAX_SPEED * clubPower;
  ball.vx = (dirX / len) * s;
  ball.vz = (dirZ / len) * s;
  ball.moving = true;
  ball.time = 0;
  ball.lastSafe = { x: ball.x, z: ball.z };
}

function collideSegment(ball, ax, az, bx, bz, thick, e, events, kind, pvx = 0, pvz = 0) {
  const ex = bx - ax;
  const ez = bz - az;
  const len2 = ex * ex + ez * ez;
  let t = len2 > 0 ? ((ball.x - ax) * ex + (ball.z - az) * ez) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + ex * t;
  const pz = az + ez * t;
  let nx = ball.x - px;
  let nz = ball.z - pz;
  const d = Math.hypot(nx, nz);
  const minD = BALL_R + thick;
  if (d >= minD) return false;
  if (d < 1e-6) {
    nx = -ez;
    nz = ex;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
  } else {
    nx /= d;
    nz /= d;
  }
  ball.x = px + nx * minD;
  ball.z = pz + nz * minD;
  const rvx = ball.vx - pvx;
  const rvz = ball.vz - pvz;
  const vn = rvx * nx + rvz * nz;
  if (vn < 0) {
    ball.vx -= (1 + e) * vn * nx;
    ball.vz -= (1 + e) * vn * nz;
    // a little tangential loss
    const tx = -nz;
    const tz = nx;
    const vt = (ball.vx - pvx) * tx + (ball.vz - pvz) * tz;
    ball.vx -= vt * tx * 0.04;
    ball.vz -= vt * tz * 0.04;
    events.push({ type: kind, speed: -vn });
  }
  return true;
}

// Advance the ball by one fixed step. `t` is course time (for moving obstacles).
// Returns nothing; pushes events like {type:'wall'|'bumper'|'spinner'|'sink'|'water'|'stop'}.
export function stepBall(ball, course, t, events) {
  if (!ball.moving) return;
  const dt = DT;
  ball.time += dt;
  const tile = tileAt(course, ball.x, ball.z);
  const type = tile ? tile.type : T.GRASS;

  // Slope gravity.
  const [gx, gz] = gradientOf(tile);
  ball.vx -= gx * GRAVITY * dt;
  ball.vz -= gz * GRAVITY * dt;

  // Boost pads.
  if (tile && tile.type === T.BOOST) {
    ball.vx += tile.dir[0] * BOOST_ACCEL * dt;
    ball.vz += tile.dir[1] * BOOST_ACCEL * dt;
    if (ball.onBoost !== tile) events.push({ type: 'boost' });
    ball.onBoost = tile;
  } else ball.onBoost = null;

  // Cup: gentle funnel + capture.
  const hx = course.hole.x - ball.x;
  const hz = course.hole.z - ball.z;
  const hd = Math.hypot(hx, hz);
  let speed = Math.hypot(ball.vx, ball.vz);
  if (hd < HOLE_R) {
    if (speed < SINK_SPEED && hd < HOLE_R - BALL_R * 0.25) {
      ball.moving = false;
      ball.vx = ball.vz = 0;
      events.push({ type: 'sink' });
      return;
    }
    const pull = 9 * (1 - hd / HOLE_R);
    ball.vx += (hx / (hd || 1)) * pull * dt;
    ball.vz += (hz / (hd || 1)) * pull * dt;
  }

  // Rolling friction + drag (much less of both on ice).
  speed = Math.hypot(ball.vx, ball.vz);
  if (speed > 0) {
    const mu = FRICTION[type] ?? 1.25;
    const damp = type === T.ICE ? DAMPING * 0.3 : DAMPING;
    const nv = Math.max(0, speed - mu * dt) * (1 - damp * dt);
    const k = nv / speed;
    ball.vx *= k;
    ball.vz *= k;
  }

  // Integrate.
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  // Walls.
  for (const w of course.walls) {
    if (Math.abs(ball.x - (w.ax + w.bx) / 2) > 1.5 || Math.abs(ball.z - (w.az + w.bz) / 2) > 1.5)
      continue;
    collideSegment(ball, w.ax, w.az, w.bx, w.bz, WALL_T / 2, WALL_E, events, 'wall');
  }

  // Bumpers.
  for (const b of course.bumpers) {
    const dx = ball.x - b.x;
    const dz = ball.z - b.z;
    const d = Math.hypot(dx, dz);
    const minD = BALL_R + b.r;
    if (d < minD && d > 1e-6) {
      const nx = dx / d;
      const nz = dz / d;
      ball.x = b.x + nx * minD;
      ball.z = b.z + nz * minD;
      const vn = ball.vx * nx + ball.vz * nz;
      if (vn < 0) {
        ball.vx -= (1 + BUMPER_E) * vn * nx;
        ball.vz -= (1 + BUMPER_E) * vn * nz;
        // Bumpers always give a satisfying kick.
        const out = ball.vx * nx + ball.vz * nz;
        if (out < 1.6) {
          ball.vx += (1.6 - out) * nx;
          ball.vz += (1.6 - out) * nz;
        }
        events.push({ type: 'bumper', speed: -vn, x: b.x, z: b.z });
      }
    }
  }

  // Spinning bars.
  for (const sp of course.spinners) {
    const a = spinnerAngle(sp, t);
    const cx = Math.cos(a) * sp.len;
    const cz = Math.sin(a) * sp.len;
    // Velocity of the bar at the closest point is computed after we know it.
    const ex = 2 * cx;
    const ez = 2 * cz;
    const ax = sp.x - cx;
    const az = sp.z - cz;
    const len2 = ex * ex + ez * ez;
    let s = ((ball.x - ax) * ex + (ball.z - az) * ez) / len2;
    s = Math.max(0, Math.min(1, s));
    const rx = ax + ex * s - sp.x;
    const rz = az + ez * s - sp.z;
    const pvx = -sp.speed * rz;
    const pvz = sp.speed * rx;
    collideSegment(ball, ax, az, sp.x + cx, sp.z + cz, SPINNER_T, SPINNER_E, events, 'spinner', pvx, pvz);
  }

  // Clamp to sane speed after kicks.
  speed = Math.hypot(ball.vx, ball.vz);
  if (speed > MAX_SPEED * 1.4) {
    const k = (MAX_SPEED * 1.4) / speed;
    ball.vx *= k;
    ball.vz *= k;
  }

  // Portals: entering one pops the ball out of its partner, keeping velocity.
  for (const p of course.portals) {
    if (Math.hypot(ball.x - p.from.x, ball.z - p.from.z) < PORTAL_R) {
      let sp = Math.hypot(ball.vx, ball.vz);
      if (sp < 0.8) {
        // A ball creeping in still comes out with a little push.
        const k = 0.8 / (sp || 1);
        ball.vx = sp ? ball.vx * k : 0;
        ball.vz = sp ? ball.vz * k : -0.8;
        sp = 0.8;
      }
      events.push({ type: 'portal', x: p.from.x, z: p.from.z, tx: p.to.x, tz: p.to.z });
      ball.x = p.to.x + (ball.vx / sp) * (PORTAL_R + 0.05);
      ball.z = p.to.z + (ball.vz / sp) * (PORTAL_R + 0.05);
      break;
    }
  }

  // Hazards.
  const now = tileAt(course, ball.x, ball.z);
  if (!isPlayable(now)) {
    // Tunnelled out somehow: treat like water (safe reset).
    ball.moving = false;
    ball.vx = ball.vz = 0;
    events.push({ type: 'water', x: ball.x, z: ball.z });
    return;
  }
  if (now.type === T.WATER) {
    // Only splash once the ball's centre is properly over the water.
    const fx = ball.x - now.c;
    const fz = ball.z - now.r;
    const m = 0.12;
    if (fx > m && fx < 1 - m && fz > m && fz < 1 - m) {
      ball.moving = false;
      ball.vx = ball.vz = 0;
      events.push({ type: 'water', x: ball.x, z: ball.z });
      return;
    }
  }

  speed = Math.hypot(ball.vx, ball.vz);
  const onSlope = now.type === T.SLOPE || now.type === T.BOOST;
  if ((speed < STOP_SPEED && !onSlope && hd >= HOLE_R) || ball.time > MAX_ROLL_TIME) {
    ball.moving = false;
    ball.vx = ball.vz = 0;
    events.push({ type: 'stop' });
  }
}
