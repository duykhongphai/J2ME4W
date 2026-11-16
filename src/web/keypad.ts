// On-screen keypad.
//  - Styles: "phone" (D-pad with OK + 12 digit keys) and "gamepad" (8-way joystick + FIRE + small keys).
//  - Placements: "portrait" (a panel under the screen) and "landscape" (translucent groups over the
//    stage). Every key group is absolutely positioned from a default layout, which the user can
//    override per style and placement in edit mode (drag to move, resize the selected group).
//  - Multi-touch: every finger is tracked; the D-pad follows a sliding finger.
import type { KeyItemPos, KeypadType } from './store';

const UP = -1, DOWN = -2, LEFT = -3, RIGHT = -4, FIRE = -5, SOFT_L = -6, SOFT_R = -7, CLEAR = -8;

export type KeypadMode = 'portrait' | 'landscape';
type Rect = { x: number; y: number; w: number; h: number };

export interface KeypadHandlers {
  down(code: number): void;
  up(code: number): void;
  /** Called when the user moved or resized key groups in edit mode. */
  layoutChanged?(key: string, layout: Record<string, KeyItemPos>): void;
  selectionChanged?(item: string | null): void;
}

const DIGITS: [number, string, string][] = [
  [49, '1', ''], [50, '2', 'abc'], [51, '3', 'def'],
  [52, '4', 'ghi'], [53, '5', 'jkl'], [54, '6', 'mno'],
  [55, '7', 'pqrs'], [56, '8', 'tuv'], [57, '9', 'wxyz'],
  [42, '*', ''], [48, '0', ''], [35, '#', ''],
];
const MINI: [number, string][] = [[49, '1'], [51, '3'], [55, '7'], [57, '9'], [42, '*'], [48, '0'], [35, '#']];

export const ITEM_NAMES: Record<string, string> = {
  softL: 'Left soft key', softR: 'Right soft key', clear: 'Clear', dpad: 'D-pad',
  digits: 'Number keys', fire: 'Fire', mini: 'Small keys',
};

/**
 * Default rectangles for every group, in px, inside a W x H keypad area.
 * The two soft keys (usually OK / Back in games) sit right above the D-pad, where the thumb already is;
 * Clear sits above the number keys.
 */
function defaultRects(type: KeypadType, mode: KeypadMode, W: number, H: number): Record<string, Rect> {
  const r: Record<string, Rect> = {};
  const softH = 46, gap = 10;
  if (mode === 'portrait') {
    const pad = 12;
    const colW = Math.min(W * 0.46, H - pad * 2 - softH - gap);
    const mainY = pad + softH + gap, mainH = Math.max(80, H - mainY - pad);
    const d = Math.min(colW, mainH);
    const half = (colW - 8) / 2;
    r.softL = { x: pad, y: pad, w: half, h: softH };
    r.softR = { x: pad + half + 8, y: pad, w: half, h: softH };
    r.dpad = { x: pad + (colW - d) / 2, y: mainY + (mainH - d) / 2, w: d, h: d };
    const rx = pad + colW + 14, rw = W - pad - rx;
    r.clear = { x: W - pad - 64, y: pad, w: 64, h: softH };
    if (type === 'phone') {
      r.digits = { x: rx, y: mainY, w: rw, h: mainH };
    } else {
      const miniH = Math.min(84, mainH * 0.42);
      r.fire = { x: rx, y: mainY, w: rw, h: mainH - miniH - 8 };
      r.mini = { x: rx, y: mainY + mainH - miniH, w: rw, h: miniH };
    }
  } else {
    const m = 14;
    const d = Math.min(H * 0.46, W * 0.3, 230);
    const dy = H - m - d;
    r.dpad = { x: m + 4, y: dy, w: d, h: d };
    const half = (d - 8) / 2;
    const sy = Math.max(8, dy - gap - softH);
    r.softL = { x: m + 4, y: sy, w: half, h: softH };
    r.softR = { x: m + 4 + half + 8, y: sy, w: half, h: softH };
    const rw = Math.min(H * 0.5, W * 0.3, 236);
    if (type === 'phone') {
      const dh = Math.min(H * 0.62, 300);
      r.digits = { x: W - m - rw, y: H - m - dh, w: rw, h: dh };
      r.clear = { x: W - m - 64, y: Math.max(8, H - m - dh - gap - 40), w: 64, h: 40 };
    } else {
      const miniH = 74, f = Math.min(H * 0.32, 132);
      r.mini = { x: W - m - rw, y: H - m - miniH, w: rw, h: miniH };
      r.fire = { x: W - m - f, y: H - m - miniH - 10 - f, w: f, h: f };
      r.clear = { x: W - m - rw, y: Math.max(8, H - m - miniH - 10 - 40), w: 64, h: 40 };
    }
  }
  return r;
}

