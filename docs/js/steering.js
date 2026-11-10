// Screen position relative to the character gives a continuous camera-relative
// direction, rather than a destination that can be reached while still held.
export function holdDirection(point, character, forward, right) {
  const x = point.x - character.x;
  const y = character.y - point.y;
  const length = Math.hypot(x, y);
  if (length < 8) return { x: 0, z: 0, mag: 0 };
  return {
    x: (right.x * x + forward.x * y) / length,
    z: (right.z * x + forward.z * y) / length,
    mag: 1,
  };
}
