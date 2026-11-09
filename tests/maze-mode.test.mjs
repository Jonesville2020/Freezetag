import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMaze } from '../docs/js/maze-mode.js';
import { World } from '../docs/js/world.js';

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

test('the actual collision grid has a walkable path to the exit', () => {
  for (let seed = 0; seed < 10; seed++) {
    const maze = createMaze(7, randomSeed(seed));
    const world = new World(maze.layout);
    assert.ok(world.isOpen(maze.start.x, maze.start.z));
    assert.ok(world.isOpen(maze.exit.x, maze.exit.z));
    assert.ok(world.path(maze.start.x, maze.start.z, maze.exit.x, maze.exit.z).length > 0);
  }
});
