// Arena layouts. See the schema notes in docs/js/world.js and prop builders in docs/js/props.js.
// Rectangles are centred: [x, z, width, depth] in metres; the arena spans -32..32 on both axes.
import { PROP_TYPES } from './props.js';

// Prop helper: fills size/height/hints from PROP_TYPES. `rot` (0/90/180/270) is visual and swaps the default footprint.
function P(type, x, z, o = {}) {
  const def = PROP_TYPES[type];
  const swap = o.rot === 90 || o.rot === 270;
  const { w = swap ? def.d : def.w, d = swap ? def.w : def.d, h = def.h, ...rest } = o;
  const p = { type, x, z, w, d, h, ...rest };
  if (def.soft) p.soft = true;
  if (def.sight === false && p.sight === undefined) p.sight = false;
  const traverse = def.auto ? (h <= 1.0 ? 'vault' : h <= 1.6 ? 'climb' : undefined) : def.traverse;
  if (traverse && p.traverse === undefined) p.traverse = traverse;
  return p;
}
const row = (type, x, z, n, dx, dz, o = {}) => Array.from({ length: n }, (_, i) => P(type, x + dx * i, z + dz * i, o));
const decor = (type, x, z, o = {}) => ({ type, x, z, w: PROP_TYPES[type].w, d: PROP_TYPES[type].d, ...o });
const ZONE_DECOR = { mud: 'mudPatch', puddle: 'puddlePatch', sand: 'sandPatch', leaves: 'leafPile' };

// Slow patches also get a nicer visual decor entry with identical bounds.
function layout({ zones = [], decor: extra = [], props = [], ...rest }) {
  const zs = zones.map(([type, x, z, w, d, slow = 0.5]) => ({ type, x, z, w, d, slow }));
  return {
    ...rest,
    props: props.flat(),
    zones: zs,
    decor: [...zs.map((q) => ({ type: ZONE_DECOR[q.type], x: q.x, z: q.z, w: q.w, d: q.d })), ...extra.flat()],
  };
}

const streetCars = [
  P('car', -17, -4.2, { rot: 90 }), P('car', -22.2, 4.2, { rot: 90 }), P('car', 17, 4.2, { rot: 90 }), P('car', 22.2, -4.2, { rot: 90 }),
  P('car', 4.4, -22), P('car', -4.4, 22), P('van', 3.6, 14), P('van', -3.6, -14.5),
];

// Pocket courtyard: back wall + two side walls, open towards `open` (+1 = south, -1 = north).
const pocket = (x, z, open) => [
  [x, z, 7, 1.5],
  [x - 3.25, z + open * 2.75, 1.5, 5.5],
  [x + 3.25, z + open * 2.75, 1.5, 5.5],
];

