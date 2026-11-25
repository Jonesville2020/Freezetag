import { Navigator } from './nav.js';

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const LEVELS = {
  toddler: { sight: 12, react: 0.7, predict: 0, memory: 2, label: 'Toddler' },
  kid: { sight: 17, react: 0.45, predict: 0.15, memory: 4, label: 'Kid' },
  scout: { sight: 22, react: 0.25, predict: 0.4, memory: 6, label: 'Scout' },
  legend: { sight: 28, react: 0.1, predict: 0.7, memory: 9, label: 'Playground Legend' },
};

// CPU players only react to opponents they can see (range + line of sight) or
// that are very close; they never read hidden positions.
export class Brain {
  constructor(game, e, level) {
    this.g = game; this.e = e; this.lv = LEVELS[level] ?? LEVELS.kid;
    this.nav = new Navigator();
    this.mem = null; this.memT = 0; this.spot = 0; this.wander = null; this.wanderT = 0;
    this.fleeT = 0; this.fleeGoal = null; this.juke = Math.random() < 0.35 + this.lv.predict; this.search = []; this.speedMul = 1; this.stand = false;
  }

  sees(o, range) {
    const e = this.e;
    const d = dist(e.pos, o.pos);
    if (d > range) return false;
    return this.g.world.sees(e.pos, o.pos);
  }

  // Returns a unit-length (or zero) direction in world space.
  think(dt) {
    this.speedMul = 1;
    this.stand = false;
    this.wanderT -= dt;
    const goal = this.e.seeker ? this.#seeker(dt) : this.#runner(dt);
    if (this.stand || !goal) return { x: 0, z: 0 };
    return this.nav.steer(this.g.world, this.e.pos, goal, dt);
  }

