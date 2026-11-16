// One running MIDlet ("tab"): its own VM, canvas tile, audio channel, network route and save slot.
import { Emulator, type Suite } from '../emulator';
import { CanvasFontRenderer, defaultFontSizes } from '../midp/fonts';
import type { RecordStorage, TextRequest } from '../midp/platform';
import { Surface } from '../midp/surface';
import { WebAudioHost, type AudioEngine } from './audio';
import { ProxyNetHost } from './net';
import { parseSysProps, rmsPrefix, type AppEntry, type ScaleMode } from './store';

export interface SessionDeps {
  engine: AudioEngine;
  /** URL of the network bridge (empty = this server). */
  bridge(): string;
  log(line: string, err?: boolean): void;
  editText(req: TextRequest): Promise<{ text: string; command: number } | null>;
  onExit(s: Session, reason: string): void;
  /** Pointer pressed on this session's screen (used to focus it). */
  onPointer(s: Session): void;
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

let nextSessionId = 1;

export class Session {
  readonly id = nextSessionId++;
  emu: Emulator | null = null;
  readonly audio: WebAudioHost;
  readonly net: ProxyNetHost;
  readonly tile: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private label: HTMLSpanElement;
  private overlay: HTMLDivElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;
  private lastFrame: Surface | null = null;
  private frames = 0;
  fps = 0;
  /** True while the tile is on screen. */
  visible = true;
  /** Keep drawing while hidden (costs CPU, keeps the screen current). */
  drawHidden = false;
  /** Include this tab when input sync is on. */
  sync = true;
  paused = false;
  softLabels: [string | null, string | null] = [null, null];
  onSoftLabels: (l: string | null, r: string | null) => void = () => {};
  status: 'running' | 'exited' | 'stopped' = 'stopped';

  constructor(
    private deps: SessionDeps,
    readonly app: AppEntry,
    private suite: Suite,
    private boot: Map<string, Uint8Array>,
    readonly midletIndex: number,
    public slot: number,
    public via: string,
  ) {
    this.audio = new WebAudioHost(deps.engine);
    this.net = new ProxyNetHost(() => deps.bridge(), (m) => deps.log(this.prefixed(m)), () => this.via);
    this.tile = document.createElement('div');
    this.tile.className = 'tile';
    this.tile.dataset.session = String(this.id);
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.className = 'screen';
    this.label = document.createElement('span');
    this.label.className = 'tile-label';
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `<p class="overlay-title"></p><p class="overlay-sub"></p>
      <div class="overlay-actions"><button class="btn" data-action="close">Close tab</button>
      <button class="btn primary" data-action="restart">Restart</button></div>`;
    this.tile.append(this.canvas, this.label, this.overlay);
    this.ctx = this.canvas.getContext('2d')!;
    this.bindPointer();
    this.updateLabel();
  }

  get title(): string { return this.slot > 1 ? `${this.app.name} #${this.slot}` : this.app.name; }
  get running(): boolean { return !!this.emu && !this.emu.vm.halted; }
  private prefixed(line: string): string { return `[${this.title}] ${line}`; }

  updateLabel(): void {
    this.label.textContent = this.title;
    this.tile.classList.toggle('proxied', !!this.via);
    this.label.title = this.via ? `${this.title} via ${this.via.replace(/\/\/[^@]*@/, '//')}` : this.title;
  }

  start(): void {
    this.stop();
    const s = this.app.settings;
    const w = s.width, h = s.height;
    const auto = defaultFontSizes(w);
    const fonts = new CanvasFontRenderer({
      small: s.fontSmall || auto.small, medium: s.fontMedium || auto.medium, large: s.fontLarge || auto.large,
    }, undefined, undefined, !s.fontAA);
    this.canvas.width = w;
    this.canvas.height = h;
    this.imageData = this.ctx.createImageData(w, h);
    this.lastFrame = null;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, w, h);
    this.overlay.hidden = true;
    this.canvas.style.imageRendering = s.filter ? 'auto' : 'pixelated';
    this.tile.style.background = s.background;

