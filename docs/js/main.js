import * as THREE from 'three';
import { World, LAYOUTS, SIZE, HALF } from './world.js';
import { Character } from './character.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { Brain, LEVELS } from './ai.js';
import { Sfx } from './sfx.js';
import { Navigator } from './nav.js';

const $ = (id) => document.getElementById(id);
const SEEKER_SPEED = 6.6, RUNNER_SPEED = 6.0, RADIUS = 0.45, TAG_RANGE = 1.0;
const THAW_RANGE = 1.8, THAW_TIME = 1.0, GRACE = 1.2, COUNTDOWN = 3;

const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1320);
scene.fog = new THREE.Fog(0x0b1320, 45, 110);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
const rig = new ChaseCamera(camera);
const input = new Input($('game'), $('stick'), $('stick-knob'));
const sfx = new Sfx();

const settings = { scheme: 'direct', camera: 'separate', ...JSON.parse(localStorage.getItem('ft3d-settings') || '{}') };
const tapNav = new Navigator();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pickRay = new THREE.Raycaster();
const tapState = { target: null, stuck: 0 };
const targetMark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
targetMark.rotation.x = -Math.PI / 2;
targetMark.visible = false;
scene.add(targetMark);

// Screen point -> walkable ground point, or null when the point is above the horizon.
function pickGround(sx, sy) {
  pickRay.setFromCamera(new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1), camera);
  const hit = pickRay.ray.intersectPlane(ground, new THREE.Vector3());
  return hit ? game.world.snapOpen(hit.x, hit.z) : null;
}

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a3348, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(26, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- match state ----------------------------------------------------------
const game = {
  state: 'menu', world: null, entities: [], player: null, config: null,
  time: 0, countdown: 0, particles: [], matchGroup: null,
};

const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const tex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function readConfig() {
  return {
    role: $('opt-role').value,
    map: +$('opt-map').value,
    runners: +$('opt-runners').value,
    seekers: +$('opt-seekers').value,
    duration: +$('opt-duration').value,
    level: $('opt-level').value,
    rescue: $('opt-rescue').checked,
  };
}

function startMatch(config) {
  if (game.matchGroup) {
    scene.remove(game.matchGroup);
    game.matchGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose?.(); });
  }
  const group = game.matchGroup = new THREE.Group();
  scene.add(group);
  game.config = config;
  game.world = new World(config.map);
  group.add(game.world.group);
  scene.background.set(0x0b1320);
  game.entities = [];
  game.particles = [];

  const humanSeeker = config.role === 'seeker';
  const total = config.seekers + config.runners;
  const spawnR = [], spawnS = [];
  const world = game.world;
  for (let i = 0; i < config.seekers; i++) {
    const a = (i / config.seekers) * Math.PI * 2 + Math.PI / 4;
    let p = { x: Math.cos(a) * 3, z: Math.sin(a) * 3 };
    if (!world.isOpen(p.x, p.z)) p = world.randomOpenPoint();
    spawnS.push(p);
  }
  for (let i = 0; i < config.runners; i++) {
    let p, tries = 0;
    do { p = world.randomOpenPoint(); tries++; } while (tries < 60 && spawnS.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 20));
    spawnR.push(p);
  }
  let id = 0;
  const make = (seeker, p, human) => {
    const char = new Character({ seed: id + 1, seeker });
    char.group.position.set(p.x, 0, p.z);
    char.yaw = seeker ? 0 : Math.random() * Math.PI * 2;
    const e = {
      id: id++, seeker, human, pos: { x: p.x, z: p.z }, vel: { x: 0, z: 0 },
      char, frozen: false, thaw: 0, grace: 0, brain: null, reach: 0,
    };
    group.add(char.group);
    // Blob marker under each character; the human player gets a brighter ring and arrow.
    const mark = new THREE.Mesh(new THREE.CircleGeometry(human ? 0.95 : 0.7, 32),
      new THREE.MeshBasicMaterial({ color: seeker ? 0xff3b52 : (human ? 0xffffff : 0x64e5ff), transparent: true, opacity: human ? 0.55 : 0.22, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.y = 0.03;
    group.add(mark); e.mark = mark;
    const thawDisc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x8ff3ff, transparent: true, opacity: 0.45, depthWrite: false }));
    thawDisc.rotation.x = -Math.PI / 2; thawDisc.position.y = 0.04; thawDisc.visible = false;
    group.add(thawDisc); e.thawDisc = thawDisc;
    if (human) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4),
        new THREE.MeshBasicMaterial({ color: seeker ? 0xff3b52 : 0xffffff }));
      arrow.rotation.x = Math.PI; group.add(arrow); e.arrow = arrow;
    }
    game.entities.push(e);
    return e;
  };
  spawnS.forEach((p, i) => { const e = make(true, p, humanSeeker && i === 0); if (!e.human) e.brain = new Brain(game, e, config.level); });
  spawnR.forEach((p, i) => { const e = make(false, p, !humanSeeker && i === 0); if (!e.human) e.brain = new Brain(game, e, config.level); });
  game.player = game.entities.find((e) => e.human);
  tapState.target = null; tapNav.reset();

  game.time = config.duration;
  game.countdown = COUNTDOWN;
  game.state = 'playing';
  rig.snap = true;
  rig.yaw = Math.PI;
  rig.idle = 0;
  $('menu').hidden = true;
  $('result').hidden = true;
  $('paused').hidden = true;
  document.body.classList.add('in-game');
  $('role-label').textContent = humanSeeker ? 'SEEKER' : 'RUNNER';
  $('objective').textContent = humanSeeker ? 'Freeze every runner before time runs out.' : 'Stay unfrozen until the timer ends.';
  toast(humanSeeker ? 'Hunt them down!' : 'Hide! The seekers are coming.', 2400);
  $('frozen-total').textContent = config.runners;
  game.total = total;
}

