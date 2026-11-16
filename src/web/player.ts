// The in-game view: runs one MIDlet, scales its screen into the stage, drives the on-screen
// keypad and hardware keyboard, and handles fullscreen / wake lock / pause on hide.
import { Emulator, type Suite } from '../emulator';
import { CanvasFontRenderer, defaultFontSizes } from '../midp/fonts';
import type { RecordStorage } from '../midp/platform';
import { Surface } from '../midp/surface';
import type { WebAudioHost } from './audio';
import { Keypad } from './keypad';
import type { ProxyNetHost } from './net';
import { parseSysProps, rmsPrefix, type AppEntry, type AppSettings } from './store';

export interface PlayerUI {
  root: HTMLElement;
  body: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  keypad: HTMLElement;
  overlay: HTMLElement;
  fps: HTMLElement;
}

export interface PlayerServices {
  audio: WebAudioHost;
  net: ProxyNetHost;
  log(line: string, err?: boolean): void;
  editText(title: string | null, text: string, max: number, constraints: number): Promise<string | null>;
  onExit(reason: string): void;
}

class LocalRecordStorage implements RecordStorage {
  constructor(private prefix: string) {}
  get(n: string) {
    try {
      const v = localStorage.getItem(this.prefix + n);
      if (v == null) return null;
      const bin = atob(v);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  set(n: string, d: Uint8Array) {
    try {
      let bin = '';
      for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(d.subarray(i, i + 0x8000)));
      localStorage.setItem(this.prefix + n, btoa(bin));
      return true;
    } catch {
      return false;
    }
  }
  delete(n: string) {
    const had = localStorage.getItem(this.prefix + n) != null;
    localStorage.removeItem(this.prefix + n);
    return had;
  }
  list() {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
    }
    return out;
  }
}

async function decodeImage(bytes: Uint8Array): Promise<Surface | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer]));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, bmp.width, bmp.height);
    const s = new Surface(bmp.width, bmp.height, 0);
    s.px.set(new Uint32Array(d.data.buffer));
    return s;
  } catch {
    return null;
  }
}

/** Hardware keyboard -> MIDP key codes. */
const KEYMAP: Record<string, number> = {
  ArrowUp: -1, ArrowDown: -2, ArrowLeft: -3, ArrowRight: -4,
  Enter: -5, NumpadEnter: -5, Space: -5,
  KeyQ: -6, F1: -6, BracketLeft: -6,
  KeyW: -7, F2: -7, BracketRight: -7,
  Backspace: -8, Delete: -8,
  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
  Numpad0: 48, Numpad1: 49, Numpad2: 50, Numpad3: 51, Numpad4: 52, Numpad5: 53, Numpad6: 54, Numpad7: 55, Numpad8: 56, Numpad9: 57,
  NumpadMultiply: 42, NumpadDivide: 35, KeyE: 42, KeyR: 35,
};

export function keyCodeFor(e: KeyboardEvent): number | undefined {
  if (e.key === '*') return 42;
  if (e.key === '#') return 35;
  return KEYMAP[e.code];
}

export const coarsePointer = () => matchMedia('(pointer: coarse)').matches;

export class Player {
  emu: Emulator | null = null;
  app: AppEntry | null = null;
  private suite: Suite | null = null;
  private midletIndex = 0;
  private boot: Map<string, Uint8Array> | null = null;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;
  private lastFrame: Surface | null = null;
  private keypad: Keypad;
  private keypadVisible = false;
  private frames = 0;
  private fpsTimer: ReturnType<typeof setInterval> | null = null;
  private wakeLock: any = null;
  private resizeObs: ResizeObserver;
  private keysDown = new Set<number>();
  paused = false;

