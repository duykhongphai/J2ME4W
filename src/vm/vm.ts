import { parseClassFile, Tag, type ClassFile } from './classfile';
import {
  ClassState, Frame, JArray, JClass, JField, JMethod, JObject, JThread, Monitor, ThreadState,
  defaultValue, type ArrayData, type NativeFn,
} from './model';
import { execute } from './interpreter';

export class JavaThrow {
  constructor(public readonly ex: JObject) {}
}

export const SUSPEND = Symbol('suspend');
export const FRAMES_PUSHED = Symbol('frames-pushed');
export const RETRY = Symbol('retry');
export const YIELD = Symbol('yield');

export interface VMOptions {
  bootClasspath: Map<string, Uint8Array>;
  appClasspath: Map<string, Uint8Array>;
  print?: (stream: 'out' | 'err', line: string) => void;
  sliceBudget?: number;
  tickMs?: number;
}

const MAX_FRAMES = 3000;

export class VM {
  readonly classes = new Map<string, JClass>();
  readonly natives = new Map<string, NativeFn>();
  readonly interned = new Map<string, JObject>();
  readonly threads = new Set<JThread>();
  readonly runQueue: JThread[] = [];
  readonly boot: Map<string, Uint8Array>;
  readonly app: Map<string, Uint8Array>;
  readonly print: (stream: 'out' | 'err', line: string) => void;
  current: JThread | null = null;
  halted = false;
  exitListeners: ((code: number, reason?: string) => void)[] = [];
  platform: any = null;
  private hashSeed = 0x1234;
  private tickScheduled = false;
  private readonly sliceBudget: number;
  private readonly tickMs: number;
  private warnedNatives = new Set<string>();
  stats = { instructions: 0 };

  constructor(opts: VMOptions) {
    this.boot = opts.bootClasspath;
    this.app = opts.appClasspath;
    this.print = opts.print ?? ((s, l) => (s === 'err' ? console.error : console.log)(l));
    this.sliceBudget = opts.sliceBudget ?? 20000;
    this.tickMs = opts.tickMs ?? 12;
  }

  registerNatives(className: string, fns: Record<string, NativeFn>): void {
    for (const [k, fn] of Object.entries(fns)) this.natives.set(`${className}.${k}`, fn);
  }

  getResource(path: string): Uint8Array | null {
    return this.app.get(path) ?? this.boot.get(path) ?? null;
  }

