import * as THREE from 'three';
import '@fontsource/press-start-2p/400.css';
import './style.css';
import { COURSES } from './levels.js';
import { parseLevel, heightAt, BALL_R, T, tileAt } from './course.js';
import { createBall, shoot, stepBall, DT } from './physics.js';
import { PixelRenderer } from './renderer.js';
import { CourseView, createBallMesh, setBallSkin, PALETTE } from './world.js';
import { Sfx } from './audio.js';
import { native } from './native.js';
import { dailyLevel, dateKey } from './daily.js';
import { createProgress, SKINS, SAVE_KEY } from './progress.js';
import { ICONS, stars as starIcons } from './icons.js';
import { themeFor } from './themes.js';

const DIFFICULTY = ['', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'];
const DAILY_THEMES = ['meadow', 'frost', 'desert', 'volcano', 'space'];
const totalStars = () => COURSES.reduce((a, c) => a + progress.courseStars(c.id, c.holes), 0);
const isUnlocked = (c) => totalStars() >= (c.unlock || 0);

const SHARE_URL = 'https://theaob.github.io/pixel-golf/';

const MAX_STROKES = 10;
let course = COURSES[0]; // the nine being played
let LEVELS = course.holes;
const holeNo = (i) => course.firstHole + i;
const holeId = (i) => `${course.id}:${i}`;
const $ = (id) => document.getElementById(id);

const storage = {
  getItem(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const progress = createProgress(storage);
progress.onChange((d) => native.backup(JSON.stringify(d)));

// ---------------------------------------------------------------------------
// Renderer, scene, camera

const stage = $('stage');
const pixel = new PixelRenderer(stage);
const scene = new THREE.Scene();
const sfx = new Sfx();

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a5a2a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const PITCH = THREE.MathUtils.degToRad(52);
const YAW = THREE.MathUtils.degToRad(-20);
const CAM_DIST = 40;
const camBack = new THREE.Vector3(
  Math.sin(YAW) * Math.cos(PITCH),
  Math.sin(PITCH),
  Math.cos(YAW) * Math.cos(PITCH),
);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.copy(camBack).multiplyScalar(CAM_DIST);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

const cam = {
  target: new THREE.Vector3(),
  wpp: 0.027, // world units per game pixel (zoom)
  playWpp: 0.027,
  overview: false,
};
const MIN_WPP = 0.018;
const MAX_WPP = 0.09;

function applyCamera() {
  const w = pixel.width;
  const h = pixel.height;
  camera.left = (-w / 2) * cam.wpp;
  camera.right = (w / 2) * cam.wpp;
  camera.top = (h / 2) * cam.wpp;
  camera.bottom = (-h / 2) * cam.wpp;
  camera.updateProjectionMatrix();
  // Snap the camera to the pixel grid to stop shimmering while it pans.
  const t = cam.target;
  const r = t.dot(camRight);
  const u = t.dot(camUp);
  const snapped = t
    .clone()
    .addScaledVector(camRight, Math.round(r / cam.wpp) * cam.wpp - r)
    .addScaledVector(camUp, Math.round(u / cam.wpp) * cam.wpp - u);
  camera.position.copy(snapped).addScaledVector(camBack, CAM_DIST);
  camera.updateMatrixWorld();
}

function overviewFor(course) {
  // Fit the course bounding box on screen.
  const pts = [];
  for (const x of [0, course.w])
    for (const z of [0, course.h]) for (const y of [-0.6, 1]) pts.push(new THREE.Vector3(x, y, z));
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
  for (const p of pts) {
    const r = p.dot(camRight), u = p.dot(camUp);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
  }
  const wpp = Math.max((maxR - minR) / (pixel.width * 0.92), (maxU - minU) / (pixel.height * 0.72));
  return {
    wpp: THREE.MathUtils.clamp(wpp, MIN_WPP, MAX_WPP),
    target: new THREE.Vector3(course.w / 2, 0, course.h / 2),
  };
}

// ---------------------------------------------------------------------------
// Ball, aim indicator, particles

const ballMesh = createBallMesh(progress.equipped());
scene.add(ballMesh);

const shadowBlob = new THREE.Mesh(
  new THREE.CircleGeometry(BALL_R * 1.1, 8),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
);
shadowBlob.rotation.x = -Math.PI / 2;
scene.add(shadowBlob);

const AIM_DOTS = 16;
const aimGroup = new THREE.Group();
const dotGeo = new THREE.PlaneGeometry(0.09, 0.09);
dotGeo.rotateX(-Math.PI / 2);
const aimDots = [];
for (let i = 0; i < AIM_DOTS; i++) {
  const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  aimGroup.add(d);
  aimDots.push(d);
}
const ringGeo = new THREE.RingGeometry(BALL_R * 1.6, BALL_R * 2.1, 12);
ringGeo.rotateX(-Math.PI / 2);
const aimRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
aimGroup.add(aimRing);
aimGroup.visible = false;
scene.add(aimGroup);

const particles = [];
const partGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
function burst(x, y, z, colors, n, { speed = 2.5, up = 3, life = 1.2, gravity = 9 } = {}) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
    m.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    scene.add(m);
    particles.push({
      m,
      vx: Math.cos(a) * s,
      vy: up * (0.5 + Math.random() * 0.7),
      vz: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.4),
      gravity,
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vy -= p.gravity * dt;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    p.m.rotation.x += dt * 8;
    p.m.rotation.y += dt * 6;
    if (p.life <= 0) {
      scene.remove(p.m);
      p.m.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Game state

const game = {
  state: 'title', // title | aim | roll | water | sunk | done
  holeIndex: 0,
  scores: [],
  strokes: 0,
  course: null,
  view: null,
  ball: null,
  time: 0,
  acc: 0,
  sinkAnim: 0,
  stateTimer: 0,
  paused: false,
};

function loadHole(i) {
  if (game.view) {
    scene.remove(game.view.group);
    game.view.dispose();
  }
  game.holeIndex = i;
  game.course = parseLevel(LEVELS[i]);
  const theme = themeFor(course.theme);
  game.theme = theme;
  game.view = new CourseView(game.course, theme);
  scene.add(game.view.group);
  hemi.color.set(theme.hemi[0]);
  hemi.groundColor.set(theme.hemi[1]);
  hemi.intensity = theme.hemi[2];
  sun.color.set(theme.sun[0]);
  sun.intensity = theme.sun[1];
  pixel.clearColor.set(theme.sky);
  game.ball = createBall(game.course.tee.x, game.course.tee.z);
  game.strokes = 0;
  ballMesh.visible = true;
  ballMesh.quaternion.identity();

  // Shadow camera covers the course.
  const co = game.course;
  const cx = co.w / 2, cz = co.h / 2;
  const ext = Math.max(co.w, co.h) / 2 + 3;
  sun.position.set(cx - 6, 14, cz + 4);
  sun.target.position.set(cx, 0, cz);
  const sc = sun.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
  sc.near = 1; sc.far = 40;
  sc.updateProjectionMatrix();
  updateHud();
}

function startHole(i) {
  loadHole(i);
  game.state = 'aim';
  cam.overview = false;
  // Start in overview, then glide to the ball.
  const ov = overviewFor(game.course);
  cam.wpp = ov.wpp;
  cam.target.copy(ov.target);
  game.introTimer = 1.6;
  showBanner(course.daily ? `DAILY #${course.daily.number}` : `HOLE ${holeNo(i)}`, `${LEVELS[i].name.toUpperCase()}<br>PAR ${LEVELS[i].par}`, 2200);
  setHint(true);
}

function dailyCourse(key) {
  const level = dailyLevel(key);
  return {
    id: 'daily',
    name: `Daily #${level.daily.number}`,
    firstHole: 1,
    holes: [level],
    daily: level.daily,
    theme: DAILY_THEMES[level.daily.number % DAILY_THEMES.length],
  };
}

function startDaily() {
  game.dailyKey = dateKey();
  newGame(dailyCourse(game.dailyKey));
}

// `which` is an index into COURSES or a course object (the daily).
function newGame(which = 0) {
  course = typeof which === 'number' ? COURSES[which] : which;
  LEVELS = course.holes;
  game.scores = [];
  hideScreens();
  $('hud').classList.remove('hidden');
  startHole(0);
}

function resultName(strokes, par) {
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  return (
    { [-3]: 'ALBATROSS!', [-2]: 'EAGLE!', [-1]: 'BIRDIE!', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY', 3: 'TRIPLE BOGEY' }[d] ??
    (d < 0 ? 'AMAZING!' : `+${d}`)
  );
}

function holeFinished(pickedUp = false) {
  const par = game.course.par;
  const strokes = pickedUp ? MAX_STROKES : game.strokes;
  game.scores[game.holeIndex] = strokes;
  game.state = 'sunk';
  game.stateTimer = 0;
  const good = strokes <= par;
  const lockedBefore = COURSES.filter((c) => !isUnlocked(c));
  const reward = course.daily ? null : progress.recordHole(holeId(game.holeIndex), strokes, par, pickedUp);
  const newlyOpen = lockedBefore.filter(isUnlocked);
  if (newlyOpen.length) setTimeout(() => toast(`NEW COURSE UNLOCKED!<br>${newlyOpen[0].name.toUpperCase()}`, 3200), 1500);
  setTimeout(() => {
    sfx.fanfare(good);
    let sub = `${strokes} STROKE${strokes === 1 ? '' : 'S'}`;
    if (reward) {
      sub = `<div class="banner-stars">${starIcons(reward.stars)}</div>${sub}`;
      if (reward.coins) sub += `<br><span class="banner-coins">${ICONS.coin}+${reward.coins}</span>`;
    }
    showBanner(pickedUp ? 'PICKED UP' : resultName(strokes, par), sub, 0);
    $('btn-next').classList.remove('hidden');
    $('btn-next').textContent = course.daily
      ? 'RESULTS'
      : game.holeIndex === LEVELS.length - 1
        ? 'SCORECARD'
        : 'NEXT HOLE';
  }, pickedUp ? 100 : 700);
  setHint(false);
}

function nextHole() {
  sfx.click();
  $('btn-next').classList.add('hidden');
  hideBanner();
  if (game.holeIndex >= LEVELS.length - 1) {
    finishRound();
  } else {
    startHole(game.holeIndex + 1);
  }
}

function finishRound() {
  game.state = 'done';
  if (course.daily) {
    showDailyResult();
    return;
  }
  const total = game.scores.reduce((a, b) => a + b, 0);
  const { isBest } = progress.recordRound(course.id, total);
  showScorecard(true, isBest);
}

function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(1, Math.ceil((next - now) / 60000));
  return `${Math.floor(mins / 60)}H ${String(mins % 60).padStart(2, '0')}M`;
}

function showDailyResult() {
  const key = game.dailyKey;
  const level = course.holes[0];
  const strokes = game.scores[0];
  const res = progress.recordDaily(key, strokes, level.par);
  const official = progress.dailyResult(key);
  const streak = progress.streak(key);
  const n = level.daily.number;
  $('daily-title').textContent = `DAILY #${n}`;
  $('daily-name').textContent = `${level.name.toUpperCase()} · PAR ${level.par}`;
  $('daily-score').innerHTML =
    `${official} STROKE${official === 1 ? '' : 'S'}<small>${resultName(official, level.par)}</small>` +
    (res.first ? '' : `<small>REPLAY: ${strokes} (NOT COUNTED)</small>`);
  $('daily-streak').innerHTML = `${ICONS.flame}${streak}`;
  $('daily-coins').innerHTML = res.first ? `${ICONS.coin}+${res.coins}` : '-';
  $('daily-next').textContent = `NEXT DAILY HOLE IN ${untilMidnight()}`;
  game.shareText =
    `Pixel Golf Daily #${n} ⛳\n${level.name} · Par ${level.par}\n` +
    `${official} stroke${official === 1 ? '' : 's'} (${resultName(official, level.par).replace('!', '')})` +
    (streak > 1 ? `\n🔥 ${streak}-day streak` : '') +
    `\n${SHARE_URL}`;
  const r = progress.data.reminders;
  $('btn-remind').classList.toggle('hidden', !native.canRemind || r.enabled);
  if (res.first && r.enabled) native.scheduleReminder(streak);
  hideScreens();
  $('hud').classList.add('hidden');
  $('screen-daily').classList.remove('hidden');
  if (res.first && streak > 1) toast(`${ICONS.flame} ${streak} DAY STREAK!`);
}

let toastTimer = null;
function toast(html, ms = 2200) {
  const el = $('toast');
  el.innerHTML = html;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

async function enableReminders() {
  const ok = await native.enableReminders();
  progress.setReminders(ok);
  if (ok) {
    native.scheduleReminder(progress.streak(dateKey()));
    toast('REMINDER SET FOR TOMORROW');
  } else {
    toast('NOTIFICATIONS ARE BLOCKED<br>ENABLE THEM IN SETTINGS', 3000);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Physics events -> feedback

function vibrate(ms) {
  native.vibrate(ms);
}

function handleEvents(events) {
  for (const e of events) {
    const b = game.ball;
    switch (e.type) {
      case 'wall':
        sfx.wall(e.speed);
        if (e.speed > 2) vibrate(8);
        break;
      case 'bumper':
        sfx.bumper();
        vibrate(15);
        game.view.bumperHit(e.x, e.z);
        burst(b.x, heightAt(game.course, b.x, b.z) + 0.2, b.z, [PALETTE.bumper, PALETTE.bumperTop], 8, {
          speed: 1.5, up: 1.5, life: 0.4,
        });
        break;
      case 'spinner':
        sfx.spinner();
        vibrate(10);
        break;
      case 'sink': {
        sfx.sink();
        vibrate([20, 40, 30]);
        game.sinkAnim = 0.001;
        const y = heightAt(game.course, game.course.hole.x, game.course.hole.z);
        burst(game.course.hole.x, y + 0.1, game.course.hole.z, PALETTE.flowers.concat([PALETTE.flag]), 40, {
          speed: 2.2, up: 4.5, life: 1.6, gravity: 7,
        });
        game.strokes = Math.min(game.strokes, MAX_STROKES);
        holeFinished();
        break;
      }
      case 'boost':
        sfx.boost();
        vibrate(8);
        break;
      case 'portal':
        sfx.portal();
        vibrate(15);
        burst(e.x, heightAt(game.course, e.x, e.z) + 0.1, e.z, [game.view.P.portalIn, 0xffffff], 10, { speed: 1, up: 1.5, life: 0.5 });
        burst(e.tx, heightAt(game.course, e.tx, e.tz) + 0.1, e.tz, [game.view.P.portalOut, 0xffffff], 10, { speed: 1, up: 1.5, life: 0.5 });
        break;
      case 'water': {
        const lava = game.theme.lava;
        if (lava) sfx.sizzle();
        else sfx.splash();
        vibrate(30);
        const y = heightAt(game.course, e.x, e.z) - 0.12;
        const cols = lava ? [0xffd166, 0xff6a1f, 0x3a2a33] : [0xffffff, game.view.P.water, 0xbfe9ff];
        burst(e.x, y, e.z, cols, 24, { speed: 1.2, up: 3, life: 0.8 });
        ballMesh.visible = false;
        game.state = 'water';
        game.stateTimer = 1.1;
        game.strokes += 1;
        showBanner(lava ? 'TOO HOT!' : 'SPLASH!', '+1 PENALTY', 1100);
        updateHud();
        break;
      }
      case 'stop':
        afterStop();
        break;
    }
  }
}

function afterStop() {
  if (game.strokes >= MAX_STROKES) {
    holeFinished(true);
    return;
  }
  game.state = 'aim';
}

// ---------------------------------------------------------------------------
// Input: drag back to aim (slingshot), pinch to zoom

const pointers = new Map();
const aim = { active: false, id: null, sx: 0, sy: 0, power: 0, dir: new THREE.Vector2() };
let pinchStart = null;
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpV = new THREE.Vector3();

function screenToGround(clientX, clientY, y) {
  const rect = pixel.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  plane.constant = -y;
  const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  return hit;
}

function canAim() {
  return game.state === 'aim' && !game.paused && !game.ball.moving;
}

stage.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  stage.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    // Second finger: switch to pinch zoom.
    cancelAim();
    const [a, b] = [...pointers.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), wpp: cam.wpp };
    return;
  }
  if (pointers.size === 1 && canAim()) {
    aim.active = true;
    aim.id = e.pointerId;
    aim.sx = e.clientX;
    aim.sy = e.clientY;
    aim.power = 0;
    if (cam.overview) cam.overview = false;
    game.introTimer = 0;
    $('hint').classList.add('hidden');
  }
});

stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchStart && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.wpp = THREE.MathUtils.clamp((pinchStart.wpp * pinchStart.d) / Math.max(d, 1), MIN_WPP, MAX_WPP);
    cam.playWpp = cam.wpp;
    return;
  }
  if (aim.active && e.pointerId === aim.id) updateAim(e.clientX, e.clientY);
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (aim.active && e.pointerId === aim.id) {
    if (e.type === 'pointerup' && aim.power > 0.04 && canAim()) {
      takeShot();
    }
    cancelAim();
  }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cam.wpp = THREE.MathUtils.clamp(cam.wpp * Math.exp(e.deltaY * 0.001), MIN_WPP, MAX_WPP);
    cam.playWpp = cam.wpp;
  },
  { passive: false },
);

function updateAim(x, y) {
  const b = game.ball;
  const by = heightAt(game.course, b.x, b.z);
  const p0 = screenToGround(aim.sx, aim.sy, by);
  const p1 = screenToGround(x, y, by);
  const dragPx = Math.hypot(x - aim.sx, y - aim.sy);
  const full = Math.min(window.innerWidth, window.innerHeight) * 0.38;
  aim.power = Math.min(1, Math.max(0, (dragPx - 6) / full));
  if (p0 && p1) {
    const dx = p0.x - p1.x;
    const dz = p0.z - p1.z;
    const l = Math.hypot(dx, dz);
    if (l > 1e-4) aim.dir.set(dx / l, dz / l);
  }
}

function cancelAim() {
  aim.active = false;
  aim.id = null;
  aim.power = 0;
}

function takeShot() {
  game.strokes += 1;
  shoot(game.ball, aim.dir.x, aim.dir.y, aim.power);
  sfx.putt(aim.power);
  vibrate(12);
  game.state = 'roll';
  setHint(false);
  updateHud();
}

function updateAimVisual() {
  const show = aim.active && aim.power > 0 && canAim();
  aimGroup.visible = canAim();
  const b = game.ball;
  const by = heightAt(game.course, b.x, b.z);
  aimRing.position.set(b.x, by + 0.012, b.z);
  aimRing.material.color.set(show ? powerColor(aim.power) : 0xffffff);
  const n = show ? Math.ceil(aim.power * AIM_DOTS) : 0;
  const col = powerColor(aim.power);
  for (let i = 0; i < AIM_DOTS; i++) {
    const d = aimDots[i];
    d.visible = i < n;
    if (!d.visible) continue;
    const dist = 0.26 + i * 0.17;
    const x = b.x + aim.dir.x * dist;
    const z = b.z + aim.dir.y * dist;
    const t = tileAt(game.course, x, z);
    const y = t && t.type !== T.VOID ? heightAt(game.course, x, z) : by;
    d.position.set(x, y + 0.015, z);
    d.material.color.set(i === n - 1 ? 0xffffff : col);
  }
  const bar = $('power');
  bar.classList.toggle('hidden', !show);
  $('power-fill').style.width = `${Math.round(aim.power * 100)}%`;
  $('power-fill').style.background = `#${powerColor(aim.power).getHexString()}`;
}

const _pc = new THREE.Color();
function powerColor(p) {
  // green -> yellow -> red
  if (p < 0.5) return _pc.setRGB(0.4 + p * 1.2, 1, 0.35, THREE.SRGBColorSpace);
  return _pc.setRGB(1, 1 - (p - 0.5) * 1.6, 0.3, THREE.SRGBColorSpace);
}

// ---------------------------------------------------------------------------
// HUD + screens

function updateHud() {
  $('hud-hole').textContent = course.daily ? `DAILY #${course.daily.number}` : `HOLE ${holeNo(game.holeIndex)}`;
  $('hud-par').textContent = `PAR ${LEVELS[game.holeIndex].par}`;
  $('hud-strokes').textContent = `SHOTS ${game.strokes}`;
}

let bannerTimeout = null;
function showBanner(title, sub, ms) {
  const el = $('banner');
  el.innerHTML = `<div class="banner-title">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
  el.classList.remove('hidden');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  clearTimeout(bannerTimeout);
  if (ms) bannerTimeout = setTimeout(hideBanner, ms);
}
function hideBanner() {
  $('banner').classList.add('hidden');
}
function setHint(on) {
  $('hint').classList.toggle('hidden', !on || course.id !== 'front' || game.holeIndex > 1);
}

function hideScreens() {
  for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
}

function showScorecard(final, isBest) {
  const rows = LEVELS.map((l, i) => {
    const s = game.scores[i];
    const cls = s == null ? '' : s < l.par ? 'under' : s === l.par ? 'even' : 'over';
    return `<tr><td>${holeNo(i)}</td><td>${l.par}</td><td class="${cls}">${s ?? '-'}</td></tr>`;
  }).join('');
  const played = LEVELS.map((l, i) => (game.scores[i] != null ? l.par : 0)).reduce((a, b) => a + b, 0);
  const total = game.scores.reduce((a, b) => a + (b || 0), 0);
  const diff = total - played;
  $('card-table').innerHTML = `<tr><th>HOLE</th><th>PAR</th><th>SHOTS</th></tr>${rows}
    <tr class="total"><td>TOTAL</td><td>${LEVELS.reduce((a, l) => a + l.par, 0)}</td><td>${total}</td></tr>`;
  $('card-summary').textContent = final
    ? `${diff === 0 ? 'EVEN PAR' : diff > 0 ? `+${diff}` : diff} ${isBest ? '· NEW BEST!' : ''}`
    : `${diff === 0 ? 'EVEN' : diff > 0 ? `+${diff}` : diff} SO FAR`;
  $('card-title').textContent = final ? `${course.name.toUpperCase()} DONE` : 'SCORECARD';
  $('btn-card-close').textContent = final ? 'PLAY AGAIN' : 'BACK';
  $('btn-card-close').dataset.final = final ? '1' : '';
  hideScreens();
  $('screen-card').classList.remove('hidden');
  if (final) $('hud').classList.add('hidden');
}

function showTitle() {
  game.state = 'title';
  hideScreens();
  hideBanner();
  $('btn-next').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('screen-title').classList.remove('hidden');
  refreshTitle();
  const gift = progress.claimGift(dateKey());
  if (gift) {
    setTimeout(() => {
      toast(`DAILY GIFT ${ICONS.coin}+${gift}`, 2600);
      sfx.fanfare(true);
      refreshTitle();
    }, 600);
  }
  course = COURSES[0];
  LEVELS = course.holes;
  loadHole(0);
  const ov = overviewFor(game.course);
  cam.wpp = ov.wpp;
  cam.target.copy(ov.target);
}

function refreshTitle() {
  const today = dateKey();
  const streak = progress.streak(today);
  $('title-streak').innerHTML = `${ICONS.flame}${streak}`;
  $('title-coins').innerHTML = `${ICONS.coin}${progress.data.coins}`;
  const daily = dailyLevel(today);
  const done = progress.dailyResult(today);
  const n = daily.daily.number;
  $('daily-sub').innerHTML =
    done != null
      ? `#${n} DONE · ${done} STROKE${done === 1 ? '' : 'S'}<br>NEXT IN ${untilMidnight()}`
      : `#${n} · PAR ${daily.par}${streak ? '<br>KEEP YOUR STREAK GOING!' : ''}`;
  $('btn-daily').querySelector('.badge')?.remove();
  if (done == null) $('btn-daily').insertAdjacentHTML('beforeend', '<span class="badge">NEW</span>');
  const all = COURSES.reduce((a, c) => a + c.holes.length * 3, 0);
  const open = COURSES.filter(isUnlocked).length;
  $('courses-sub').innerHTML = `${ICONS.star}${totalStars()}/${all} · ${open}/${COURSES.length} OPEN`;
}

function renderCourses() {
  const stars = totalStars();
  $('courses-stars').innerHTML = `${ICONS.star}${stars} STARS`;
  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
  $('course-list').innerHTML = COURSES.map((c, ci) => {
    const theme = themeFor(c.theme);
    const pal = { grassA: 0x6cc24a, wallSide: 0xd98b4e, ...theme.palette };
    const par = c.holes.reduce((a, l) => a + l.par, 0);
    const got = progress.courseStars(c.id, c.holes);
    const best = progress.data.rounds[c.id];
    const open = stars >= (c.unlock || 0);
    const pips = [1, 2, 3, 4].map((i) => `<i class="${i <= c.difficulty ? 'on' : ''}"></i>`).join('');
    return `<button class="course-card${open ? '' : ' locked'}" data-ci="${ci}"
      style="--c1:${hex(pal.grassA)};--c2:${hex(pal.wallSide)};--c3:${hex(theme.sky)}">
      <span class="cc-swatch"></span>
      <span class="cc-body">
        <span class="cc-head"><span class="cc-name">${c.name.toUpperCase()}</span>
          <span class="cc-diff d${c.difficulty}"><span class="pips">${pips}</span>${DIFFICULTY[c.difficulty]}</span></span>
        <span class="cc-concept">${c.concept}</span>
        <span class="cc-meta">${
          open
            ? `${c.holes.length} HOLES · PAR ${par} · ${ICONS.star}${got}/${c.holes.length * 3}${best ? ` · BEST ${best}` : ''}`
            : `${ICONS.lock} COLLECT ${ICONS.star}${c.unlock} TO UNLOCK (${c.unlock - stars} MORE)`
        }</span>
      </span>
    </button>`;
  }).join('');
}

$('course-list').addEventListener('click', (e) => {
  const card = e.target.closest('.course-card');
  if (!card) return;
  sfx.unlock();
  const c = COURSES[Number(card.dataset.ci)];
  if (!isUnlocked(c)) {
    sfx.wall(1);
    toast(`NEED ${c.unlock - totalStars()} MORE ${ICONS.star}<br>3 STARS = UNDER PAR`);
    return;
  }
  sfx.click();
  newGame(Number(card.dataset.ci));
});

// Keep the countdown / date fresh while the title is showing.
let titleDay = dateKey();
setInterval(() => {
  if (game.state !== 'title') return;
  if (dateKey() !== titleDay) {
    titleDay = dateKey();
    showTitle(); // new day: new daily hole and gift
  } else refreshTitle();
}, 15000);

function renderShop() {
  $('shop-coins').innerHTML = `${ICONS.coin}${progress.data.coins}`;
  const eq = progress.equipped().id;
  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
  $('shop-grid').innerHTML = SKINS.map((s) => {
    const owned = progress.owns(s.id);
    const label = owned ? (s.id === eq ? 'EQUIPPED' : 'TAP TO USE') : `${ICONS.coin}${s.price}`;
    return `<button class="skin${s.id === eq ? ' equipped' : ''}${owned ? '' : ' locked'}" data-id="${s.id}">
      <span class="ball" style="background:linear-gradient(${hex(s.a)} 0 38%, ${hex(s.b)} 38% 62%, ${hex(s.a)} 62%)"></span>
      ${s.name}<br><span class="price">${label}</span></button>`;
  }).join('');
}

$('shop-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.skin');
  if (!btn) return;
  sfx.unlock();
  const id = btn.dataset.id;
  const skin = SKINS.find((s) => s.id === id);
  if (progress.owns(id)) {
    progress.equip(id);
    sfx.click();
  } else if (progress.buy(id)) {
    sfx.fanfare(true);
    toast(`UNLOCKED ${skin.name}!`);
  } else {
    sfx.wall(1);
    toast(`NEED ${skin.price - progress.data.coins} MORE ${ICONS.coin}`);
  }
  setBallSkin(ballMesh, progress.equipped());
  renderShop();
  refreshTitle();
});

