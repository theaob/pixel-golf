// Builds the Three.js scene for a parsed course: cel-shaded tiles, walls,
// hazards, obstacles, flag and scenery.
import * as THREE from 'three';
import {
  T,
  LEVEL_H,
  WALL_T,
  BALL_R,
  HOLE_R,
  BUMPER_R,
  SPINNER_T,
  localHeight,
  isPlayable,
  spinnerAngle,
  PORTAL_R,
} from './course.js';
import { THEMES } from './themes.js';

export const BASE_Y = -0.6; // ground level around the course
const WATER_DROP = 0.14;
const CUP_DEPTH = 0.28;

export const PALETTE = {
  grassA: 0x6cc24a,
  grassB: 0x5db240,
  slopeA: 0x7fd05a,
  slopeB: 0x70c24c,
  chevron: 0xa8e67a,
  iceA: 0xd4f1ff,
  iceB: 0xc2e8fa,
  iceStreak: 0xffffff,
  boost: 0x3b2f5c,
  boostArrow: 0xffd166,
  portalIn: 0xff4fd8,
  portalOut: 0x2affd5,
  sand: 0xf0d58c,
  sandDark: 0xe2c072,
  water: 0x3ba7e0,
  waterDeep: 0x2a7fc4,
  dirt: 0x9a6a44,
  wallSide: 0xd98b4e,
  wallTop: 0xffe3b0,
  ground: 0x3f8f45,
  groundB: 0x3a8641,
  cup: 0x1a1426,
  flag: 0xff4f5e,
  pole: 0xf4f4f4,
  bumper: 0xff6fa8,
  bumperTop: 0xffd166,
  spinner: 0x8f5bff,
  post: 0x4b3b6b,
  ball: 0xffffff,
  leaves: [0x2f7d3a, 0x3d9440, 0x4fa64a],
  trunk: 0x7a4a2c,
  rock: 0x9aa3b5,
  flowers: [0xff7aa2, 0xffd166, 0xffffff, 0x9b8cff],
};

// ---------------------------------------------------------------------------
// Toon materials

let gradientMap = null;
function getGradientMap() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 170, 255]);
  gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...opts });
  matCache.set(key, m);
  return m;
}
export function vertexToon() {
  return toon(0xffffff, { vertexColors: true });
}

// ---------------------------------------------------------------------------
// Tiny geometry builder producing flat-shaded, vertex-coloured triangles.

const _c = new THREE.Color();
class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
  }
  tri(a, b, c, color, hint) {
    // Ensure the face normal agrees with the hint (outward direction).
    if (hint) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) [b, c] = [c, b];
    }
    _c.set(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(_c.r, _c.g, _c.b);
    }
  }
  quad(a, b, c, d, color, hint) {
    this.tri(a, b, c, color, hint);
    this.tri(a, c, d, color, hint);
  }
  // Bake an arbitrary geometry (transformed) into this builder.
  addGeometry(geo, matrix, color) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const p = src.attributes.position;
    const v = new THREE.Vector3();
    _c.set(color);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      this.col.push(_c.r, _c.g, _c.b);
    }
    if (src !== geo) src.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Deterministic RNG so scenery is stable per hole.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const UP = [0, 1, 0];

// ---------------------------------------------------------------------------

export class CourseView {
  constructor(course, theme = THEMES.meadow) {
    this.course = course;
    this.theme = theme;
    this.P = { ...PALETTE, ...theme.palette };
    this.group = new THREE.Group();
    this.spinnerMeshes = [];
    this.bumperMeshes = [];
    this.waterVerts = null;

    this.buildGround();
    this.buildWalls();
    this.buildWater();
    this.buildCup();
    this.buildObstacles();
    this.buildSpecials();
    this.buildScenery();
  }

  visualTop(tile, fx, fz) {
    if (!isPlayable(tile)) return BASE_Y;
    const h = localHeight(tile, fx, fz);
    return tile.type === T.WATER ? h - WATER_DROP : h;
  }

  tile(c, r) {
    const co = this.course;
    if (c < 0 || r < 0 || c >= co.w || r >= co.h) return null;
    return co.tiles[r * co.w + c];
  }

