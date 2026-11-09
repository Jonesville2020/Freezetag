import * as THREE from 'three';
import { World, LAYOUTS, SIZE, HALF } from './world.js';
import { Character, RUNNER_COLORS, SEEKER_COLOR } from './character.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { Brain, LEVELS } from './ai.js';
import { Sfx } from './sfx.js';
import { Navigator } from './nav.js';
import { MAX_PLAYERS, keymapFor, playerRects, slotLabels, assignSlot, normalizeSlots } from './splitscreen.js';
import { createMaze } from './maze-mode.js';
import { createSeries, startSeriesRound, updateSeries, seriesTag, standings, seriesLeaders } from './modes.js';

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
const sfx = new Sfx();

const stored = JSON.parse(localStorage.getItem('ft3d-settings') || '{}');
const settings = {
  scheme: 'direct', camera: 'separate', ...stored,
  // Split screen keeps its own per-player controls so solo settings are untouched.
  players: Array.from({ length: MAX_PLAYERS }, (_, i) => ({ scheme: 'direct', camera: 'separate', ...stored.players?.[i] })),
  slots: normalizeSlots(stored.slots, MAX_PLAYERS),
};
const PLAYER_COLORS = [0xffffff, 0xffd23f, 0x7dff8a, 0xff7bf0];
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pickRay = new THREE.Raycaster();

// One slot per possible local player: own camera/rig, input, tap-to-move state and HUD pane.
// Only the first `game.players.length` slots are active; slot 0 alone is the solo game.
function makeStick(i) {
  if (i === 0) { $('stick-knob').classList.add('knob'); return [$('stick'), $('stick-knob')]; }
  const el = document.createElement('div'), knob = document.createElement('div');
  el.className = 'stick'; knob.className = 'knob'; el.append(knob);
  document.body.append(el);
  return [el, knob];
}
function makePane(i) {
  const el = document.createElement('div');
  el.className = 'pane';
  el.innerHTML = '<div class="pane-tag"></div><div class="toast pane-toast"></div><canvas class="pane-map" width="160" height="160"></canvas>'
    + '<button class="cam-btn left" aria-label="Rotate camera left">⟲</button><button class="cam-btn right" aria-label="Rotate camera right">⟳</button>'
    + `<button class="pane-give-up" aria-label="Player ${i + 1} give up maze" hidden>Give up</button>`;
  $('hud').append(el);
  return { el, tag: el.children[0], toast: el.children[1], map: el.children[2], left: el.children[3], right: el.children[4], giveUp: el.children[5] };
}
const pool = Array.from({ length: MAX_PLAYERS }, (_, index) => {
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  const [stickEl, knobEl] = makeStick(index);
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[index], transparent: true, opacity: 0.9, depthWrite: false }));
  mark.rotation.x = -Math.PI / 2;
  mark.visible = false;
  scene.add(mark);
  const p = {
    index, camera, rig: new ChaseCamera(camera), nav: new Navigator(), tap: { target: null, stuck: 0 },
    input: new Input($('game'), stickEl, knobEl, { enabled: index === 0, handlesPause: index === 0 }),
    mark, markOn: false, scheme: 'direct', ent: null, cache: null, pane: makePane(index),
    rect: { x: 0, y: 0, w: innerWidth, h: innerHeight },
  };
  for (const [btn, act] of [[p.pane.left, 'yawL'], [p.pane.right, 'yawR']]) {
    btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); p.input.hold(act, true); });
    for (const t of ['pointerup', 'pointercancel']) btn.addEventListener(t, () => p.input.hold(act, false));
  }
  p.pane.giveUp.addEventListener('click', () => giveUp(p.ent));
  return p;
});
const camera = pool[0].camera, rig = pool[0].rig, input = pool[0].input;
let players = [pool[0]];

// Screen point -> walkable ground point for player p's view, or null when the point is above the horizon.
function pickGround(p, sx, sy) {
  const r = p.rect;
  pickRay.setFromCamera(new THREE.Vector2(((sx - r.x) / r.w) * 2 - 1, -((sy - r.y) / r.h) * 2 + 1), p.camera);
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

// Position every active player's viewport, camera aspect, touch region and HUD pane.
function layout() {
  renderer.setSize(innerWidth, innerHeight, false);
  const n = players.length;
  const rects = playerRects(innerWidth, innerHeight, n, settings.slots);
  document.body.classList.toggle('split', n > 1);
  players.forEach((p, i) => {
    const r = p.rect = rects[i];
    p.camera.aspect = r.w / r.h;
    p.camera.updateProjectionMatrix();
    p.input.region = n > 1 ? r : null;
    Object.assign(p.pane.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, display: n > 1 ? 'block' : 'none' });
  });
  for (const p of pool.slice(n)) p.pane.el.style.display = 'none';
}
addEventListener('resize', layout);
layout();