const street = layout({
  name: 'Street Circuit',
  floor: 0x679b7d, line: 0xe7f4ce, wall: 0xe6c6a4, trim: 0x947b6d, theme: 'street',
  walls: [
    [-21, -22, 14, 8], [21, -22, 14, 8], [-21, 22, 14, 8], [21, 22, 14, 8],
    [-29, 0, 6, 12], [29, 0, 6, 12], [0, -29, 12, 6], [0, 29, 12, 6],
    ...pocket(-10.5, -15, 1), ...pocket(10.5, -15, 1), ...pocket(-10.5, 15, -1), ...pocket(10.5, 15, -1),
  ],
  props: [
    streetCars,
    P('busShelter', -21, -8.2), P('busShelter', 21, 8.2, { rot: 180 }),
    P('bollard', -6.2, -6.2), P('bollard', 6.2, -6.2), P('bollard', -6.2, 6.2), P('bollard', 6.2, 6.2),
    P('lampPost', -10.5, -7.2), P('lampPost', 10.5, -7.2), P('lampPost', -10.5, 7.2), P('lampPost', 10.5, 7.2),
    // pocket hideouts
    P('bush', -10.5, -12.4), P('bin', -12.3, -13.5), P('bush', 10.5, -12.4), P('mailbox', 12.3, -13.5),
    P('bush', -10.5, 12.4), P('bench', -10.5, 13.7, { w: 2.2 }), P('planter', 10.5, 13.6, { w: 3.6 }), P('bin', 12.3, 10.9),
    // shopfronts & pavements
    P('kiosk', -23.5, -13), P('kiosk', 23.5, 13), P('crate', -27, -12), P('crate', -27, -10.8, { h: 0.8 }),
    P('crate', 27, 12), P('crate', 27, 10.8, { h: 0.8 }), P('vending', -25.6, 9.2), P('vending', 25.6, -9.2, { rot: 180 }),
    P('bench', -14.5, -7.2), P('bench', 14.5, 7.2), P('bench', -14.5, 7.2), P('bench', 14.5, -7.2),
    P('phoneBooth', 8.5, -19.5), P('phoneBooth', -8.5, 19.5), P('hydrant', -5.8, 17), P('hydrant', 5.8, -17),
    row('hedge', -21, -17.4, 1, 0, 0, { w: 8, d: 1 }), row('hedge', 21, 17.4, 1, 0, 0, { w: 8, d: 1 }),
    P('hedge', 21, -17.4, { w: 8, d: 1 }), P('hedge', -21, 17.4, { w: 8, d: 1 }),
    P('tree', -24.5, -16.2), P('tree', 24.5, 16.2), P('planter', -17, -12.5, { w: 1.2, d: 3, rot: 90 }),
    P('dumpster', 18, -12.8), P('dumpster', -18, 12.8, { rot: 180 }),
    P('mailbox', -6.4, 11.4), P('mailbox', 6.4, -11.4),
  ],
  zones: [
    ['puddle', -12, 2.4, 3.8, 2.6], ['puddle', 12, -2.4, 3.8, 2.6], ['leaves', -24.5, -15.5, 5.5, 4], ['leaves', 24.5, 15.5, 5.5, 4],
    ['sand', 17, 16.5, 3.4, 2.6],
  ],
  decor: [
    decor('pavers', 0, 0, { w: 52, d: 10, colour: 0x59636d, cell: 99 }), decor('pavers', 0, 0, { w: 10, d: 52, colour: 0x59636d, cell: 99 }),
    decor('roadLine', -15.5, 0, { w: 19, d: 0.18, dash: 1.2, colour: 0xf2c14e }), decor('roadLine', 15.5, 0, { w: 19, d: 0.18, dash: 1.2, colour: 0xf2c14e }),
    decor('roadLine', 0, -15.5, { w: 0.18, d: 19, dash: 1.2, colour: 0xf2c14e }), decor('roadLine', 0, 15.5, { w: 0.18, d: 19, dash: 1.2, colour: 0xf2c14e }),
    decor('crosswalk', -8.5, 0, { w: 3, d: 9 }), decor('crosswalk', 8.5, 0, { w: 3, d: 9 }),
    decor('crosswalk', 0, -8.5, { w: 9, d: 3 }), decor('crosswalk', 0, 8.5, { w: 9, d: 3 }),
    decor('pavers', -21, -13, { w: 10, d: 8, cell: 1.2 }), decor('pavers', 21, 13, { w: 10, d: 8, cell: 1.2 }),
    decor('flowers', -10.5, -11, { w: 3, d: 1.2 }), decor('flowers', 10.5, 14.5, { w: 3, d: 1 }),
    decor('flowers', -26, -17, { w: 2.5, d: 1 }), decor('flowers', 26, 17, { w: 2.5, d: 1 }),
    decor('cone', 16, 15, {}), decor('cone', 18, 15, {}), decor('cone', 16, 18, {}), decor('cone', 18, 18, {}),
    decor('sign', -7.5, -6.8, { colour: 0x3fa3a5 }), decor('sign', 7.5, 6.8, { colour: 0xe8665c }),
    decor('building', -40, -22, { w: 14, d: 10, h: 11, colour: 0xe6a98f }), decor('building', 40, -14, { w: 12, d: 12, h: 8, colour: 0xa9c4d9 }),
    decor('building', -40, 18, { w: 12, d: 14, h: 9, colour: 0xf0d58c }), decor('building', 40, 22, { w: 14, d: 10, h: 12, colour: 0xc9b2d9 }),
    decor('building', 8, -42, { w: 16, d: 8, h: 8, colour: 0xd9c4a3 }), decor('building', -10, 42, { w: 16, d: 8, h: 10, colour: 0x9fc9b4 }),
  ],
});

