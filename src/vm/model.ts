import type { ClassFile, CodeAttr, ExceptionHandler } from './classfile';

export const enum ClassState { Loaded, Initializing, Initialized, Error }
export const enum ThreadState { Runnable, Blocked, Dead }

export const TOP = undefined;

export type NativeResult = unknown;
export type NativeFn = (t: JThread, args: any[]) => NativeResult;

export class JField {
  constructor(
    public readonly cls: JClass,
    public readonly name: string,
    public readonly desc: string,
    public readonly access: number,
    public readonly isStatic: boolean,
    public slot: number,
    public readonly constantValueIndex: number,
  ) {}
  get wide(): boolean { return this.desc === 'J' || this.desc === 'D'; }
}

export class JMethod {
  readonly key: string;
  readonly isStatic: boolean;
  readonly isNative: boolean;
  readonly isAbstract: boolean;
  readonly isSync: boolean;
  readonly isPrivate: boolean;
  readonly argSlots: number;
  readonly argIndex: number[] | null;
  readonly ret: string;
  readonly retWide: boolean;
  readonly code: Uint8Array | null;
  readonly maxLocals: number;
  readonly handlers: ExceptionHandler[];
  readonly lineNumbers: number[] | null;
  native: NativeFn | null = null;

  constructor(
    public readonly cls: JClass,
    public readonly name: string,
    public readonly desc: string,
    public readonly access: number,
    code: CodeAttr | null,
  ) {
    this.key = name + desc;
    this.isStatic = (access & 0x0008) !== 0;
    this.isNative = (access & 0x0100) !== 0;
    this.isAbstract = (access & 0x0400) !== 0;
    this.isSync = (access & 0x0020) !== 0;
    this.isPrivate = (access & 0x0002) !== 0;
    const { slots, wideAt, ret } = parseMethodDescriptor(desc);
    const self = this.isStatic ? 0 : 1;
    this.argSlots = slots + self;
    if (wideAt.length) {
      const idx: number[] = [];
      for (let i = 0; i < this.argSlots; i++) if (!wideAt.includes(i - self)) idx.push(i);
      this.argIndex = idx;
    } else {
      this.argIndex = null;
    }
    this.ret = ret[0];
    this.retWide = ret === 'J' || ret === 'D';
    this.code = code ? code.code : null;
    this.maxLocals = code ? Math.max(code.maxLocals, this.argSlots) : this.argSlots;
    this.handlers = code ? code.handlers : [];
    this.lineNumbers = code ? code.lineNumbers : null;
  }

  lineFor(pc: number): number {
    const ln = this.lineNumbers;
    if (!ln) return -1;
    let line = -1;
    let best = -1;
    for (let i = 0; i < ln.length; i += 2) {
      if (ln[i] <= pc && ln[i] > best) { best = ln[i]; line = ln[i + 1]; }
    }
    return line;
  }
}

export function parseMethodDescriptor(desc: string): { slots: number; wideAt: number[]; ret: string; args: string[] } {
  let i = 1;
  let slots = 0;
  const wideAt: number[] = [];
  const args: string[] = [];
  while (desc[i] !== ')') {
    const start = i;
    while (desc[i] === '[') i++;
    if (desc[i] === 'L') i = desc.indexOf(';', i);
    i++;
    const a = desc.slice(start, i);
    args.push(a);
    if (a === 'J' || a === 'D') { slots += 2; wideAt.push(slots - 1); } else slots++;
  }
  return { slots, wideAt, ret: desc.slice(i + 1), args };
}

export function defaultValue(desc: string): unknown {
  switch (desc[0]) {
    case 'J': return 0n;
    case 'L': case '[': return null;
    default: return 0;
  }
}

export class Monitor {
  owner: JThread | null = null;
  count = 0;
  entryQ: JThread[] = [];
  waitSet: JThread[] = [];
}

export class JObject {
  f: any[];
  mon: Monitor | null = null;
  hash = 0;
  s: string | null = null;
  nat: any = null;
  constructor(public cls: JClass, fields: any[]) { this.f = fields; }
}