// ---- match state ----------------------------------------------------------
const game = {
  state: 'menu', world: null, entities: [], player: null, players, config: null,
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
    roles: [$('opt-role').value, $('opt-role2').value, $('opt-role3').value, $('opt-role4').value],
    mode: $('opt-mode').value,
    mazeSize: +$('opt-maze-size').value,
    map: +$('opt-map').value,
    runners: +$('opt-runners').value,
    seekers: +$('opt-seekers').value,
    duration: +$('opt-duration').value,
    level: $('opt-level').value,
    rescue: $('opt-rescue').checked,
    players: +$('opt-players').value,
  };
}

function setPlayers(n) {
  players = game.players = pool.slice(0, n);
  pool.forEach((p, i) => { p.input.enabled = i < n; });
  players.forEach((p, i) => p.input.configure({ keymap: keymapFor(i, n), region: null, slot: i, count: n }));
  layout();
}

function startMatch(config) {
  if (game.matchGroup) {
    scene.remove(game.matchGroup);
    game.matchGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose?.(); });
  }
  const group = game.matchGroup = new THREE.Group();
  scene.add(group);
  const count = Math.max(1, Math.min(MAX_PLAYERS, config.players));
  const mode = config.mode ?? 'freeze';
  const roles = (config.roles ?? [config.role]).slice(0, count);
  while (roles.length < count) roles.push('runner');
  if (mode === 'outbreak' || mode === 'maze') roles.fill('runner');
  if (mode === 'tag') {
    let hasIt = false;
    for (let i = 0; i < roles.length; i++) {
      if (roles[i] !== 'seeker') continue;
      if (hasIt) roles[i] = 'runner';
      else hasIt = true;
    }
  }
  const humanSeekers = roles.filter((role) => role === 'seeker').length;
  config = game.config = {
    ...config, mode, roles, players: count,
    seekers: mode === 'maze' ? 0 : mode === 'tag' || mode === 'outbreak' ? 1 : Math.max(config.seekers, humanSeekers),
    runners: mode === 'maze' ? count : Math.max(config.runners, count - humanSeekers),
  };
  setPlayers(count);
  game.maze = mode === 'maze' ? createMaze(config.mazeSize === 5 ? 5 : 7) : null;
  game.series = null;
  game.world = new World(game.maze ? game.maze.layout : config.map);
  group.add(game.world.group);
  scene.background.set(0x0b1320);
  scene.fog.near = game.maze ? 12 : 45;
  scene.fog.far = game.maze ? 40 : 110;
  game.entities = [];
  game.particles = [];

  const humanSeeker = roles[0] === 'seeker';
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
    e.runnerColor = seeker ? RUNNER_COLORS[e.id % RUNNER_COLORS.length] : char.mats.shirt.color.getHex();
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
  let si = 0, ri = 0;
  const humans = roles.map((role, i) => {
    const seeker = role === 'seeker';
    const pos = game.maze ? { x: game.maze.start.x + (i % 2) * 1.1, z: game.maze.start.z + Math.floor(i / 2) * 1.1 } : seeker ? spawnS[si++] : spawnR[ri++];
    return make(seeker, pos, true);
  });
  while (si < spawnS.length) {
    const e = make(true, spawnS[si++], false);
    e.scout = mode === 'outbreak';
    e.brain = new Brain(game, e, mode === 'outbreak' ? 'scout' : config.level);
  }
  while (ri < spawnR.length && mode !== 'maze') {
    const e = make(false, spawnR[ri++], false);
    e.brain = new Brain(game, e, config.level);
  }
  players.forEach((p, i) => {
    p.ent = humans[i]; humans[i].player = p;
    p.tap.target = null; p.nav.reset(); p.markOn = false; p.cache = null;
    p.rig.fade.clear();
    p.explored = new Uint8Array(64 * 64);
    p.pane.giveUp.hidden = mode !== 'maze' || count === 1;
    if (count > 1) { humans[i].arrow.material.color.setHex(PLAYER_COLORS[i]); humans[i].mark.material.color.setHex(PLAYER_COLORS[i]); }
  });
  game.player = humans[0];

  if (mode === 'tag' || mode === 'outbreak') game.series = createSeries(mode, game.entities);
  if (game.maze) {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 3.5, 16), new THREE.MeshBasicMaterial({ color: 0x64e5ff, transparent: true, opacity: 0.8 }));
    marker.position.set(game.maze.exit.x, 1.75, game.maze.exit.z);
    group.add(marker);
    game.maze.marker = marker;
    game.elapsed = 0;
  }
  game.time = game.series?.duration ?? config.duration;
  game.countdown = COUNTDOWN;
  game.state = 'playing';
  for (const p of players) { p.rig.snap = true; p.rig.yaw = Math.PI; p.rig.idle = 0; }
  applySettings();
  $('menu').hidden = true;
  $('result').hidden = true;
  $('paused').hidden = true;
  document.body.classList.add('in-game');
  $('role-label').textContent = humanSeeker ? 'SEEKER' : 'RUNNER';
  $('objective').textContent = mode === 'maze' ? 'Find the exit. Each player finishes separately.'
    : mode === 'tag' ? 'Pass IT on contact. Lowest total IT time wins after 5 rounds.'
    : mode === 'outbreak' ? 'Survive the infection. Highest survival score wins after 3 rounds.'
    : humanSeeker ? 'Freeze every runner before time runs out.' : 'Stay unfrozen until the timer ends.';
  toast(humanSeeker ? 'Hunt them down!' : 'Hide! The seekers are coming.', 2400);
  $('frozen-total').textContent = config.runners;
  $('give-up').hidden = mode !== 'maze' || count !== 1;
  $('next-round').hidden = true;
  $('replay').hidden = false;
}

