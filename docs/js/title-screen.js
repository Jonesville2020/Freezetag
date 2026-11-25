import * as THREE from 'three';
import { Avatar, loadAvatar } from './avatar.js?v=avatar5';
import { createTitleScene } from './title-scene.js?v=title1';

const $ = (id) => document.getElementById(id);
const home = $('home');
const menu = $('title-menu');

// Torn, rough band edges: deterministic jagged polygons so the shape never changes between loads.
function jagged(seed, inset, amp, step) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const top = [], bottom = [];
  for (let x = 0; x <= 100.01; x += step * (0.6 + rnd() * 0.8)) {
    const px = Math.min(100, x);
    top.push(`${px.toFixed(1)}% ${(inset + rnd() * amp).toFixed(1)}%`);
    bottom.push(`${px.toFixed(1)}% ${(100 - inset - rnd() * amp).toFixed(1)}%`);
  }
  return `polygon(${top.join(',')},${bottom.reverse().join(',')})`;
}
document.querySelector('.title-band').style.clipPath = jagged(7, 0.5, 3.2, 1.6);
document.querySelector('.title-band-edge').style.clipPath = jagged(31, 0, 4.2, 1.1);

const scene = createTitleScene($('title-stage'), {
  three: THREE,
  avatarFactory: async (appearance, seeker) => new Avatar({ appearance, seeker }, await loadAvatar()),
});
window.__titleScene = scene;

// The 3D backdrop only renders while the home screen is actually visible.
const sync = () => { if (!home.hidden && !document.hidden) scene.start(); else scene.stop(); };
new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('visibilitychange', sync);
sync();

$('title-studio').addEventListener('click', () => {
  $('custom-play').click();
  const studio = document.querySelector('.studio');
  studio.open = true;
  studio.querySelector('summary').focus();
});

let creditsPad = 0;
function setCredits(open) {
  $('credits-panel').hidden = !open;
  menu.hidden = open;
  clearInterval(creditsPad);
  if (open) {
    $('credits-back').focus();
    let held = false;
    creditsPad = setInterval(() => {
      const pressed = [...(navigator.getGamepads?.() ?? [])].some((p) => p?.connected && (p.buttons[1]?.pressed || p.buttons[9]?.pressed));
      if (pressed && !held) setCredits(false);
      held = pressed;
    }, 80);
  } else $('title-credits').focus();
}
$('title-credits').addEventListener('click', () => setCredits(true));
$('credits-back').addEventListener('click', () => setCredits(false));

document.addEventListener('keydown', (event) => {
  if (home.hidden || !$('audio-settings').hidden) return;
  if (event.key === 'Escape' && !$('credits-panel').hidden) { setCredits(false); return; }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  const buttons = [...menu.querySelectorAll('button')].filter((b) => !menu.hidden && !b.disabled);
  if (!buttons.length) return;
  const i = buttons.indexOf(document.activeElement);
  const next = i < 0 ? 0 : (i + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
  buttons[next].focus();
  event.preventDefault();
});

if (!home.hidden) $('quick-play').focus({ preventScroll: true });
