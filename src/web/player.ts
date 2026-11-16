// The in-game workspace: several MIDlets ("tabs") running at once, shown one at a time or side by
// side in a grid, with one on-screen keypad and one set of hardware bindings that drive the focused
// tab, or every synced tab when input sync is on. Hidden tabs keep running without drawing.
import type { Suite } from '../emulator';
import type { TextRequest } from '../midp/platform';
import type { AudioEngine } from './audio';
import { buildBindingMap, readGamepads } from './controls';
import { Keypad } from './keypad';
import { Session } from './session';
import type { AppEntry, AppSettings } from './store';

export interface WorkspaceUI {
  root: HTMLElement;
  body: HTMLElement;
  stage: HTMLElement;
  keypad: HTMLElement;
  fps: HTMLElement;
}

export interface WorkspaceServices {
  engine: AudioEngine;
  bridge(): string;
  log(line: string, err?: boolean): void;
  editText(req: TextRequest): Promise<{ text: string; command: number } | null>;
  /** Persists an app entry whose settings changed (keypad layout edits). */
  saveApp(app: AppEntry): void;
  /** Tabs were added, removed, focused or changed state. */
  changed(): void;
  closeRequested(s: Session): void;
}

export type ViewMode = 'single' | 'grid';

export const coarsePointer = () => matchMedia('(pointer: coarse)').matches;

export class Workspace {
  sessions: Session[] = [];
  focused: Session | null = null;
  view: ViewMode = 'single';
  /** Mirror input to every tab whose `sync` flag is set. */
  syncInput = false;
  /** Keep drawing tabs that are not on screen. */
  drawHidden = false;
  /** Only the focused tab makes sound. */
  soundFocusedOnly = true;
  onEditSelection: (item: string | null) => void = () => {};

  private keypad: Keypad;
  private keypadVisible = false;
  private keypadOverride: boolean | null = null;
  /** MIDP key codes held by hardware input, with the number of bindings holding each. */
  private hwHeld = new Map<number, number>();
  private kbDown = new Map<string, number>();
  private padHeld = new Set<string>();
  private padRaf = 0;
  private bindings = new Map<string, number>();
  private fpsTimer: ReturnType<typeof setInterval>;
  private wakeLock: any = null;
  /** Sessions that received the keys currently held (so releases reach the same tabs). */
  private keyTargets = new Map<number, Session[]>();