const metro = layout({
  name: 'Metro Plaza',
  floor: 0x889da2, line: 0xf0f0d7, wall: 0xd7d6c6, trim: 0x879a9a, theme: 'plaza',
  walls: [
    [-25, -25, 8, 6], [25, -25, 8, 6], [-25, 25, 8, 6], [25, 25, 8, 6],
    [-29, 0, 6, 8], [29, 0, 6, 8], [0, -29, 8, 6], [0, 29, 8, 6],
  ],
  props: [
    // pillar cloister ring around the central square
    [-4.8, -1.6, 1.6, 4.8].flatMap((a) => [P('pillar', -15, a), P('pillar', 15, a), P('pillar', a, -15), P('pillar', a, 15)]),
    P('statue', -15, -15), P('statue', 15, -15, { h: 2.6 }), P('statue', -15, 15, { h: 2.6 }), P('statue', 15, 15),
    P('bench', -8.5, 0, { rot: 90 }), P('bench', 8.5, 0, { rot: 90 }), P('bench', 0, -8.5), P('bench', 0, 8.5),
    P('fountain', 0, -20), P('kiosk', 0, 19.5, { rot: 180 }),
    P('cafeTable', -5.2, 21.5), P('cafeTable', 5.2, 21.5), P('cafeTable', -8.2, 24.5), P('cafeTable', 8.2, 24.5),
    P('planter', -9, 19), P('planter', 9, 19),
    P('stairs', -25, 0, { rot: 90 }), P('stairs', 25, 0, { rot: 270 }), P('stairs', 0, -24.8), P('stairs', 0, 24.8, { rot: 180 }),
    P('stall', -21, -9.5, { rot: 90, w: 2, d: 3 }), P('stall', -21, 9.5, { rot: 90, w: 2, d: 3 }),
    P('stall', 21, -9.5, { rot: 270, w: 2, d: 3 }), P('stall', 21, 9.5, { rot: 270, w: 2, d: 3 }),
    P('tree', -20, -19.5), P('tree', 20, 19.5), P('tree', 20, -19.5), P('tree', -20, 19.5),
    P('planter', -9, -19), P('planter', 9, -19), P('lowWall', -11.5, -21, { w: 2.6, d: 0.5, rot: 90 }), P('lowWall', 11.5, -21, { w: 0.5, d: 2.6 }),
    P('bin', -7, -11), P('bin', 7, 11), P('bin', -7, 11), P('bin', 7, -11),
    P('vending', -29.6 + 6.2, -6.9), P('vending', 23.4, 6.9, { rot: 180 }),
    P('bollard', -11.5, -4), P('bollard', -11.5, 4), P('bollard', 11.5, -4), P('bollard', 11.5, 4),
    P('planter', 0, 14, { w: 2.4, d: 0.8 }),
    P('hedge', -16.8, -23, { w: 1, d: 3, soft: true }), P('hedge', 16.8, 23, { w: 1, d: 3, soft: true }),
  ],
  zones: [
    ['puddle', -6, -13, 4, 2.6], ['puddle', 7, 13, 4, 2.6], ['puddle', 17, -2, 2.6, 4], ['leaves', -19, 16, 4.5, 3.5],
    ['leaves', 19, -16, 4.5, 3.5],
  ],
  decor: [
    decor('pavers', 0, 0, { w: 31, d: 31, colour: 0xc2c7c1, cell: 3.1 }), decor('pavers', 0, -20, { w: 10, d: 10, colour: 0x9aa9ad, cell: 2.5 }),
    decor('pavers', 0, 22, { w: 14, d: 8, colour: 0xb7b2a0, cell: 2 }),
    decor('hazard', -23.6, -7.2, { w: 0.4, d: 7 }), decor('hazard', 23.6, 7.2, { w: 0.4, d: 7 }),
    decor('bunting', -15, -3.2, { w: 3.2, d: 0.2, h: 2.45, rot: 90 }), decor('bunting', 15, 3.2, { w: 3.2, d: 0.2, h: 2.45, rot: 90 }),
    decor('bunting', -3.2, -15, { w: 3.2, d: 0.2, h: 2.45 }), decor('bunting', 3.2, 15, { w: 3.2, d: 0.2, h: 2.45 }),
    decor('flowers', -26, -20, { w: 3, d: 1.2 }), decor('flowers', 26, -20, { w: 3, d: 1.2 }),
    decor('flowers', -26, 20, { w: 3, d: 1.2 }), decor('flowers', 26, 20, { w: 3, d: 1.2 }),
    decor('flowers', -9, -22.8, { w: 2.4, d: 0.8 }), decor('flowers', 9, -22.8, { w: 2.4, d: 0.8 }),
    decor('building', -40, -10, { w: 12, d: 14, h: 12, colour: 0xb7c4cc }), decor('building', 40, 12, { w: 12, d: 14, h: 14, colour: 0xc9c2b4 }),
    decor('building', 38, -26, { w: 12, d: 10, h: 9, colour: 0xa8b8a8 }), decor('building', -38, 28, { w: 12, d: 10, h: 10, colour: 0xc4b4a8 }),
    decor('building', -12, -42, { w: 18, d: 8, h: 11, colour: 0xbfc9d6 }), decor('building', 14, 42, { w: 18, d: 8, h: 13, colour: 0xd6c9b4 }),
  ],
});

