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
} from './course.js';

export const BASE_Y = -0.6; // ground level around the course
const WATER_DROP = 0.14;
const CUP_DEPTH = 0.28;

export const PALETTE = {
  grassA: 0x6cc24a,
  grassB: 0x5db240,
  slopeA: 0x7fd05a,
  slopeB: 0x70c24c,
  chevron: 0xa8e67a,
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
  constructor(course) {
    this.course = course;
    this.group = new THREE.Group();
    this.spinnerMeshes = [];
    this.bumperMeshes = [];
    this.waterVerts = null;

    this.buildGround();
    this.buildWalls();
    this.buildWater();
    this.buildCup();
    this.buildObstacles();
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
        if (tile.type === T.SAND) color = tile.checker ? PALETTE.sand : PALETTE.sandDark;
        else if (tile.type === T.SLOPE) color = tile.checker ? PALETTE.slopeA : PALETTE.slopeB;
        else color = tile.checker ? PALETTE.grassA : PALETTE.grassB;

        if (tile.cup) {
          this.cupTop(g, tile, color);
        } else if (tile.type === T.SAND) {
          // Speckled sand: 3x3 sub-quads with slight colour variation.
          const rand = rng(c * 73856093 + r * 19349663);
          const n = 3;
          for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) {
              const x0 = i / n, x1 = (i + 1) / n, z0 = j / n, z1 = (j + 1) / n;
              const col = rand() < 0.5 ? PALETTE.sand : PALETTE.sandDark;
              g.quad(P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1), col, UP);
            }
        } else {
          g.quad(P(0, 0), P(1, 0), P(1, 1), P(0, 1), color, UP);
        }

        if (tile.type === T.SLOPE) this.chevron(g, tile);
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
        const col = tile.type === T.WATER ? PALETTE.waterDeep : PALETTE.dirt;
        g.quad(A, B, Bb, Ab, col, s.out);
      }
    }

    // Big surrounding lawn with a subtle checker of larger patches.
    const pad = 40;
    const x0 = -pad, x1 = co.w + pad, z0 = -pad, z1 = co.h + pad;
    const step = 2;
    for (let x = x0; x < x1; x += step)
      for (let z = z0; z < z1; z += step) {
        const col = ((x + z) / step) % 2 === 0 ? PALETTE.ground : PALETTE.groundB;
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
      g.quad(pt(0.18, 0), pt(0.18 - w * 1.4, 0), pt(-0.12 - w, 0.28 * side), pt(-0.12, 0.28 * side), PALETTE.chevron, UP);
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
      g.quad(a1, b1, b2, a2, PALETTE.wallTop, UP);
      g.quad(a1, b1, b1b, a1b, PALETTE.wallSide, [nx, 0, nz]);
      g.quad(a2, b2, b2b, a2b, PALETTE.wallSide, [-nx, 0, -nz]);
      g.quad(a1, a2, a2b, a1b, PALETTE.wallSide, [-dx, 0, -dz]);
      g.quad(b1, b2, b2b, b1b, PALETTE.wallSide, [dx, 0, dz]);
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
    const mesh = new THREE.Mesh(geo, toon(PALETTE.water));
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
      toon(PALETTE.cup, { side: THREE.BackSide }),
    );
    cup.position.set(x, y - CUP_DEPTH / 2, z);
    this.group.add(cup);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R, 16), toon(PALETTE.cup));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(x, y - CUP_DEPTH + 0.01, z);
    this.group.add(bottom);

    // Flag
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 5), toon(PALETTE.pole));
    pole.position.y = 0.65 - CUP_DEPTH;
    pole.castShadow = true;
    flag.add(pole);
    const clothGeo = new THREE.PlaneGeometry(0.5, 0.3, 4, 1);
    clothGeo.translate(0.25, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, toon(PALETTE.flag, { side: THREE.DoubleSide }));
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
      const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.26, 10), toon(PALETTE.bumper));
      body.position.y = 0.13;
      body.castShadow = true;
      grp.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.6, b.r * 0.75, 0.08, 10), toon(PALETTE.bumperTop));
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
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.42, 8), toon(PALETTE.post));
      post.position.y = 0.21;
      post.castShadow = true;
      grp.add(post);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(sp.len * 2, 0.16, SPINNER_T * 2),
        toon(PALETTE.spinner),
      );
      bar.position.y = 0.16;
      bar.castShadow = true;
      grp.add(bar);
      grp.position.set(sp.x, y, sp.z);
      this.group.add(grp);
      this.spinnerMeshes.push({ grp, sp });
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
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.4, 5);
    const leafGeo = new THREE.ConeGeometry(0.42, 0.75, 6);
    const leafGeo2 = new THREE.ConeGeometry(0.32, 0.6, 6);
    const rockGeo = new THREE.DodecahedronGeometry(0.22, 0);
    const flowerGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const g = new GeoBuilder();
    const m = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pad = 6;
    for (let r = -pad; r < co.h + pad; r++)
      for (let c = -pad; c < co.w + pad; c++) {
        if (occupied(c, r, 1)) continue;
        const p = rand();
        const x = c + 0.25 + rand() * 0.5;
        const z = r + 0.25 + rand() * 0.5;
        if (p < 0.22) {
          const s = 0.8 + rand() * 0.6;
          q.setFromEuler(e.set(0, rand() * Math.PI, 0));
          m.compose(new THREE.Vector3(x, BASE_Y, z), q, new THREE.Vector3(s, s, s));
          const leafCol = PALETTE.leaves[Math.floor(rand() * 3)];
          g.addGeometry(trunkGeo, local.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0)), PALETTE.trunk);
          g.addGeometry(leafGeo, local.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 0.65, 0)), leafCol);
          g.addGeometry(leafGeo2, local.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 1.0, 0)), leafCol);
        } else if (p < 0.27) {
          q.setFromEuler(e.set(0, rand() * 6, 0));
          m.compose(
            new THREE.Vector3(x, BASE_Y + 0.05, z),
            q,
            new THREE.Vector3(1 + rand(), 0.6 + rand() * 0.4, 1 + rand() * 0.5),
          );
          g.addGeometry(rockGeo, m, PALETTE.rock);
        } else if (p < 0.4) {
          const col = PALETTE.flowers[Math.floor(rand() * PALETTE.flowers.length)];
          for (let k = 0; k < 3; k++) {
            m.makeTranslation(x + (rand() - 0.5) * 0.5, BASE_Y + 0.04, z + (rand() - 0.5) * 0.5);
            g.addGeometry(flowerGeo, m, col);
          }
        }
      }
    for (const geo of [trunkGeo, leafGeo, leafGeo2, rockGeo, flowerGeo]) geo.dispose();
    const mesh = new THREE.Mesh(g.build(), vertexToon());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  bumperHit(x, z) {
    for (const m of this.bumperMeshes) if (m.b.x === x && m.b.z === z) m.pulse = 1;
  }

  update(t, dt) {
    for (const { grp, sp } of this.spinnerMeshes) grp.rotation.y = -spinnerAngle(sp, t);
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
export function createBallMesh() {
  const geo = new THREE.IcosahedronGeometry(BALL_R, 1);
  // Two-tone faces make the spin visible.
  const colors = [];
  const pos = geo.attributes.position;
  const c1 = new THREE.Color(PALETTE.ball);
  const c2 = new THREE.Color(0xd6dcff);
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = Math.abs(cy) < BALL_R * 0.3 ? c2 : c1;
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, vertexToon());
  mesh.castShadow = true;
  return mesh;
}
