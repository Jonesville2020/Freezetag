const COLORS = ['#d9a47c', '#f2c9a5', '#b97a56', '#8a5a3c', '#5e3b27', '#1a1a22', '#3da9fc', '#59d98e', '#ffc542', '#b27cff', '#ff8fb1', '#e5384c', '#24303f', '#f4f4f4'];
const pressed = (pad, i) => Boolean(pad.buttons[i]?.pressed);

export class MenuController {
  constructor({ root, back, activateAudio }) {
    this.root = root;
    this.back = back;
    this.activateAudio = activateAudio;
    this.pads = new Map();
  }

  update(pads, now) {
    const root = this.root();
    if (!root) { this.pads.clear(); return; }
    const connected = [...(pads ?? [])].filter((pad) => pad?.connected && pad.mapping === 'standard');
    const indices = new Set(connected.map((pad) => pad.index));
    for (const index of this.pads.keys()) if (!indices.has(index)) this.pads.delete(index);
    const actions = {};
    for (const pad of connected) {
      const active = {
        up: pressed(pad, 12) || (pad.axes[1] ?? 0) < -0.65,
        down: pressed(pad, 13) || (pad.axes[1] ?? 0) > 0.65,
        left: pressed(pad, 14) || (pad.axes[0] ?? 0) < -0.65,
        right: pressed(pad, 15) || (pad.axes[0] ?? 0) > 0.65,
        confirm: pressed(pad, 0), back: pressed(pad, 1), start: pressed(pad, 9),
      };
      let state = this.pads.get(pad.index);
      if (!state) {
        this.pads.set(pad.index, { previous: active, held: {} });
        continue;
      }
      for (const key of Object.keys(active)) {
        if (!active[key]) { delete state.held[key]; continue; }
        const repeat = ['up', 'down', 'left', 'right'].includes(key);
        if (!state.previous[key]) {
          state.held[key] = now + 500;
          actions[key] = true;
        } else if (repeat && now >= (state.held[key] ?? Infinity)) {
          state.held[key] = now + 130;
          actions[key] = true;
        }
      }
      state.previous = active;
    }
    const { up, down, left, right, confirm, back, start } = actions;
    if (up || down || left || right || confirm || back || start) this.activateAudio();
    if (back || start) { this.back(); return; }
    if (!up && !down && !left && !right && !confirm) return;
    const controls = [...root.querySelectorAll('button, select, input, summary')]
      .filter((el) => !el.disabled && el.getClientRects().length > 0 && !el.closest('[hidden]'));
    if (!controls.length) return;
    let index = controls.indexOf(document.activeElement);
    if (up || down) {
      index = index < 0 ? 0 : (index + (down ? 1 : -1) + controls.length) % controls.length;
      controls[index].focus();
      controls[index].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (index < 0) { controls[0].focus(); return; }
    const el = controls[index];
    if (left || right) this.adjust(el, right ? 1 : -1);
    if (confirm) {
      if (el.tagName === 'SELECT') this.adjust(el, 1);
      else if (el.type === 'color') this.adjust(el, 1);
      else el.click();
    }
  }

  adjust(el, direction) {
    if (el.tagName === 'SELECT') {
      const options = [...el.options];
      let next = el.selectedIndex;
      do { next += direction; } while (options[next]?.disabled);
      if (next < 0 || next >= options.length) return;
      el.selectedIndex = next;
    } else if (el.type === 'range') {
      const min = Number(el.min), max = Number(el.max);
      el.value = Math.max(min, Math.min(max, Number(el.value) + direction * Number(el.step || 1)));
    } else if (el.type === 'color') {
      const current = COLORS.indexOf(el.value.toLowerCase());
      el.value = COLORS[(current < 0 ? 0 : (current + direction + COLORS.length) % COLORS.length)];
    } else return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