  constructor(private ui: PlayerUI, private svc: PlayerServices) {
    this.ctx = ui.canvas.getContext('2d')!;
    this.keypad = new Keypad(ui.keypad, {
      down: (c) => { svc.audio.unlock(); this.emu?.platform.keyDown(c); },
      up: (c) => this.emu?.platform.keyUp(c),
    });
    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(ui.body);
    this.bindPointer();
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  get settings(): AppSettings | null { return this.app?.settings ?? null; }
  get running(): boolean { return !!this.emu && !this.emu.vm.halted; }

  // ---------------------------------------------------------------- lifecycle
  async start(app: AppEntry, suite: Suite, boot: Map<string, Uint8Array>, midletIndex = 0): Promise<void> {
    this.stop();
    this.app = app;
    this.suite = suite;
    this.boot = boot;
    this.midletIndex = midletIndex;
    const s = app.settings;
    const w = s.width, h = s.height;
    const auto = defaultFontSizes(w);
    const fonts = new CanvasFontRenderer({
      small: s.fontSmall || auto.small, medium: s.fontMedium || auto.medium, large: s.fontLarge || auto.large,
    }, undefined, undefined, !s.fontAA);

    this.ui.canvas.width = w;
    this.ui.canvas.height = h;
    this.imageData = this.ctx.createImageData(w, h);
    this.lastFrame = null;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, w, h);
    this.ui.overlay.hidden = true;
    this.applySettings();

    const e = new Emulator({
      bootClasspath: boot,
      suite,
      midletIndex,
      width: w,
      height: h,
      fonts,
      storage: new LocalRecordStorage(rmsPrefix(app.id)),
      systemProperties: parseSysProps(s.sysProps),
      print: (stream, line) => this.svc.log(line, stream === 'err'),
      host: {
        present: (surf) => this.present(surf),
        setSoftLabels: (l, r) => this.keypad.setSoftLabels(l, r),
        vibrate: (ms) => { try { navigator.vibrate?.(Math.min(ms, 1000)); } catch { /* ignore */ } },
        editText: (t, text, max, c) => this.svc.editText(t, text, max, c),
        openUrl: (url) => { if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener'); },
        onFatal: (msg) => this.showOverlay('MIDlet failed to start', msg),
        decodeImage,
        audio: this.svc.audio,
        net: this.svc.net,
      },
    });
    e.onExit((_code, reason) => {
      if (this.emu !== e) return;
      this.svc.audio.closeAll();
      this.svc.onExit(reason ?? 'stopped');
    });
    this.emu = e;
    this.paused = false;
    this.svc.log(`— ${suite.name}: starting ${suite.midlets[midletIndex]?.className} (${w}×${h})`);
    this.fpsTimer = setInterval(() => {
      this.ui.fps.textContent = `${this.frames} fps`;
      this.frames = 0;
    }, 1000);
    void this.acquireWakeLock();
    e.start();
    this.ui.canvas.focus({ preventScroll: true });
  }

  restart(): void {
    if (this.app && this.suite && this.boot) void this.start(this.app, this.suite, this.boot, this.midletIndex);
  }

  stop(): void {
    this.keypad.releaseAll();
    this.keysDown.clear();
    if (this.emu) {
      const e = this.emu;
      this.emu = null;
      e.stop();
    }
    if (this.fpsTimer) { clearInterval(this.fpsTimer); this.fpsTimer = null; }
    this.svc.audio.closeAll();
    void this.wakeLock?.release?.().catch(() => {});
    this.wakeLock = null;
  }

  /** Re-applies settings that do not need a restart. */
  applySettings(): void {
    const s = this.settings;
    if (!s) return;
    this.ui.stage.style.background = s.background;
    this.ui.canvas.style.imageRendering = s.filter ? 'auto' : 'pixelated';
    this.ui.fps.hidden = !s.showFps;
    this.ui.keypad.style.setProperty('--kp-opacity', String(s.keypadOpacity));
    this.keypad.haptics = s.haptics;
    this.keypad.build(s.keypadType);
    this.keypadVisible = s.keypad === 'show' || (s.keypad === 'auto' && coarsePointer());
    this.layout();
  }

  toggleKeypad(): boolean {
    this.keypadVisible = !this.keypadVisible;
    if (!this.keypadVisible) this.keypad.releaseAll();
    this.layout();
    return this.keypadVisible;
  }

  get keypadShown(): boolean { return this.keypadVisible; }

  // ---------------------------------------------------------------- rendering
  private present(s: Surface): void {
    this.lastFrame = s;
    this.frames++;
    if (!this.imageData || this.imageData.width !== s.w || this.imageData.height !== s.h) {
      this.imageData = this.ctx.createImageData(s.w, s.h);
    }
    new Uint32Array(this.imageData.data.buffer).set(s.px);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  /** Places the keypad and scales the canvas into the remaining stage area. */
  layout(): void {
    const s = this.settings;
    const { body, keypad, canvas, stage } = this.ui;
    const bw = body.clientWidth, bh = body.clientHeight;
    if (!bw || !bh) return;
    const W = canvas.width, H = canvas.height;
    let mode: 'none' | 'portrait' | 'landscape' = 'none';
    if (this.keypadVisible) {
      // below the screen when it leaves enough room, otherwise overlay the sides
      const fitBelow = Math.min(bw / W, (bh * 0.58) / H);
      mode = bw / bh > 0.82 || fitBelow * W < bw * 0.45 ? 'landscape' : 'portrait';
    }
    keypad.hidden = mode === 'none';
    keypad.className = `keypad ${mode}`;
    body.dataset.keypad = mode;
    if (mode === 'portrait') {
      const kh = Math.min(Math.round(bh * 0.42), Math.round(bw * 0.78), 340);
      keypad.style.height = `${kh}px`;
    } else {
      keypad.style.height = '';
    }
    const aw = stage.clientWidth, ah = stage.clientHeight;
    if (!aw || !ah) return;
    let cw: number, ch: number;
    const fit = Math.min(aw / W, ah / H);
    switch (s?.scale ?? 'fit') {
      case 'fill': cw = aw; ch = ah; break;
      case 'native': cw = W * Math.min(1, fit); ch = H * Math.min(1, fit); break;
      case 'integer': {
        const k = fit >= 1 ? Math.floor(fit) : fit;
        cw = W * k; ch = H * k;
        break;
      }
      default: cw = W * fit; ch = H * fit;
    }
    canvas.style.width = `${Math.floor(cw)}px`;
    canvas.style.height = `${Math.floor(ch)}px`;
  }

  showOverlay(title: string, sub = ''): void {
    const o = this.ui.overlay;
    o.hidden = false;
    o.querySelector('.overlay-title')!.textContent = title;
    o.querySelector('.overlay-sub')!.textContent = sub;
  }

  screenshot(): void {
    this.ui.canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${(this.app?.name ?? 'screen').replace(/[^\w.-]+/g, '_')}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  }

  // ---------------------------------------------------------------- input
  keyDown(e: KeyboardEvent): boolean {
    const code = keyCodeFor(e);
    if (code === undefined || !this.emu || e.ctrlKey || e.metaKey || e.altKey) return false;
    this.svc.audio.unlock();
    this.keysDown.add(code);
    this.emu.platform.keyDown(code);
    return true;
  }

  keyUp(e: KeyboardEvent): boolean {
    const code = keyCodeFor(e);
    if (code === undefined || !this.emu) return false;
    this.keysDown.delete(code);
    this.emu.platform.keyUp(code);
    return true;
  }

  releaseKeys(): void {
    this.keypad.releaseAll();
    this.emu?.platform.releaseAllKeys();
    this.keysDown.clear();
  }

  private bindPointer(): void {
    const c = this.ui.canvas;
    let down = false;
    const point = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
    };
    c.addEventListener('pointerdown', (e) => {
      if (!this.emu) return;
      e.preventDefault();
      this.svc.audio.unlock();
      down = true;
      try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const [x, y] = point(e);
      this.emu.platform.pointer('down', x, y);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.emu || !down) return;
      const [x, y] = point(e);
      this.emu.platform.pointer('move', x, y);
    });
    const up = (e: PointerEvent) => {
      if (!this.emu || !down) return;
      down = false;
      const [x, y] = point(e);
      this.emu.platform.pointer('up', x, y);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- device integration
  private async acquireWakeLock(): Promise<void> {
    try {
      this.wakeLock = await (navigator as any).wakeLock?.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private onVisibility(): void {
    if (!this.emu) return;
    if (document.hidden) {
      this.releaseKeys();
      if (this.settings?.pauseWhenHidden && !this.paused) {
        this.paused = true;
        this.emu.platform.pause();
        this.svc.audio.setSuspended(true);
      }
    } else {
      if (this.paused) {
        this.paused = false;
        this.emu.platform.resume();
        this.svc.audio.setSuspended(false);
      }
      if (this.lastFrame) this.present(this.lastFrame);
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
}