// ---- helpers ----------------------------------------------------------------
let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function burst(x, z, color = 0x9eefff) {
  const geom = new THREE.TetrahedronGeometry(0.11);
  geom.userData = {};
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.userData.shared = true;
    m.position.set(x, 0.9, z);
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
    game.particles.push({ m, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.7 });
    game.matchGroup.add(m);
  }
}

function updateParticles(dt) {
  game.particles = game.particles.filter((p) => {
    p.life -= dt;
    if (p.life <= 0) { game.matchGroup.remove(p.m); p.m.material.dispose(); return false; }
    p.vy -= 12 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.rotation.x += 6 * dt; p.m.rotation.y += 5 * dt;
    p.m.material.opacity = Math.min(1, p.life * 2);
    return true;
  });
}

// Walls are taller than every character, so anyone the player has no line of
// sight to is hidden. The whole arena is revealed once the round ends.
function visibleToPlayer(e) {
  const p = game.player;
  if (!p || e === p || game.state === 'ended') return true;
  return game.world.sees(p.pos, e.pos);
}

function playerDirection(e) {
  const { move, world } = e.inputCache;
  if (world) return world;
  const f = rig.forward, r = rig.right;
  return { x: f.x * move.y + r.x * move.x, z: f.z * move.y + r.z * move.x, mag: Math.min(1, Math.hypot(move.x, move.y)) };
}