  buildGround() {
    const g = new GeoBuilder();
    const co = this.course;
    for (const tile of co.tiles) {
      if (!isPlayable(tile)) continue;
      const { c, r } = tile;
      const y = (fx, fz) => this.visualTop(tile, fx, fz);
      const P = (fx, fz) => [c + fx, y(fx, fz), r + fz];

      // --- top surface
      if (tile.type !== T.WATER) {
        let color;
        if (tile.type === T.SAND) color = tile.checker ? this.P.sand : this.P.sandDark;
        else if (tile.type === T.ICE) color = tile.checker ? this.P.iceA : this.P.iceB;
        else if (tile.type === T.BOOST) color = this.P.boost;
        else if (tile.type === T.SLOPE) color = tile.checker ? this.P.slopeA : this.P.slopeB;
        else color = tile.checker ? this.P.grassA : this.P.grassB;

        if (tile.cup) {
          this.cupTop(g, tile, color);
        } else if (tile.type === T.SAND) {
          // Speckled sand: 3x3 sub-quads with slight colour variation.
          const rand = rng(c * 73856093 + r * 19349663);
          const n = 3;
          for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) {
              const x0 = i / n, x1 = (i + 1) / n, z0 = j / n, z1 = (j + 1) / n;
              const col = rand() < 0.5 ? this.P.sand : this.P.sandDark;
              g.quad(P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1), col, UP);
            }
        } else {
          g.quad(P(0, 0), P(1, 0), P(1, 1), P(0, 1), color, UP);
        }

        if (tile.type === T.SLOPE) this.chevron(g, tile);
        if (tile.type === T.ICE) {
          // A couple of glints so ice reads as ice.
          const rand = rng(c * 92821 + r * 68917);
          const lift = localHeight(tile, 0.5, 0.5) + 0.004;
          for (let k = 0; k < 2; k++) {
            const x0 = 0.15 + rand() * 0.5, z0 = 0.15 + rand() * 0.6, len = 0.15 + rand() * 0.15;
            g.quad([c + x0, lift, r + z0], [c + x0 + len, lift, r + z0 - len * 0.6],
              [c + x0 + len + 0.04, lift, r + z0 - len * 0.6], [c + x0 + 0.04, lift, r + z0], this.P.iceStreak, UP);
          }
        }
      }

