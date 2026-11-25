import { PROP_TYPES } from './props.js';

const CELL = 8;
const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function distancesFrom(passages, from = 0) {
  const dist = new Int32Array(passages.length).fill(-1);
  const queue = [from];
  dist[from] = 0;
  for (let i = 0; i < queue.length; i++) {
    for (const next of passages[queue[i]]) {
      if (dist[next] !== -1) continue;
      dist[next] = dist[queue[i]] + 1;
      queue.push(next);
    }
  }
  return { dist, queue };
}

const prop = (type, x, z, o = {}) => {
  const def = PROP_TYPES[type];
  const swap = o.rot === 90 || o.rot === 270;
  const { w = swap ? def.d : def.w, d = swap ? def.w : def.d, h = def.h, ...rest } = o;
  const p = { type, x, z, w, d, h, ...rest };
  if (def.soft) p.soft = true;
  if (def.sight === false && p.sight === undefined) p.sight = false;
  if (def.traverse && p.traverse === undefined) p.traverse = def.traverse;
  return p;
};

// Generate a connected garden maze of eight-unit cells inside the 64-unit arena. A recursive backtracker
// makes the base maze, then a few 2x2 rooms and extra openings add loops so a chaser can be dodged
// around a block instead of cornering you in a dead end. The exit stays a long walk from the start.
export function createMaze(size = 7, random = Math.random) {
  const origin = -size * CELL / 2;
  const total = size * size;
  const passages = Array.from({ length: total }, () => new Set());
  const visited = new Uint8Array(total);
  const stack = [0];
  visited[0] = 1;
  const cx = (cell) => cell % size, cz = (cell) => Math.floor(cell / size);

  const neighbours = (cell) => {
    const x = cx(cell), z = cz(cell);
    return [
      ...(x > 0 ? [cell - 1] : []),
      ...(x + 1 < size ? [cell + 1] : []),
      ...(z > 0 ? [cell - size] : []),
      ...(z + 1 < size ? [cell + size] : []),
    ];
  };
  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = neighbours(current).filter((cell) => !visited[cell]);
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const next = choices[Math.floor(random() * choices.length)];
    passages[current].add(next);
    passages[next].add(current);
    visited[next] = 1;
    stack.push(next);
  }

  const baseWalls = 2 * size * (size - 1) - (total - 1);
  const base = distancesFrom(passages);
  const baseExit = base.queue.reduce((best, cell) => base.dist[cell] > base.dist[best] ? cell : best, 0);
  const minRoute = Math.max(2 * (size - 1), Math.ceil(base.dist[baseExit] * 0.7));
  const link = (a, b) => { passages[a].add(b); passages[b].add(a); };
  const unlink = (a, b) => { passages[a].delete(b); passages[b].delete(a); };
  const routeOk = () => distancesFrom(passages).dist[baseExit] >= minRoute;
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  // Rooms: remove every wall inside a 2x2 block that avoids the start and the farthest cell.
  const roomCells = new Set();
  const rooms = [];
  for (let tries = 0; tries < 24 && rooms.length < (size === 5 ? 1 : 2); tries++) {
    const x = Math.floor(random() * (size - 1)), z = Math.floor(random() * (size - 1));
    const cells = [z * size + x, z * size + x + 1, (z + 1) * size + x, (z + 1) * size + x + 1];
    if (cells.some((c) => c === 0 || c === baseExit || roomCells.has(c))) continue;
    const added = [];
    for (const [a, b] of [[cells[0], cells[1]], [cells[2], cells[3]], [cells[0], cells[2]], [cells[1], cells[3]]]) {
      if (!passages[a].has(b)) { link(a, b); added.push([a, b]); }
    }
    if (!routeOk()) { for (const [a, b] of added) unlink(a, b); continue; }
    cells.forEach((c) => roomCells.add(c));
    rooms.push({ x, z, cells, x0: origin + (x + 1) * CELL, z0: origin + (z + 1) * CELL });
  }

  // Loops: open a way out of most dead ends, then knock out roughly 12% of the remaining walls.
  const openWall = (cell) => shuffle(neighbours(cell).filter((n) => !passages[cell].has(n) && n !== 0 && cell !== 0))
    .find((n) => { link(cell, n); if (routeOk()) return true; unlink(cell, n); return false; });
  for (let cell = 1; cell < total; cell++) {
    if (passages[cell].size === 1 && cell !== baseExit && random() < 0.3) openWall(cell);
  }
  let knock = Math.round(baseWalls * 0.12);
  const walled = [];
  for (let cell = 0; cell < total; cell++) for (const n of neighbours(cell)) if (n > cell && !passages[cell].has(n)) walled.push([cell, n]);
  for (const [a, b] of shuffle(walled)) {
    if (knock <= 0) break;
    link(a, b);
    if (routeOk()) knock--; else unlink(a, b);
  }

  const walls = [];
  const segments = [];
  const width = size * CELL;
  walls.push([0, origin, width + 1, 1], [0, -origin, width + 1, 1]);
  walls.push([origin, 0, 1, width], [-origin, 0, 1, width]);
  const segment = (x, z, w, d, a, b, border = false) => segments.push({ x, z, w, d, a, b, border });
  for (let i = 0; i < size; i++) {
    const mid = origin + (i + 0.5) * CELL;
    segment(mid, origin, CELL, 1, [i, 0], [i + 1, 0], true);
    segment(mid, -origin, CELL, 1, [i, size], [i + 1, size], true);
    segment(origin, mid, 1, CELL, [0, i], [0, i + 1], true);
    segment(-origin, mid, 1, CELL, [size, i], [size, i + 1], true);
  }
  for (let cell = 0; cell < total; cell++) {
    const x = cx(cell), z = cz(cell);
    if (x + 1 < size && !passages[cell].has(cell + 1)) {
      const w = [origin + (x + 1) * CELL, origin + (z + 0.5) * CELL, 1, CELL];
      walls.push(w);
      segment(...w, [x + 1, z], [x + 1, z + 1]);
    }
    if (z + 1 < size && !passages[cell].has(cell + size)) {
      const w = [origin + (x + 0.5) * CELL, origin + (z + 1) * CELL, CELL, 1];
      walls.push(w);
      segment(...w, [x, z + 1], [x + 1, z + 1]);
    }
  }

  // Posts stand at every wall junction; `mask` records which of N/E/S/W the walls leave from.
  const posts = new Map();
  for (const s of segments) {
    const [ai, aj] = s.a, [bi, bj] = s.b, horizontal = aj === bj;
    for (const [i, j, bit] of [[ai, aj, horizontal ? 2 : 4], [bi, bj, horizontal ? 8 : 1]]) {
      const key = j * (size + 1) + i;
      if (!posts.has(key)) posts.set(key, { i, j, x: origin + i * CELL, z: origin + j * CELL, mask: 0 });
      posts.get(key).mask |= bit;
    }
  }

  const { dist, queue } = distancesFrom(passages);
  const exitCell = queue.reduce((best, cell) => dist[cell] > dist[best] ? cell : best, 0);
  const centre = (cell) => ({ x: origin + (cx(cell) + 0.5) * CELL, z: origin + (cz(cell) + 0.5) * CELL });
  const deadEnds = [];
  for (let cell = 0; cell < total; cell++) if (passages[cell].size === 1 && cell !== 0 && cell !== exitCell) deadEnds.push(cell);

  // Dressing that needs collision (benches, statues, fountains) is registered as ordinary props; flowers are decor.
  const seed = Math.floor(random() * 0x7fffffff);
  const dress = mulberry(seed);
  const props = [], decor = [];
  rooms.forEach((room, i) => {
    props.push(prop(i % 2 ? 'statue' : 'fountain', room.x0, room.z0, i % 2 ? { w: 1.8, d: 1.8 } : {}));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (dress() < 0.7) decor.push({ type: 'flowers', x: room.x0 + sx * 6.6, z: room.z0 + sz * 6.6, w: 2, d: 1.2 });
    }
  });
  for (const cell of deadEnds) {
    const c = centre(cell), n = [...passages[cell]][0];
    const open = { x: Math.sign(centre(n).x - c.x), z: Math.sign(centre(n).z - c.z) };
    const back = { x: -open.x, z: -open.z };
    const kind = dress();
    const rot = back.z < 0 ? 0 : back.z > 0 ? 180 : back.x < 0 ? 90 : 270;
    const spot = (depth, side = 0) => ({ x: c.x + back.x * depth + back.z * side, z: c.z + back.z * depth - back.x * side });
    if (kind < 0.4) {
      const p = spot(3.1);
      props.push(prop('bench', p.x, p.z, { rot }));
    } else if (kind < 0.6) {
      const p = spot(2.7);
      props.push(prop('statue', p.x, p.z, { w: 1.4, d: 1.4 }));
    }
    for (const side of [-2.4, 2.4]) {
      if (dress() < 0.6) {
        const p = spot(3.0, side);
        decor.push({ type: 'flowers', x: p.x, z: p.z, w: back.z ? 2 : 1, d: back.z ? 1 : 2 });
      }
    }
  }

  return {
    layout: {
      name: 'Maze Dash', floor: 0x4f8a4a, line: 0xf5ebca, wall: 0x2f6b3a, trim: 0x9a9582, theme: 'park', walls, props, decor,
      maze: {
        size, cellSize: CELL, origin, seed, segments, posts: [...posts.values()], deadEnds, rooms,
        start: centre(0), exit: centre(exitCell),
      },
    },
    start: centre(0),
    exit: centre(exitCell),
    passages,
  };
}