const warehouse = layout({
  name: 'Warehouse Run',
  floor: 0x9a8b9b, line: 0xf2e5dd, wall: 0xdbbca0, trim: 0x907d91, theme: 'warehouse',
  walls: [
    [-23, -24, 2, 16], [-10, -22, 2, 14], [10, -24, 2, 16], [23, 22, 2, 16], [10, 22, 2, 14], [-10, 24, 2, 16],
    [28, -8, 8, 6], [-28, 8, 8, 6],
  ],
  props: [
    // west bay racking
    P('shelf', -29, -26, { rot: 90 }), P('shelf', -26, -26, { rot: 90 }), P('shelf', -29, -20, { rot: 90 }), P('shelf', -26, -20, { rot: 90 }),
    P('crateStack', -29, -13), P('crate', -26, -13), P('crate', -26, -11.8, { h: 0.8 }),
    // lanes
    row('shelf', -28.5, 2, 2, 3, 0), P('shelf', -17, -12, { rot: 90 }), P('shelf', -17, -8.5, { rot: 90 }),
    P('pallets', -17, -2.5), P('pallets', -15.4, 14), P('pallets', -17, 14, { h: 0.9 }),
    P('forklift', -15, 24, { rot: 0 }), P('forklift', 15, -24),
    P('barrel', -15, 20, { w: 1.6, d: 1.6 }), P('barrel', 15, -20, { w: 1.6, d: 1.6 }),
    P('barrel', -5.5, -9), P('barrel', 5.5, 9), P('tyres', -5.5, 12), P('tyres', 5.5, -12),
    P('crateStack', -6, -25, { w: 1.6, d: 1.6 }), P('crateStack', 6, 25, { w: 1.6, d: 1.6 }), P('crate', -6, -22.2), P('crate', 6, 22.2),
    P('barrier', 0, -10.5), P('barrier', 0, 10.5), P('barrier', -12, 0, { rot: 90 }), P('barrier', 12, 0, { rot: 90 }),
    // container yard east
    P('container', 25, -17.8), P('container', 25, -13.8), P('container', 24, 4), P('container', 24, 7.2),
    P('container', 17.5, 15.5, { rot: 90 }), P('crate', 17.5, 8), P('crate', 17.5, 9.2, { h: 0.8 }),
    row('shelf', 17.5, -1.5, 1, 0, 0, { rot: 90 }), P('shelf', 17.5, -5, { rot: 90 }),
    P('pallets', 28, 12), P('pallets', 28, 14), P('pallets', 28, 16, { h: 0.9 }),
    P('bin', -8, 5), P('bin', 8, -5), P('hayBale', 17.5, 22), P('hayBale', 17.5, 23.1, { w: 1.4, d: 0.9 }),
    P('tyres', -20, 27), P('tyres', -21.2, 27),
    P('crate', -20, 18), P('crate', -20, 19.2, { h: 0.8 }), P('pallets', -26, 20), P('shelf', -30.3, 14.5), P('shelf', -27.3, 14.5),
  ],
  zones: [
    ['puddle', -2, -17, 3.6, 2.6], ['puddle', 2, 17, 3.6, 2.6], ['mud', 18, 26, 4, 3], ['mud', -18, -26, 4, 3], ['sand', 0, 29, 4.5, 2.2],
  ],
  decor: [
    decor('hazard', 0, -13.5, { w: 6.4, d: 0.5 }), decor('hazard', 0, 13.5, { w: 6.4, d: 0.5 }),
    decor('roadLine', 0, 0, { w: 0.2, d: 40, dash: 1.4, colour: 0xf2c14e }), decor('roadLine', 0, 0, { w: 14, d: 0.2, dash: 1.4, colour: 0xf2c14e }),
    decor('hazard', 15.4, 15.5, { w: 0.4, d: 9 }), decor('hazard', -15.4, -15.5, { w: 0.4, d: 9 }),
    decor('pavers', 0, 0, { w: 14, d: 14, colour: 0xa89aa8, cell: 3.5 }),
    decor('cone', -3, -12, {}), decor('cone', 3, 12, {}), decor('cone', -3.6, -12, {}), decor('cone', 3.6, 12, {}),
    decor('sign', -8.2, -3, { colour: 0xf2a33a }), decor('sign', 8.2, 3, { colour: 0xe8665c }),
    decor('building', -42, 0, { w: 12, d: 30, h: 8, colour: 0xc9a98f }), decor('building', 42, 0, { w: 12, d: 30, h: 8, colour: 0xc9a98f }),
    decor('building', 0, -42, { w: 26, d: 8, h: 9, colour: 0xb8a6b8 }), decor('building', 0, 42, { w: 26, d: 8, h: 9, colour: 0xb8a6b8 }),
  ],
});