      // --- side faces down to whatever is next door
      const sides = [
        { dc: 0, dr: -1, a: [0, 0], b: [1, 0], na: [0, 1], nb: [1, 1], out: [0, 0, -1] },
        { dc: 0, dr: 1, a: [0, 1], b: [1, 1], na: [0, 0], nb: [1, 0], out: [0, 0, 1] },
        { dc: -1, dr: 0, a: [0, 0], b: [0, 1], na: [1, 0], nb: [1, 1], out: [-1, 0, 0] },
        { dc: 1, dr: 0, a: [1, 0], b: [1, 1], na: [0, 0], nb: [0, 1], out: [1, 0, 0] },
      ];
      for (const s of sides) {
        const nbt = this.tile(c + s.dc, r + s.dr);
        const ta = y(...s.a);
        const tb = y(...s.b);
        const ba = isPlayable(nbt) ? this.visualTop(nbt, ...s.na) : BASE_Y;
        const bb = isPlayable(nbt) ? this.visualTop(nbt, ...s.nb) : BASE_Y;
        if (ta <= ba + 1e-4 && tb <= bb + 1e-4) continue;
        const A = [c + s.a[0], ta, r + s.a[1]];
        const B = [c + s.b[0], tb, r + s.b[1]];
        const Bb = [c + s.b[0], Math.min(bb, tb), r + s.b[1]];
        const Ab = [c + s.a[0], Math.min(ba, ta), r + s.a[1]];
        const col = tile.type === T.WATER ? this.P.waterDeep : this.P.dirt;
        g.quad(A, B, Bb, Ab, col, s.out);
      }
    }

    // Big surrounding lawn with a subtle checker of larger patches.
    const pad = 40;
    const x0 = -pad, x1 = co.w + pad, z0 = -pad, z1 = co.h + pad;
    const step = 2;
    for (let x = x0; x < x1; x += step)
      for (let z = z0; z < z1; z += step) {
        const col = ((x + z) / step) % 2 === 0 ? this.P.ground : this.P.groundB;
        g.quad([x, BASE_Y, z], [x + step, BASE_Y, z], [x + step, BASE_Y, z + step], [x, BASE_Y, z + step], col, UP);
      }

    const mesh = new THREE.Mesh(g.build(), vertexToon());
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  chevron(g, tile) {
    // Painted arrow pointing downhill.
    const [dx, dz] = tile.dir;
    const { c, r } = tile;
    const lift = 0.006;
    const px = -dz, pz = dx; // perpendicular
    const pt = (u, v) => {
      // u: along downhill (-0.5..0.5), v: across
      const fx = 0.5 + dx * u + px * v;
      const fz = 0.5 + dz * u + pz * v;
      return [c + fx, localHeight(tile, fx, fz) + lift, r + fz];
    };
    const w = 0.07;
    // Two arms of a V, tip at u = +0.18
    for (const side of [-1, 1]) {
      g.quad(pt(0.18, 0), pt(0.18 - w * 1.4, 0), pt(-0.12 - w, 0.28 * side), pt(-0.12, 0.28 * side), this.P.chevron, UP);
    }
  }

  cupTop(g, tile, color) {
    const { c, r } = tile;
    const y = localHeight(tile, 0.5, 0.5);
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const sq = (a) => {
        const ca = Math.cos(a), sa = Math.sin(a);
        const t = 0.5 / Math.max(Math.abs(ca), Math.abs(sa));
        return [c + 0.5 + ca * t, y, r + 0.5 + sa * t];
      };
      const ci = (a) => [c + 0.5 + Math.cos(a) * HOLE_R, y, r + 0.5 + Math.sin(a) * HOLE_R];
      g.quad(ci(a0), sq(a0), sq(a1), ci(a1), color, UP);
    }
  }

  buildWalls() {
    const g = new GeoBuilder();
    const h = WALL_T / 2;
    for (const w of this.course.walls) {
      const dx = Math.sign(w.bx - w.ax);
      const dz = Math.sign(w.bz - w.az);
      const nx = -dz, nz = dx;
      const ax = w.ax - dx * h, az = w.az - dz * h;
      const bx = w.bx + dx * h, bz = w.bz + dz * h;
      const yb = BASE_Y;
      const [ta, tb] = w.tops;
      const a1 = [ax + nx * h, ta, az + nz * h];
      const a2 = [ax - nx * h, ta, az - nz * h];
      const b1 = [bx + nx * h, tb, bz + nz * h];
      const b2 = [bx - nx * h, tb, bz - nz * h];
      const a1b = [a1[0], yb, a1[2]], a2b = [a2[0], yb, a2[2]];
      const b1b = [b1[0], yb, b1[2]], b2b = [b2[0], yb, b2[2]];
      g.quad(a1, b1, b2, a2, this.P.wallTop, UP);
      g.quad(a1, b1, b1b, a1b, this.P.wallSide, [nx, 0, nz]);
      g.quad(a2, b2, b2b, a2b, this.P.wallSide, [-nx, 0, -nz]);
      g.quad(a1, a2, a2b, a1b, this.P.wallSide, [-dx, 0, -dz]);
      g.quad(b1, b2, b2b, b1b, this.P.wallSide, [dx, 0, dz]);
    }
    const mesh = new THREE.Mesh(g.build(), vertexToon());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildWater() {
    const co = this.course;
    const pos = [];
    const base = [];
    const n = 3;
    for (const tile of co.tiles) {
      if (tile.type !== T.WATER) continue;
      const y = this.visualTop(tile, 0.5, 0.5);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const x0 = tile.c + i / n, x1 = tile.c + (i + 1) / n;
          const z0 = tile.r + j / n, z1 = tile.r + (j + 1) / n;
          const quad = [
            [x0, z0], [x0, z1], [x1, z1],
            [x0, z0], [x1, z1], [x1, z0],
          ];
          for (const [x, z] of quad) {
            pos.push(x, y, z);
            base.push(x, y, z);
          }
        }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      toon(this.P.water, this.P.waterGlow ? { emissive: this.P.waterGlow, emissiveIntensity: 0.6 } : {}),
    );
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.water = { geo, base: new Float32Array(base) };
  }

  buildCup() {
    const { x, z } = this.course.hole;
    const y = 0 + (this.course.tiles.find((t) => t.cup).lvl * LEVEL_H);
    this.cupY = y;
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(HOLE_R, HOLE_R, CUP_DEPTH, 16, 1, true),
      toon(this.P.cup, { side: THREE.BackSide }),
    );
    cup.position.set(x, y - CUP_DEPTH / 2, z);
    this.group.add(cup);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R, 16), toon(this.P.cup));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(x, y - CUP_DEPTH + 0.01, z);
    this.group.add(bottom);

    // Flag
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 5), toon(this.P.pole));
    pole.position.y = 0.65 - CUP_DEPTH;
    pole.castShadow = true;
    flag.add(pole);
    const clothGeo = new THREE.PlaneGeometry(0.5, 0.3, 4, 1);
    clothGeo.translate(0.25, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, toon(this.P.flag, { side: THREE.DoubleSide }));
    cloth.position.y = 1.3 - CUP_DEPTH - 0.15;
    cloth.castShadow = true;
    flag.add(cloth);
    flag.position.set(x, y, z);
    this.group.add(flag);
    this.flag = flag;
    this.cloth = cloth;
    this.clothBase = Float32Array.from(clothGeo.attributes.position.array);
  }

  buildObstacles() {
    const co = this.course;
    for (const b of co.bumpers) {
      const y = localHeight(this.tile(Math.floor(b.x), Math.floor(b.z)), 0.5, 0.5);
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.26, 10), toon(this.P.bumper));
      body.position.y = 0.13;
      body.castShadow = true;
      grp.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.6, b.r * 0.75, 0.08, 10), toon(this.P.bumperTop));
      cap.position.y = 0.3;
      cap.castShadow = true;
      grp.add(cap);
      grp.position.set(b.x, y, b.z);
      this.group.add(grp);
      this.bumperMeshes.push({ grp, b, pulse: 0 });
    }
    for (const sp of co.spinners) {
      const y = localHeight(this.tile(Math.floor(sp.x), Math.floor(sp.z)), 0.5, 0.5);
      const grp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.42, 8), toon(this.P.post));
      post.position.y = 0.21;
      post.castShadow = true;
      grp.add(post);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(sp.len * 2, 0.16, SPINNER_T * 2),
        toon(this.P.spinner),
      );
      bar.position.y = 0.16;
      bar.castShadow = true;
      grp.add(bar);
      grp.position.set(sp.x, y, sp.z);
      this.group.add(grp);
      this.spinnerMeshes.push({ grp, sp });
    }
  }

  // Boost pad arrows and portals.
  buildSpecials() {
    const co = this.course;
    const g = new GeoBuilder();
    let anyBoost = false;
    for (const tile of co.tiles) {
      if (tile.type !== T.BOOST) continue;
      anyBoost = true;
      const [dx, dz] = tile.dir;
      const px = -dz, pz = dx;
      const y = localHeight(tile, 0.5, 0.5) + 0.008;
      const pt = (u, v) => [tile.c + 0.5 + dx * u + px * v, y, tile.r + 0.5 + dz * u + pz * v];
      for (const off of [-0.18, 0.14]) {
        for (const side of [-1, 1]) {
          g.quad(pt(off + 0.16, 0), pt(off + 0.04, 0), pt(off - 0.1, 0.26 * side), pt(off + 0.02, 0.26 * side), 0xffffff, UP);
        }
      }
    }
    if (anyBoost) {
      this.boostMat = new THREE.MeshToonMaterial({
        color: this.P.boostArrow,
        emissive: this.P.boostArrow,
        emissiveIntensity: 0.3,
        gradientMap: toon(0xffffff).gradientMap,
      });
      this.group.add(new THREE.Mesh(g.build(), this.boostMat));
    }
    this.portalMeshes = [];
    for (const p of co.portals) {
      for (const [pos, color] of [[p.from, this.P.portalIn], [p.to, this.P.portalOut]]) {
        const t = this.tile(Math.floor(pos.x), Math.floor(pos.z));
        const y = localHeight(t, 0.5, 0.5);
        const grp = new THREE.Group();
        const ringGeo = new THREE.RingGeometry(PORTAL_R * 0.75, PORTAL_R * 1.15, 12);
        ringGeo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: 0.5, gradientMap: toon(0xffffff).gradientMap });
        const ring = new THREE.Mesh(ringGeo, mat);
        ring.position.y = 0.01;
        grp.add(ring);
        const coreGeo = new THREE.CircleGeometry(PORTAL_R * 0.75, 12);
        coreGeo.rotateX(-Math.PI / 2);
        const core = new THREE.Mesh(coreGeo, toon(0x120c26));
        core.position.y = 0.006;
        grp.add(core);
        // Little orbiting sparks.
        const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        for (let k = 0; k < 3; k++) {
          const sp = new THREE.Mesh(sparkGeo, mat);
          sp.userData.phase = (k / 3) * Math.PI * 2;
          grp.add(sp);
        }
        grp.position.set(pos.x, y, pos.z);
        this.group.add(grp);
        this.portalMeshes.push(grp);
      }
    }
  }

  buildScenery() {
    const co = this.course;
    const rand = rng(hashStr(co.name));
    const occupied = (c, r, m) => {
      for (let dr = -m; dr <= m; dr++)
        for (let dc = -m; dc <= m; dc++) if (isPlayable(this.tile(c + dc, r + dr))) return true;
      return false;
    };
    const P = this.P;
    const geos = {
      trunk: new THREE.CylinderGeometry(0.07, 0.09, 0.4, 5),
      leaf: new THREE.ConeGeometry(0.42, 0.75, 6),
      leaf2: new THREE.ConeGeometry(0.32, 0.6, 6),
      cap: new THREE.ConeGeometry(0.2, 0.3, 6),
      rock: new THREE.DodecahedronGeometry(0.22, 0),
      flower: new THREE.BoxGeometry(0.07, 0.07, 0.07),
      cactus: new THREE.CylinderGeometry(0.11, 0.12, 0.8, 6),
      arm: new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6),
      branch: new THREE.CylinderGeometry(0.03, 0.045, 0.45, 4),
      crystal: new THREE.OctahedronGeometry(0.18, 0),
    };
    const g = new GeoBuilder();
    const m = new THREE.Matrix4();
    const T4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const at = (base, ...rest) => rest.reduce((acc, mm) => acc.multiply(mm), base.clone());
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const cactusGreen = [0x4f8f3a, 0x5c9c45];
    const crystalCols = [0x9ff2ff, 0xc9a8ff, 0xff8fe0];

    const place = {
      tree(x, z) {
        const s = 0.8 + rand() * 0.6;
        q.setFromEuler(e.set(0, rand() * Math.PI, 0));
        m.compose(V(x, BASE_Y, z), q, V(s, s, s));
        const leafCol = P.leaves[Math.floor(rand() * P.leaves.length)];
        g.addGeometry(geos.trunk, at(m, T4(0, 0.2, 0)), P.trunk);
        g.addGeometry(geos.leaf, at(m, T4(0, 0.65, 0)), leafCol);
        g.addGeometry(geos.leaf2, at(m, T4(0, 1.0, 0)), leafCol);
      },
      snowpine(x, z) {
        place.tree(x, z);
        g.addGeometry(geos.cap, at(m, T4(0, 1.18, 0)), 0xffffff);
      },
      rock(x, z) {
        q.setFromEuler(e.set(0, rand() * 6, 0));
        m.compose(V(x, BASE_Y + 0.05, z), q, V(1 + rand(), 0.6 + rand() * 0.4, 1 + rand() * 0.5));
        g.addGeometry(geos.rock, m, P.rock);
      },
      bigrock(x, z) {
        q.setFromEuler(e.set(rand() * 0.4, rand() * 6, 0));
        const s = 1.6 + rand() * 1.4;
        m.compose(V(x, BASE_Y + 0.1, z), q, V(s, s * (0.8 + rand() * 0.8), s));
        g.addGeometry(geos.rock, m, P.rock);
      },
      flowers(x, z) {
        const col = P.flowers[Math.floor(rand() * P.flowers.length)];
        for (let k = 0; k < 3; k++) {
          m.makeTranslation(x + (rand() - 0.5) * 0.5, BASE_Y + 0.04, z + (rand() - 0.5) * 0.5);
          g.addGeometry(geos.flower, m, col);
        }
      },
      cactus(x, z) {
        const s = 0.8 + rand() * 0.5;
        q.setFromEuler(e.set(0, rand() * Math.PI, 0));
        m.compose(V(x, BASE_Y, z), q, V(s, s, s));
        const col = cactusGreen[Math.floor(rand() * 2)];
        g.addGeometry(geos.cactus, at(m, T4(0, 0.4, 0)), col);
        const arms = rand() < 0.7 ? 2 : 1;
        for (let k = 0; k < arms; k++) {
          const side = k === 0 ? 1 : -1;
          const h = 0.35 + rand() * 0.2;
          g.addGeometry(geos.arm, at(m, T4(side * 0.16, h, 0), new THREE.Matrix4().makeRotationZ(Math.PI / 2)), col);
          g.addGeometry(geos.arm, at(m, T4(side * 0.27, h + 0.14, 0)), col);
        }
      },
      deadtree(x, z) {
        const s = 0.9 + rand() * 0.5;
        q.setFromEuler(e.set(0, rand() * Math.PI, 0));
        m.compose(V(x, BASE_Y, z), q, V(s, s, s));
        g.addGeometry(geos.trunk, at(m, T4(0, 0.2, 0)), P.trunk);
        g.addGeometry(geos.branch, at(m, T4(0, 0.55, 0)), P.trunk);
        for (const side of [-1, 1])
          g.addGeometry(geos.branch, at(m, T4(side * 0.1, 0.6, 0), new THREE.Matrix4().makeRotationZ(side * -0.8)), P.trunk);
      },
      crystal(x, z) {
        const col = crystalCols[Math.floor(rand() * crystalCols.length)];
        for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) {
          const s = 0.8 + rand() * 1.4;
          q.setFromEuler(e.set((rand() - 0.5) * 0.6, rand() * 6, (rand() - 0.5) * 0.6));
          m.compose(V(x + (rand() - 0.5) * 0.4, BASE_Y + 0.15 * s, z + (rand() - 0.5) * 0.4), q, V(s * 0.6, s * 1.6, s * 0.6));
          g.addGeometry(geos.crystal, m, col);
        }
      },
    };

    const decor = this.theme.decor;
    const pad = 6;
    for (let r = -pad; r < co.h + pad; r++)
      for (let c = -pad; c < co.w + pad; c++) {
        if (occupied(c, r, 1)) continue;
        let p = rand();
        const x = c + 0.25 + rand() * 0.5;
        const z = r + 0.25 + rand() * 0.5;
        for (const [kind, chance] of decor) {
          if (p < chance) {
            place[kind](x, z);
            break;
          }
          p -= chance;
        }
      }
    for (const geo of Object.values(geos)) geo.dispose();
    const mesh = new THREE.Mesh(g.build(), vertexToon());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  setFlag(design) {
    if (!this.cloth) return;
    this.cloth.material = design.grid
      ? new THREE.MeshToonMaterial({ map: flagTexture(design), gradientMap: getGradientMap(), side: THREE.DoubleSide })
      : toon(this.P.flag, { side: THREE.DoubleSide });
  }

  bumperHit(x, z) {
    for (const m of this.bumperMeshes) if (m.b.x === x && m.b.z === z) m.pulse = 1;
  }

  update(t, dt) {
    for (const { grp, sp } of this.spinnerMeshes) grp.rotation.y = -spinnerAngle(sp, t);
    if (this.boostMat) this.boostMat.emissiveIntensity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 8));
    for (const grp of this.portalMeshes) {
      grp.children[0].rotation.y = t * 2;
      for (const sp of grp.children.slice(2)) {
        const a = sp.userData.phase + t * 3;
        sp.position.set(Math.cos(a) * PORTAL_R, 0.12 + Math.sin(t * 4 + sp.userData.phase) * 0.05, Math.sin(a) * PORTAL_R);
      }
    }
    for (const m of this.bumperMeshes) {
      m.pulse = Math.max(0, m.pulse - dt * 4);
      const s = 1 + Math.sin(m.pulse * Math.PI) * 0.25;
      m.grp.scale.set(s, 1 / s, s);
    }
    if (this.water) {
      const p = this.water.geo.attributes.position;
      const b = this.water.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], z = b[i * 3 + 2];
        p.array[i * 3 + 1] = b[i * 3 + 1] + Math.sin(x * 3.1 + t * 2.0) * 0.02 + Math.cos(z * 2.7 - t * 1.6) * 0.02;
      }
      p.needsUpdate = true;
      this.water.geo.computeVertexNormals();
    }
    if (this.cloth) {
      const p = this.cloth.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = this.clothBase[i * 3];
        p.array[i * 3 + 2] = Math.sin(x * 9 - t * 6) * 0.05 * x * 2;
      }
      p.needsUpdate = true;
      this.cloth.geometry.computeVertexNormals();
      this.flag.rotation.y = Math.sin(t * 0.7) * 0.25 - 0.5;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