  loadClass(name: string): JClass {
    const c = this.classes.get(name);
    if (c) return c;
    const r = this.tryLoadClass(name);
    if (!r) {
      if (name === 'java/lang/NoClassDefFoundError') throw new Error('Bootstrap failure: NoClassDefFoundError missing');
      this.print('err', `[j2me4w] class not found: ${name.replace(/\//g, '.')}`);
      this.throwNew('java/lang/NoClassDefFoundError', name.replace(/\//g, '.'));
    }
    return r;
  }

  tryLoadClass(name: string): JClass | null {
    const existing = this.classes.get(name);
    if (existing) return existing;
    if (name[0] === '[') return this.arrayClass(name);
    const bytes = this.boot.get(name + '.class') ?? this.app.get(name + '.class');
    if (!bytes) return null;
    return this.defineClass(name, parseClassFile(bytes));
  }

  private defineClass(name: string, cf: ClassFile): JClass {
    const cls = new JClass(name, cf);
    cls.access = cf.access;
    cls.sourceFile = cf.sourceFile;
    this.classes.set(name, cls);
    try {
      if (cf.superClass) cls.superClass = this.loadClass(cf.superClass);
      cls.interfaces = cf.interfaces.map((i) => this.loadClass(i));
    } catch (e) {
      this.classes.delete(name);
      throw e;
    }
    let slot = cls.superClass ? cls.superClass.fieldTemplate.length : 0;
    cls.fieldTemplate = cls.superClass ? cls.superClass.fieldTemplate.slice() : [];
    let sslot = 0;
    for (const f of cf.fields) {
      const isStatic = (f.access & 0x0008) !== 0;
      const fld = new JField(cls, f.name, f.desc, f.access, isStatic, isStatic ? sslot++ : slot++, f.constantValueIndex);
      cls.fields.push(fld);
      if (isStatic) cls.statics[fld.slot] = defaultValue(f.desc);
      else cls.fieldTemplate[fld.slot] = defaultValue(f.desc);
    }
    for (const m of cf.methods) {
      const jm = new JMethod(cls, m.name, m.desc, m.access, m.code);
      if (jm.isNative) jm.native = this.bindNative(jm);
      cls.methods.set(jm.key, jm);
    }
    cls.resolved = new Array(cf.cp.length);
    return cls;
  }

  private bindNative(m: JMethod): NativeFn {
    const key = `${m.cls.name}.${m.key}`;
    const fn = this.natives.get(key);
    if (fn) return fn;
    return () => {
      if (!this.warnedNatives.has(key)) {
        this.warnedNatives.add(key);
        this.print('err', `[j2me4w] missing native: ${key}`);
      }
      this.throwNew('java/lang/UnsatisfiedLinkError', key);
    };
  }

  arrayClass(name: string): JClass {
    let c = this.classes.get(name);
    if (c) return c;
    c = new JClass(name, null);
    c.access = 0x0001 | 0x0010 | 0x0400;
    c.superClass = this.loadClass('java/lang/Object');
    const ifs: JClass[] = [];
    for (const i of ['java/lang/Cloneable', 'java/io/Serializable']) {
      const ic = this.tryLoadClass(i);
      if (ic) ifs.push(ic);
    }
    c.interfaces = ifs;
    c.componentDesc = name.slice(1);
    const cd = c.componentDesc;
    if (cd[0] === 'L') c.componentClass = this.loadClass(cd.slice(1, -1));
    else if (cd[0] === '[') c.componentClass = this.arrayClass(cd);
    c.state = ClassState.Initialized;
    this.classes.set(name, c);
    return c;
  }

  arrayClassOf(cls: JClass): JClass {
    return this.arrayClass(cls.isArray ? '[' + cls.name : '[L' + cls.name + ';');
  }

  ensureInit(t: JThread, cls: JClass): 0 | 1 | 2 {
    if (cls.state === ClassState.Initialized) return 0;
    if (cls.state === ClassState.Initializing) return cls.initThread === t ? 0 : 2;
    if (cls.state === ClassState.Error) this.throwNew('java/lang/NoClassDefFoundError', cls.javaName + ' (initialization failed)');
    const chain: JClass[] = [];
    for (let c: JClass | null = cls; c && c.state !== ClassState.Initialized; c = c.superClass) {
      if (c.state === ClassState.Initializing) {
        if (c.initThread !== t) return 2;
        break;
      }
      if (c.state === ClassState.Error) this.throwNew('java/lang/NoClassDefFoundError', c.javaName);
      chain.push(c);
    }
    let pushed = false;
    for (const c of chain) {
      this.applyConstantValues(c);
      const clinit = c.methods.get('<clinit>()V');
      if (clinit) {
        c.state = ClassState.Initializing;
        c.initThread = t;
        this.pushFrame(t, clinit, []);
        pushed = true;
      } else {
        c.state = ClassState.Initialized;
      }
    }
    return pushed ? 1 : 0;
  }

  clinitDone(cls: JClass, ok: boolean): void {
    cls.state = ok ? ClassState.Initialized : ClassState.Error;
    cls.initThread = null;
  }

  private applyConstantValues(c: JClass): void {
    const cf = c.cf;
    if (!cf) return;
    for (const f of c.fields) {
      if (!f.isStatic || !f.constantValueIndex) continue;
      const e = cf.cp[f.constantValueIndex]!;
      switch (e.tag) {
        case Tag.Integer: case Tag.Float: case Tag.Long: case Tag.Double:
          c.statics[f.slot] = e.value;
          break;
        case Tag.String:
          c.statics[f.slot] = this.intern((cf.cp[e.stringIndex] as { value: string }).value);
          break;
      }
    }
  }

  resolveClass(cls: JClass, idx: number): JClass {
    let r = cls.resolved[idx];
    if (r) return r;
    const e = cls.cf!.cp[idx] as { tag: Tag.Class; nameIndex: number };
    const name = (cls.cf!.cp[e.nameIndex] as { value: string }).value;
    r = this.loadClass(name);
    cls.resolved[idx] = r;
    return r;
  }

  private memberRef(cls: JClass, idx: number): { owner: JClass; name: string; desc: string } {
    const cp = cls.cf!.cp;
    const e = cp[idx] as { classIndex: number; natIndex: number };
    const nat = cp[e.natIndex] as { nameIndex: number; descIndex: number };
    return {
      owner: this.resolveClass(cls, e.classIndex),
      name: (cp[nat.nameIndex] as { value: string }).value,
      desc: (cp[nat.descIndex] as { value: string }).value,
    };
  }

  resolveField(cls: JClass, idx: number): JField {
    let r = cls.resolved[idx];
    if (r) return r;
    const { owner, name, desc } = this.memberRef(cls, idx);
    r = owner.findField(name, desc);
    if (!r) this.throwNew('java/lang/NoSuchFieldError', `${owner.javaName}.${name}`);
    cls.resolved[idx] = r;
    return r;
  }

  resolveMethod(cls: JClass, idx: number): JMethod {
    let r = cls.resolved[idx];
    if (r) return r;
    const { owner, name, desc } = this.memberRef(cls, idx);
    r = owner.findMethod(name + desc);
    if (!r && owner.isInterface) r = this.loadClass('java/lang/Object').findMethod(name + desc);
    if (!r) {
      this.print('err', `[j2me4w] no such method: ${owner.javaName}.${name}${desc}`);
      this.throwNew('java/lang/NoSuchMethodError', `${owner.javaName}.${name}${desc}`);
    }
    cls.resolved[idx] = r;
    return r;
  }

  resolveConstant(cls: JClass, idx: number): unknown {
    const r = cls.resolved[idx];
    if (r !== undefined) return r;
    const e = cls.cf!.cp[idx]!;
    let v: unknown;
    switch (e.tag) {
      case Tag.Integer: case Tag.Float: case Tag.Long: case Tag.Double: v = e.value; break;
      case Tag.String: v = this.intern((cls.cf!.cp[e.stringIndex] as { value: string }).value); break;
      case Tag.Class: v = this.classObject(this.resolveClass(cls, idx)); break;
      default: this.throwNew('java/lang/InternalError', `unsupported constant tag ${e.tag}`);
    }
    cls.resolved[idx] = v;
    return v;
  }

  newObject(cls: JClass): JObject {
    return new JObject(cls, cls.fieldTemplate.slice());
  }

  newObjectByName(name: string): JObject {
    return this.newObject(this.loadClass(name));
  }

  newArray(arrayClassName: string, length: number): JArray {
    if (length < 0) this.throwNew('java/lang/NegativeArraySizeException', String(length));
    const cls = this.arrayClass(arrayClassName);
    return new JArray(cls, newArrayData(arrayClassName.charCodeAt(1), length));
  }

  newMultiArray(name: string, dims: number[]): JArray {
    const arr = this.newArray(name, dims[0]);
    if (dims.length > 1) {
      const sub = name.slice(1);
      const rest = dims.slice(1);
      const a = arr.a as any[];
      for (let i = 0; i < dims[0]; i++) a[i] = this.newMultiArray(sub, rest);
    }
    return arr;
  }

  str(s: string): JObject {
    const o = new JObject(this.stringClass(), EMPTY_FIELDS);
    o.s = s;
    return o;
  }

  private _stringClass: JClass | null = null;
  stringClass(): JClass {
    return this._stringClass ??= this.loadClass('java/lang/String');
  }

  intern(s: string): JObject {
    let o = this.interned.get(s);
    if (!o) {
      o = this.str(s);
      this.interned.set(s, o);
    }
    return o;
  }

  jstr(o: JObject | null): string | null {
    return o == null ? null : o.s ?? '';
  }

  strArray(values: string[]): JArray {
    const arr = this.newArray('[Ljava/lang/String;', values.length);
    values.forEach((v, i) => ((arr.a as any[])[i] = this.str(v)));
    return arr;
  }

  byteArray(bytes: Uint8Array): JArray {
    const arr = this.newArray('[B', bytes.length);
    (arr.a as Int8Array).set(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return arr;
  }

  classObject(cls: JClass): JObject {
    if (!cls.classObj) {
      const o = this.newObject(this.loadClass('java/lang/Class'));
      o.nat = cls;
      cls.classObj = o;
    }
    return cls.classObj;
  }

  identityHash(o: JObject): number {
    if (!o.hash) {
      let x = this.hashSeed;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.hashSeed = x | 0;
      o.hash = (x & 0x7fffffff) || 1;
    }
    return o.hash;
  }

  getField(o: JObject, name: string): any {
    const f = o.cls.findField(name);
    if (!f) throw new Error(`no field ${name} in ${o.cls.name}`);
    return o.f[f.slot];
  }

  setField(o: JObject, name: string, value: unknown): void {
    const f = o.cls.findField(name);
    if (!f) throw new Error(`no field ${name} in ${o.cls.name}`);
    o.f[f.slot] = value;
  }

  isAssignable(s: JClass, t: JClass): boolean {
    if (s === t) return true;
    const cached = s.assignCache.get(t);
    if (cached !== undefined) return cached;
    let r: boolean;
    if (t.name === 'java/lang/Object') r = true;
    else if (s.isArray) {
      if (t.isArray) {
        const sc = s.componentDesc!, tc = t.componentDesc!;
        if (sc.length === 1 || tc.length === 1) r = sc === tc;
        else r = this.isAssignable(s.componentClass!, t.componentClass!);
      } else {
        r = t.isInterface && s.interfaces.includes(t);
      }
    } else if (t.isInterface) {
      r = s.implementsInterface(t);
    } else {
      r = s.isSubclassOf(t);
    }
    s.assignCache.set(t, r);
    return r;
  }

  isInstance(o: JObject, t: JClass): boolean {
    return this.isAssignable(o.cls, t);
  }

  newThrowable(className: string, message?: string | null): JObject {
    const o = this.newObject(this.loadClass(className));
    if (message != null) this.setField(o, 'detailMessage', this.str(message));
    o.nat = { trace: this.current ? this.captureTrace(this.current, 0) : [] };
    return o;
  }

  throwNew(className: string, message?: string | null): never {
    throw new JavaThrow(this.newThrowable(className, message));
  }

  captureTrace(t: JThread, skip: number): string[] {
    const lines: string[] = [];
    for (let i = t.frames.length - 1 - skip; i >= 0; i--) {
      const f = t.frames[i];
      lines.push(this.frameLabel(f));
    }
    return lines;
  }

  frameLabel(f: Frame): string {
    const m = f.m;
    const line = m.lineFor(Math.max(0, f.pc - 1));
    const src = m.isNative ? 'Native Method' : (m.cls.sourceFile ?? 'Unknown Source') + (line >= 0 ? ':' + line : '');
    return `${m.cls.javaName}.${m.name}(${src})`;
  }

  describeThrowable(ex: JObject): string {
    const msg = this.jstr(this.getField(ex, 'detailMessage'));
    return ex.cls.javaName + (msg != null ? ': ' + msg : '');
  }

  monitorEnter(t: JThread, o: JObject): boolean {
    const m = (o.mon ??= new Monitor());
    if (m.owner === null) { m.owner = t; m.count = 1; return true; }
    if (m.owner === t) { m.count++; return true; }
    m.entryQ.push(t);
    t.state = ThreadState.Blocked;
    return false;
  }

  monitorExit(t: JThread, o: JObject): void {
    const m = o.mon;
    if (!m || m.owner !== t) this.throwNew('java/lang/IllegalMonitorStateException');
    if (--m.count === 0) {
      m.owner = null;
      this.wakeEntry(m);
    }
  }

  private wakeEntry(m: Monitor): void {
    const w = m.entryQ.shift();
    if (w) this.makeRunnable(w);
  }

  monitorWait(t: JThread, o: JObject, timeout: number): typeof SUSPEND {
    const m = o.mon;
    if (!m || m.owner !== t) this.throwNew('java/lang/IllegalMonitorStateException');
    if (t.interrupted) {
      t.interrupted = false;
      this.throwNew('java/lang/InterruptedException');
    }
    t.reacquire = { mon: m, count: m.count };
    m.owner = null;
    m.count = 0;
    this.wakeEntry(m);
    m.waitSet.push(t);
    t.waitingOn = m;
    t.interruptible = true;
    t.state = ThreadState.Blocked;
    if (timeout > 0) {
      t.timer = setTimeout(() => {
        t.timer = null;
        this.removeWaiter(t);
        this.makeRunnable(t);
      }, timeout);
    }
    return SUSPEND;
  }

  private removeWaiter(t: JThread): void {
    const m = t.waitingOn;
    if (m) {
      const i = m.waitSet.indexOf(t);
      if (i >= 0) m.waitSet.splice(i, 1);
      t.waitingOn = null;
    }
  }

  monitorNotify(t: JThread, o: JObject, all: boolean): void {
    const m = o.mon;
    if (!m || m.owner !== t) this.throwNew('java/lang/IllegalMonitorStateException');
    do {
      const w = m.waitSet.shift();
      if (!w) break;
      w.waitingOn = null;
      if (w.timer) { clearTimeout(w.timer); w.timer = null; }
      this.makeRunnable(w);
    } while (all);
  }

  pushFrame(t: JThread, m: JMethod, args: any[]): Frame {
    if (t.frames.length >= MAX_FRAMES) this.throwNew('java/lang/StackOverflowError');
    const f = new Frame(m, args);
    t.frames.push(f);
    return f;
  }

  spawn(name: string, m: JMethod, args: any[], jobj: JObject | null = null): JThread {
    const t = new JThread(name);
    t.jobj = jobj;
    if (jobj) jobj.nat = t;
    this.threads.add(t);
    t.frames.push(new Frame(m, args));
    t.state = ThreadState.Blocked;
    this.makeRunnable(t);
    return t;
  }

  resume(t: JThread, value?: unknown, wide = false): void {
    if (t.state === ThreadState.Dead) return;
    t.hasPending = value !== undefined;
    t.pending = value;
    t.pendingWide = wide;
    this.makeRunnable(t);
  }

  resumeThrow(t: JThread, className: string, message?: string): void {
    if (t.state === ThreadState.Dead) return;
    const prev = this.current;
    this.current = t;
    try {
      t.pendingThrow = this.newThrowable(className, message);
    } finally {
      this.current = prev;
    }
    this.makeRunnable(t);
  }

  makeRunnable(t: JThread): void {
    if (t.state !== ThreadState.Blocked) return;
    t.state = ThreadState.Runnable;
    t.interruptible = false;
    this.runQueue.push(t);
    this.scheduleTick();
  }

  sleep(t: JThread, ms: number): typeof SUSPEND {
    if (t.interrupted) {
      t.interrupted = false;
      this.throwNew('java/lang/InterruptedException');
    }
    t.state = ThreadState.Blocked;
    t.interruptible = true;
    t.timer = setTimeout(() => {
      t.timer = null;
      this.resume(t);
    }, Math.max(0, ms));
    return SUSPEND;
  }

  interrupt(target: JThread): void {
    if (target.state === ThreadState.Blocked && target.interruptible) {
      if (target.timer) { clearTimeout(target.timer); target.timer = null; }
      this.removeWaiter(target);
      this.resumeThrow(target, 'java/lang/InterruptedException');
    } else {
      target.interrupted = true;
    }
  }

  threadFinished(t: JThread): void {
    t.state = ThreadState.Dead;
    t.frames.length = 0;
    this.threads.delete(t);
    const m = t.jobj?.mon;
    if (m) {
      for (const w of m.waitSet.splice(0)) {
        w.waitingOn = null;
        if (w.timer) { clearTimeout(w.timer); w.timer = null; }
        this.makeRunnable(w);
      }
    }
  }

  private scheduleTick(): void {
    if (this.tickScheduled || this.halted) return;
    this.tickScheduled = true;
    scheduleMacrotask(() => this.tick());
  }

  private tick(): void {
    this.tickScheduled = false;
    if (this.halted) return;
    const deadline = now() + this.tickMs;
    while (this.runQueue.length && !this.halted) {
      const t = this.runQueue.shift()!;
      if (t.state !== ThreadState.Runnable) continue;
      this.current = t;
      try {
        execute(this, t, this.sliceBudget);
      } catch (e) {
        this.internalError(t, e);
      }
      this.current = null;
      if (t.state === ThreadState.Runnable) this.runQueue.push(t);
      if (now() >= deadline) break;
    }
    if (this.runQueue.length) this.scheduleTick();
  }

  private internalError(t: JThread, e: unknown): void {
    this.print('err', `[j2me4w] internal VM error in thread "${t.name}": ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    for (let i = t.frames.length - 1; i >= 0; i--) this.print('err', '    at ' + this.frameLabel(t.frames[i]));
    this.threadFinished(t);
  }

  exit(code: number, reason?: string): void {
    if (this.halted) return;
    this.halted = true;
    for (const t of this.threads) {
      if (t.timer) clearTimeout(t.timer);
      t.state = ThreadState.Dead;
    }
    this.threads.clear();
    this.runQueue.length = 0;
    for (const l of this.exitListeners) l(code, reason);
  }

  startStatic(className: string, methodKey: string, args: any[], threadName = 'main'): JThread {
    const cls = this.loadClass(className);
    const m = cls.methods.get(methodKey);
    if (!m || !m.isStatic) throw new Error(`no static method ${className}.${methodKey}`);
    const t = new JThread(threadName);
    this.threads.add(t);
    t.frames.push(new Frame(m, args));
    const prev = this.current;
    this.current = t;
    try { this.ensureInit(t, cls); } finally { this.current = prev; }
    t.state = ThreadState.Blocked;
    this.makeRunnable(t);
    return t;
  }
}

const EMPTY_FIELDS: any[] = [];

export function newArrayData(kind: number, n: number): ArrayData {
  switch (kind) {
    case 90:  case 66:  return new Int8Array(n);
    case 67:  return new Uint16Array(n);
    case 83:  return new Int16Array(n);
    case 73:  return new Int32Array(n);
    case 70:  return new Float32Array(n);
    case 68:  return new Float64Array(n);
    case 74:  return new BigInt64Array(n);
    default: return new Array(n).fill(null);
  }
}

const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

const scheduleMacrotask: (fn: () => void) => void = (() => {
  const g = globalThis as any;
  if (typeof g.setImmediate === 'function') return (fn: () => void) => g.setImmediate(fn);
  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel();
    const q: (() => void)[] = [];
    ch.port1.onmessage = () => q.shift()?.();
    return (fn: () => void) => { q.push(fn); ch.port2.postMessage(0); };
  }
  return (fn: () => void) => setTimeout(fn, 0);
})();