const park = layout({
  name: 'Playground Park',
  floor: 0x7cbf6a, line: 0xf7f3c6, wall: 0xd8b98f, trim: 0x8b6a4a, theme: 'park',
  walls: [
    [28, -27, 8, 5], [-28, 28, 7, 4],
  ],
  props: [
    // playground (north-west)
    P('slide', -24, -22, { rot: 90 }), P('swingSet', -14, -26), P('monkeyBars', -25, -12), P('merryGoRound', -17, -17),
    P('seesaw', -12, -12), P('tunnel', -27, -4), P('jungleGym', -9, -21), P('trampoline', -20, -6.5, { w: 2.6, d: 2.6 }),
    P('bench', -9.5, -16, { rot: 90 }), P('bin', -7, -26),
    // picnic area (north-east)
    P('picnicTable', 14, -22), P('picnicTable', 22, -16), P('picnicTable', 12, -12), P('bin', 17.5, -16), P('tree', 8, -26), P('tree', 18, -28),
    P('hayBale', 27, -13), P('hayBale', 27, -11.8, { w: 1.4, d: 0.9 }), P('hayBale', 25.5, -12.4, { w: 0.9, d: 1.4, rot: 90 }),
    // hedge garden (south-west)
    P('hedge', -12, 8, { w: 7, d: 1.2 }), P('hedge', -17, 12.5, { w: 1.2, d: 6 }), P('hedge', -12, 17, { w: 7, d: 1.2 }), P('hedge', -22, 9, { w: 1.2, d: 4 }),
    P('bush', -9, 13), P('statue', -12, 12.5, { w: 1.2, d: 1.2, h: 2.2 }), P('planter', -4.5, 12), P('hedge', -3.5, 22, { w: 1.2, d: 6 }),
    // south & east
    P('tree', -22, 23), P('tree', 5, 26), P('bush', 10, 20), P('bush', 12.5, 22), P('bush', 24, 20), P('tallGrass', 18, 12), P('tallGrass', 24, 4),
    P('tallGrass', -22, 28, { w: 3, d: 2 }), P('tallGrass', 6, -5.5, { w: 2.4, d: 2 }), P('bench', 10, 14, { rot: 0 }), P('bench', 24, 10),
    P('lowWall', 8, 8, { w: 4, d: 0.5 }), P('lowWall', 8, 4.5, { w: 0.5, d: 3 }), P('crate', 28, 25), P('crate', 28, 23.8, { h: 0.8 }),
    P('barrier', 17, 28), P('fence', 12, 29, { w: 4 }), P('fence', 24, 29, { w: 4 }), P('hydrant', 31, 5),
    P('tyres', 27, 20), P('tyres', 27, 21.2, { h: 0.6 }), P('bin', 28, 5),
    P('lampPost', 0, -18), P('lampPost', 0, 18), P('lampPost', -18, 0), P('lampPost', 18, 0),
    P('mailbox', 30, -4), P('bush', -30, 17), P('bush', 30, -22),
  ],
  zones: [
    ['mud', -3, 17, 4, 3], ['mud', 17, 18, 4.5, 3], ['sand', -20, -25, 5, 3.4], ['sand', -17, -2, 4, 3], ['leaves', 12, -18, 5, 4], ['puddle', 4, -14, 3.6, 2.6],
    ['puddle', -4, 6, 3.2, 2.2],
  ],
  decor: [
    decor('sandbox', -20, -3, { w: 5, d: 4 }), decor('flowers', -4.5, 13, { w: 3, d: 1 }),
    decor('flowers', -12, 10.5, { w: 3, d: 1 }), decor('flowers', 24, 22.5, { w: 3, d: 1 }), decor('flowers', 8, 8.8, { w: 3, d: 0.8 }),
    decor('pavers', 0, 0, { w: 8, d: 8, colour: 0xd9d4b0, cell: 2 }), decor('pavers', 0, -9, { w: 2.4, d: 12, colour: 0xd9d4b0, cell: 2 }),
    decor('pavers', 9, 0, { w: 12, d: 2.4, colour: 0xd9d4b0, cell: 2 }), decor('bunting', 13, -27, { w: 10, d: 0.2, h: 3 }),
    decor('tree', -34, -20, { h: 4.4 }), decor('tree', -34, 10, { h: 4 }), decor('tree', 34, 14, { h: 4.4 }), decor('tree', 34, -8, { h: 4 }),
    decor('building', -40, 0, { w: 8, d: 20, h: 7, colour: 0xe6b98f }), decor('building', 40, 2, { w: 8, d: 20, h: 7, colour: 0xc9d6a8 }),
  ],
});

