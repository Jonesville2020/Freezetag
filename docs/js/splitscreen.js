// Pure helpers for local 2-player split screen (no DOM / three.js), so they can be unit-tested.

export const KEYMAPS = {
  // Solo keeps the original combined bindings: WASD and arrows both move.
  solo: {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    yawL: ['KeyQ'], yawR: ['KeyE'], pitchUp: ['KeyR'], pitchDown: ['KeyF'], zoomOut: ['Minus'], zoomIn: ['Equal'],
  },
  p1: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    yawL: ['KeyQ'], yawR: ['KeyE'], pitchUp: ['KeyR'], pitchDown: ['KeyF'], zoomOut: ['Minus'], zoomIn: ['Equal'],
  },
  p2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    yawL: ['Comma'], yawR: ['Period'], pitchUp: ['Semicolon'], pitchDown: ['Quote'], zoomOut: ['BracketLeft'], zoomIn: ['BracketRight'],
  },
};

export const MAX_PLAYERS = 4;
const NO_KEYS = Object.fromEntries(Object.keys(KEYMAPS.solo).map((k) => [k, []]));

// P1 WASD, P2 arrows; P3/P4 (and touch / gamepads for everyone) have no keyboard keys.
export function keymapFor(index, count) {
  if (count <= 1) return KEYMAPS.solo;
  return [KEYMAPS.p1, KEYMAPS.p2][index] ?? NO_KEYS;
}

// Screen cells for a player count, in slot order. 2: left|right. 3: two on top, one across the bottom. 4: 2x2.
export function slotRects(width, height, count) {
  const hw = Math.floor(width / 2), hh = Math.floor(height / 2);
  const L = { x: 0, w: hw }, R = { x: hw, w: width - hw };
  const T = { y: 0, h: hh }, B = { y: hh, h: height - hh };
  if (count <= 1) return [{ x: 0, y: 0, w: width, h: height }];
  if (count === 2) return [{ ...L, y: 0, h: height }, { ...R, y: 0, h: height }];
  const cells = [{ ...L, ...T }, { ...R, ...T }];
  cells.push(count === 3 ? { x: 0, w: width, ...B } : { ...L, ...B });
  if (count === 4) cells.push({ ...R, ...B });
  return cells;
}

export function slotLabels(count) {
  if (count === 2) return ['Left', 'Right'];
  if (count === 3) return ['Top left', 'Top right', 'Bottom'];
  if (count === 4) return ['Top left', 'Top right', 'Bottom left', 'Bottom right'];
  return ['Full screen'];
}

// Make `slots` (player index -> slot index) a valid permutation of 0..count-1.
export function normalizeSlots(slots, count) {
  const out = [], used = new Set();
  for (let i = 0; i < count; i++) {
    const s = slots?.[i];
    if (Number.isInteger(s) && s >= 0 && s < count && !used.has(s)) { out.push(s); used.add(s); } else out.push(-1);
  }
  for (let i = 0; i < count; i++) if (out[i] < 0) { let s = 0; while (used.has(s)) s++; out[i] = s; used.add(s); }
  return out;
}

// Give `player` the slot `slot`, handing their old slot to whoever held it.
export function assignSlot(slots, count, player, slot) {
  const cur = normalizeSlots(slots, count);
  const other = cur.indexOf(slot);
  if (other >= 0 && other !== player) cur[other] = cur[player];
  cur[player] = slot;
  return cur;
}

// Rect for each player index.
export function playerRects(width, height, count, slots) {
  const cells = slotRects(width, height, count);
  return normalizeSlots(slots, count).map((s) => cells[s]);
}

export const inRect = (r, x, y) => !r || (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

// Gamepads are handed out in connection order. With 3-4 players the keyboard-less P3/P4 get the first pads.
export function padFor(pads, index, count = 2) {
  const live = [...(pads ?? [])].filter((g) => g?.connected).sort((a, b) => a.index - b.index);
  const order = (count <= 2 ? [0, 1] : [2, 3, 0, 1]).filter((player) => player < count);
  const rank = order.indexOf(index);
  return (count <= 1 ? live[0] : live[rank]) ?? null;
}
