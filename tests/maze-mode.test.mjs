import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMaze } from '../docs/js/maze-mode.js';
import { World } from '../docs/js/world.js';
import { MazeMonster, MONSTER_DELAY, MONSTER_SPEED } from '../docs/js/maze-monster.js';

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
    assert.equal(maze.layout.walls.length, 4 + (size - 1) ** 2);
  }
});

test('monster waits, follows slowly around walls and only catches active visible players', () => {
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
  const world = { blocked: () => true, resolve: () => {}, path: () => [] };
  const player = { pos: { x: 0.3, z: 0 } };
  assert.deepEqual(monster.update(0.1, world, [player]), []);
  world.blocked = () => false;
  const escaped = { pos: { x: 0, z: 0 }, escaped: true };
  assert.deepEqual(monster.update(0.1, world, [escaped, player]), [player]);
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
