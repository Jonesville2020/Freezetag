import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROSTER, isRedish, loadAppearance, assignCpus, randomLook, resolveAppearance } from '../docs/js/roster.js';
import { normalizeAppearance } from '../docs/js/character.js';
import { registerTint, setTints } from '../docs/js/outfit.js';

test('roster has 10 unique, normalized, non-red characters', () => {
  assert.equal(ROSTER.length, 10);
  assert.equal(new Set(ROSTER.map((c) => c.id)).size, 10);
  assert.equal(new Set(ROSTER.map((c) => c.name)).size, 10);
  assert.equal(ROSTER.filter((c) => c.gender === 'girl').length, 4);
  assert.equal(ROSTER.filter((c) => c.gender === 'boy').length, 6);
  for (const c of ROSTER) {
    assert.equal(c.appearance.model, 'supplied');
    assert.deepEqual(normalizeAppearance(c.appearance), c.appearance);
    assert.ok(!isRedish(c.appearance.shirt) && !isRedish(c.appearance.accent), c.id);
  }
});

test('old saved appearances migrate', () => {
  const old = normalizeAppearance({ model: 'supplied', shirt: '#123456', style: 'afro' });
  const mine = loadAppearance(old, 0);
  assert.equal(mine.model, 'supplied');
  assert.equal(mine.preset, '');
  assert.equal(mine.shirt, '#123456');
  assert.equal(loadAppearance({ model: 'custom', shirt: '#123456' }, 0).model, 'custom');
  const saved = loadAppearance({ model: 'supplied', preset: 'kai' }, 1);
  assert.equal(resolveAppearance(saved).shirt, ROSTER.find((c) => c.id === 'kai').appearance.shirt);
});

test('cpu assignment is unique and skips taken presets', () => {
  const list = assignCpus(14, ['mia']);
  assert.equal(new Set(list.map((c) => c.name)).size, 14);
  assert.ok(!list.some((c) => c.name === 'Mia'));
  assert.equal(list.filter((c) => c.name.startsWith('Guest')).length, 5);
  for (let i = 0; i < 50; i++) assert.ok(!isRedish(randomLook().shirt));
});

test('seeker tint overrides and restores shirt colour', () => {
  const avatar = {};
  const color = new THREE.Color(0x2244cc);
  registerTint(avatar, 'shirt', color);
  setTints(avatar, true);
  assert.equal(color.getHex(), 0xe5384c);
  setTints(avatar, false);
  assert.equal(color.getHex(), 0x2244cc);
});