function setPaused(p) {
  game.paused = p;
  $('screen-menu').classList.toggle('hidden', !p);
  $('btn-sound').textContent = `SOUND: ${sfx.enabled ? 'ON' : 'OFF'}`;
  $('btn-reminders').classList.toggle('hidden', !native.canRemind);
  $('btn-reminders').textContent = `REMINDERS: ${progress.data.reminders.enabled ? 'ON' : 'OFF'}`;
  if (p) cancelAim();
}

function bind(id, fn) {
  $(id).addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.unlock();
    sfx.click();
    fn();
  });
}
bind('btn-daily', startDaily);
bind('btn-shop', () => {
  renderShop();
  hideScreens();
  $('screen-shop').classList.remove('hidden');
});
bind('btn-shop-close', showTitle);
bind('btn-share', async () => {
  const r = await native.share(game.shareText);
  if (r === 'copied') toast('COPIED TO CLIPBOARD');
});
bind('btn-remind', async () => {
  if (await enableReminders()) $('btn-remind').classList.add('hidden');
});
bind('btn-daily-done', showTitle);
bind('btn-reminders', async () => {
  if (progress.data.reminders.enabled) {
    progress.setReminders(false);
    native.cancelReminder();
  } else {
    await enableReminders();
  }
  $('btn-reminders').textContent = `REMINDERS: ${progress.data.reminders.enabled ? 'ON' : 'OFF'}`;
});
bind('btn-courses', () => {
  renderCourses();
  hideScreens();
  $('screen-courses').classList.remove('hidden');
});
bind('btn-courses-close', showTitle);
bind('btn-next', nextHole);
bind('btn-menu', () => setPaused(!game.paused));
bind('btn-resume', () => setPaused(false));
bind('btn-restart', () => {
  setPaused(false);
  startHole(game.holeIndex);
});
bind('btn-scorecard', () => {
  setPaused(false);
  game.paused = true;
  showScorecard(false);
});
bind('btn-sound', () => {
  sfx.setEnabled(!sfx.enabled);
  $('btn-sound').textContent = `SOUND: ${sfx.enabled ? 'ON' : 'OFF'}`;
});
bind('btn-quit', () => {
  setPaused(false);
  showTitle();
});
bind('btn-view', () => {
  cam.overview = !cam.overview;
  game.introTimer = 0;
});
bind('btn-card-close', () => {
  if ($('btn-card-close').dataset.final) {
    showTitle();
  } else {
    hideScreens();
    game.paused = false;
  }
});