const harbor = layout({
  name: 'Harbor Docks',
  floor: 0xa89073, line: 0xf3e7c9, wall: 0x6f8aa3, trim: 0x3a5068, theme: 'harbor',
  walls: [
    [-26, -27, 12, 6], [26, -27, 12, 6], [-14, -14, 2, 8], [14, -14, 2, 8], [-28, 8, 8, 2], [28, 8, 8, 2],
  ],
  props: [
    // container maze, west
    P('container', -26, -17, { rot: 90 }), P('container', -22, -12), P('container', -26, 15), P('container', -20, 21, { rot: 90 }),
    P('container', 26, -17, { rot: 90 }), P('container', 22, -12), P('container', 22, 1), P('container', 20, 22, { rot: 90 }),
    P('crateStack', -29, -3), P('crate', -29, -1.2), P('crate', -29, 0.0, { h: 0.8 }), P('crateStack', 29, 14), P('crate', 29, 12),
    P('barrel', -22, 3, { w: 1.6, d: 1.6 }), P('barrel', 18, -6, { w: 1.6, d: 1.6 }), P('barrel', -8, 27), P('barrel', 8, 27),
    P('tyres', -17, 9), P('tyres', -17, 10.2, { h: 0.6 }), P('tyres', 17, 12), P('tyres', 15.8, 12, { h: 0.6 }),
    // fish market
    P('stall', -9, -19, { rot: 0 }), P('stall', 9, -19), P('stall', -9, -25.5), P('stall', 9, -25.5),
    P('crate', -4.5, -22), P('crate', 4.5, -22), P('crate', -4.5, -20.8, { h: 0.8 }), P('barrel', 4.5, -27),
    P('boat', -9, 14), P('boat', 12, 5, { w: 1.8, d: 4.4 }), P('boat', 6, 20, { w: 4.4, d: 1.8, rot: 90 }),
    P('bollard', -26, 28), P('bollard', -20, 28), P('bollard', -14, 28), P('bollard', 14, 28), P('bollard', 20, 28), P('bollard', 26, 28),
    P('lampPost', -5, 13), P('lampPost', 5, -13), P('lampPost', -13, -5), P('lampPost', 13, 5),
    P('pallets', -5, 7), P('pallets', 4.5, 8.5), P('pallets', -12, -8), P('forklift', 11, -8), P('dumpster', -6.5, -12),
    P('bench', -8, 22.5, { rot: 0 }), P('bench', 7.5, 17.5, { rot: 90 }), P('hayBale', -31.2, 21), P('hayBale', -31.2, 22.1, { w: 1.4, d: 0.9 }),
    P('fence', -3, 26.8, { w: 3.2 }), P('fence', 3, 26.8, { w: 3.2 }), P('bin', 27.5, 5),
    P('hedge', -29, 29, { w: 3, d: 1 }), P('bush', 29, 28.5),
  ],
  zones: [
    ['puddle', -3, -9, 4, 2.6], ['puddle', 3, 9, 4, 2.6], ['puddle', 16, 18, 4, 2.6], ['sand', -3, 30.8, 8, 2.4], ['mud', -18, -2, 4, 3],
    ['mud', 18, -1, 4, 3],
  ],
  decor: [
    decor('water', 0, 49, { w: 160, d: 30 }), decor('water', 0, -49, { w: 160, d: 30 }),
    decor('pavers', 0, 0, { w: 64, d: 6, colour: 0x9c8467, cell: 1.5 }),
    decor('hazard', 0, 32.2, { w: 64, d: 0.4 }), decor('crane', -16, 36, { w: 6, d: 3, h: 13 }), decor('crane', 16, 36, { w: 6, d: 3, h: 13 }),
    decor('hazard', -14, -9, { w: 0.4, d: 4 }), decor('hazard', 14, -9, { w: 0.4, d: 4 }),
    decor('sign', -2, -29, { colour: 0xd9604c }), decor('sign', 2, -29, { colour: 0x2f86a8 }),
    decor('bunting', 0, -19, { w: 18, d: 0.2, h: 3.1 }),
    decor('building', -40, -6, { w: 10, d: 24, h: 8, colour: 0x8aa3b8 }), decor('building', 40, -6, { w: 10, d: 24, h: 8, colour: 0xb88a7a }),
  ],
});

export const LAYOUTS = [street, metro, warehouse, park, harbor];