const SOFT_FALLBACK: [string, string] = ['Menu', 'Back'];

export class Keypad {
  private items = new Map<string, HTMLElement>();
  private softL!: HTMLButtonElement;
  private softR!: HTMLButtonElement;
  private dpad!: HTMLDivElement;
  private dpadKeys = new Map<number, Set<number>>();
  private held = new Map<number, number>();
  private type: KeypadType = 'phone';
  private mode: KeypadMode = 'portrait';
  private W = 0;
  private H = 0;
  private custom: Record<string, Record<string, KeyItemPos>> = {};
  private editing = false;
  private selected: string | null = null;
  haptics = true;

  constructor(private root: HTMLElement, private h: KeypadHandlers) {
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // edit mode intercepts pointer events before the keys see them
    root.addEventListener('pointerdown', (e) => this.editPointerDown(e), { capture: true });
  }

  get layoutKey(): string { return `${this.type}-${this.mode}`; }
  get isEditing(): boolean { return this.editing; }
  get selectedItem(): string | null { return this.selected; }

  build(type: KeypadType, custom: Record<string, Record<string, KeyItemPos>>): void {
    this.releaseAll();
    this.type = type;
    this.custom = custom;
    this.root.innerHTML = '';
    this.items.clear();
    this.root.dataset.type = type;

    const item = (id: string, child: HTMLElement) => {
      const w = document.createElement('div');
      w.className = `kp-item kp-item-${id}`;
      w.dataset.item = id;
      w.appendChild(child);
      this.root.appendChild(w);
      this.items.set(id, w);
    };

    this.softL = this.button('kp-soft kp-soft-l', SOFT_L, '');
    this.softR = this.button('kp-soft kp-soft-r', SOFT_R, '');
    this.softL.setAttribute('aria-label', 'Left soft key');
    this.softR.setAttribute('aria-label', 'Right soft key');
    const clear = this.button('kp-soft kp-clear', CLEAR, 'C');
    clear.setAttribute('aria-label', 'Clear');
    item('softL', this.softL);
    item('clear', clear);
    item('softR', this.softR);
    this.setSoftLabels(null, null);

    this.dpad = document.createElement('div');
    this.dpad.className = 'kp-dpad';
    this.dpad.setAttribute('role', 'group');
    this.dpad.setAttribute('aria-label', type === 'gamepad' ? 'Joystick' : 'Navigation keys');
    this.dpad.innerHTML = `
      <span class="kp-arrow up" data-dir="${UP}"></span>
      <span class="kp-arrow right" data-dir="${RIGHT}"></span>
      <span class="kp-arrow down" data-dir="${DOWN}"></span>
      <span class="kp-arrow left" data-dir="${LEFT}"></span>
      ${type === 'phone' ? `<span class="kp-ok" data-dir="${FIRE}">OK</span>` : '<span class="kp-knob"></span>'}`;
    this.bindDpad();
    item('dpad', this.dpad);

    if (type === 'phone') {
      const grid = document.createElement('div');
      grid.className = 'kp-grid kp-digits';
      for (const [code, label, sub] of DIGITS) grid.appendChild(this.button('kp-key', code, label, sub));
      item('digits', grid);
    } else {
      item('fire', this.button('kp-key kp-fire', FIRE, 'FIRE'));
      const mini = document.createElement('div');
      mini.className = 'kp-grid kp-mini';
      for (const [code, label] of MINI) mini.appendChild(this.button('kp-key', code, label));
      item('mini', mini);
    }
    if (this.W) this.place(this.mode, this.W, this.H);
  }