// ---- helpers ----------------------------------------------------------------
// In split screen a toast about one player is shown in that player's pane; others use the shared one.
function toast(msg, ms = 1800, ent = null) {
  const t = players.length > 1 && ent?.player ? ent.player.pane.toast : $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function burst(x, z, color = 0x9eefff, seenBy = players.map(() => true)) {
  const geom = new THREE.TetrahedronGeometry(0.11);
  geom.userData = {};
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.userData.shared = true;
    m.position.set(x, 0.9, z);
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
    game.particles.push({ m, seenBy, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.7 });
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
function visibleTo(p, e) {
  if (!p.ent || e === p.ent || game.state === 'ended') return true;
  return game.world.sees(p.ent.pos, e.pos);
}
const seenByAll = (e) => players.map((p) => visibleTo(p, e));

function playerDirection(e) {
  const { move, world } = e.inputCache;
  if (world) return world;
  const f = e.player.rig.forward, r = e.player.rig.right;
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
  } else if (game.maze) {
    game.elapsed += dt;
  } else {
    game.time = Math.max(0, game.time - dt);
  }
  const locked = game.countdown > 0;
  if (!locked && game.series) {
    for (const event of updateSeries(game.series, entities, dt)) {
      if (event.type === 'infected') {
        updateRoleAppearance(event.player);
        if (event.player.human) toast('Infected! You are now a seeker.', 2000, event.player);
      }
    }
  }

  for (const e of entities) {
    e.grace = Math.max(0, e.grace - dt);
    let dir = { x: 0, z: 0, mag: 0 }, mul = 1;
    if (!e.frozen && !e.escaped && !e.gaveUp && !(locked && (e.seeker || game.maze))) {
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

  if (game.maze) {
    for (const e of entities) {
      if (!e.escaped && !e.gaveUp && Math.hypot(e.pos.x - game.maze.exit.x, e.pos.z - game.maze.exit.z) < 1.4) {
        e.escaped = true;
        e.finishTime = game.elapsed;
        e.vel.x = e.vel.z = 0;
        toast(`Escaped in ${e.finishTime.toFixed(1)}s!`, 2500, e);
      }
    }
    if (entities.every((e) => e.escaped || e.gaveUp)) endMaze();
    return;
  }

  if (!locked) {
    for (const s of entities) {
      if (!s.seeker || s.frozen) continue;
      for (const r of entities) {
        if (!s.seeker || s.frozen) break;
        if (r.seeker || r.frozen || r.grace > 0) continue;
        if (dist(s, r) < TAG_RANGE && !world.blocked(s.pos.x, s.pos.z, r.pos.x, r.pos.z, 0)) {
          if (game.series && seriesTag(game.series, s, r)) {
            r.vel.x = r.vel.z = 0;
            updateRoleAppearance(s);
            updateRoleAppearance(r);
            const seen = seenByAll(r);
            if (seen.some(Boolean)) { burst(r.pos.x, r.pos.z, 0x9eefff, seen); sfx.freeze(); }
            if (r.human) toast(config.mode === 'tag' ? 'You are IT!' : 'Frozen! Rescue before infection.', 2000, r);
          } else if (!game.series) freeze(r, s);
        }
      }
    }
    if (config.mode === 'outbreak' && !entities.some((e) => !e.seeker && !e.frozen)) {
      endSeriesRound();
      return;
    }
    if (config.mode === 'outbreak' || (config.mode === 'freeze' && config.rescue)) updateThaw(dt);
  }

  if (game.series) {
    if (game.time <= 0) endSeriesRound();
    return;
  }
  // Win checks
  const active = entities.filter((e) => !e.seeker && !e.frozen).length;
  if (active === 0) endMatch('seekers');
  else if (game.time <= 0) endMatch('runners');
}

function freeze(r, by) {
  r.frozen = true; r.thaw = 0; r.vel.x = r.vel.z = 0;
  const seen = seenByAll(r);
  if (seen.some(Boolean)) { burst(r.pos.x, r.pos.z, 0x9eefff, seen); sfx.freeze(); }
  if (r.human) toast('You were frozen! Wait for a rescue.', 2200, r);
  else if (by.human) toast(`Frozen! ${game.entities.filter((e) => !e.seeker && e.frozen).length}/${game.config.runners}`, 1000, by);
}

function updateThaw(dt) {
  for (const f of game.entities) {
    if (f.seeker || !f.frozen) continue;
    const helpers = game.entities.some((h) => !h.seeker && !h.frozen && h !== f && dist(h, f) < THAW_RANGE && game.world.sees(h.pos, f.pos));
    f.thaw = helpers ? Math.min(1, f.thaw + dt / THAW_TIME) : game.config.mode === 'outbreak' ? 0 : Math.max(0, f.thaw - dt * 1.5);
    const camping = game.config.mode === 'outbreak' && game.entities.some((s) => s.seeker && dist(s, f) < THAW_RANGE && game.world.sees(s.pos, f.pos));
    f.campTime = camping ? (f.campTime || 0) + dt : 0;
    if (f.thaw >= 1 || f.campTime >= 3) {
      f.frozen = false; f.thaw = 0; f.infection = 0; f.grace = f.campTime >= 3 ? 5 : GRACE; f.campTime = 0;
      const seen = seenByAll(f);
      if (seen.some(Boolean)) { burst(f.pos.x, f.pos.z, 0xffffff, seen); sfx.thaw(); }
      if (f.human) toast('Thawed! Run!', 1500, f);
    }
  }
}

function updateRoleAppearance(e) {
  e.char.mats.shirt.color.setHex(e.seeker ? SEEKER_COLOR : e.runnerColor);
  if (!e.human) e.mark.material.color.setHex(e.seeker ? 0xff3b52 : 0x64e5ff);
}

function playerName(e) {
  return e.human ? `P${e.player.index + 1}` : `CPU ${e.id + 1}`;
}

function endSeriesRound() {
  const series = game.series;
  game.state = 'ended';
  game.nextIt = game.entities.find((e) => e.seeker)?.id;
  const ranked = standings(series);
  const final = series.round >= series.rounds;
  const winners = final ? seriesLeaders(series).map((entry) => entry.id) : [];
  for (const e of game.entities) e.joyTarget = winners.includes(e.id);
  $('result-tag').textContent = final ? 'SERIES COMPLETE' : `ROUND ${series.round} OF ${series.rounds}`;
  $('result-title').textContent = final ? `${winners.map((id) => playerName(game.entities.find((e) => e.id === id))).join(' & ')} win!` : 'Round complete';
  $('result-description').textContent = ranked.map((entry) =>
    `${playerName(game.entities.find((e) => e.id === entry.id))}: ${entry.score.toFixed(1)}s`).join(' · ');
  $('next-round').hidden = final;
  $('replay').hidden = !final;
  $('result').hidden = false;
  if (final) sfx.win();
}

function nextSeriesRound() {
  const series = game.series;
  series.round++;
  startSeriesRound(series, game.entities, game.nextIt);
  const placed = [];
  for (const e of game.entities) {
    let pos;
    for (let tries = 0; tries < 100; tries++) {
      pos = game.world.randomOpenPoint();
      if (placed.every((other) => Math.hypot(pos.x - other.x, pos.z - other.z) > 3)) break;
    }
    placed.push(pos);
    e.pos.x = pos.x; e.pos.z = pos.z;
    e.vel.x = e.vel.z = 0;
    e.campTime = 0;
    e.think = 0;
    e.lastDir = null;
    if (e.brain) e.brain = new Brain(game, e, e.scout ? 'scout' : game.config.level);
    updateRoleAppearance(e);
  }
  for (const p of players) { p.tap.target = null; p.nav.reset(); p.rig.snap = true; }
  game.time = series.duration;
  game.countdown = COUNTDOWN;
  game.state = 'playing';
  $('result').hidden = true;
  $('next-round').hidden = true;
}

function endMaze() {
  game.state = 'ended';
  const finishers = game.entities.filter((e) => e.escaped).sort((a, b) => a.finishTime - b.finishTime);
  for (const e of game.entities) e.joyTarget = e.escaped;
  $('result-tag').textContent = 'MAZE DASH';
  $('result-title').textContent = finishers.length ? 'Maze complete!' : 'Maze ended';
  $('result-description').textContent = game.entities.map((e) =>
    `${playerName(e)}: ${e.escaped ? `${e.finishTime.toFixed(1)}s` : 'gave up'}`).join(' · ');
  $('next-round').hidden = true;
  $('replay').hidden = false;
  $('result').hidden = false;
}

function giveUp(e) {
  if (game.state !== 'playing' || !game.maze || !e || e.escaped || e.gaveUp) return;
  e.gaveUp = true;
  e.vel.x = e.vel.z = 0;
  e.player.pane.giveUp.hidden = true;
  if (game.entities.every((player) => player.escaped || player.gaveUp)) endMaze();
}

function endMatch(winner) {
  game.state = 'ended';
  const humanSeeker = game.config.role === 'seeker';
  const won = (winner === 'seekers') === humanSeeker;
  for (const e of game.entities) e.joyTarget = (e.seeker === (winner === 'seekers')) ? 1 : 0;
  $('result-tag').textContent = players.length > 1 ? 'ROUND OVER' : won ? 'YOU WIN' : 'ROUND OVER';
  $('result-title').textContent = winner === 'seekers' ? 'Everyone’s frozen.' : 'Time’s up — runners escape.';
  const frozen = game.entities.filter((e) => !e.seeker && e.frozen).length;
  const outcomes = players.length > 1 ? ` · ${players.map((p) => `P${p.index + 1} ${p.ent.seeker === (winner === 'seekers') ? 'wins' : 'loses'}`).join(' · ')}` : '';
  $('result-description').textContent = `${frozen}/${game.config.runners} runners frozen · ${Math.round(game.config.duration - game.time)}s played${outcomes}.`;
  won ? sfx.win() : sfx.lose();
  setTimeout(() => { if (game.state === 'ended') { $('result').hidden = false; } }, 1600);
}

// ---- rendering / HUD -------------------------------------------------------------
function drawMinimap(p) {
  const { world, entities } = game;
  const player = p.ent, mini = players.length > 1 ? p.pane.map : $('minimap'), mctx = mini.getContext('2d');
  const s = mini.width, k = s / SIZE;
  mctx.clearRect(0, 0, s, s);
  mctx.fillStyle = 'rgba(11,19,32,.82)'; mctx.fillRect(0, 0, s, s);
  if (game.maze && performance.now() - (p.lastExplore || 0) > 250) {
    p.lastExplore = performance.now();
    const cx = Math.floor(player.pos.x + HALF), cz = Math.floor(player.pos.z + HALF);
    for (let z = Math.max(0, cz - 6); z <= Math.min(63, cz + 6); z++) {
      for (let x = Math.max(0, cx - 6); x <= Math.min(63, cx + 6); x++) {
        const point = { x: x + 0.5 - HALF, z: z + 0.5 - HALF };
        if (Math.hypot(point.x - player.pos.x, point.z - player.pos.z) <= 6 && world.sees(player.pos, point)) p.explored[z * 64 + x] = 1;
      }
    }
  }
  if (game.maze) {
    mctx.fillStyle = '#36524f';
    for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) {
      if (p.explored[z * 64 + x]) mctx.fillRect(x * k, z * k, k + 0.5, k + 0.5);
    }
  }
  mctx.fillStyle = '#9aa7b4';
  for (const w of world.rects) {
    if (game.maze && !p.explored[Math.max(0, Math.min(63, Math.floor(w.z + HALF))) * 64 + Math.max(0, Math.min(63, Math.floor(w.x + HALF)))]) continue;
    mctx.fillRect((w.minX + HALF) * k, (w.minZ + HALF) * k, w.w * k, w.d * k);
  }
  if (game.maze) {
    const exit = game.maze.exit;
    if (p.explored[Math.floor(exit.z + HALF) * 64 + Math.floor(exit.x + HALF)]) {
      mctx.fillStyle = '#64e5ff';
      mctx.fillRect((exit.x + HALF) * k - 3, (exit.z + HALF) * k - 3, 6, 6);
    }
  }
  for (const e of entities) {
    // Hidden characters stay off the map; frozen runners are always known.
    if (!e.seenBy[p.index] && !(e.frozen && !e.seeker)) continue;
    const x = (e.pos.x + HALF) * k, y = (e.pos.z + HALF) * k;
    mctx.fillStyle = e.frozen ? '#8ff3ff' : e.seeker ? '#ff3b52' : '#ffd23f';
    mctx.beginPath(); mctx.arc(x, y, e.human ? 5 : 3.2, 0, 6.283); mctx.fill();
    if (e.human) {
      mctx.strokeStyle = players.length > 1 ? '#' + PLAYER_COLORS[e.player.index].toString(16).padStart(6, '0') : '#fff'; mctx.lineWidth = 2; mctx.stroke(); }
  }
  // Camera direction wedge
  if (player) {
    const px = (player.pos.x + HALF) * k, py = (player.pos.z + HALF) * k, f = p.rig.forward;
    mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.moveTo(px, py); mctx.lineTo(px + f.x * 16, py + f.z * 16); mctx.stroke();
  }
}

function updateHud() {
  const t = game.maze ? Math.floor(game.elapsed) : Math.ceil(game.time);
  $('time').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const amount = game.maze ? game.entities.filter((e) => e.escaped).length
    : game.series?.mode === 'tag' ? game.series.round
    : game.series?.mode === 'outbreak' ? game.entities.filter((e) => e.seeker && !e.scout).length
    : game.entities.filter((e) => !e.seeker && e.frozen).length;
  const total = game.maze ? game.entities.length : game.series?.mode === 'tag' ? game.series.rounds : game.config.runners;
  $('score-label').textContent = game.maze ? 'ESCAPED' : game.series?.mode === 'tag' ? 'ROUND' : game.series?.mode === 'outbreak' ? 'INFECTED' : 'FROZEN';
  $('role-label').textContent = game.maze ? 'MAZE' : game.player.seeker ? 'SEEKER' : 'RUNNER';
  for (const p of players) {
    const state = game.maze ? (p.ent.escaped ? 'Escaped' : p.ent.gaveUp ? 'Gave up' : 'Find exit')
      : p.ent.seeker ? 'IT' : p.ent.frozen ? `Frozen${p.ent.infection > 0 ? ` ${p.ent.infection.toFixed(1)}s` : ''}` : 'Runner';
    const score = game.series && game.series.scores.has(p.ent.id) ? ` · ${game.series.scores.get(p.ent.id).toFixed(1)}s` : '';
    p.pane.tag.textContent = `P${p.index + 1} · ${state}${score}`;
  }
  if (game.series) {
    const score = game.series.scores.get(game.player.id) ?? 0;
    const infection = game.player.frozen && game.player.infection > 0 ? ` · Infection in ${game.player.infection.toFixed(1)}s` : '';
    $('objective').textContent = `Round ${game.series.round}/${game.series.rounds} · Your ${game.series.mode === 'tag' ? 'IT time' : 'survival score'}: ${score.toFixed(1)}s${infection}`;
  }
  $('frozen-count').textContent = amount;
  $('frozen-total').textContent = total;
  $('freeze-fill').style.width = `${(amount / total) * 100}%`;
  const c = $('countdown');
  if (game.countdown > 0) { c.textContent = Math.ceil(game.countdown); c.classList.add('show'); } else c.classList.remove('show');
}

function render(dt, cam) {
  const { entities, world } = game;
  for (const e of entities) {
    const nearTarget = e.seeker && !e.frozen && entities.some((r) => !r.seeker && !r.frozen && r.grace <= 0 && dist(e, r) < 2.4);
    e.seenBy = seenByAll(e);
    e.char.group.position.set(e.pos.x, 0, e.pos.z);
    const celebrating = game.state === 'ended' && e.joyTarget;
    e.char.update(dt, e.vel, { frozen: e.frozen && game.state !== 'ended', thaw: e.thaw, reach: nearTarget && game.countdown <= 0 ? 1 : 0, joy: celebrating ? 1 : 0 });
    e.mark.position.set(e.pos.x, 0.03, e.pos.z);
    e.mark.material.opacity = (e.human ? 0.45 + Math.sin(performance.now() / 250) * 0.12 : e.grace > 0 ? 0.6 : 0.22);
    e.thawOn = e.frozen && e.thaw > 0.02;
    if (e.thawOn) { e.thawDisc.position.set(e.pos.x, 0.04, e.pos.z); e.thawDisc.scale.setScalar(Math.max(0.05, e.thaw)); }
    if (e.arrow) e.arrow.position.set(e.pos.x, 2.5 + Math.sin(performance.now() / 280) * 0.12, e.pos.z);
    e.blink = e.grace > 0 ? Math.floor(performance.now() / 90) % 2 === 0 : true;
  }
  updateParticles(dt);
  if (cam) for (const p of players) if (p.ent) p.rig.update(dt, p.ent.pos, p.ent.vel, p.ent.char.yaw, world);
  drawViews();
}

// Visibility, wall fade and target marker are per view, so apply them just before each viewport renders.
function drawViews() {
  const n = players.length;
  renderer.setScissorTest(n > 1);
  for (const p of players) {
    const idx = p.index;
    for (const e of game.entities) {
      const vis = !!e.seenBy?.[idx];
      e.char.group.visible = vis && e.blink;
      e.mark.visible = vis;
      e.thawDisc.visible = vis && e.thawOn;
      if (e.arrow) e.arrow.visible = vis;
    }
    for (const pr of game.particles) pr.m.visible = !!pr.seenBy[idx];
    for (const q of pool) q.mark.visible = q === p && q.markOn;
    if (game.maze) game.maze.marker.visible = game.world.sees(p.ent.pos, game.maze.exit);
    if (game.world && p.ent) p.rig.applyFade(game.world);
    const r = p.rect, y = innerHeight - r.y - r.h;
    renderer.setViewport(r.x, y, r.w, r.h);
    renderer.setScissor(r.x, y, r.w, r.h);
    renderer.render(scene, p.camera);
  }
}

// Click / tap to move. Returns a world-space direction for the player, or null.
function tapControl(p, poll, dt) {
  const e = p.ent;
  if (p.scheme !== 'tap') { p.tap.target = null; p.markOn = false; return null; }
  if (Math.hypot(poll.move.x, poll.move.y) > 0.1) p.tap.target = null; // keyboard / gamepad take over
  else {
    const pt = poll.aim ?? poll.tap;
    const g = pt && pickGround(p, pt.x, pt.y);
    if (g) { p.tap.target = g; p.tap.stuck = 0; }
  }
  const target = p.tap.target;
  p.markOn = !!target;
  if (!target || e.frozen) return null;
  const d = Math.hypot(target.x - e.pos.x, target.z - e.pos.z);
  const dir = p.nav.steer(game.world, e.pos, target, dt);
  const speed = Math.hypot(e.vel.x, e.vel.z);
  p.tap.stuck = speed < 0.3 && d > 1 ? p.tap.stuck + dt : 0;
  if (d < 0.35 || (dir.x === 0 && dir.z === 0) || p.tap.stuck > 0.7) { p.tap.target = null; p.markOn = false; return null; }
  p.mark.position.set(target.x, 0.05, target.z);
  p.mark.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.12);
  return { x: dir.x, z: dir.z, mag: Math.max(0.4, Math.min(1, d / 1.2)) };
}

// ---- main loop -----------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'menu') {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(scene, camera);
    return;
  }
  const polls = players.map((p) => p.input.poll(dt));
  if (game.state !== 'paused') {
    players.forEach((p, i) => {
      // In follow mode the camera turns with the character, so only tilt and zoom are manual.
      p.rig.rotate(p.camMode === 'follow' ? 0 : polls[i].yaw, polls[i].pitch);
      p.rig.zoom(polls[i].zoom);
    });
  }
  if (game.state === 'playing') {
    players.forEach((p, i) => { polls[i].world = tapControl(p, polls[i], dt); p.ent.inputCache = polls[i]; });
    acc += dt;
    while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; if (game.state !== 'playing') break; }
    updateHud();
    render(dt, true);
    for (const p of players) drawMinimap(p);
  } else if (game.state === 'ended') {
    for (const e of game.entities) { e.vel.x *= 0.9; e.vel.z *= 0.9; }
    render(dt, true);
    for (const p of players) drawMinimap(p);
  } else {
    render(0, false);
  }
}

