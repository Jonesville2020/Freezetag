import { buildProp } from './props.js';
import { ROSTER_BY_ID } from './roster.js?v=avatar5';

// Live 3D backdrop for the title screen: a sunny park where a red seeker chases runners round a
// loop, tags one (ice burst) and a teammate thaws her, while another kid stays frozen in ice.
// Uses its own renderer/canvas and only renders between start() and stop().

const TAU = Math.PI * 2;
const RING = { cx: -0.8, cz: -1.2, rx: 5.4, rz: 3.1 };
const OMEGA = 1.15;
const FROZEN_SPOT = [-4.7, 3.0];
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const backOut = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

function ringPoint(theta, scale = 1) {
  return [RING.cx + Math.cos(theta) * RING.rx * scale, RING.cz + Math.sin(theta) * RING.rz * scale];
}

function softSprite(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function skyTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4fb0ee');
  grad.addColorStop(0.55, '#a9dcf7');
  grad.addColorStop(1, '#e8f7ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Pool {
  constructor(THREE, n, { map, size, additive, opacity = 1, fadeTo = null }) {
    this.n = n; this.next = 0; this.fadeTo = fadeTo;
    this.pos = new Float32Array(n * 3).fill(-100);
    this.col = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.material = new THREE.PointsMaterial({
      map, size, vertexColors: true, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  emit(x, y, z, vx, vy, vz, life, [r, g, b]) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.base.set([r, g, b], i * 3);
    this.life[i] = this.max[i] = life;
  }

  update(dt, gravity, drag) {
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.max[i]);
      for (let a = 0; a < 3; a++) {
        const j = i * 3 + a;
        if (a === 1) this.vel[j] -= gravity * dt;
        this.vel[j] *= k;
        this.pos[j] += this.vel[j] * dt;
        this.col[j] = this.fadeTo ? this.fadeTo[a] + (this.base[j] - this.fadeTo[a]) * f : this.base[j] * f;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

export function createTitleScene(container, { three: THREE, avatarFactory, reducedMotion = false }) {
  let renderer, scene, camera, raf = 0, running = false, disposed = false, ready = false, wantRun = false;
  let observer, last = 0, time = 0;
  const actors = {};
  const sim = { state: 'run', st: 0, zoeTheta: 2.6, seekTheta: 1.6, maxPull: 0, maxTheta: 4.6, miaTheta: 5.6 };
  const reduced = reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sprite, sky, ringFx, dust, sparks, ambient, blocks = [], shadows = [];

  const fail = () => { container.classList.add('title-fallback'); };

  function makeBlock() {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xbfeaff, transparent: true, opacity: 0.4, roughness: 0.08, metalness: 0,
      emissive: 0x4fb6f0, emissiveIntensity: 0.4, depthWrite: false, clearcoat: 1,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.95, 1.3), mat);
    box.position.y = 0.97;
    group.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    edges.position.copy(box.position);
    group.add(edges);
    const shardGeo = new THREE.ConeGeometry(0.16, 0.7, 5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      const shard = new THREE.Mesh(shardGeo, mat);
      shard.position.set(Math.cos(a) * 0.85, 0.3, Math.sin(a) * 0.85);
      shard.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      shard.scale.setScalar(0.7 + (i % 3) * 0.3);
      group.add(shard);
    }
    group.visible = false;
    scene.add(group);
    return group;
  }

  function addShadow(radius) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 20),
      new THREE.MeshBasicMaterial({ color: 0x1d3a16, transparent: true, opacity: 0.3, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    scene.add(m);
    shadows.push(m);
    return m;
  }

  function buildWorld() {
    scene = new THREE.Scene();
    sky = skyTexture(THREE);
    scene.background = sky;
    scene.fog = new THREE.Fog(0xdff3fb, 24, 70);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fd88a, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0cc, 2.3);
    sun.position.set(7, 11, 9);
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: 0x84d46a }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const path = new THREE.Mesh(new THREE.RingGeometry(0.74, 1.12, 64),
      new THREE.MeshLambertMaterial({ color: 0xe6cf98, side: THREE.DoubleSide }));
    path.rotation.x = -Math.PI / 2;
    path.scale.set(RING.rx, RING.rz, 1);
    path.rotation.z = 0;
    path.position.set(RING.cx, 0.015, RING.cz);
    scene.add(path);

    const hillMat = new THREE.MeshLambertMaterial({ color: 0x6cc268 });
    [[-26, -34, 16], [8, -42, 22], [34, -36, 15]].forEach(([x, z, r], i) => {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), i % 2 ? hillMat : new THREE.MeshLambertMaterial({ color: 0x78cb72 }));
      hill.scale.y = 0.45;
      hill.position.set(x, -1, z);
      scene.add(hill);
    });

    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    [[-20, 16, -55], [14, 20, -60], [34, 13, -52]].forEach(([x, y, z]) => {
      const cloud = new THREE.Group();
      [[0, 0, 5], [4.5, -0.8, 3.8], [-4.5, -1, 3.5], [8, -1.4, 2.6]].forEach(([cx, cy, r]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), cloudMat);
        puff.scale.y = 0.6;
        puff.position.set(cx, cy, 0);
        cloud.add(puff);
      });
      cloud.position.set(x, y, z);
      scene.add(cloud);
    });

    const layout = { theme: 'park' };
    const place = (type, x, z, extra = {}) => {
      const prop = buildProp({ type, x, z, ...extra }, layout);
      prop.position.set(x, 0, z);
      scene.add(prop);
    };
    try {
      place('tree', -9.5, -9, { h: 5 }); place('tree', -3.5, -13, { h: 5.6 }); place('tree', 4.5, -12, { h: 4.8 });
      place('tree', 11, -8, { h: 5.4 }); place('tree', -13, -3, { h: 4.6 }); place('tree', 14.5, 0, { h: 5 });
      place('tree', -16, -12, { h: 6 }); place('tree', 18, -14, { h: 5.8 });
      place('bush', -8.4, -4.6); place('bush', 8.8, -3.8); place('bush', 2.2, -8.6); place('bush', -11, 4);
      place('swingSet', 8.2, -9.4, { rot: 0 }); place('slide', -6.2, -8.2, { rot: 90 });
      place('bench', 9.6, 4.4, { rot: 90 });
    } catch (error) { console.warn('Title scene props skipped:', error); }

    sprite = softSprite(THREE);
    dust = new Pool(THREE, 90, { map: sprite, size: 0.55, fadeTo: [0.52, 0.83, 0.42] });
    sparks = new Pool(THREE, 160, { map: sprite, size: 0.2, additive: true });
    ambient = new Pool(THREE, 56, { map: sprite, size: 0.14, additive: true });
    for (const pool of [dust, sparks, ambient]) scene.add(pool.points);
    for (let i = 0; i < ambient.n; i++) ambient.life[i] = Infinity;

    ringFx = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ringFx.rotation.x = -Math.PI / 2;
    scene.add(ringFx);
    ringFx.userData.t = 1;

    camera = new THREE.PerspectiveCamera(32, 2, 0.1, 120);
  }

  async function buildActors() {
    const jobs = {
      seeker: ['leo', true], mia: ['mia', false], max: ['max', false], zoe: ['zoe', false], kai: ['kai', false],
    };
    await Promise.all(Object.entries(jobs).map(async ([key, [id, seeker]]) => {
      const avatar = await avatarFactory(ROSTER_BY_ID[id].appearance, seeker);
      actors[key] = { avatar, pos: [0, 0], prev: null, blob: addShadow(0.75) };
      scene.add(avatar.group);
    }));
    if (disposed) return;
    actors.kai.pos = [...FROZEN_SPOT];
    actors.kai.avatar.yaw = 0.55;
    blocks = [makeBlock(), makeBlock()];
    blocks[0].userData = { actor: 'kai', amt: 0 };
    blocks[1].userData = { actor: 'zoe', amt: 0 };
  }

  function burst(x, z, count = 46) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = 1.5 + Math.random() * 3.2;
      const tint = Math.random() < 0.5 ? [0.75, 0.93, 1] : [1, 1, 1];
      sparks.emit(x, 0.9 + Math.random() * 0.6, z, Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s, 0.7 + Math.random() * 0.7, tint);
    }
    ringFx.position.set(x, 0.06, z);
    ringFx.userData.t = 0;
  }

  const blockAmt = (name) => blocks.find((b) => b.userData.actor === name);

  function stepSim(dt) {
    time += dt;
    const { seeker, mia, max, zoe, kai } = actors;
    sim.st += dt;
    const zoeState = { frozen: false, thaw: 0 };
    const maxState = {};
    const seekerState = {};
    let zoeRun = false;

    // Runners advance round the loop; Zoe's loop position stops while she is frozen.
    sim.miaTheta += OMEGA * dt;
    sim.maxTheta += OMEGA * 1.03 * dt;

    switch (sim.state) {
      case 'run': case 'chase': {
        zoeRun = true;
        sim.zoeTheta += OMEGA * (sim.state === 'chase' ? 0.94 : 1) * dt;
        const gap = wrap(sim.zoeTheta - sim.seekTheta);
        const target = sim.state === 'chase' ? 0.1 : 0.85 + 0.15 * Math.sin(time * 1.4);
        sim.seekTheta += Math.max(OMEGA * 0.3, OMEGA + 2.6 * (gap - target)) * dt;
        if (sim.state === 'run' && sim.st > 4.5) { sim.state = 'chase'; sim.st = 0; }
        else if (sim.state === 'chase' && (gap < 0.22 || sim.st > 3)) {
          sim.state = 'frozen'; sim.st = 0;
          const p = actors.zoe.pos;
          burst(p[0], p[1]);
          blockAmt('zoe').userData.t = 0;
        }
        seekerState.reach = sim.state === 'chase' || Math.sin(time * 0.9) > 0.5;
        break;
      }
      case 'frozen': case 'thaw': case 'recover': {
        sim.seekTheta += OMEGA * 1.12 * dt;
        seekerState.reach = false;
        if (sim.state === 'frozen') {
          zoeState.frozen = true;
          if (sim.st > 1.6) sim.maxPull = Math.min(1, sim.maxPull + dt / 1.5);
          if (sim.maxPull >= 1) { sim.state = 'thaw'; sim.st = 0; }
        } else if (sim.state === 'thaw') {
          zoeState.frozen = true;
          zoeState.thaw = clamp01(sim.st / 1.1);
          maxState.reach = true;
          if (sim.st > 1.1) {
            sim.state = 'recover'; sim.st = 0;
            const p = actors.zoe.pos;
            burst(p[0], p[1], 36);
          }
        } else {
          sim.maxPull = Math.max(0, sim.maxPull - dt / 1.4);
          if (sim.st > 0.5 && !zoe.avatar.recovering && sim.maxPull <= 0) { sim.state = 'run'; sim.st = 0; }
        }
        break;
      }
    }

    // Zoe: on the loop while running, otherwise pinned where she was tagged.
    if (zoeRun) zoe.pos = ringPoint(sim.zoeTheta, 1);
    mia.pos = ringPoint(sim.miaTheta, 1.04);
    seeker.pos = ringPoint(sim.seekTheta, 0.9);
    const ringMax = ringPoint(sim.maxTheta, 0.96);
    const pull = ease(sim.maxPull);
    max.pos = [ringMax[0] + (zoe.pos[0] + 1.25 - ringMax[0]) * pull, ringMax[1] + (zoe.pos[1] + 0.5 - ringMax[1]) * pull];

    const hold = zoeState.frozen || sim.state === 'recover';
    for (const [key, actor] of Object.entries(actors)) {
      const [x, z] = actor.pos;
      actor.avatar.group.position.set(x, 0, z);
      let vx = 0, vz = 0;
      if (actor.prev && dt > 0) { vx = (x - actor.prev[0]) / dt; vz = (z - actor.prev[1]) / dt; }
      actor.prev = [x, z];
      let state = {};
      if (key === 'kai') { vx = vz = 0; state = { frozen: true }; }
      else if (key === 'zoe') { state = zoeState; if (hold) { vx = vz = 0; } }
      else if (key === 'max') { state = maxState; if (sim.maxPull >= 1) vx = vz = 0; }
      else if (key === 'seeker') state = seekerState;
      actor.avatar.update(dt, { x: vx, z: vz }, state);
      actor.blob.position.x = x; actor.blob.position.z = z;
      const speedy = Math.hypot(vx, vz) > 3 && key !== 'kai';
      if (speedy && Math.random() < dt * 14) {
        dust.emit(x + (Math.random() - 0.5) * 0.4, 0.08, z + (Math.random() - 0.5) * 0.4,
          -vx * 0.08 + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, -vz * 0.08 + (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.5, [0.86, 0.76, 0.52]);
      }
    }

    for (const block of blocks) {
      const a = actors[block.userData.actor];
      const frozen = block.userData.actor === 'kai' || (sim.state === 'frozen' || sim.state === 'thaw');
      const shrink = block.userData.actor === 'zoe' && sim.state === 'thaw' ? 1 - ease(clamp01(sim.st / 1.1)) * 0.35 : 1;
      block.userData.amt += ((frozen ? 1 : 0) - block.userData.amt) * Math.min(1, dt * (frozen ? 7 : 12));
      const amt = block.userData.amt;
      block.visible = amt > 0.02;
      block.position.set(a.pos[0], 0, a.pos[1]);
      const s = backOut(clamp01(amt)) * shrink;
      block.scale.set(s, Math.min(1.05, s), s);
      block.rotation.y = a.avatar.yaw * 0.2;
    }

    // Ambient sparkles orbit the ice and drift through the park.
    for (let i = 0; i < ambient.n; i++) {
      const j = i * 3;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 3 + i * 1.7);
      if (i < 24) {
        const block = i < 12 ? blocks[0] : blocks[1];
        const on = block && block.visible;
        const a = time * (0.6 + (i % 3) * 0.2) + i * 0.9;
        const r = 0.95 + (i % 4) * 0.16;
        ambient.pos[j] = on ? block.position.x + Math.cos(a) * r : 0;
        ambient.pos[j + 1] = on ? 0.2 + ((time * 0.35 + i * 0.37) % 1) * 2.1 : -100;
        ambient.pos[j + 2] = on ? block.position.z + Math.sin(a) * r : 0;
        ambient.col.set(on ? [0.55 * twinkle + 0.3, 0.85 * twinkle + 0.15, twinkle * 0.3 + 0.7] : [0, 0, 0], j);
      } else {
        const phase = i * 12.9898;
        ambient.pos[j] = ((Math.sin(phase) * 43758.5 % 1 + 1) % 1 - 0.5) * 24 + Math.sin(time * 0.3 + i) * 0.6;
        ambient.pos[j + 1] = 0.4 + ((time * 0.12 + (i * 0.173) % 1) % 1) * 5;
        ambient.pos[j + 2] = ((Math.cos(phase) * 24634.6 % 1 + 1) % 1 - 0.5) * 14 - 1 + Math.cos(time * 0.25 + i) * 0.6;
        const k = twinkle * 0.8 + 0.1;
        ambient.col.set([k, k, k * 0.9], j);
      }
    }
    ambient.geometry.attributes.position.needsUpdate = true;
    ambient.geometry.attributes.color.needsUpdate = true;
    dust.update(dt, -0.4, 1.2);
    sparks.update(dt, 5, 0.9);

    const fx = ringFx.userData;
    fx.t = Math.min(1, fx.t + dt * 1.6);
    ringFx.scale.setScalar(0.4 + fx.t * 3.2);
    ringFx.material.opacity = (1 - fx.t) * 0.8 * (fx.t < 1 ? 1 : 0);

    // Low camera with a gentle sway and a slight tilt.
    const sway = reduced ? 0 : time;
    const aspect = camera.aspect;
    const back = Math.max(8.6, 10.8 / (aspect * 0.574));
    // Keep the frozen kid inside narrow frames.
    kai.pos[0] = Math.max(FROZEN_SPOT[0], -(aspect * 0.287 * (back - FROZEN_SPOT[1]) - 1.2));
    camera.position.set(Math.sin(sway * 0.33) * 1.3 - 0.4, 0.95 + Math.sin(sway * 0.5) * 0.1, back + 1 + Math.sin(sway * 0.27) * 0.5);
    camera.lookAt(Math.sin(sway * 0.33) * 0.5 - 0.3, 1.2, -0.6);
    camera.rotateZ(0.05 + Math.sin(sway * 0.4) * 0.012);
  }

  function resize() {
    if (!renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (ready && !running) { stepSim(0); renderer.render(scene, camera); }
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    stepSim(dt);
    renderer.render(scene, camera);
  }

  function renderOnce() {
    renderer.render(scene, camera);
  }

  const api = {
    get running() { return running; },
    get phase() { return sim.state; },
    // Steps the simulation without waiting for real time (used for stills and checks).
    advance(seconds) {
      if (!ready || disposed) return;
      for (let t = 0; t < seconds; t += 1 / 30) stepSim(1 / 30);
      renderOnce();
    },
    start() {
      wantRun = true;
      if (!ready || running || disposed) return;
      resize();
      if (reduced) { renderOnce(); return; }
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      wantRun = false;
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      api.stop();
      disposed = true;
      observer?.disconnect();
      scene?.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton?.dispose();
        o.geometry?.dispose?.();
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
      });
      for (const a of Object.values(actors)) a.avatar.mixer?.stopAllAction();
      sprite?.dispose(); sky?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
      }
    },
    ready: null,
  };

  api.ready = (async () => {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.domElement.className = 'title-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      container.append(renderer.domElement);
      buildWorld();
      await buildActors();
      if (disposed) return false;
      observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      for (let i = 0; i < 40; i++) stepSim(1 / 30);
      ready = true;
      container.classList.add('title-live');
      if (wantRun) api.start();
      else renderOnce();
      return true;
    } catch (error) {
      console.warn('Title scene unavailable, using the fallback backdrop:', error);
      fail();
      return false;
    }
  })();
  return api;
}
