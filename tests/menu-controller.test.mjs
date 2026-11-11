import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MenuController } from '../docs/js/menu-controller.js';

function pad(index) {
  return { index, connected: true, mapping: 'standard', axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
}

test('either controller can navigate and held inputs are latched when menus open', () => {
  let clicked = 0;
  const control = {
    tagName: 'BUTTON', disabled: false, getClientRects: () => [1], closest: () => null,
    focus() { globalThis.document.activeElement = this; }, scrollIntoView() {},
    click() { clicked++; },
  };
  globalThis.document = { activeElement: control };
  let visible = true;
  const menu = new MenuController({
    root: () => visible ? { querySelectorAll: () => [control] } : null,
    back: () => {}, activateAudio: () => {},
  });
  const first = pad(0), second = pad(1);
  second.buttons[0].pressed = true;
  menu.update([first, second], 0);
  menu.update([first, second], 50);
  assert.equal(clicked, 0);
  second.buttons[0].pressed = false;
  menu.update([first, second], 100);
  second.buttons[0].pressed = true;
  menu.update([first, second], 150);
  assert.equal(clicked, 1);
  menu.update([first, second], 200);
  assert.equal(clicked, 1);
  visible = false;
  menu.update([first, second], 250);
  visible = true;
  menu.update([first, second], 300);
  assert.equal(clicked, 1);
});