// ---- UI wiring --------------------------------------------------------------------
function pause(on = game.state === 'playing') {
  if (on && game.state === 'playing') {
    game.state = 'paused';
    for (const p of players) p.input.releaseAll();
    $('paused').hidden = false;
  }
  else if (!on && game.state === 'paused') { game.state = 'playing'; $('paused').hidden = true; last = performance.now(); }
}
for (const p of pool) p.input.onPause = () => pause(game.state === 'playing');
addEventListener('blur', () => pause(true));
document.addEventListener('visibilitychange', () => document.hidden && pause(true));

$('start').addEventListener('click', () => { sfx.unlock(); startMatch(readConfig()); });
$('replay').addEventListener('click', () => { sfx.unlock(); startMatch(game.config); });
$('next-round').addEventListener('click', nextSeriesRound);
$('give-up').addEventListener('click', () => giveUp(game.player));
$('result-menu').addEventListener('click', toMenu);
$('pause-menu').addEventListener('click', toMenu);
$('resume').addEventListener('click', () => pause(false));
$('pause').addEventListener('click', () => pause(true));
$('auto-cam').addEventListener('click', (e) => {
  const on = !rig.autoFollow;
  for (const p of pool) p.rig.autoFollow = on;
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.textContent = `Auto-recentre: ${on ? 'on' : 'off'}`;
});