export type ArrayData = Int8Array | Uint16Array | Int16Array | Int32Array | Float32Array | Float64Array | BigInt64Array | any[];

export class JArray extends JObject {
  constructor(cls: JClass, public a: ArrayData) { super(cls, EMPTY); }
}
const EMPTY: any[] = [];

export class JClass {
  superClass: JClass | null = null;
  interfaces: JClass[] = [];
  access = 0;
  fields: JField[] = [];
  methods = new Map<string, JMethod>();
  fieldTemplate: any[] = [];
  statics: any[] = [];
  state = ClassState.Loaded;
  initThread: JThread | null = null;
  resolved: any[] = [];
  vcache = new Map<string, JMethod | null>();
  assignCache = new Map<JClass, boolean>();
  classObj: JObject | null = null;
  sourceFile: string | null = null;
  componentDesc: string | null = null;
  componentClass: JClass | null = null;

  constructor(public readonly name: string, public readonly cf: ClassFile | null) {}

  get isInterface(): boolean { return (this.access & 0x0200) !== 0; }
  get isArray(): boolean { return this.name.charCodeAt(0) === 91;  }
  get javaName(): string { return this.name.replace(/\//g, '.'); }

  findField(name: string, desc?: string): JField | null {
    for (let c: JClass | null = this; c; c = c.superClass) {
      for (const f of c.fields) if (f.name === name && (desc === undefined || f.desc === desc)) return f;
      for (const i of c.interfaces) {
        const r = i.findField(name, desc);
        if (r) return r;
      }
    }
    return null;
  }

  findMethod(key: string): JMethod | null {
    for (let c: JClass | null = this; c; c = c.superClass) {
      const m = c.methods.get(key);
      if (m) return m;
    }
    const seen = new Set<JClass>();
    const searchIf = (c: JClass): JMethod | null => {
      for (const i of c.interfaces) {
        if (seen.has(i)) continue;
        seen.add(i);
        const m = i.methods.get(key) ?? searchIf(i);
        if (m) return m;
      }
      return null;
    };
    for (let c: JClass | null = this; c; c = c.superClass) {
      const m = searchIf(c);
      if (m) return m;
    }
    return null;
  }

  vlookup(key: string): JMethod | null {
    let m = this.vcache.get(key);
    if (m !== undefined) return m;
    m = null;
    for (let c: JClass | null = this; c; c = c.superClass) {
      const x = c.methods.get(key);
      if (x && !x.isStatic) { m = x; break; }
    }
    if (!m) {
      const r = this.findMethod(key);
      if (r && !r.isStatic && !r.isAbstract) m = r;
    }
    this.vcache.set(key, m);
    return m;
  }

  isSubclassOf(other: JClass): boolean {
    for (let c: JClass | null = this; c; c = c.superClass) if (c === other) return true;
    return false;
  }

  implementsInterface(iface: JClass): boolean {
    for (let c: JClass | null = this; c; c = c.superClass) {
      for (const i of c.interfaces) if (i === iface || i.implementsInterface(iface)) return true;
    }
    return false;
  }
}

export class Frame {
  pc = 0;
  stack: any[] = [];
  locals: any[];
  lockObj: JObject | null = null;
  retOverride: unknown = undefined;
  constructor(public readonly m: JMethod, args: any[]) {
    this.locals = args;
    if (args.length < m.maxLocals) args.length = m.maxLocals;
  }
}

export class JThread {
  static nextId = 1;
  readonly id = JThread.nextId++;
  frames: Frame[] = [];
  state = ThreadState.Runnable;
  jobj: JObject | null = null;
  hasPending = false;
  pending: unknown = undefined;
  pendingWide = false;
  pendingThrow: JObject | null = null;
  interrupted = false;
  reacquire: { mon: Monitor; count: number } | null = null;
  waitingOn: Monitor | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;
  interruptible = false;
  constructor(public name: string) {}
}