// ---- simulation ---------------------------------------------------------------
function step(dt) {
  const { world, entities, config } = game;
  if (game.countdown > 0) {
    const prev = Math.ceil(game.countdown);
    game.countdown -= dt;
    if (Math.ceil(game.countdown) !== prev && game.countdown > 0) sfx.beep(520, 0.08);
    if (game.countdown <= 0) { toast('GO!', 900); sfx.beep(880, 0.18); }
  } else {
    game.time = Math.max(0, game.time - dt);
  }
  const locked = game.countdown > 0;

  for (const e of entities) {
    e.grace = Math.max(0, e.grace - dt);
    let dir = { x: 0, z: 0, mag: 0 }, mul = 1;
    if (!e.frozen && !(locked && e.seeker)) {
      if (e.human) dir = playerDirection(e);
      else {
        e.think = (e.think ?? Math.random() * 0.1) - dt;
        if (e.think <= 0 || !e.lastDir) {
          e.lastDir = e.brain.think(0.1 + Math.max(0, -e.think));
          e.lastMul = e.brain.speedMul;
          e.think = 0.1;
        }
        dir = { ...e.lastDir, mag: Math.hypot(e.lastDir.x, e.lastDir.z) };
        mul = e.lastMul ?? 1;
      }
    }
    const top = (e.seeker ? SEEKER_SPEED : RUNNER_SPEED) * mul;
    const tvx = dir.x * top * (dir.mag > 1 ? 1 : dir.mag), tvz = dir.z * top * (dir.mag > 1 ? 1 : dir.mag);
    // Acceleration is higher when braking or reversing so stops feel crisp.
    const along = e.vel.x * tvx + e.vel.z * tvz;
    const rate = (along < 0 || dir.mag === 0 ? 55 : 32) * dt;
    const dx = tvx - e.vel.x, dz = tvz - e.vel.z, dl = Math.hypot(dx, dz);
    if (dl > rate) { e.vel.x += (dx / dl) * rate; e.vel.z += (dz / dl) * rate; } else { e.vel.x = tvx; e.vel.z = tvz; }
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  }

  // Soft separation so characters do not stack.
  for (let i = 0; i < entities.length; i++) for (let j = i + 1; j < entities.length; j++) {
    const a = entities[i], b = entities[j];
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0 && d < RADIUS * 1.6 && !(a.seeker !== b.seeker && !a.frozen && !b.frozen)) {
      const push = (RADIUS * 1.6 - d) * 0.5;
      const aw = a.frozen ? 0 : 1, bw = b.frozen ? 0 : 1, tw = aw + bw || 1;
      a.pos.x -= (dx / d) * push * 2 * aw / tw; a.pos.z -= (dz / d) * push * 2 * aw / tw;
      b.pos.x += (dx / d) * push * 2 * bw / tw; b.pos.z += (dz / d) * push * 2 * bw / tw;
    }
  }
  for (const e of entities) world.resolve(e.pos, RADIUS);

  if (!locked) {
    for (const s of entities) {
      if (!s.seeker) continue;
      for (const r of entities) {
        if (r.seeker || r.frozen || r.grace > 0) continue;
        if (dist(s, r) < TAG_RANGE && !world.blocked(s.pos.x, s.pos.z, r.pos.x, r.pos.z, 0)) freeze(r, s);
      }
    }
    if (config.rescue) updateThaw(dt);
  }

  // Win checks
  const active = entities.filter((e) => !e.seeker && !e.frozen).length;
  if (active === 0) endMatch('seekers');
  else if (game.time <= 0) endMatch('runners');
}

function freeze(r, by) {
  r.frozen = true; r.thaw = 0; r.vel.x = r.vel.z = 0;
  if (visibleToPlayer(r)) { burst(r.pos.x, r.pos.z); sfx.freeze(); }
  if (r.human) toast('You were frozen! Wait for a rescue.', 2200);
  else if (by.human) toast(`Frozen! ${game.entities.filter((e) => !e.seeker && e.frozen).length}/${game.config.runners}`, 1000);
}

function updateThaw(dt) {
  for (const f of game.entities) {
    if (f.seeker || !f.frozen) continue;
    const helpers = game.entities.some((h) => !h.seeker && !h.frozen && dist(h, f) < THAW_RANGE);
    f.thaw = helpers ? Math.min(1, f.thaw + dt / THAW_TIME) : Math.max(0, f.thaw - dt * 1.5);
    if (f.thaw >= 1) {
      f.frozen = false; f.thaw = 0; f.grace = GRACE;
      if (visibleToPlayer(f)) { burst(f.pos.x, f.pos.z, 0xffffff); sfx.thaw(); }
      if (f.human) toast('Thawed! Run!', 1500);
    }
  }
}

function endMatch(winner) {
  game.state = 'ended';
  const humanSeeker = game.config.role === 'seeker';
  const won = (winner === 'seekers') === humanSeeker;
  for (const e of game.entities) e.joyTarget = (e.seeker === (winner === 'seekers')) ? 1 : 0;
  $('result-tag').textContent = won ? 'YOU WIN' : 'ROUND OVER';
  $('result-title').textContent = winner === 'seekers' ? 'Everyone’s frozen.' : 'Time’s up — runners escape.';
  const frozen = game.entities.filter((e) => !e.seeker && e.frozen).length;
  $('result-description').textContent = `${frozen}/${game.config.runners} runners frozen · ${Math.round(game.config.duration - game.time)}s played.`;
  won ? sfx.win() : sfx.lose();
  setTimeout(() => { if (game.state === 'ended') { $('result').hidden = false; } }, 1600);
}