const HINTS = {
  direct: { separate: 'WASD move · drag / Q E look · wheel zoom · Esc pause', follow: 'WASD move · camera turns with you · wheel zoom · Esc pause' },
  tap: { separate: 'Click to move (hold to steer) · right-drag / Q E look · wheel zoom · Esc pause', follow: 'Click to move (hold to steer) · camera turns with you · Esc pause' },
};
const SPLIT_HINT = 'P1 WASD + Q E · P2 arrows + , . · P3/P4 controllers (pads go to P3, P4, then P1, P2) · each player can also touch their own screen · Esc / Start pause';
const uiCount = () => (game.state === 'menu' ? +$('opt-players').value : players.length);
const keyHint = (i, n) => (n === 1 ? '' : i === 0 ? 'WASD' : i === 1 ? 'Arrows' : 'Controller');

// Per-player control rows (movement, camera, screen position) for the menu and pause dialogs.
const SCHEMES = [['direct', 'Joystick · keys · gamepad'], ['tap', 'Tap / click to move']];
const CAMERAS = [['separate', 'Camera: you steer'], ['follow', 'Camera: follows you']];
const splitRows = ['menu-split', 'pause-split'].map((id) => {
  const box = $(id);
  return pool.map((p, i) => {
    const row = document.createElement('div');
    row.className = 'split-row';
    const make = (key, opts) => {
      const sel = document.createElement('select');
      sel.dataset.key = key; sel.setAttribute('aria-label', `Player ${i + 1} ${key}`);
      for (const [v, t] of opts) sel.add(new Option(t, v));
      sel.addEventListener('change', () => {
        if (key === 'slot') settings.slots = assignSlot(settings.slots, uiCount(), i, +sel.value);
        else settings.players[i][key] = sel.value;
        applySettings();
      });
      return sel;
    };
    const tag = document.createElement('b');
    tag.textContent = `P${i + 1}`; tag.style.color = `#${PLAYER_COLORS[i].toString(16).padStart(6, '0')}`;
    row.append(tag, make('scheme', SCHEMES), make('camera', CAMERAS), make('slot', []));
    box.append(row);
    return row;
  });
});