  constructor(private ui: WorkspaceUI, private svc: WorkspaceServices) {
    this.keypad = new Keypad(ui.keypad, {
      down: (c) => this.press(c),
      up: (c) => this.release(c),
      layoutChanged: (key, layout) => {
        const s = this.focused?.app.settings;
        if (!s) return;
        const next = { ...s.keyLayouts };
        if (Object.keys(layout).length) next[key] = layout; else delete next[key];
        s.keyLayouts = next;
        svc.saveApp(this.focused!.app);
      },
      selectionChanged: (item) => this.onEditSelection(item),
    });
    new ResizeObserver(() => this.layout()).observe(ui.body);
    window.addEventListener('gamepadconnected', (e) => {
      svc.log(`[input] gamepad connected: ${(e as GamepadEvent).gamepad.id}`);
      this.pollPads();
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    this.fpsTimer = setInterval(() => {
      for (const s of this.sessions) s.sampleFps();
      if (this.focused) this.ui.fps.textContent = `${this.focused.fps} fps`;
    }, 1000);
  }

  get settings(): AppSettings | null { return this.focused?.app.settings ?? null; }
  get keypadShown(): boolean { return this.keypadVisible; }
  get editing(): boolean { return this.keypad.isEditing; }

  // ---------------------------------------------------------------- tabs
  open(app: AppEntry, suite: Suite, boot: Map<string, Uint8Array>, midletIndex: number, slot: number, via: string): Session {
    const s = new Session({
      engine: this.svc.engine,
      bridge: () => this.svc.bridge(),
      log: (l, e) => this.svc.log(l, e),
      editText: (r) => this.svc.editText(r),
      onExit: () => this.svc.changed(),
      onPointer: (ss) => { if (ss !== this.focused) this.focus(ss); },
    }, app, suite, boot, midletIndex, slot, via);
    s.onSoftLabels = (l, r) => { if (s === this.focused) this.keypad.setSoftLabels(l, r); };
    s.onScreenPointer = (type, x, y) => this.pointer(s, type, x, y);
    s.onOverlayAction((a) => {
      if (a === 'restart') { s.start(); this.svc.changed(); }
      if (a === 'close') this.svc.closeRequested(s);
    });
    this.sessions.push(s);
    this.ui.stage.appendChild(s.tile);
    s.start();
    this.focus(s);
    void this.acquireWakeLock();
    return s;
  }

  close(s: Session): void {
    const i = this.sessions.indexOf(s);
    if (i < 0) return;
    this.releaseKeys();
    s.dispose();
    this.sessions.splice(i, 1);
    if (this.focused === s) {
      this.focused = null;
      const next = this.sessions[Math.min(i, this.sessions.length - 1)];
      if (next) this.focus(next);
    }
    if (!this.sessions.length) {
      this.setEditing(false);
      void this.wakeLock?.release?.().catch(() => {});
      this.wakeLock = null;
    }
    this.applyVisibility();
    this.layout();
    this.svc.changed();
  }

  closeAll(): void {
    for (const s of [...this.sessions]) this.close(s);
  }

  focus(s: Session): void {
    if (this.focused === s) return;
    this.releaseKeys();
    this.setEditing(false);
    this.focused = s;
    for (const x of this.sessions) x.tile.classList.toggle('focused', x === s);
    this.applySettings();
    this.keypad.setSoftLabels(...s.softLabels);
    s.canvas.focus({ preventScroll: true });
    this.svc.changed();
  }

  focusIndex(i: number): void {
    const s = this.sessions[i];
    if (s) this.focus(s);
  }

  restart(s = this.focused): void {
    if (!s) return;
    this.releaseKeys();
    s.start();
    s.setVisible(s.visible, this.drawHidden);
    this.svc.changed();
  }

  setView(v: ViewMode): void {
    this.view = v;
    this.ui.stage.dataset.view = v;
    this.applyVisibility();
    this.layout();
    this.svc.changed();
  }

  setDrawHidden(on: boolean): void {
    this.drawHidden = on;
    this.applyVisibility();
  }

  setSoundFocusedOnly(on: boolean): void {
    this.soundFocusedOnly = on;
    this.applyVisibility();
  }

  /** False while another page (the library) covers the workspace: every tab runs hidden. */
  shown = true;

  setShown(on: boolean): void {
    this.shown = on;
    if (!on) this.releaseKeys();
    this.applyVisibility();
    if (on) this.layout();
  }

  /** Which tiles are on screen, which tabs draw, which make sound. */
  private applyVisibility(): void {
    for (const s of this.sessions) {
      const visible = this.shown && (this.view === 'grid' || s === this.focused);
      s.setVisible(visible, this.drawHidden);
      s.audio.setSessionMuted(this.soundFocusedOnly && s !== this.focused);
    }
  }

  /** Re-applies the focused tab's settings that do not need a restart. */
  applySettings(): void {
    const s = this.settings;
    if (!s) return;
    this.ui.keypad.style.setProperty('--kp-opacity', String(s.keypadOpacity));
    this.keypad.haptics = s.haptics;
    this.keypad.build(s.keypadType, s.keyLayouts);
    this.keypadVisible = this.keypadOverride ?? (s.keypad === 'show' || (s.keypad === 'auto' && coarsePointer()));
    this.ui.fps.hidden = !s.showFps;
    this.releaseHardware();
    this.bindings = buildBindingMap(s.bindings);
    this.pollPads();
    this.applyVisibility();
    this.layout();
  }

  toggleKeypad(): boolean {
    this.keypadVisible = !this.keypadVisible;
    this.keypadOverride = this.keypadVisible;
    if (!this.keypadVisible) { this.keypad.releaseAll(); this.setEditing(false); }
    this.layout();
    return this.keypadVisible;
  }

  // ---------------------------------------------------------------- layout
  layout(): void {
    const { body, keypad, stage } = this.ui;
    const bw = body.clientWidth, bh = body.clientHeight;
    if (!bw || !bh) return;
    const f = this.focused;
    const W = f?.canvas.width || 240, H = f?.canvas.height || 320;
    let mode: 'none' | 'portrait' | 'landscape' = 'none';
    if (this.keypadVisible && f) {
      // below the screen when that leaves enough room, otherwise over the sides of the stage
      const fitBelow = Math.min(bw / W, (bh * 0.58) / H);
      mode = bw / bh > 0.82 || fitBelow * W < bw * 0.45 ? 'landscape' : 'portrait';
    }
    keypad.hidden = mode === 'none';
    keypad.className = `keypad ${mode}${this.keypad.isEditing ? ' editing' : ''}`;
    body.dataset.keypad = mode;
    if (mode === 'portrait') {
      const kh = Math.min(Math.round(bh * 0.42), Math.round(bw * 0.78), 340);
      keypad.style.height = `${kh}px`;
      this.keypad.place('portrait', bw, kh);
    } else {
      keypad.style.height = '';
      if (mode === 'landscape') this.keypad.place('landscape', bw, bh);
    }
    const aw = stage.clientWidth, ah = stage.clientHeight;
    if (!aw || !ah) return;
    const visible = this.sessions.filter((s) => s.visible);
    if (this.view === 'grid' && visible.length > 1) {
      // choose the column count that gives the biggest screens
      let best = { cols: 1, scale: 0 };
      for (let cols = 1; cols <= visible.length; cols++) {
        const rows = Math.ceil(visible.length / cols);
        const scale = Math.min((aw / cols - 8) / W, (ah / rows - 8) / H);
        if (scale > best.scale) best = { cols, scale };
      }
      const rows = Math.ceil(visible.length / best.cols);
      stage.style.gridTemplateColumns = `repeat(${best.cols}, minmax(0, 1fr))`;
      stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
      const tw = aw / best.cols - 8, th = ah / rows - 8;
      for (const s of visible) s.fit(s.app.settings.scale === 'fill' ? 'fit' : s.app.settings.scale, tw, th - 18);
    } else {
      stage.style.gridTemplateColumns = '';
      stage.style.gridTemplateRows = '';
      for (const s of visible) s.fit(s.app.settings.scale, aw, ah);
    }
  }

  // ---------------------------------------------------------------- keypad layout editing
  setEditing(on: boolean): void {
    if (on && !this.focused) return;
    if (on && !this.keypadVisible) { this.keypadVisible = true; this.keypadOverride = true; }
    if (on !== this.keypad.isEditing) {
      this.keypad.setEditing(on);
      this.ui.root.classList.toggle('editing-keys', on);
    }
    this.layout();
  }

  resizeSelected(delta: number): void { this.keypad.resizeSelected(delta); }
  resetLayout(): void { this.keypad.resetLayout(); }

  // ---------------------------------------------------------------- input routing
  /** Tabs that receive input now: the focused one, plus every synced tab when sync is on. */
  private targets(): Session[] {
    const f = this.focused;
    if (!f) return [];
    if (!this.syncInput || !f.sync) return [f];
    return this.sessions.filter((s) => s === f || s.sync);
  }

  private press(code: number): void {
    this.svc.engine.unlock();
    const t = this.targets();
    this.keyTargets.set(code, t);
    for (const s of t) s.keyDown(code);
  }

  private release(code: number): void {
    const t = this.keyTargets.get(code) ?? this.targets();
    this.keyTargets.delete(code);
    for (const s of t) s.keyUp(code);
  }

  /** Repeat of a held key (keyboard auto-repeat): goes to the tabs that got the press. */
  private repeat(code: number): void {
    for (const s of this.keyTargets.get(code) ?? this.targets()) s.keyDown(code);
  }

  private pointer(from: Session, type: 'down' | 'up' | 'move', x: number, y: number): void {
    if (from !== this.focused) { from.pointer(type, x, y); return; }
    for (const s of this.targets()) s.pointer(type, x, y);
  }

  private codeForKey(e: KeyboardEvent): number | undefined {
    const c = this.bindings.get(`k:${e.code}`);
    if (c !== undefined) return c;
    if (e.key === '*') return 42;
    if (e.key === '#') return 35;
    return undefined;
  }

  private hwPress(code: number): void {
    const n = this.hwHeld.get(code) ?? 0;
    this.hwHeld.set(code, n + 1);
    if (n === 0) this.press(code);
  }

  private hwRelease(code: number): void {
    const n = this.hwHeld.get(code) ?? 0;
    if (n <= 1) {
      this.hwHeld.delete(code);
      if (n === 1) this.release(code);
    } else {
      this.hwHeld.set(code, n - 1);
    }
  }

  keyDown(e: KeyboardEvent): boolean {
    if (!this.focused || e.ctrlKey || e.metaKey || e.altKey || this.keypad.isEditing) return false;
    const code = this.codeForKey(e);
    if (code === undefined) return false;
    if (this.kbDown.has(e.code)) this.repeat(code);
    else { this.kbDown.set(e.code, code); this.hwPress(code); }
    return true;
  }

  keyUp(e: KeyboardEvent): boolean {
    const code = this.kbDown.get(e.code);
    if (code === undefined) return false;
    this.kbDown.delete(e.code);
    this.hwRelease(code);
    return true;
  }

  private releaseHardware(): void {
    for (const code of this.hwHeld.keys()) this.release(code);
    this.hwHeld.clear();
    this.kbDown.clear();
    this.padHeld.clear();
  }

  releaseKeys(): void {
    this.keypad.releaseAll();
    this.releaseHardware();
    for (const [code, t] of this.keyTargets) for (const s of t) s.keyUp(code);
    this.keyTargets.clear();
    for (const s of this.sessions) s.releaseKeys();
  }

  private pollPads(): void {
    if (this.padRaf || !navigator.getGamepads) return;
    const tick = () => {
      this.padRaf = 0;
      if (!this.sessions.length) return;
      if (!navigator.getGamepads().some((p) => p && p.connected)) { this.padHeld.clear(); return; }
      const now = this.keypad.isEditing || document.hidden ? new Set<string>() : readGamepads();
      for (const b of this.padHeld) if (!now.has(b)) { const c = this.bindings.get(b); if (c !== undefined) this.hwRelease(c); }
      for (const b of now) if (!this.padHeld.has(b)) { const c = this.bindings.get(b); if (c !== undefined) this.hwPress(c); }
      this.padHeld = now;
      this.padRaf = requestAnimationFrame(tick);
    };
    this.padRaf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- device integration
  private async acquireWakeLock(): Promise<void> {
    if (this.wakeLock || !this.sessions.length) return;
    try {
      this.wakeLock = await (navigator as any).wakeLock?.request('screen');
      this.wakeLock?.addEventListener?.('release', () => { this.wakeLock = null; });
    } catch {
      this.wakeLock = null;
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.releaseKeys();
      for (const s of this.sessions) s.pause();
      if (this.sessions.some((s) => s.paused)) this.svc.engine.setSuspended(true);
    } else {
      for (const s of this.sessions) s.resume();
      this.svc.engine.setSuspended(false);
      this.applyVisibility();
      void this.acquireWakeLock();
    }
  }

  async enterFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) await this.ui.root.requestFullscreen({ navigationUI: 'hide' });
      const o = this.settings?.orientation;
      if (o && o !== 'auto') await (screen.orientation as any)?.lock?.(o);
    } catch {
      /* not supported (iOS Safari, desktop orientation lock) */
    }
  }

  async exitFullscreen(): Promise<void> {
    try {
      (screen.orientation as any)?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* ignore */ }
  }

  dispose(): void { clearInterval(this.fpsTimer); }
}