// ---- rendering / HUD -------------------------------------------------------------
const mini = $('minimap'), mctx = mini.getContext('2d');
function drawMinimap() {
  const { world, entities, player } = game;
  const s = mini.width, k = s / SIZE;
  mctx.clearRect(0, 0, s, s);
  mctx.fillStyle = 'rgba(11,19,32,.82)'; mctx.fillRect(0, 0, s, s);
  mctx.fillStyle = '#9aa7b4';
  for (const w of world.rects) mctx.fillRect((w.minX + HALF) * k, (w.minZ + HALF) * k, w.w * k, w.d * k);
  for (const e of entities) {
    // Hidden characters stay off the map; frozen runners are always known.
    if (!e.seen && !(e.frozen && !e.seeker)) continue;
    const x = (e.pos.x + HALF) * k, y = (e.pos.z + HALF) * k;
    mctx.fillStyle = e.frozen ? '#8ff3ff' : e.seeker ? '#ff3b52' : '#ffd23f';
    mctx.beginPath(); mctx.arc(x, y, e.human ? 5 : 3.2, 0, 6.283); mctx.fill();
    if (e.human) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke(); }
  }
  // Camera direction wedge
  if (player) {
    const px = (player.pos.x + HALF) * k, py = (player.pos.z + HALF) * k, f = rig.forward;
    mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.moveTo(px, py); mctx.lineTo(px + f.x * 16, py + f.z * 16); mctx.stroke();
  }
}

function updateHud() {
  const t = Math.ceil(game.time);
  $('time').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const frozen = game.entities.filter((e) => !e.seeker && e.frozen).length;
  $('frozen-count').textContent = frozen;
  $('freeze-fill').style.width = `${(frozen / game.config.runners) * 100}%`;
  const c = $('countdown');
  if (game.countdown > 0) { c.textContent = Math.ceil(game.countdown); c.classList.add('show'); } else c.classList.remove('show');
}

function render(dt, cam) {
  const { entities, player, world } = game;
  for (const e of entities) {
    const nearTarget = e.seeker && !e.frozen && entities.some((r) => !r.seeker && !r.frozen && r.grace <= 0 && dist(e, r) < 2.4);
    e.seen = visibleToPlayer(e);
    e.char.group.position.set(e.pos.x, 0, e.pos.z);
    const celebrating = game.state === 'ended' && e.joyTarget;
    e.char.update(dt, e.vel, { frozen: e.frozen && game.state !== 'ended', thaw: e.thaw, reach: nearTarget && game.countdown <= 0 ? 1 : 0, joy: celebrating ? 1 : 0 });
    e.mark.position.set(e.pos.x, 0.03, e.pos.z);
    e.mark.material.opacity = (e.human ? 0.45 + Math.sin(performance.now() / 250) * 0.12 : e.grace > 0 ? 0.6 : 0.22);
    e.thawDisc.visible = e.frozen && e.thaw > 0.02;
    if (e.thawDisc.visible) { e.thawDisc.position.set(e.pos.x, 0.04, e.pos.z); e.thawDisc.scale.setScalar(Math.max(0.05, e.thaw)); }
    if (e.arrow) e.arrow.position.set(e.pos.x, 2.5 + Math.sin(performance.now() / 280) * 0.12, e.pos.z);
    const blink = e.grace > 0 ? Math.floor(performance.now() / 90) % 2 === 0 : true;
    e.char.group.visible = e.seen && blink;
    e.mark.visible = e.seen;
    if (!e.seen) e.thawDisc.visible = false;
  }
  updateParticles(dt);
  if (cam && player) rig.update(dt, player.pos, player.vel, player.char.yaw, world);
  renderer.render(scene, camera);
}

// Click / tap to move. Returns a world-space direction for the player, or null.
function tapControl(poll, dt) {
  const p = game.player;
  if (settings.scheme !== 'tap') { tapState.target = null; targetMark.visible = false; return null; }
  if (Math.hypot(poll.move.x, poll.move.y) > 0.1) tapState.target = null; // keyboard / gamepad take over
  else {
    const pt = poll.aim ?? poll.tap;
    const g = pt && pickGround(pt.x, pt.y);
    if (g) { tapState.target = g; tapState.stuck = 0; }
  }
  const target = tapState.target;
  targetMark.visible = !!target;
  if (!target || p.frozen) return null;
  const d = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
  const dir = tapNav.steer(game.world, p.pos, target, dt);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  tapState.stuck = speed < 0.3 && d > 1 ? tapState.stuck + dt : 0;
  if (d < 0.35 || (dir.x === 0 && dir.z === 0) || tapState.stuck > 0.7) { tapState.target = null; targetMark.visible = false; return null; }
  targetMark.position.set(target.x, 0.05, target.z);
  targetMark.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.12);
  return { x: dir.x, z: dir.z, mag: Math.max(0.4, Math.min(1, d / 1.2)) };
}