// The ball mesh: a low-poly icosphere so rolling reads clearly at low res.
// A band of faces around the equator uses the skin's second colour so the
// spin stays visible.
export function createBallMesh(skin = { a: PALETTE.ball, b: 0xd6dcff }) {
  const geo = new THREE.IcosahedronGeometry(BALL_R, 1);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  const mesh = new THREE.Mesh(geo, vertexToon());
  mesh.castShadow = true;
  setBallSkin(mesh, skin);
  return mesh;
}

const DISCO = [0xff4fd8, 0x2affd5, 0xffd166, 0x8f5bff, 0xffffff, 0x5ec8ff];
export function setBallSkin(mesh, skin) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const c1 = new THREE.Color(skin.a);
  const c2 = new THREE.Color(skin.b);
  const tmp = new THREE.Color();
  for (let i = 0, f = 0; i < pos.count; i += 3, f++) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    let c;
    switch (skin.pattern) {
      case 'stripes':
        c = Math.floor((cy / BALL_R + 1) * 2.5) % 2 ? c2 : c1;
        break;
      case 'checker':
        c = (Math.floor(Math.atan2(cz, cx) / (Math.PI / 4) + 8) + (cy > 0 ? 1 : 0)) % 2 ? c2 : c1;
        break;
      case 'split':
        c = cy > 0 ? c2 : c1;
        break;
      case 'rainbow':
        if (Math.abs(cy) > BALL_R * 0.75) c = c1;
        else c = tmp.setHSL(((Math.atan2(cz, cx) / (Math.PI * 2) + 1) % 1), 0.85, 0.6);
        break;
      case 'disco':
        c = tmp.set(DISCO[(f * 7) % DISCO.length]);
        break;
      default:
        c = Math.abs(cy) < BALL_R * 0.3 ? c2 : c1;
    }
    for (let k = 0; k < 3; k++) col.setXYZ(i + k, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// Pixel-art flag texture (12x8) from an unlockables.js design.
const flagCache = new Map();
export function flagTexture(design) {
  if (flagCache.has(design.id)) return flagCache.get(design.id);
  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  design.grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      ctx.fillStyle = `#${design.colors[ch].toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  flagCache.set(design.id, tex);
  return tex;
}

// A putter: grip at the top, head resting just behind the ball. The `swing`
// group pivots at the grip so pulling back / swinging is one rotation.
export const CLUB_LEN = 0.86;
export function createClubMesh(club) {
  const root = new THREE.Group();
  const swing = new THREE.Group();
  swing.position.set(-BALL_R - 0.05, CLUB_LEN + 0.045, 0);
  root.add(swing);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, CLUB_LEN, 5), toon(0xdfe3ea));
  shaft.position.y = -CLUB_LEN / 2;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.24, 6), toon(club.grip));
  grip.position.y = -0.11;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.27), toon(club.head));
  head.position.set(0, -CLUB_LEN, 0);
  for (const m of [shaft, grip, head]) {
    m.castShadow = true;
    swing.add(m);
  }
  root.userData = { swing, head, grip };
  return root;
}

export function setClubColors(mesh, club) {
  mesh.userData.head.material = toon(club.head);
  mesh.userData.grip.material = toon(club.grip);
}
