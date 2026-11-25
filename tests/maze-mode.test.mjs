import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMaze } from '../docs/js/maze-mode.js';
import { World } from '../docs/js/world.js';
import { Navigator } from '../docs/js/nav.js';
import { MazeMonster, MONSTER_DELAY, MONSTER_SPEED, WINDUP_TIME, LUNGE_TIME, RECOVER_TIME } from '../docs/js/maze-monster.js';

function randomSeed(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test('generated mazes have connected passages and a distinct reachable exit', () => {
  for (const size of [5, 7]) for (let seed = 0; seed < 30; seed++) {
    const maze = createMaze(size, randomSeed(seed));
    const reached = new Set([0]);
    const queue = [0];
    for (const cell of queue) {
      for (const next of maze.passages[cell]) {
        assert.ok(maze.passages[next].has(cell));
        if (!reached.has(next)) { reached.add(next); queue.push(next); }
      }
    }
    assert.equal(reached.size, size * size);
    assert.notDeepEqual(maze.start, maze.exit);
  }
});

test('monster waits, follows around walls and only catches active visible players', () => {
  const maze = createMaze(5, randomSeed(42));
  const world = new World(maze.layout);
  const monster = new MazeMonster(maze.start);
  const player = { pos: { ...maze.exit } };
  assert.deepEqual(monster.update(MONSTER_DELAY - 1, world, [player]), []);
  assert.deepEqual(monster.pos, maze.start);
  monster.update(1, world, [player]);
  assert.ok(Math.hypot(monster.pos.x - maze.start.x, monster.pos.z - maze.start.z) <= MONSTER_SPEED + 1e-6);
  let caught = false;
  for (let i = 0; i < 2500 && !caught; i++) {
    caught = monster.update(0.1, world, [player]).includes(player);
    for (const wall of world.rects) {
      const x = Math.max(wall.minX, Math.min(monster.pos.x, wall.maxX));
      const z = Math.max(wall.minZ, Math.min(monster.pos.z, wall.maxZ));
      assert.ok(Math.hypot(monster.pos.x - x, monster.pos.z - z) >= 0.399);
    }
  }
  assert.ok(caught, 'monster follows the maze passages to the player');
  player.caught = true;
  assert.deepEqual(monster.update(0.1, world, [player]), []);
});

test('a wall prevents catches and finished players are ignored', () => {
  const monster = new MazeMonster({ x: 0, z: 0 });
  monster.delay = 0;
  monster.state = 'lunge'; monster.lungeLeft = 1;
  const world = { blocked: () => true, resolve: () => {}, path: () => [] };
  const player = { pos: { x: 0.3, z: 0 } };
  assert.deepEqual(monster.update(0.01, world, [player]), []);
  world.blocked = () => false;
  const escaped = { pos: { x: 0, z: 0 }, escaped: true };
  assert.deepEqual(monster.update(0.01, world, [escaped, player]), [player]);
});

test('the actual collision grid has a walkable path to the exit', () => {
  for (let seed = 0; seed < 10; seed++) {
    const maze = createMaze(7, randomSeed(seed));
    const world = new World(maze.layout);
    assert.ok(world.isOpen(maze.start.x, maze.start.z));
    assert.ok(world.isOpen(maze.exit.x, maze.exit.z));
    assert.ok(world.path(maze.start.x, maze.start.z, maze.exit.x, maze.exit.z).length > 0);
  }
});

const corridor = () => new World({
  ...createMaze(5, randomSeed(1)).layout,
  walls: [[0, -4.5, 60, 1], [0, 4.5, 60, 1], [-30, 0, 1, 10], [8, 0, 1, 10]],
  props: [],
});

function runMazeChase(seed, speed, lead) {
  const maze = createMaze(7, randomSeed(seed));
  const world = new World(maze.layout);
  const path = world.path(maze.start.x, maze.start.z, maze.exit.x, maze.exit.z);
  const player = { pos: { ...path.find((p) => Math.hypot(p.x - maze.start.x, p.z - maze.start.z) >= lead) } };
  const nav = new Navigator();
  const monster = new MazeMonster(maze.start);
  monster.delay = 0; monster.state = 'chase';
  for (let t = 0; t < 300; t += 1 / 60) {
    if (Math.hypot(player.pos.x - maze.exit.x, player.pos.z - maze.exit.z) < 1.2) return 'escaped';
    const dir = nav.steer(world, player.pos, maze.exit, 1 / 60);
    player.pos.x += dir.x * speed / 60; player.pos.z += dir.z * speed / 60;
    world.resolve(player.pos, 0.45);
    if (monster.update(1 / 60, world, [player]).length) return 'caught';
  }
  return 'timeout';
}

test('a sprinting player outruns the monster through the maze but a walking one is caught', () => {
  assert.ok(MONSTER_SPEED < 6 && MONSTER_SPEED > 4.4);
  for (let seed = 0; seed < 6; seed++) {
    assert.equal(runMazeChase(seed, 6, 5), 'escaped');
    assert.equal(runMazeChase(seed, 3, 5), 'caught');
  }
});

test('monster telegraphs, lunges a limited distance, then recovers slowly', () => {
  const world = corridor();
  const monster = new MazeMonster({ x: 0, z: 0 });
  monster.delay = 0; monster.state = 'chase';
  const player = { pos: { x: 2.2, z: 0 } };
  const events = [];
  monster.onEvent = (kind) => events.push(kind);
  monster.update(1 / 60, world, [player]);
  assert.equal(monster.state, 'windup');
  assert.deepEqual(events, ['windup']);
  for (let t = 0; t < WINDUP_TIME + 0.02; t += 1 / 60) monster.update(1 / 60, world, [{ pos: { x: 20, z: 3 } }]);
  assert.equal(monster.state, 'lunge');
  const from = monster.pos.x;
  for (let t = 0; t < LUNGE_TIME + 0.05; t += 1 / 60) monster.update(1 / 60, world, [{ pos: { x: 20, z: 3 } }]);
  assert.ok(monster.pos.x - from <= 1.65 && monster.pos.x - from > 1.4);
  assert.equal(monster.state, 'recover');
  const rec = monster.pos.x;
  for (let t = 0; t < RECOVER_TIME - 0.1; t += 1 / 60) monster.update(1 / 60, world, [{ pos: { x: 20, z: 3 } }]);
  assert.ok(monster.pos.x - rec < 1.2, 'recovery is slow');
});

test('a cornered player can slip past the lunge in an 8-wide corridor', () => {
  for (const side of [1, -1]) {
    const world = corridor();
    const monster = new MazeMonster({ x: 0, z: 0 });
    monster.delay = 0; monster.state = 'chase'; monster.heading = Math.PI / 2;
    const player = { pos: { x: 3, z: 0 } };
    let windupAt = null;
    for (let t = 0; t < 8; t += 1 / 60) {
      if (monster.state === 'windup' && windupAt === null) windupAt = t;
      if (windupAt !== null) {
        if (t > windupAt + 2.4) break;
        if (t >= windupAt + 0.4) {
          const goal = t < windupAt + 0.85 ? { x: 0.5, z: side * 3.4 } : { x: -12, z: side * 3.4 };
          const dx = goal.x - player.pos.x, dz = goal.z - player.pos.z, l = Math.hypot(dx, dz);
          player.pos.x += dx / l * 0.1; player.pos.z += dz / l * 0.1;
          world.resolve(player.pos, 0.45);
        }
      }
      assert.deepEqual(monster.update(1 / 60, world, [player]), []);
    }
    assert.ok(player.pos.x < -6, 'player ended up past the monster');
  }
});

test('monster warning ramps before it spawns and it emits events', () => {
  const world = corridor();
  const monster = new MazeMonster({ x: 0, z: 0 });
  const events = [];
  monster.onEvent = (kind) => events.push(kind);
  monster.update(MONSTER_DELAY - 4, world, []);
  assert.equal(monster.warning, 0);
  monster.update(2, world, []);
  assert.ok(monster.warning > 0.3 && monster.warning < 0.8);
  assert.equal(monster.model.visible, false);
  monster.update(2.1, world, []);
  assert.equal(monster.state, 'spawn');
  assert.equal(monster.model.visible, true);
  assert.deepEqual(events, ['rumble', 'spawn']);
});

test('lost line of sight makes the monster head for the last seen spot first', () => {
  const world = { blocked: () => true, resolve: () => {}, path: () => [] };
  const monster = new MazeMonster({ x: 0, z: 0 });
  monster.delay = 0; monster.state = 'chase';
  monster.lastSeen = { x: 5, z: 0 };
  const goals = [];
  monster.nav.steer = (w, pos, goal) => { goals.push({ ...goal }); return { x: 1, z: 0 }; };
  monster.update(0.1, world, [{ pos: { x: -9, z: 9 } }]);
  assert.deepEqual(goals[0], { x: 5, z: 0 });
  monster.lost = 2;
  monster.update(0.1, world, [{ pos: { x: -9, z: 9 } }]);
  assert.deepEqual(goals[1], { x: -9, z: 9 });
});

function edgeCount(maze) {
  let sum = 0;
  for (const set of maze.passages) sum += set.size;
  return sum / 2;
}

function bfs(maze, from = 0) {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  for (const cell of queue) for (const next of maze.passages[cell]) if (!dist.has(next)) { dist.set(next, dist.get(cell) + 1); queue.push(next); }
  return dist;
}

test('mazes have loops and rooms instead of being a perfect tree, and stay deterministic', () => {
  for (const size of [5, 7]) for (let seed = 0; seed < 30; seed++) {
    const maze = createMaze(size, randomSeed(seed));
    assert.ok(edgeCount(maze) >= size * size + 1, `size ${size} seed ${seed} has at least two loops`);
    assert.equal(maze.layout.maze.rooms.length, size === 5 ? 1 : 2);
    for (const room of maze.layout.maze.rooms) {
      for (const [a, b] of [[0, 1], [2, 3], [0, 2], [1, 3]]) assert.ok(maze.passages[room.cells[a]].has(room.cells[b]));
    }
    assert.equal(maze.layout.walls.length, 4 + 2 * size * (size - 1) - (edgeCount(maze)));
    assert.deepEqual(createMaze(size, randomSeed(seed)).layout.walls, maze.layout.walls);
  }
});

test('the exit stays a long walk from the start even with loops', () => {
  for (const size of [5, 7]) for (let seed = 0; seed < 30; seed++) {
    const maze = createMaze(size, randomSeed(seed));
    const dist = bfs(maze);
    const exitCell = Math.round((maze.exit.z + size * 4) / 8 - 0.5) * size + Math.round((maze.exit.x + size * 4) / 8 - 0.5);
    assert.ok(dist.get(exitCell) >= 2 * (size - 1), `size ${size} seed ${seed} exit ${dist.get(exitCell)} steps away`);
    assert.equal(dist.get(exitCell), Math.max(...dist.values()));
  }
});

test('dressing props leave every cell reachable and keep clear of the start and exit', () => {
  for (const size of [5, 7]) for (let seed = 0; seed < 12; seed++) {
    const maze = createMaze(size, randomSeed(seed));
    const world = new World(maze.layout);
    for (let cell = 0; cell < size * size; cell++) {
      const x = maze.layout.maze.origin + (cell % size + 0.5) * 8, z = maze.layout.maze.origin + (Math.floor(cell / size) + 0.5) * 8;
      assert.ok(world.isOpen(x, z) && (cell === 0 || world.path(maze.start.x, maze.start.z, x, z).length > 0), `cell ${cell} reachable`);
    }
    for (const prop of maze.layout.props) {
      assert.ok(Math.hypot(prop.x - maze.start.x, prop.z - maze.start.z) > 3);
      assert.ok(Math.hypot(prop.x - maze.exit.x, prop.z - maze.exit.z) > 3);
    }
    assert.ok(world.path(maze.start.x, maze.start.z, maze.exit.x, maze.exit.z).length > 0);
    assert.ok(maze.layout.maze.posts.length > 0 && world.group.children.length > 0);
  }
});