  /** Positions every group for a keypad area of W x H px. */
  place(mode: KeypadMode, W: number, H: number): void {
    this.mode = mode;
    this.W = W;
    this.H = H;
    const def = defaultRects(this.type, mode, W, H);
    const cust = this.custom[this.layoutKey] ?? {};
    for (const [id, el] of this.items) {
      const d = def[id];
      if (!d) { el.hidden = true; continue; }
      el.hidden = false;
      const c = cust[id];
      let { x, y, w, h } = d;
      if (c) {
        w = d.w * c.s;
        h = d.h * c.s;
        x = c.x * W - w / 2;
        y = c.y * H - h / 2;
      }
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.style.width = `${Math.round(w)}px`;
      el.style.height = `${Math.round(h)}px`;
    }
  }

  /** Shows the game's soft key labels; without one, a dimmed "OK" / "Back" says what the key usually does. */
  setSoftLabels(left: string | null, right: string | null): void {
    if (!this.softL) return;
    [[this.softL, left, SOFT_FALLBACK[0]], [this.softR, right, SOFT_FALLBACK[1]]].forEach(([btn, text, fb]) => {
      const b = btn as HTMLButtonElement;
      const t = (text as string | null) ?? '';
      b.querySelector('.kp-label')!.textContent = t || (fb as string);
      b.classList.toggle('fallback', !t);
    });
  }

  releaseAll(): void {
    for (const code of this.held.keys()) this.h.up(code);
    this.held.clear();
    this.dpadKeys.clear();
    this.root.querySelectorAll('.active').forEach((e) => e.classList.remove('active'));
  }

  // ---------------------------------------------------------------- edit mode
  setEditing(on: boolean): void {
    this.editing = on;
    this.releaseAll();
    this.root.classList.toggle('editing', on);
    this.select(on ? this.selected ?? 'dpad' : null);
  }

  private select(id: string | null): void {
    this.selected = id;
    for (const [k, el] of this.items) el.classList.toggle('selected', k === id);
    this.h.selectionChanged?.(id);
  }

  private currentPos(id: string): KeyItemPos {
    const c = this.custom[this.layoutKey]?.[id];
    if (c) return { ...c };
    const d = defaultRects(this.type, this.mode, this.W, this.H)[id];
    return { x: (d.x + d.w / 2) / this.W, y: (d.y + d.h / 2) / this.H, s: 1 };
  }

  private commit(id: string, pos: KeyItemPos): void {
    const key = this.layoutKey;
    const next = { ...this.custom, [key]: { ...(this.custom[key] ?? {}), [id]: pos } };
    this.custom = next;
    this.place(this.mode, this.W, this.H);
    this.h.layoutChanged?.(key, next[key]);
  }

  /** Changes the size of the selected group by `delta` (e.g. +0.1). */
  resizeSelected(delta: number): void {
    if (!this.selected) return;
    const p = this.currentPos(this.selected);
    p.s = Math.max(0.5, Math.min(2.5, Math.round((p.s + delta) * 100) / 100));
    this.commit(this.selected, p);
  }

  resetLayout(): void {
    const key = this.layoutKey;
    const next = { ...this.custom };
    delete next[key];
    this.custom = next;
    this.place(this.mode, this.W, this.H);
    this.h.layoutChanged?.(key, {});
  }

