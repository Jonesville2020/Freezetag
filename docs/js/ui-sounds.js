// Delegated UI sounds: hover/focus pops, clicks, back, toggles and slider ticks for any control in the document.
const CONTROLS = 'button, select, summary, input[type="range"], input[type="checkbox"], input[type="radio"], [role="button"]';
const BACK = /\b(back|close|cancel|quit|exit|home|leave)\b/i;

export function uiSoundFor(el) {
  if (!el || el.disabled) return null;
  if (el.matches?.('input[type="range"]')) return 'tick';
  if (el.matches?.('input[type="checkbox"], input[type="radio"], select')) return 'toggle';
  return BACK.test(`${el.id ?? ''} ${el.getAttribute?.('aria-label') ?? ''} ${el.textContent ?? ''}`.slice(0, 80)) ? 'back' : 'click';
}

export function attachUiSounds(sfx, doc = document) {
  let lastPointer = -Infinity, lastHover = null;
  const now = () => performance.now();
  const control = (target) => target?.closest?.(CONTROLS) ?? null;
  const hover = (el) => {
    if (!el || el === lastHover || el.disabled || doc.body?.classList.contains('in-game')) return;
    lastHover = el;
    sfx.ui('hover');
  };
  doc.addEventListener('pointerdown', () => { lastPointer = now(); }, true);
  doc.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = control(e.target);
    if (el && !el.contains(e.relatedTarget)) hover(el);
  });
  doc.addEventListener('pointerout', (e) => { if (!control(e.relatedTarget)) lastHover = null; });
  // Keyboard / gamepad navigation moves focus; mouse presses also focus, so skip those.
  doc.addEventListener('focusin', (e) => {
    const el = control(e.target);
    if (el && now() - lastPointer > 400) hover(el);
  });
  doc.addEventListener('focusout', () => { lastHover = null; });
  doc.addEventListener('click', (e) => {
    const el = control(e.target);
    if (!el || el.matches('input[type="range"], select, input[type="checkbox"], input[type="radio"]')) return;
    sfx.ui(uiSoundFor(el));
  });
  doc.addEventListener('change', (e) => {
    const el = e.target;
    if (el?.matches?.('select, input[type="checkbox"], input[type="radio"]')) sfx.ui('toggle');
  });
  doc.addEventListener('input', (e) => {
    const el = e.target;
    if (!el?.matches?.('input[type="range"]')) return;
    const span = (Number(el.max) || 100) - (Number(el.min) || 0) || 1;
    sfx.ui('tick', ((Number(el.value) - (Number(el.min) || 0)) / span) * 12);
  });
}