    const e = new Emulator({
      bootClasspath: this.boot,
      suite: this.suite,
      midletIndex: this.midletIndex,
      width: w,
      height: h,
      fonts,
      storage: new LocalRecordStorage(rmsPrefix(this.app.id, this.slot)),
      systemProperties: parseSysProps(s.sysProps),
      print: (stream, line) => this.deps.log(this.prefixed(line), stream === 'err'),
      host: {
        present: (surf) => this.present(surf),
        setSoftLabels: (l, r) => { this.softLabels = [l, r]; this.onSoftLabels(l, r); },
        vibrate: (ms) => { if (this.visible) { try { navigator.vibrate?.(Math.min(ms, 1000)); } catch { /* ignore */ } } },
        editText: (r) => this.deps.editText(r),
        openUrl: (url) => { if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener'); },
        onFatal: (msg) => this.showOverlay('MIDlet failed to start', msg),
        decodeImage,
        audio: this.audio,
        net: this.net,
      },
    });
    e.onExit((_code, reason) => {
      if (this.emu !== e) return;
      this.audio.closeAll();
      this.status = reason === 'stopped' ? 'stopped' : 'exited';
      if (reason !== 'stopped') {
        this.showOverlay(reason === 'MIDlet exited' ? 'Game closed' : 'Stopped', reason === 'MIDlet exited' ? '' : reason);
      }
      this.deps.onExit(this, reason ?? 'stopped');
    });
    this.emu = e;
    this.status = 'running';
    this.paused = false;
    e.platform.setRendering(this.visible || this.drawHidden);
    this.deps.log(this.prefixed(`starting ${this.suite.midlets[this.midletIndex]?.className} (${w}×${h}, slot ${this.slot}${this.via ? ', via proxy' : ''})`));
    e.start();
  }

  stop(): void {
    if (this.emu) {
      const e = this.emu;
      this.emu = null;
      e.stop();
    }
    this.audio.closeAll();
    this.status = 'stopped';
  }

  dispose(): void {
    this.stop();
    this.audio.dispose();
    this.tile.remove();
  }

  showOverlay(title: string, sub = ''): void {
    this.overlay.hidden = false;
    this.overlay.querySelector('.overlay-title')!.textContent = title;
    this.overlay.querySelector('.overlay-sub')!.textContent = sub;
  }

  onOverlayAction(fn: (action: string) => void): void {
    this.overlay.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (a) fn(a);
    });
  }

  /** Called once per second by the workspace. */
  sampleFps(): number {
    this.fps = this.frames;
    this.frames = 0;
    return this.fps;
  }

  /** Shows or hides the tile. Hidden tabs keep running but skip drawing unless drawHidden is set. */
  setVisible(v: boolean, drawHidden: boolean): void {
    this.visible = v;
    this.drawHidden = drawHidden;
    this.tile.hidden = !v;
    this.emu?.platform.setRendering(v || drawHidden);
    if (v && this.lastFrame) this.blit(this.lastFrame);
  }

  private present(s: Surface): void {
    this.lastFrame = s;
    this.frames++;
    if (this.visible) this.blit(s);
  }

  private blit(s: Surface): void {
    if (!this.imageData || this.imageData.width !== s.w || this.imageData.height !== s.h) {
      this.imageData = this.ctx.createImageData(s.w, s.h);
    }
    new Uint32Array(this.imageData.data.buffer).set(s.px);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  /** Scales the canvas into a box of aw x ah css px. */
  fit(scale: ScaleMode, aw: number, ah: number): void {
    const W = this.canvas.width, H = this.canvas.height;
    if (!aw || !ah || !W || !H) return;
    const f = Math.min(aw / W, ah / H);
    let cw: number, ch: number;
    switch (scale) {
      case 'fill': cw = aw; ch = ah; break;
      case 'native': cw = W * Math.min(1, f); ch = H * Math.min(1, f); break;
      case 'integer': { const k = f >= 1 ? Math.floor(f) : f; cw = W * k; ch = H * k; break; }
      default: cw = W * f; ch = H * f;
    }
    this.canvas.style.width = `${Math.floor(cw)}px`;
    this.canvas.style.height = `${Math.floor(ch)}px`;
  }

  screenshot(): void {
    this.canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${this.title.replace(/[^\w.-]+/g, '_')}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  }

  // ---------------------------------------------------------------- input (from the workspace)
  keyDown(code: number): void { this.emu?.platform.keyDown(code); }
  keyUp(code: number): void { this.emu?.platform.keyUp(code); }
  releaseKeys(): void { this.emu?.platform.releaseAllKeys(); }

  /** Pointer in normalized screen coordinates (0..1). */
  pointer(type: 'down' | 'up' | 'move', nx: number, ny: number): void {
    this.emu?.platform.pointer(type, nx * this.canvas.width, ny * this.canvas.height);
  }

  /** Pointer events on this screen; the workspace mirrors them to synced tabs. */
  onScreenPointer: (type: 'down' | 'up' | 'move', nx: number, ny: number) => void = () => {};

  private bindPointer(): void {
    const c = this.canvas;
    let down = false;
    const point = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
    };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.deps.onPointer(this);
      if (!this.emu) return;
      this.audio.unlock();
      down = true;
      try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const [x, y] = point(e);
      this.onScreenPointer('down', x, y);
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const [x, y] = point(e);
      this.onScreenPointer('move', x, y);
    });
    const up = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      const [x, y] = point(e);
      this.onScreenPointer('up', x, y);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- page visibility
  pause(): void {
    if (!this.emu || this.paused || !this.app.settings.pauseWhenHidden) return;
    this.paused = true;
    this.emu.platform.pause();
  }

  resume(): void {
    if (!this.emu || !this.paused) return;
    this.paused = false;
    this.emu.platform.resume();
  }
}