// ---------------------------------------------------------------------------
// Main loop

let lastFrame = performance.now();
const tmpQ = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();

function update(dt) {
  const co = game.course;
  const b = game.ball;
  const running = !game.paused;

  if (running) {
    game.time += dt;
    // Fixed-step physics.
    if (game.state === 'roll') {
      game.acc += dt;
      const events = [];
      let steps = 0;
      while (game.acc >= DT && steps < 40) {
        const px = b.x, pz = b.z;
        stepBall(b, co, game.time - game.acc, events);
        game.acc -= DT;
        steps++;
        // Rolling rotation.
        const mx = b.x - px, mz = b.z - pz;
        const dist = Math.hypot(mx, mz);
        if (dist > 0) {
          tmpAxis.set(mz, 0, -mx).normalize();
          tmpQ.setFromAxisAngle(tmpAxis, dist / BALL_R);
          ballMesh.quaternion.premultiply(tmpQ);
        }
        if (!b.moving) break;
      }
      if (!b.moving) game.acc = 0;
      const skin = progress.equipped();
      if (skin.trail && b.moving && Math.hypot(b.vx, b.vz) > 0.6) {
        game.trailT = (game.trailT || 0) - dt;
        if (game.trailT <= 0) {
          game.trailT = 0.035;
          burst(b.x, heightAt(co, b.x, b.z) + BALL_R * 0.6, b.z, [skin.trail], 1, {
            speed: 0.15, up: 0.4, life: 0.45, gravity: 0,
          });
        }
      }
      handleEvents(events);
    }

    if (game.state === 'water') {
      game.stateTimer -= dt;
      if (game.stateTimer <= 0) {
        b.x = b.lastSafe.x;
        b.z = b.lastSafe.z;
        ballMesh.visible = true;
        if (game.strokes >= MAX_STROKES) holeFinished(true);
        else game.state = 'aim';
      }
    }
  }

  game.view.update(game.time, dt);
  updateParticles(dt);

  // Ball visual.
  let by = heightAt(co, b.x, b.z) + BALL_R;
  let bx = b.x, bz = b.z;
  if (game.state === 'sunk' && game.sinkAnim > 0) {
    game.sinkAnim = Math.min(1, game.sinkAnim + dt * 3);
    const k = game.sinkAnim;
    bx = THREE.MathUtils.lerp(b.x, co.hole.x, k);
    bz = THREE.MathUtils.lerp(b.z, co.hole.z, k);
    by -= k * 0.22;
    if (k >= 1) {
      b.x = co.hole.x;
      b.z = co.hole.z;
    }
  }
  ballMesh.position.set(bx, by, bz);
  shadowBlob.visible = ballMesh.visible && game.state !== 'sunk';
  shadowBlob.position.set(bx + 0.03, heightAt(co, bx, bz) + 0.004, bz + 0.02);

  // Flag hops when you sink it.
  if (game.view.flag) {
    const f = game.view.flag;
    const target = game.state === 'sunk' ? 0.35 + Math.abs(Math.sin(game.time * 6)) * 0.12 : 0;
    f.position.y += (game.view.cupY + target - f.position.y) * Math.min(1, dt * 10);
  }

  updateAimVisual();

  // Camera.
  let goalTarget, goalWpp;
  if (game.state === 'title') {
    const ov = overviewFor(co);
    goalTarget = ov.target.clone().add(new THREE.Vector3(Math.sin(game.time * 0.3) * 1.2, 0, 0));
    goalWpp = ov.wpp;
  } else if (cam.overview || game.introTimer > 0) {
    const ov = overviewFor(co);
    goalTarget = ov.target;
    goalWpp = ov.wpp;
    game.introTimer -= dt;
  } else {
    // Follow the ball, peeking a little toward the cup.
    const toHole = new THREE.Vector3(co.hole.x - b.x, 0, co.hole.z - b.z);
    const len = toHole.length();
    if (len > 0) toHole.multiplyScalar(Math.min(len * 0.3, 1.5) / len);
    goalTarget = new THREE.Vector3(bx, by - BALL_R, bz).add(toHole);
    goalWpp = cam.playWpp;
  }
  const k = 1 - Math.exp(-dt * 4);
  cam.target.lerp(goalTarget, k);
  if (!pinchStart) cam.wpp += (goalWpp - cam.wpp) * k;
  applyCamera();
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 1 / 20);
  lastFrame = now;
  update(dt);
  pixel.render(scene, camera);
}

