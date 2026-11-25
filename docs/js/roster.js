import { DEFAULT_APPEARANCE, AVATAR_HAIR_STYLES, AVATAR_TOP_STYLES, AVATAR_BOTTOM_STYLES, ACCESSORY_STYLES, normalizeAppearance } from './character.js?v=avatar5';

// Ten named preset characters on the supplied model. Red is reserved for seekers, so no
// preset wears a red-ish top or accent (see isRedish).
const look = (skin, hair, shirt, pants, shoe, accent, style, top, bottom, accessory) =>
  normalizeAppearance({ model: 'supplied', skin, hair, shirt, pants, shoe, accent, style, top, bottom, accessory });

export const ROSTER = [
  { id: 'mia', name: 'Mia', gender: 'girl', vibe: 'Sunny sprinter',
    appearance: look('#f2c9a5', '#8a4b22', '#ffc542', '#3b5b92', '#f4f4f4', '#2ec4b6', 'ponytail', 'tee', 'shorts', 'wristbands') },
  { id: 'zoe', name: 'Zoe', gender: 'girl', vibe: 'Sporty and speedy',
    appearance: look('#8a5a3c', '#1a1a22', '#2ec4b6', '#2d3a55', '#ffd23f', '#f4f4f4', 'braid', 'jersey', 'joggers', 'headphones') },
  { id: 'luna', name: 'Luna', gender: 'girl', vibe: 'Dreamy daydreamer',
    appearance: look('#d9a47c', '#b27cff', '#7c8cf0', '#2f3a6b', '#f4f4f4', '#ffd23f', 'long', 'sweater', 'skirt', 'glasses') },
  { id: 'ruby', name: 'Ruby', gender: 'girl', vibe: 'Cheeky chatterbox',
    appearance: look('#f2c9a5', '#c2571a', '#2f8f5b', '#24303f', '#ffd23f', '#ffc542', 'buns', 'hoodie', 'pants', 'backpack') },
  { id: 'max', name: 'Max', gender: 'boy', vibe: 'Cool customer',
    appearance: look('#d9a47c', '#2b1b12', '#3da9fc', '#7a6a4a', '#f4f4f4', '#f4f4f4', 'spiky', 'striped', 'shorts', 'sunglasses') },
  { id: 'leo', name: 'Leo', gender: 'boy', vibe: 'Big-hearted goofball',
    appearance: look('#b97a56', '#2b1b12', '#ff9f43', '#1f2a44', '#f4f4f4', '#3da9fc', 'curly', 'hoodie', 'pants', 'none') },
  { id: 'finn', name: 'Finn', gender: 'boy', vibe: 'Sneaky explorer',
    appearance: look('#f2c9a5', '#d9b36a', '#2f4a9e', '#3a3a4a', '#ffd23f', '#ffd23f', 'side', 'jacket', 'pants', 'backpack') },
  { id: 'kai', name: 'Kai', gender: 'boy', vibe: 'Beach-bum daredevil',
    appearance: look('#c08a5e', '#1a1a22', '#8fd14f', '#1f2a44', '#ffd23f', '#2ec4b6', 'mohawk', 'tank', 'shorts', 'wristbands') },
  { id: 'theo', name: 'Theo', gender: 'boy', vibe: 'Clever clutch player',
    appearance: look('#5e3b27', '#1a1a22', '#7a4bd1', '#2d3a55', '#f4f4f4', '#ffc542', 'afro', 'jersey', 'joggers', 'glasses') },
  { id: 'jay', name: 'Jay', gender: 'boy', vibe: 'Chill and cosy',
    appearance: look('#e0b48f', '#6b3f1f', '#e9e1cf', '#3a3a4a', '#f4f4f4', '#2ec4b6', 'beanie', 'sweater', 'pants', 'scarf') },
];

export const ROSTER_BY_ID = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
// Each local player starts on a different preset.
export const DEFAULT_PRESETS = ['mia', 'max', 'zoe', 'leo'];

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
export function isRedish(color) {
  const [r, g, b] = hex(color);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (max < 0.4 || d / max < 0.45) return false;
  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h >= 340 || h <= 20;
}

// The look actually worn: a preset's fixed look, otherwise the player's own appearance.
export function resolveAppearance(appearance) {
  const value = normalizeAppearance(appearance);
  const preset = value.model === 'supplied' ? ROSTER_BY_ID[value.preset] : null;
  return preset ? { ...preset.appearance, preset: preset.id } : value;
}

export const presetOf = (appearance) => (appearance.model === 'supplied' ? ROSTER_BY_ID[appearance.preset] ?? null : null);

// The editable slot keeps its own colours/styles even while a preset is selected.
export function defaultAppearance(index = 0) {
  return normalizeAppearance({ ...normalizeAppearance({ model: 'supplied' }), preset: DEFAULT_PRESETS[index % DEFAULT_PRESETS.length] });
}

// Loads one stored appearance. Old saves keep working: 'supplied' becomes "My character"
// with its customisation, 'custom' becomes Classic, and an untouched old default gets a preset.
export function loadAppearance(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return defaultAppearance(index);
  const value = normalizeAppearance(raw);
  const blank = normalizeAppearance({});
  if (!value.preset && Object.keys(DEFAULT_APPEARANCE).every((key) => value[key] === blank[key])) return defaultAppearance(index);
  return value;
}

const GUEST_SHIRTS = ['#3da9fc', '#59d98e', '#ffc542', '#b27cff', '#2ec4b6', '#ff9f43', '#8fd14f', '#7c8cf0', '#f4f4f4', '#2a8fa8'];
const GUEST_SKINS = ['#f2c9a5', '#d9a47c', '#b97a56', '#8a5a3c', '#5e3b27', '#e0b48f', '#c08a5e'];
const GUEST_HAIR = ['#2b1b12', '#6b3f1f', '#d9b36a', '#1a1a22', '#8a4b22', '#5b7fe0', '#b27cff'];
const GUEST_PANTS = ['#24303f', '#3a3a4a', '#2f4a3a', '#4a3a2f', '#1f2a44', '#7a6a4a', '#2d3a55'];
const GUEST_SHOES = ['#f4f4f4', '#111111', '#ffd23f'];
const GUEST_ACCENTS = ['#ffd23f', '#2ec4b6', '#f4f4f4', '#3da9fc', '#59d98e', '#b27cff'];

// Random but tidy look for CPUs beyond the ten presets. Never a red top.
export function randomLook(rng = Math.random) {
  const pick = (items) => items[Math.floor(rng() * items.length)];
  return normalizeAppearance({
    model: 'supplied', skin: pick(GUEST_SKINS), hair: pick(GUEST_HAIR), shirt: pick(GUEST_SHIRTS), pants: pick(GUEST_PANTS),
    shoe: pick(GUEST_SHOES), accent: pick(GUEST_ACCENTS), style: pick(AVATAR_HAIR_STYLES.filter((s) => s !== 'none')),
    top: pick(AVATAR_TOP_STYLES), bottom: pick(AVATAR_BOTTOM_STYLES), accessory: pick(ACCESSORY_STYLES),
  });
}

function shuffled(items, rng) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// One unique character per CPU: free presets in random order, then numbered guests.
export function assignCpus(count, takenPresetIds = [], rng = Math.random) {
  const free = shuffled(ROSTER.filter((c) => !takenPresetIds.includes(c.id)), rng);
  return Array.from({ length: count }, (_, i) => (i < free.length
    ? { name: free[i].name, preset: free[i].id, appearance: { ...free[i].appearance, preset: free[i].id } }
    : { name: `Guest ${i - free.length + 1}`, preset: '', appearance: randomLook(rng) }));
}
