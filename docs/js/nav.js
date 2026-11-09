const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Walks toward a goal using direct steering when clear and A* waypoints otherwise.
// Shared by CPU players and tap/click-to-move.
export class Navigator {
  constructor() { this.path = []; this.goal = null; this.repath = 0; }

  reset() { this.path = []; this.goal = null; this.repath = 0; }

  // Returns a unit direction (or zero when within arrival distance).
  steer(world, pos, goal, dt) {
    this.repath -= dt;
    const d = dist(pos, goal);
    if (d < 0.35) return { x: 0, z: 0 };
    let target = goal;
    if (d > 1.5 || world.blocked(pos.x, pos.z, goal.x, goal.z, 0.45)) {
      const direct = d < 9 && !world.blocked(pos.x, pos.z, goal.x, goal.z, 0.5);
      if (!direct) {
        const moved = !this.goal || dist(this.goal, goal) > 2.5;
        if (moved || this.repath <= 0 || !this.path.length) {
          this.path = world.path(pos.x, pos.z, goal.x, goal.z);
          this.goal = { x: goal.x, z: goal.z };
          this.repath = 0.5 + Math.random() * 0.4;
        }
        while (this.path.length > 1 && dist(pos, this.path[0]) < 0.9) this.path.shift();
        if (this.path.length) {
          target = this.path[0];
          for (let i = 1; i < Math.min(this.path.length, 6); i++) {
            if (world.blocked(pos.x, pos.z, this.path[i].x, this.path[i].z, 0.45)) break;
            target = this.path[i];
          }
        }
      }
    }
    const dx = target.x - pos.x, dz = target.z - pos.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }
}
