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
    this.path = []; this.goal = null; this.repath = Math.random() * 0.4;
    this.mem = null; this.memT = 0; this.spot = 0; this.wander = null; this.wanderT = 0;
    this.fleeT = 0; this.fleeGoal = null; this.speedMul = 1; this.stand = false;
  }

  sees(o, range) {
    const e = this.e;
    const d = dist(e.pos, o.pos);
    if (d > range) return false;
    return d < 3.5 || !this.g.world.blocked(e.pos.x, e.pos.z, o.pos.x, o.pos.z, 0);
  }

  // Returns a unit-length (or zero) direction in world space.
  think(dt) {
    this.speedMul = 1;
    this.stand = false;
    this.repath -= dt; this.wanderT -= dt;
    const goal = this.e.seeker ? this.#seeker(dt) : this.#runner(dt);
    return this.#steer(goal);
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
      if (this.spot >= lv.react) {
        const lead = lv.predict * Math.min(bd / 6.6, 0.9);
        return { x: best.pos.x + best.vel.x * lead, z: best.pos.z + best.vel.z * lead, chase: true };
      }
    } else this.spot = 0;
    if (this.mem) {
      this.memT -= dt;
      if (this.memT <= 0 || dist(e.pos, this.mem) < 1.6) this.mem = null;
      else return this.mem;
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
        return this.fleeGoal;
      }
    } else { this.spot = 0; this.fleeGoal = null; }

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

  #pickFlee(threat) {
    const { g, e } = this;
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

  #steer(goal) {
    const { g, e } = this;
    if (this.stand || !goal) return { x: 0, z: 0 };
    const d = dist(e.pos, goal);
    if (d < 0.35) return { x: 0, z: 0 };
    let target = goal;
    if (d > 1.5 || g.world.blocked(e.pos.x, e.pos.z, goal.x, goal.z, 0.45)) {
      const direct = d < 9 && !g.world.blocked(e.pos.x, e.pos.z, goal.x, goal.z, 0.5);
      if (!direct) {
        const moved = !this.goal || dist(this.goal, goal) > 2.5;
        if (moved || this.repath <= 0 || !this.path.length) {
          this.path = g.world.path(e.pos.x, e.pos.z, goal.x, goal.z);
          this.goal = { x: goal.x, z: goal.z };
          this.repath = rand(0.5, 0.9);
        }
        while (this.path.length > 1 && dist(e.pos, this.path[0]) < 0.9) this.path.shift();
        if (this.path.length) {
          target = this.path[0];
          for (let i = 1; i < Math.min(this.path.length, 6); i++) {
            if (g.world.blocked(e.pos.x, e.pos.z, this.path[i].x, this.path[i].z, 0.45)) break;
            target = this.path[i];
          }
        }
      }
    }
    const dx = target.x - e.pos.x, dz = target.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }
}
