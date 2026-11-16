// On-screen keypad. Two styles ("phone": D-pad with OK + 12 digit keys; "gamepad": 8-way joystick +
// big FIRE + a few digits) and two placements ("portrait": a panel under the screen;
// "landscape": translucent clusters overlaid on the sides of the stage). Multi-touch aware:
// every finger is tracked separately and the D-pad follows a sliding finger.
import type { KeypadType } from './store';

const UP = -1, DOWN = -2, LEFT = -3, RIGHT = -4, FIRE = -5, SOFT_L = -6, SOFT_R = -7, CLEAR = -8;

export interface KeypadHandlers {
  down(code: number): void;
  up(code: number): void;
}

const DIGITS: [number, string, string][] = [
  [49, '1', ''], [50, '2', 'abc'], [51, '3', 'def'],
  [52, '4', 'ghi'], [53, '5', 'jkl'], [54, '6', 'mno'],
  [55, '7', 'pqrs'], [56, '8', 'tuv'], [57, '9', 'wxyz'],
  [42, '*', ''], [48, '0', '␣'], [35, '#', ''],
];

export class Keypad {
  private softL!: HTMLButtonElement;
  private softR!: HTMLButtonElement;
  private dpad!: HTMLDivElement;
  private dpadKeys = new Map<number, Set<number>>();
  private held = new Map<number, number>(); // key code -> number of active presses
  private type: KeypadType = 'phone';
  haptics = true;

  constructor(private root: HTMLElement, private h: KeypadHandlers) {
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  build(type: KeypadType): void {
    this.releaseAll();
    this.type = type;
    this.root.innerHTML = '';
    this.root.dataset.type = type;

    this.softL = this.button('kp-soft kp-soft-l', SOFT_L, '');
    this.softR = this.button('kp-soft kp-soft-r', SOFT_R, '');
    this.softL.setAttribute('aria-label', 'Left soft key');
    this.softR.setAttribute('aria-label', 'Right soft key');

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

    const right = document.createElement('div');
    right.className = 'kp-right';
    if (type === 'phone') {
      const grid = document.createElement('div');
      grid.className = 'kp-digits';
      for (const [code, label, sub] of DIGITS) grid.appendChild(this.button('kp-key', code, label, sub));
      right.appendChild(grid);
    } else {
      const cluster = document.createElement('div');
      cluster.className = 'kp-action';
      cluster.appendChild(this.button('kp-key kp-fire', FIRE, 'FIRE'));
      const row = document.createElement('div');
      row.className = 'kp-mini';
      for (const [code, label] of [[49, '1'], [51, '3'], [55, '7'], [57, '9'], [42, '*'], [48, '0'], [35, '#']] as [number, string][]) {
        row.appendChild(this.button('kp-key kp-small', code, label));
      }
      cluster.appendChild(row);
      right.appendChild(cluster);
    }
    const clear = this.button('kp-soft kp-clear', CLEAR, 'C');
    clear.setAttribute('aria-label', 'Clear');

    const top = document.createElement('div');
    top.className = 'kp-top';
    top.append(this.softL, clear, this.softR);
    const main = document.createElement('div');
    main.className = 'kp-main';
    main.append(this.dpad, right);
    this.root.append(top, main);
  }

  setSoftLabels(left: string | null, right: string | null): void {
    if (!this.softL) return;
    this.softL.querySelector('.kp-label')!.textContent = left ?? '';
    this.softR.querySelector('.kp-label')!.textContent = right ?? '';
  }

  releaseAll(): void {
    for (const code of this.held.keys()) this.h.up(code);
    this.held.clear();
    this.dpadKeys.clear();
    this.root.querySelectorAll('.active').forEach((e) => e.classList.remove('active'));
  }

  // ---------------------------------------------------------------- internals
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
      // held key -> key repeat events, like a real phone
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
    const dist = Math.hypot(dx, dy);
    const out = new Set<number>();
    if (dist < 0.3) {
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
      // 8-way: each axis active within +-67.5 deg of its direction
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
      if (!this.dpadKeys.has(e.pointerId) && e.buttons === 0 && e.pointerType === 'mouse') return;
      if (!this.dpad.hasPointerCapture(e.pointerId)) return;
      set(e.pointerId, this.dpadDirections(e));
    });
    const end = (e: PointerEvent) => set(e.pointerId, new Set());
    this.dpad.addEventListener('pointerup', end);
    this.dpad.addEventListener('pointercancel', end);
    this.dpad.addEventListener('lostpointercapture', end);
  }
}