  #seeker(dt) {
    const { g, e, lv } = this;
    let best = null, bd = Infinity;
    for (const r of g.entities) {
      if (r.seeker || r.frozen || r.grace > 0) continue;
      const d = dist(e.pos, r.pos);
      if (d < bd && this.sees(r, lv.sight)) { best = r; bd = d; }
    }
    if (best) {
      this.spot += dt;
      this.mem = { x: best.pos.x, z: best.pos.z };
      this.memT = lv.memory;
      this.search = [];
      if (this.spot >= lv.react) {
        const lead = lv.predict * Math.min(bd / 6.6, 0.9);
        return { x: best.pos.x + best.vel.x * lead, z: best.pos.z + best.vel.z * lead, chase: true };
      }
    } else this.spot = 0;
    if (this.mem) {
      this.memT -= dt;
      if (this.memT <= 0) { this.mem = null; this.search = []; }
      else if (dist(e.pos, this.mem) < 1.6) {
        // Lost them: check the nearby cover they could be hiding behind, then give up.
        if (!this.search.length && this.memT > 1) this.search = this.#coverSpots(this.mem, Math.min(3, Math.ceil(lv.memory / 3)));
        const next = this.search.shift();
        if (next) this.mem = next; else this.mem = null;
        if (this.mem) return this.mem;
      } else return this.mem;
    }
    this.speedMul = 0.85;
    if (!this.wander || this.wanderT <= 0 || dist(e.pos, this.wander) < 1.8) {
      const frozen = g.entities.filter((r) => !r.seeker && r.frozen);
      if (frozen.length && Math.random() < 0.45) {
        const f = frozen[Math.floor(Math.random() * frozen.length)];
        let p = { x: f.pos.x + rand(-7, 7), z: f.pos.z + rand(-7, 7) };
        if (!g.world.isOpen(p.x, p.z)) p = g.world.randomOpenPoint();
        this.wander = p;
      } else this.wander = g.world.randomOpenPoint();
      this.wanderT = rand(4, 8);
    }
    return this.wander;
  }

  #runner(dt) {
    const { g, e, lv } = this;
    let threat = null, td = Infinity;
    for (const s of g.entities) {
      if (!s.seeker) continue;
      const d = dist(e.pos, s.pos);
      if (d < td && this.sees(s, lv.sight * 0.8)) { threat = s; td = d; }
    }
    if (threat) {
      this.spot += dt;
      if (this.spot >= lv.react) {
        this.fleeT -= dt;
        if (this.fleeT <= 0 || !this.fleeGoal) { this.fleeGoal = this.#pickFlee(threat); this.fleeT = 0.35; }
        this.holdT = 1.2;
        return this.fleeGoal;
      }
    } else {
      this.spot = 0;
      // Stay tucked behind cover for a moment after the seeker loses sight.
      this.holdT = (this.holdT ?? 0) - dt;
      if (this.holdT > 0 && this.fleeGoal) {
        if (dist(e.pos, this.fleeGoal) < 0.8) this.stand = true;
        return this.fleeGoal;
      }
      this.fleeGoal = null;
    }

    // Rescue the closest frozen teammate if no seeker is lurking nearby.
    let mate = null, md = Infinity;
    for (const f of g.entities) {
      if (f.seeker || !f.frozen || f === e) continue;
      const d = dist(e.pos, f.pos);
      if (d < md) { mate = f; md = d; }
    }
    if (mate && !threat) {
      const danger = g.entities.some((s) => s.seeker && dist(s.pos, mate.pos) < 9 && this.sees(s, 18));
      const closest = g.entities.every((o) => o.seeker || o.frozen || o === e || dist(o.pos, mate.pos) >= md - 0.5);
      if (!danger && (closest || md < 14)) {
        if (md < 1.2) this.stand = true;
        return mate.pos;
      }
    }
    this.speedMul = 0.7;
    if (!this.wander || this.wanderT <= 0 || dist(e.pos, this.wander) < 1.8) {
      this.wander = g.world.randomOpenPoint();
      this.wanderT = rand(3, 7);
    }
    return this.wander;
  }

  // Open points hugging sight-blocking cover near `from`, hidden from `from` itself.
  #coverSpots(from, count) {
    const w = this.g.world, spots = [];
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, R = rand(2.5, 7);
      const c = { x: from.x + Math.cos(a) * R, z: from.z + Math.sin(a) * R };
      if (!w.isOpen(c.x, c.z)) continue;
      if (w.blocked(from.x, from.z, c.x, c.z, 0, 'sight')) spots.push(c);
    }
    spots.sort((p, q) => dist(p, from) - dist(q, from));
    return spots.slice(0, count);
  }

  // Playground juking: a spot on the far side of nearby cover so the obstacle sits between us and the seeker.
  #coverSpot(threat) {
    const { g, e } = this, w = g.world;
    let best = null, bs = -Infinity;
    for (const o of w.sightRects) {
      if (o.soft || dist(e.pos, o) > 12 + Math.max(o.w, o.d) / 2) continue;
      const m = 1.3;
      const xs = [o.minX - m, o.x, o.maxX + m], zs = [o.minZ - m, o.z, o.maxZ + m];
      for (const x of xs) for (const z of zs) {
        if (x === o.x && z === o.z) continue;
        if (!w.isOpen(x, z) || !w.blocked(threat.pos.x, threat.pos.z, x, z, 0, 'sight')) continue;
        const dt = dist({ x, z }, threat.pos), de = dist({ x, z }, e.pos);
        if (de > 11 || dt < 3) continue;
        // Prefer close spots that are not toward the seeker, and stick with the current goal.
        let s = dt * 0.6 - de + (this.fleeGoal && dist(this.fleeGoal, { x, z }) < 1.5 ? 2.5 : 0);
        if (w.blocked(e.pos.x, e.pos.z, x, z, 0.4)) s -= 2;
        if (s > bs) { bs = s; best = { x, z }; }
      }
    }
    return best;
  }

  #pickFlee(threat) {
    const { g, e } = this;
    if (this.juke && dist(e.pos, threat.pos) < 11) {
      const cover = this.#coverSpot(threat);
      if (cover) return cover;
    }
    let best = null, bs = -Infinity;
    const tx = threat.pos.x - e.pos.x, tz = threat.pos.z - e.pos.z, tl = Math.hypot(tx, tz) || 1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, R = rand(7, 12);
      const c = { x: e.pos.x + Math.cos(a) * R, z: e.pos.z + Math.sin(a) * R };
      if (!g.world.isOpen(c.x, c.z)) continue;
      const toward = ((c.x - e.pos.x) * tx + (c.z - e.pos.z) * tz) / (R * tl);
      let s = dist(c, threat.pos) - toward * 10 + rand(0, 2);
      if (g.world.blocked(threat.pos.x, threat.pos.z, c.x, c.z, 0)) s += 5;
      if (Math.abs(c.x) > 29 || Math.abs(c.z) > 29) s -= 3;
      if (s > bs) { bs = s; best = c; }
    }
    return best ?? g.world.randomOpenPoint();
  }
}