// ---- main loop -----------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'menu') {
    // Slow orbit of an empty backdrop is handled by the menu card; keep rendering the last scene.
    renderer.render(scene, camera);
    return;
  }
  const poll = input.poll(dt);
  if (game.state !== 'paused') {
    // In follow mode the camera turns with the character, so only tilt and zoom are manual.
    rig.rotate(settings.camera === 'follow' ? 0 : poll.yaw, poll.pitch);
    rig.zoom(poll.zoom);
  }
  if (game.state === 'playing') {
    poll.world = tapControl(poll, dt);
    game.player.inputCache = poll;
    acc += dt;
    while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; if (game.state !== 'playing') break; }
    updateHud();
    render(dt, true);
    drawMinimap();
  } else if (game.state === 'ended') {
    for (const e of game.entities) { e.vel.x *= 0.9; e.vel.z *= 0.9; }
    render(dt, true);
    drawMinimap();
  } else {
    render(0, false);
  }
}

// ---- UI wiring --------------------------------------------------------------------
function pause(on = game.state === 'playing') {
  if (on && game.state === 'playing') { game.state = 'paused'; $('paused').hidden = false; }
  else if (!on && game.state === 'paused') { game.state = 'playing'; $('paused').hidden = true; last = performance.now(); }
}
input.onPause = () => pause(game.state === 'playing');
addEventListener('blur', () => pause(true));
document.addEventListener('visibilitychange', () => document.hidden && pause(true));

$('start').addEventListener('click', () => { sfx.unlock(); startMatch(readConfig()); });
$('replay').addEventListener('click', () => { sfx.unlock(); startMatch(game.config); });
$('result-menu').addEventListener('click', toMenu);
$('pause-menu').addEventListener('click', toMenu);
$('resume').addEventListener('click', () => pause(false));
$('pause').addEventListener('click', () => pause(true));
$('auto-cam').addEventListener('click', (e) => {
  rig.autoFollow = !rig.autoFollow;
  e.currentTarget.setAttribute('aria-pressed', String(rig.autoFollow));
  e.currentTarget.textContent = `Auto-recentre: ${rig.autoFollow ? 'on' : 'off'}`;
});

const HINTS = {
  direct: { separate: 'WASD move · drag / Q E look · wheel zoom · Esc pause', follow: 'WASD move · camera turns with you · wheel zoom · Esc pause' },
  tap: { separate: 'Click to move (hold to steer) · right-drag / Q E look · wheel zoom · Esc pause', follow: 'Click to move (hold to steer) · camera turns with you · Esc pause' },
};
function applySettings() {
  if (input.scheme !== settings.scheme) input.setScheme(settings.scheme);
  rig.mode = settings.camera;
  document.body.dataset.scheme = settings.scheme;
  document.body.dataset.camera = settings.camera;
  for (const id of ['opt-scheme', 'pause-scheme']) $(id).value = settings.scheme;
  for (const id of ['opt-camera', 'pause-camera']) $(id).value = settings.camera;
  $('hint').textContent = HINTS[settings.scheme][settings.camera];
  localStorage.setItem('ft3d-settings', JSON.stringify(settings));
}
for (const id of ['opt-scheme', 'pause-scheme']) $(id).addEventListener('change', (e) => { settings.scheme = e.target.value; applySettings(); });
for (const id of ['opt-camera', 'pause-camera']) $(id).addEventListener('change', (e) => { settings.camera = e.target.value; applySettings(); });
// On-screen camera turn buttons (tap scheme on touch devices) feed the same Q / E keys.
for (const [id, code] of [['cam-left', 'KeyQ'], ['cam-right', 'KeyE']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); input.keys.add(code); });
  for (const t of ['pointerup', 'pointercancel']) b.addEventListener(t, () => input.keys.delete(code));
}
applySettings();
$('sound').addEventListener('click', (e) => {
  const on = sfx.toggle();
  e.currentTarget.textContent = `Sound: ${on ? 'on' : 'off'}`;
});
$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
});
function toMenu() {
  game.state = 'menu';
  $('menu').hidden = false; $('result').hidden = true; $('paused').hidden = true;
  document.body.classList.remove('in-game');
}

for (const [i, l] of LAYOUTS.entries()) $('opt-map').add(new Option(l.name, i));
for (const [k, l] of Object.entries(LEVELS)) $('opt-level').add(new Option(l.label, k, false, k === 'kid'));

// Menu backdrop: preview the first arena.
{
  const w = new World(0);
  game.matchGroup = new THREE.Group();
  game.matchGroup.add(w.group);
  scene.add(game.matchGroup);
  camera.position.set(-30, 26, -34);
  camera.lookAt(0, 0, 0);
}
requestAnimationFrame(frame);
window.__game = game;
window.__rig = rig;
