// Generate a connected maze of eight-unit cells inside the existing 64-unit arena.
export function createMaze(size = 7, random = Math.random) {
  const cellSize = 8;
  const origin = -size * cellSize / 2;
  const total = size * size;
  const passages = Array.from({ length: total }, () => new Set());
  const visited = new Uint8Array(total);
  const stack = [0];
  visited[0] = 1;

  const neighbours = (cell) => {
    const x = cell % size, z = Math.floor(cell / size);
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

  const walls = [];
  const width = size * cellSize;
  walls.push([0, origin, width + 1, 1], [0, -origin, width + 1, 1]);
  walls.push([origin, 0, 1, width], [-origin, 0, 1, width]);
  for (let cell = 0; cell < total; cell++) {
    const x = cell % size, z = Math.floor(cell / size);
    if (x + 1 < size && !passages[cell].has(cell + 1)) {
      walls.push([origin + (x + 1) * cellSize, origin + (z + 0.5) * cellSize, 1, cellSize]);
    }
    if (z + 1 < size && !passages[cell].has(cell + size)) {
      walls.push([origin + (x + 0.5) * cellSize, origin + (z + 1) * cellSize, cellSize, 1]);
    }
  }

  const distances = new Int32Array(total).fill(-1);
  const queue = [0];
  distances[0] = 0;
  for (let i = 0; i < queue.length; i++) {
    for (const next of passages[queue[i]]) {
      if (distances[next] !== -1) continue;
      distances[next] = distances[queue[i]] + 1;
      queue.push(next);
    }
  }
  const exitCell = queue.reduce((best, cell) => distances[cell] > distances[best] ? cell : best, 0);
  const centre = (cell) => ({
    x: origin + (cell % size + 0.5) * cellSize,
    z: origin + (Math.floor(cell / size) + 0.5) * cellSize,
  });
  return {
    layout: { name: 'Maze Dash', floor: 0x3d6f6d, line: 0xc6eec7, wall: 0xc1bb9a, trim: 0x2f5959, walls },
    start: centre(0),
    exit: centre(exitCell),
    passages,
  };
}