window.addEventListener('resize', () => {
  pixel.resize();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state !== 'title' && game.state !== 'done') setPaused(true);
});
// Prevent iOS double-tap zoom / scroll bounce.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Debug hook for automated tests.
window.__pixelGolf = { game, progress, startDaily, showTitle, COURSES, shootAt: (dx, dz, p) => { aim.dir.set(dx, dz).normalize(); aim.power = p; takeShot(); }, startHole, newGame };

showTitle();
frame();

// Android: hardware back button and app backgrounding.
native.onBack(() => {
  if (['screen-shop', 'screen-daily', 'screen-courses'].some((id) => !$(id).classList.contains('hidden'))) {
    showTitle();
  } else if (!$('screen-card').classList.contains('hidden')) {
    $('btn-card-close').click();
  } else if (game.state === 'title') {
    native.exit();
  } else {
    setPaused(!game.paused);
  }
});
if (native.isNative && !storage.getItem(SAVE_KEY)) {
  native.restore().then((raw) => {
    if (!raw) return;
    try {
      progress.replace(JSON.parse(raw));
      setBallSkin(ballMesh, progress.equipped());
      if (game.state === 'title') refreshTitle();
    } catch {}
  });
}

native.onBackground(() => {
  if (game.state !== 'title' && game.state !== 'done') setPaused(true);
});

if ('serviceWorker' in navigator && import.meta.env.PROD && !native.isNative) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
