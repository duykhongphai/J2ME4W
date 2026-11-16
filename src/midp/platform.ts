import type { JArray, JThread } from '../vm/model';
import type { VM } from '../vm/vm';
import type { FontRenderer, Surface } from './surface';

export const EV_KEY_PRESSED = 1, EV_KEY_RELEASED = 2, EV_KEY_REPEATED = 3;
export const EV_POINTER_PRESSED = 4, EV_POINTER_RELEASED = 5, EV_POINTER_DRAGGED = 6;
export const EV_REPAINT = 7, EV_SERIAL = 8, EV_PAUSE = 9, EV_RESUME = 10, EV_FORCE_REPAINT = 11;

export const KEY = {
  UP: -1, DOWN: -2, LEFT: -3, RIGHT: -4, FIRE: -5, SOFT_LEFT: -6, SOFT_RIGHT: -7, CLEAR: -8,
  NUM0: 48, NUM1: 49, NUM2: 50, NUM3: 51, NUM4: 52, NUM5: 53, NUM6: 54, NUM7: 55, NUM8: 56, NUM9: 57,
  STAR: 42, POUND: 35,
} as const;

export function gameAction(code: number): number {
  switch (code) {
    case -1: case 50: return 1;
    case -2: case 56: return 6;
    case -3: case 52: return 2;
    case -4: case 54: return 5;
    case -5: case 53: return 8;
    case 49: return 9;
    case 51: return 10;
    case 55: return 11;
    case 57: return 12;
  }
  return 0;
}

export interface RecordStorage {
  get(name: string): Uint8Array | null;
  set(name: string, data: Uint8Array): boolean;
  delete(name: string): boolean;
  list(): string[];
}

export class MemoryStorage implements RecordStorage {
  private m = new Map<string, Uint8Array>();
  get(n: string) { return this.m.get(n) ?? null; }
  set(n: string, d: Uint8Array) { this.m.set(n, d.slice()); return true; }
  delete(n: string) { return this.m.delete(n); }
  list() { return [...this.m.keys()]; }
}

export interface AudioHost {
  create(handle: number, data: Uint8Array | null, type: string): void;
  start(handle: number, loops: number, onEnd: () => void): void;
  stop(handle: number): void;
  close(handle: number): void;
  setTime(handle: number, micros: number): void;
  time(handle: number): number;
  duration(handle: number): number;
  volume(handle: number, level: number): void;
  toneSequence(handle: number, seq: Uint8Array): void;
  tone(note: number, durationMs: number, volume: number): void;
}

export interface NetSocket {
  send(data: Uint8Array): void;
  close(): void;
}

export interface NetSocketEvents {
  onData(data: Uint8Array): void;
  onClose(error?: string): void;
}

export interface HttpRequest { method: string; url: string; headers: [string, string][]; body: Uint8Array | null }
export interface HttpResult { status: number; message: string; headers: [string, string][]; body: Uint8Array }

export interface NetHost {
  connect(host: string, port: number, events: NetSocketEvents): Promise<NetSocket>;
  http(req: HttpRequest): Promise<HttpResult>;
}

export interface TextRequest {
  title: string | null;
  text: string;
  maxSize: number;
  constraints: number;
  commands: string[];
}

export interface PlatformHost {
  net?: NetHost;
  present(surface: Surface): void;
  setSoftLabels?(left: string | null, right: string | null): void;
  vibrate?(ms: number): void;
  editText?(req: TextRequest): Promise<{ text: string; command: number } | null>;
  openUrl?(url: string): void;
  onFatal?(message: string): void;
  decodeImage?(bytes: Uint8Array): Promise<Surface | null>;
  audio?: AudioHost;
}

export interface PlatformOptions {
  width: number;
  height: number;
  fonts: FontRenderer;
  host: PlatformHost;
  storage?: RecordStorage;
  appProperties?: Record<string, string>;
  systemProperties?: Record<string, string>;
}

export class Platform {
  readonly width: number;
  readonly height: number;
  readonly fonts: FontRenderer;
  readonly host: PlatformHost;
  readonly storage: RecordStorage;
  readonly appProperties: Record<string, string>;
  readonly properties: Record<string, string>;
  private queue: number[] = [];
  private waiter: { t: JThread; arr: JArray } | null = null;
  private held = 0;
  private latched = 0;
  private heldKeys = new Set<number>();
  private displays = new Set<Surface>();
  rendering = true;

  constructor(private vm: VM, opts: PlatformOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.fonts = opts.fonts;
    this.host = opts.host;
    this.storage = opts.storage ?? new MemoryStorage();
    this.appProperties = opts.appProperties ?? {};
    this.properties = opts.systemProperties ?? {};
    vm.platform = this;
  }

  postEvent(type: number, a = 0, b = 0): void {
    if (this.vm.halted) return;
    if (this.waiter) {
      const { t, arr } = this.waiter;
      this.waiter = null;
      const e = arr.a as Int32Array;
      e[0] = type; e[1] = a; e[2] = b;
      this.vm.resume(t);
      return;
    }
    if (this.queue.length >= 3 * 512) return;
    if (type === EV_POINTER_DRAGGED && this.queue.length >= 3 && this.queue[this.queue.length - 3] === EV_POINTER_DRAGGED) {
      this.queue[this.queue.length - 2] = a;
      this.queue[this.queue.length - 1] = b;
      return;
    }
    this.queue.push(type, a, b);
  }

  takeEvent(t: JThread, arr: JArray): boolean {
    if (this.queue.length) {
      const e = arr.a as Int32Array;
      e[0] = this.queue.shift()!; e[1] = this.queue.shift()!; e[2] = this.queue.shift()!;
      return true;
    }
    this.waiter = { t, arr };
    return false;
  }

  keyDown(code: number): void {
    const repeat = this.heldKeys.has(code);
    this.heldKeys.add(code);
    const ga = gameAction(code);
    if (ga) { this.held |= 1 << ga; this.latched |= 1 << ga; }
    this.postEvent(repeat ? EV_KEY_REPEATED : EV_KEY_PRESSED, code);
  }

  keyUp(code: number): void {
    if (!this.heldKeys.delete(code)) return;
    const ga = gameAction(code);
    if (ga) this.held &= ~(1 << ga);
    this.postEvent(EV_KEY_RELEASED, code);
  }

  releaseAllKeys(): void {
    for (const k of [...this.heldKeys]) this.keyUp(k);
  }

  pointer(type: 'down' | 'up' | 'move', x: number, y: number): void {
    const ev = type === 'down' ? EV_POINTER_PRESSED : type === 'up' ? EV_POINTER_RELEASED : EV_POINTER_DRAGGED;
    this.postEvent(ev, Math.round(x), Math.round(y));
  }

  readKeyStates(): number {
    const r = this.held | this.latched;
    this.latched = 0;
    return r;
  }

  registerDisplay(s: Surface): void {
    if (this.displays.has(s)) return;
    this.displays.add(s);
    s.skipDraw = !this.rendering;
  }

  setRendering(on: boolean): void {
    if (on === this.rendering) return;
    this.rendering = on;
    for (const s of this.displays) s.skipDraw = !on;
    if (on) this.postEvent(EV_FORCE_REPAINT);
  }

  pause(): void { this.postEvent(EV_PAUSE); }
  resume(): void { this.postEvent(EV_RESUME); }
}