function applySettings() {
  const n = uiCount(), split = n > 1;
  if (game.state !== 'menu') {
    players.forEach((p, i) => {
      const c = split ? settings.players[i] : settings;
      if (p.scheme !== c.scheme) { p.scheme = c.scheme; p.input.setScheme(c.scheme); p.tap.target = null; }
      p.camMode = c.camera;
      p.rig.mode = c.camera;
      p.pane.el.dataset.scheme = c.scheme;
      p.pane.el.dataset.camera = c.camera;
      p.pane.tag.textContent = split ? `P${i + 1} · ${c.scheme === 'tap' ? 'Tap / click' : keyHint(i, n)}` : '';
      p.pane.tag.style.color = `#${PLAYER_COLORS[i].toString(16).padStart(6, '0')}`;
    });
    layout();
  }
  document.body.dataset.scheme = settings.scheme;
  document.body.dataset.camera = settings.camera;
  for (const id of ['opt-scheme', 'pause-scheme']) $(id).value = settings.scheme;
  for (const id of ['opt-camera', 'pause-camera']) $(id).value = settings.camera;
  for (const el of document.querySelectorAll('.solo-only')) el.hidden = split;
  for (const el of document.querySelectorAll('.split-only')) el.hidden = !split;
  const slots = normalizeSlots(settings.slots, n), labels = slotLabels(n);
  for (const rows of splitRows) rows.forEach((row, i) => {
    row.hidden = i >= n;
    if (i >= n) return;
    row.querySelector('[data-key=scheme]').value = settings.players[i].scheme;
    row.querySelector('[data-key=camera]').value = settings.players[i].camera;
    const sel = row.querySelector('[data-key=slot]');
    if (sel.options.length !== n) { sel.length = 0; labels.forEach((t, k) => sel.add(new Option(t, k))); }
    sel.value = slots[i];
  });
  $('hint').textContent = split ? SPLIT_HINT : HINTS[settings.scheme][settings.camera];
  localStorage.setItem('ft3d-settings', JSON.stringify(settings));
}
for (const id of ['opt-scheme', 'pause-scheme']) $(id).addEventListener('change', (e) => { settings.scheme = e.target.value; applySettings(); });
for (const id of ['opt-camera', 'pause-camera']) $(id).addEventListener('change', (e) => { settings.camera = e.target.value; applySettings(); });
function updateModeOptions() {
  const mode = $('opt-mode').value;
  const count = +$('opt-players').value;
  $('maze-size-label').hidden = mode !== 'maze';
  $('opt-role').parentElement.hidden = mode === 'outbreak' || mode === 'maze';
  for (let i = 2; i <= 4; i++) $(`role${i}-label`).hidden = !['freeze', 'tag'].includes(mode) || count < i;
  for (const id of ['opt-map', 'opt-runners', 'opt-seekers', 'opt-duration', 'opt-level']) {
    const hide = mode === 'maze' || (id === 'opt-seekers' && (mode === 'tag' || mode === 'outbreak'))
      || (id === 'opt-duration' && (mode === 'tag' || mode === 'outbreak'));
    $(id).parentElement.hidden = hide;
  }
  $('rescue-option').hidden = mode !== 'freeze';
  $('mode-help').textContent = mode === 'tag' ? 'Five 40-second rounds. The first player choosing Seeker starts as IT; otherwise a CPU starts. Lowest total IT time wins.'
    : mode === 'outbreak' ? 'Three 120-second rounds. Rescue frozen runners before infection spreads; most survival time wins.'
    : mode === 'maze' ? 'Explore the maze and find the glowing exit. Each player finishes separately or can give up.'
    : 'Tag by touching. Walls block sight. Rescue frozen teammates by staying nearby.';
}
$('opt-mode').addEventListener('change', updateModeOptions);
$('opt-players').addEventListener('change', () => { updateModeOptions(); applySettings(); });
// On-screen camera turn buttons (tap scheme on touch devices) feed the same actions as Q / E.
for (const [id, act] of [['cam-left', 'yawL'], ['cam-right', 'yawR']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); input.hold(act, true); });
  for (const t of ['pointerup', 'pointercancel']) b.addEventListener(t, () => input.hold(act, false));
}
applySettings();
updateModeOptions();
$('sound').addEventListener('click', (e) => {
  const on = sfx.toggle();
  e.currentTarget.textContent = `Sound: ${on ? 'on' : 'off'}`;
});
$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
});
function toMenu() {
  game.state = 'menu';
  setPlayers(1);
  applySettings();
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