  private editPointerDown(e: PointerEvent): void {
    if (!this.editing) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.kp-item');
    e.preventDefault();
    e.stopPropagation();
    if (!el) return;
    const id = el.dataset.item!;
    this.select(id);
    const start = this.currentPos(id);
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const p = {
        x: Math.max(0.02, Math.min(0.98, start.x + (ev.clientX - sx) / this.W)),
        y: Math.max(0.02, Math.min(0.98, start.y + (ev.clientY - sy) / this.H)),
        s: start.s,
      };
      // live preview without saving on every move
      const def = defaultRects(this.type, this.mode, this.W, this.H)[id];
      const w = def.w * p.s, h = def.h * p.s;
      el.style.left = `${Math.round(p.x * this.W - w / 2)}px`;
      el.style.top = `${Math.round(p.y * this.H - h / 2)}px`;
      el.dataset.px = String(p.x);
      el.dataset.py = String(p.y);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (el.dataset.px) {
        this.commit(id, { x: Number(el.dataset.px), y: Number(el.dataset.py), s: start.s });
        delete el.dataset.px;
        delete el.dataset.py;
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // ---------------------------------------------------------------- keys
  private press(code: number): void {
    const n = this.held.get(code) ?? 0;
    this.held.set(code, n + 1);
    if (n === 0) {
      this.h.down(code);
      if (this.haptics) { try { navigator.vibrate?.(12); } catch { /* ignore */ } }
    }
  }

  private release(code: number): void {
    const n = this.held.get(code) ?? 0;
    if (n <= 1) {
      this.held.delete(code);
      if (n === 1) this.h.up(code);
    } else {
      this.held.set(code, n - 1);
    }
  }

  private button(cls: string, code: number, label: string, sub = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.dataset.key = String(code);
    b.innerHTML = `<span class="kp-label"></span>${sub ? `<small>${sub}</small>` : ''}`;
    b.querySelector('.kp-label')!.textContent = label;
    let pointer = -1;
    let delay: ReturnType<typeof setTimeout> | null = null;
    let repeat: ReturnType<typeof setInterval> | null = null;
    const stopRepeat = () => {
      if (delay) clearTimeout(delay);
      if (repeat) clearInterval(repeat);
      delay = repeat = null;
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pointer !== -1) return;
      pointer = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      b.classList.add('active');
      this.press(code);
      // a held key produces key-repeat events, like a real phone
      delay = setTimeout(() => { repeat = setInterval(() => this.h.down(code), 100); }, 450);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = -1;
      stopRepeat();
      b.classList.remove('active');
      this.release(code);
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
    return b;
  }

  private dpadDirections(e: PointerEvent): Set<number> {
    const r = this.dpad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const out = new Set<number>();
    if (Math.hypot(dx, dy) < 0.3) {
      if (this.type === 'phone') out.add(FIRE);
      return out;
    }
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = right, 90 = down
    if (this.type === 'phone') {
      if (ang > -45 && ang <= 45) out.add(RIGHT);
      else if (ang > 45 && ang <= 135) out.add(DOWN);
      else if (ang > -135 && ang <= -45) out.add(UP);
      else out.add(LEFT);
    } else {
      // 8-way: each axis is active within +-67.5 degrees of its direction
      if (Math.abs(ang) < 67.5) out.add(RIGHT);
      if (Math.abs(ang) > 112.5) out.add(LEFT);
      if (ang > 22.5 && ang < 157.5) out.add(DOWN);
      if (ang < -22.5 && ang > -157.5) out.add(UP);
    }
    return out;
  }

  private updateDpadVisual(): void {
    const all = new Set<number>();
    for (const s of this.dpadKeys.values()) for (const k of s) all.add(k);
    this.dpad.querySelectorAll<HTMLElement>('[data-dir]').forEach((el) => {
      el.classList.toggle('active', all.has(Number(el.dataset.dir)));
    });
    this.dpad.classList.toggle('active', all.size > 0);
  }

  private bindDpad(): void {
    const set = (id: number, next: Set<number>) => {
      const prev = this.dpadKeys.get(id) ?? new Set<number>();
      for (const k of prev) if (!next.has(k)) this.release(k);
      for (const k of next) if (!prev.has(k)) this.press(k);
      if (next.size) this.dpadKeys.set(id, next); else this.dpadKeys.delete(id);
      this.updateDpadVisual();
    };
    this.dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { this.dpad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      set(e.pointerId, this.dpadDirections(e));
    });
    this.dpad.addEventListener('pointermove', (e) => {
      if (!this.dpad.hasPointerCapture(e.pointerId)) return;
      set(e.pointerId, this.dpadDirections(e));
    });
    const end = (e: PointerEvent) => set(e.pointerId, new Set());
    this.dpad.addEventListener('pointerup', end);
    this.dpad.addEventListener('pointercancel', end);
    this.dpad.addEventListener('lostpointercapture', end);
  }
}
