import { JArray, JClass, JObject, ThreadState, type JThread } from '../model';
import { FRAMES_PUSHED, RETRY, YIELD, type VM } from '../vm';
import {
  decodeBytes, encodeString, javaFloatingToString, parseJavaDouble, parseJavaInteger,
} from './text';

const b = (x: boolean) => (x ? 1 : 0);

export function registerLangNatives(vm: VM): void {
  const S = (o: JObject | null): string => {
    if (o === null) vm.throwNew('java/lang/NullPointerException');
    return o.s ?? '';
  };
  const str = (s: string) => vm.str(s);
  const npe = (): never => vm.throwNew('java/lang/NullPointerException');
  const sioobe = (i: number): never => vm.throwNew('java/lang/StringIndexOutOfBoundsException', 'String index out of range: ' + i);

  vm.registerNatives('java/lang/Object', {
    'getClass()Ljava/lang/Class;': (_t, [self]) => vm.classObject(self.cls),
    'hashCode()I': (_t, [self]) => vm.identityHash(self),
    'clone()Ljava/lang/Object;': (_t, [self]) => {
      if (self instanceof JArray) {
        const a = self.a;
        return new JArray(self.cls, Array.isArray(a) ? a.slice() : (a as Int32Array).slice());
      }
      if (!vm.isAssignable(self.cls, vm.loadClass('java/lang/Cloneable'))) {
        vm.throwNew('java/lang/CloneNotSupportedException', self.cls.javaName);
      }
      const o = new JObject(self.cls, self.f.slice());
      o.s = self.s;
      return o;
    },
    'notify()V': (t, [self]) => vm.monitorNotify(t, self, false),
    'notifyAll()V': (t, [self]) => vm.monitorNotify(t, self, true),
    'wait(J)V': (t, [self, ms]) => {
      if (ms < 0n) vm.throwNew('java/lang/IllegalArgumentException', 'timeout value is negative');
      return vm.monitorWait(t, self, Number(ms));
    },
  });

  vm.registerNatives('java/lang/Class', {
    'forName0(Ljava/lang/String;)Ljava/lang/Class;': (_t, [name]) => {
      const n = S(name).replace(/\./g, '/');
      let c: JClass | null = null;
      try {
        c = vm.tryLoadClass(n);
      } catch {
        c = null;
      }
      if (!c) vm.throwNew('java/lang/ClassNotFoundException', S(name));
      return vm.classObject(c);
    },
    'initialize0()V': (t, [self]) => {
      const r = vm.ensureInit(t, self.nat as JClass);
      return r === 0 ? undefined : r === 1 ? FRAMES_PUSHED : RETRY;
    },
    'newInstance()Ljava/lang/Object;': (t, [self]) => {
      const cls = self.nat as JClass;
      if (cls.isInterface || cls.isArray || (cls.access & 0x0400) !== 0) {
        vm.throwNew('java/lang/InstantiationException', cls.javaName);
      }
      const ctor = cls.methods.get('<init>()V');
      if (!ctor) vm.throwNew('java/lang/InstantiationException', cls.javaName);
      if (ctor.isPrivate) vm.throwNew('java/lang/IllegalAccessException', cls.javaName);
      if (cls.state === 1  && cls.initThread !== t) return RETRY;
      const obj = vm.newObject(cls);
      const fr = vm.pushFrame(t, ctor, [obj]);
      fr.retOverride = obj;
      vm.ensureInit(t, cls);
      return FRAMES_PUSHED;
    },
    'isInstance(Ljava/lang/Object;)Z': (_t, [self, o]) => b(o !== null && vm.isAssignable(o.cls, self.nat)),
    'isAssignableFrom(Ljava/lang/Class;)Z': (_t, [self, c]) => {
      if (c === null) npe();
      return b(vm.isAssignable(c.nat, self.nat));
    },
    'isInterface()Z': (_t, [self]) => b((self.nat as JClass).isInterface),
    'isArray()Z': (_t, [self]) => b((self.nat as JClass).isArray),
    'getName()Ljava/lang/String;': (_t, [self]) => vm.intern((self.nat as JClass).javaName),
    'getResource0(Ljava/lang/String;)[B': (_t, [name]) => {
      const data = vm.getResource(S(name));
      return data ? vm.byteArray(data) : null;
    },
  });

  vm.registerNatives('j2me4w/Resources', {
    'get(Ljava/lang/String;)[B': (_t, [name]) => {
      const data = vm.getResource(S(name));
      return data ? vm.byteArray(data) : null;
    },
  });

  const checkRange = (len: number, begin: number, end: number) => {
    if (begin < 0) sioobe(begin);
    if (end > len) sioobe(end);
    if (begin > end) sioobe(end - begin);
  };
  vm.registerNatives('java/lang/String', {
    'init0(Ljava/lang/String;)V': (_t, [self, s]) => { self.s = S(s); },
    'initChars0([CII)V': (_t, [self, arr, off, count]) => {
      if (arr === null) npe();
      const a = arr.a as Uint16Array;
      if (off < 0 || count < 0 || off + count > a.length) sioobe(off + count);
      self.s = charsToString(a, off, count);
    },
    'initBytes0([BIILjava/lang/String;)Z': (_t, [self, arr, off, len, enc]) => {
      if (arr === null) npe();
      const a = arr.a as Int8Array;
      if (off < 0 || len < 0 || off + len > a.length) sioobe(off + len);
      const r = decodeBytes(new Uint8Array(a.buffer, a.byteOffset + off, len), enc === null ? null : S(enc));
      if (r === null) { self.s = ''; return 0; }
      self.s = r;
      return 1;
    },
    'length()I': (_t, [self]) => self.s!.length,
    'charAt(I)C': (_t, [self, i]) => {
      const s = self.s!;
      if (i < 0 || i >= s.length) sioobe(i);
      return s.charCodeAt(i);
    },
    'getChars(II[CI)V': (_t, [self, sb, se, dst, db]) => {
      const s = self.s!;
      if (dst === null) npe();
      checkRange(s.length, sb, se);
      const d = dst.a as Uint16Array;
      if (db < 0 || db + (se - sb) > d.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException');
      for (let i = sb; i < se; i++) d[db + i - sb] = s.charCodeAt(i);
    },
    'getBytes0(Ljava/lang/String;)[B': (_t, [self, enc]) => {
      const r = encodeString(self.s!, enc === null ? null : S(enc));
      return r ? vm.byteArray(r) : null;
    },
    'equals(Ljava/lang/Object;)Z': (_t, [self, o]) => b(o !== null && o.cls === self.cls && o.s === self.s),
    'equalsIgnoreCase(Ljava/lang/String;)Z': (_t, [self, o]) =>
      b(o !== null && (o.s === self.s || (o.s!.length === self.s!.length && o.s!.toUpperCase() === self.s!.toUpperCase()))),
    'compareTo(Ljava/lang/String;)I': (_t, [self, o]) => {
      const a = self.s!, c = S(o);
      const n = Math.min(a.length, c.length);
      for (let i = 0; i < n; i++) {
        const d = a.charCodeAt(i) - c.charCodeAt(i);
        if (d !== 0) return d;
      }
      return a.length - c.length;
    },
    'regionMatches(ZILjava/lang/String;II)Z': (_t, [self, ic, to, other, oo, len]) => {
      const a = self.s!, o = S(other);
      if (oo < 0 || to < 0 || to > a.length - len || oo > o.length - len) return 0;
      let x = a.substr(to, len), y = o.substr(oo, len);
      if (ic) { x = x.toUpperCase(); y = y.toUpperCase(); }
      return b(x === y);
    },
    'startsWith(Ljava/lang/String;I)Z': (_t, [self, p, off]) => b(off >= 0 && self.s!.startsWith(S(p), off)),
    'endsWith(Ljava/lang/String;)Z': (_t, [self, p]) => b(self.s!.endsWith(S(p))),
    'hashCode()I': (_t, [self]) => {
      const s = self.s!;
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
      return h;
    },
    'indexOf(I)I': (_t, [self, ch]) => self.s!.indexOf(String.fromCharCode(ch)),
    'indexOf(II)I': (_t, [self, ch, from]) => self.s!.indexOf(String.fromCharCode(ch), Math.max(0, from)),
    'indexOf(Ljava/lang/String;)I': (_t, [self, s]) => self.s!.indexOf(S(s)),
    'indexOf(Ljava/lang/String;I)I': (_t, [self, s, from]) => {
      const x = self.s!, y = S(s);
      if (from >= x.length) return y.length === 0 ? x.length : -1;
      return x.indexOf(y, Math.max(0, from));
    },
    'lastIndexOf(I)I': (_t, [self, ch]) => self.s!.lastIndexOf(String.fromCharCode(ch)),
    'lastIndexOf(II)I': (_t, [self, ch, from]) => (from < 0 ? -1 : self.s!.lastIndexOf(String.fromCharCode(ch), from)),
    'lastIndexOf(Ljava/lang/String;)I': (_t, [self, s]) => self.s!.lastIndexOf(S(s)),
    'lastIndexOf(Ljava/lang/String;I)I': (_t, [self, s, from]) => (from < 0 ? -1 : self.s!.lastIndexOf(S(s), from)),
    'substring(I)Ljava/lang/String;': (_t, [self, begin]) => {
      const s = self.s!;
      checkRange(s.length, begin, s.length);
      return begin === 0 ? self : str(s.substring(begin));
    },
    'substring(II)Ljava/lang/String;': (_t, [self, begin, end]) => {
      const s = self.s!;
      checkRange(s.length, begin, end);
      return begin === 0 && end === s.length ? self : str(s.substring(begin, end));
    },
    'concat(Ljava/lang/String;)Ljava/lang/String;': (_t, [self, o]) => {
      const x = S(o);
      return x.length === 0 ? self : str(self.s! + x);
    },
    'replace(CC)Ljava/lang/String;': (_t, [self, a, c]) => {
      if (a === c) return self;
      const from = String.fromCharCode(a);
      const s = self.s!;
      return s.indexOf(from) < 0 ? self : str(s.split(from).join(String.fromCharCode(c)));
    },
    'toLowerCase()Ljava/lang/String;': (_t, [self]) => { const r = self.s!.toLowerCase(); return r === self.s ? self : str(r); },
    'toUpperCase()Ljava/lang/String;': (_t, [self]) => { const r = self.s!.toUpperCase(); return r === self.s ? self : str(r); },
    'trim()Ljava/lang/String;': (_t, [self]) => {
      const s = self.s!;
      let st = 0, en = s.length;
      while (st < en && s.charCodeAt(st) <= 32) st++;
      while (en > st && s.charCodeAt(en - 1) <= 32) en--;
      return st === 0 && en === s.length ? self : str(s.substring(st, en));
    },
    'toCharArray()[C': (_t, [self]) => {
      const s = self.s!;
      const arr = vm.newArray('[C', s.length);
      const a = arr.a as Uint16Array;
      for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      return arr;
    },
    'intern()Ljava/lang/String;': (_t, [self]) => {
      const e = vm.interned.get(self.s!);
      if (e) return e;
      vm.interned.set(self.s!, self);
      return self;
    },
    'valueOf(C)Ljava/lang/String;': (_t, [c]) => str(String.fromCharCode(c)),
  });

  for (const cn of ['java/lang/StringBuffer', 'java/lang/StringBuilder']) {
    const T = `L${cn};`;
    const sb = (o: JObject) => o.s ?? '';
    vm.registerNatives(cn, {
      'length()I': (_t, [self]) => sb(self).length,
      'charAt(I)C': (_t, [self, i]) => {
        const s = sb(self);
        if (i < 0 || i >= s.length) sioobe(i);
        return s.charCodeAt(i);
      },
      'getChars(II[CI)V': (_t, [self, s0, s1, dst, db]) => {
        const s = sb(self);
        if (dst === null) npe();
        checkRange(s.length, s0, s1);
        const d = dst.a as Uint16Array;
        if (db < 0 || db + (s1 - s0) > d.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException');
        for (let i = s0; i < s1; i++) d[db + i - s0] = s.charCodeAt(i);
      },
      'setCharAt(IC)V': (_t, [self, i, c]) => {
        const s = sb(self);
        if (i < 0 || i >= s.length) sioobe(i);
        self.s = s.slice(0, i) + String.fromCharCode(c) + s.slice(i + 1);
      },
      'setLength(I)V': (_t, [self, n]) => {
        if (n < 0) sioobe(n);
        const s = sb(self);
        self.s = n <= s.length ? s.slice(0, n) : s + '\0'.repeat(n - s.length);
      },
      [`append(Ljava/lang/String;)${T}`]: (_t, [self, s]) => { self.s = sb(self) + (s === null ? 'null' : s.s); return self; },
      [`append(C)${T}`]: (_t, [self, c]) => { self.s = sb(self) + String.fromCharCode(c); return self; },
      [`append(I)${T}`]: (_t, [self, i]) => { self.s = sb(self) + i; return self; },
      [`delete(II)${T}`]: (_t, [self, st, en]) => {
        const s = sb(self);
        if (en > s.length) en = s.length;
        if (st < 0 || st > en) sioobe(st);
        self.s = s.slice(0, st) + s.slice(en);
        return self;
      },
      [`deleteCharAt(I)${T}`]: (_t, [self, i]) => {
        const s = sb(self);
        if (i < 0 || i >= s.length) sioobe(i);
        self.s = s.slice(0, i) + s.slice(i + 1);
        return self;
      },
      [`replace(IILjava/lang/String;)${T}`]: (_t, [self, st, en, r]) => {
        const s = sb(self);
        if (st < 0 || st > s.length || st > en) sioobe(st);
        if (en > s.length) en = s.length;
        self.s = s.slice(0, st) + S(r) + s.slice(en);
        return self;
      },
      [`insert(ILjava/lang/String;)${T}`]: (_t, [self, off, x]) => {
        const s = sb(self);
        if (off < 0 || off > s.length) sioobe(off);
        self.s = s.slice(0, off) + (x === null ? 'null' : x.s) + s.slice(off);
        return self;
      },
      'indexOf(Ljava/lang/String;)I': (_t, [self, x]) => sb(self).indexOf(S(x)),
      'indexOf(Ljava/lang/String;I)I': (_t, [self, x, from]) => sb(self).indexOf(S(x), Math.max(0, from)),
      'lastIndexOf(Ljava/lang/String;)I': (_t, [self, x]) => sb(self).lastIndexOf(S(x)),
      'substring(I)Ljava/lang/String;': (_t, [self, st]) => {
        const s = sb(self);
        checkRange(s.length, st, s.length);
        return str(s.slice(st));
      },
      'substring(II)Ljava/lang/String;': (_t, [self, st, en]) => {
        const s = sb(self);
        checkRange(s.length, st, en);
        return str(s.slice(st, en));
      },
      [`reverse()${T}`]: (_t, [self]) => { self.s = Array.from(sb(self)).reverse().join(''); return self; },
      'toString()Ljava/lang/String;': (_t, [self]) => str(sb(self)),
    });
  }

  vm.registerNatives('java/lang/Throwable', {
    'fillInStackTrace0()V': (t, [self]) => {
      let skip = 0;
      const fr = t.frames;
      while (skip < fr.length && fr[fr.length - 1 - skip].m.name === '<init>'
             && fr[fr.length - 1 - skip].locals[0] === self) skip++;
      self.nat = { trace: vm.captureTrace(t, skip) };
    },
    'printStackTrace0(Ljava/lang/String;)V': (_t, [self, header]) => {
      vm.print('err', S(header));
      for (const l of (self.nat?.trace ?? []) as string[]) vm.print('err', '\tat ' + l);
      let cause = vm.getField(self, 'cause') as JObject | null;
      let depth = 0;
      while (cause && cause !== self && depth++ < 10) {
        vm.print('err', 'Caused by: ' + vm.describeThrowable(cause));
        for (const l of (cause.nat?.trace ?? []) as string[]) vm.print('err', '\tat ' + l);
        cause = vm.getField(cause, 'cause');
      }
    },
  });

  const threadOf = (t: JThread): JObject => {
    if (!t.jobj) {
      const o = vm.newObjectByName('java/lang/Thread');
      vm.setField(o, 'name', vm.str(t.name));
      vm.setField(o, 'priority', 5);
      vm.setField(o, 'started', 1);
      o.nat = t;
      t.jobj = o;
    }
    return t.jobj;
  };
  vm.registerNatives('java/lang/Thread', {
    'start0()V': (_t, [self]) => {
      const run = self.cls.vlookup('run()V')!;
      const name = vm.jstr(vm.getField(self, 'name')) ?? 'Thread';
      vm.spawn(name, run, [self], self);
    },
    'currentThread()Ljava/lang/Thread;': (t) => threadOf(t),
    'sleep(J)V': (t, [ms]) => {
      if (ms < 0n) vm.throwNew('java/lang/IllegalArgumentException', 'timeout value is negative');
      if (ms === 0n) return YIELD;
      return vm.sleep(t, Number(ms));
    },
    'yield()V': () => YIELD,
    'activeCount()I': () => vm.threads.size,
    'isAlive()Z': (_t, [self]) => b(self.nat != null && (self.nat as JThread).state !== ThreadState.Dead),
    'interrupt()V': (_t, [self]) => { if (self.nat) vm.interrupt(self.nat as JThread); },
    'interrupted0(Z)Z': (_t, [self, clear]) => {
      const th = self.nat as JThread | null;
      if (!th) return 0;
      const r = th.interrupted;
      if (clear) th.interrupted = false;
      return b(r);
    },
  });

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  vm.registerNatives('java/lang/System', {
    'currentTimeMillis()J': () => BigInt(Date.now()),
    'nanoTime()J': () => BigInt(Math.floor(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) * 1e6)),
    'arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V': (_t, [src, sp, dst, dp, len]) => {
      if (src === null || dst === null) npe();
      if (!(src instanceof JArray) || !(dst instanceof JArray)) vm.throwNew('java/lang/ArrayStoreException');
      const s = src.a, d = dst.a;
      if (len < 0 || sp < 0 || dp < 0 || sp + len > s.length || dp + len > d.length) {
        vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', 'arraycopy');
      }
      if (len === 0) return;
      const sPrim = !Array.isArray(s), dPrim = !Array.isArray(d);
      if (sPrim || dPrim) {
        if (src.cls !== dst.cls) vm.throwNew('java/lang/ArrayStoreException', 'arraycopy: type mismatch');
        const st = s as Int32Array, dt = d as Int32Array;
        if (st === dt) dt.copyWithin(dp, sp, sp + len);
        else dt.set(st.subarray(sp, sp + len), dp);
        return;
      }
      const sa = s as any[], da = d as any[];
      if (sa === da) { da.copyWithin(dp, sp, sp + len); return; }
      const dc = dst.cls.componentClass!;
      const check = dc.name !== 'java/lang/Object' && !vm.isAssignable(src.cls.componentClass!, dc);
      for (let i = 0; i < len; i++) {
        const v = sa[sp + i];
        if (check && v !== null && !vm.isAssignable(v.cls, dc)) vm.throwNew('java/lang/ArrayStoreException');
        da[dp + i] = v;
      }
    },
    'identityHashCode(Ljava/lang/Object;)I': (_t, [o]) => (o === null ? 0 : vm.identityHash(o)),
    'getProperty(Ljava/lang/String;)Ljava/lang/String;': (_t, [key]) => {
      const k = S(key);
      const v = vm.platform?.properties?.[k] ?? DEFAULT_PROPERTIES[k];
      return v == null ? null : vm.str(v);
    },
  });
  vm.registerNatives('java/lang/Runtime', {
    'exit(I)V': (_t, [_self, code]) => { flushConsole(); vm.exit(code, 'System.exit(' + code + ')'); },
  });

  vm.registerNatives('java/lang/Math', {
    'max(FF)F': (_t, [a, c]) => (a !== a ? a : Math.max(a, c)),
    'max(DD)D': (_t, [a, c]) => Math.max(a, c),
    'min(FF)F': (_t, [a, c]) => (a !== a ? a : Math.min(a, c)),
    'min(DD)D': (_t, [a, c]) => Math.min(a, c),
    'sin(D)D': (_t, [a]) => Math.sin(a),
    'cos(D)D': (_t, [a]) => Math.cos(a),
    'tan(D)D': (_t, [a]) => Math.tan(a),
    'asin(D)D': (_t, [a]) => Math.asin(a),
    'acos(D)D': (_t, [a]) => Math.acos(a),
    'atan(D)D': (_t, [a]) => Math.atan(a),
    'atan2(DD)D': (_t, [y, x]) => Math.atan2(y, x),
    'sqrt(D)D': (_t, [a]) => Math.sqrt(a),
    'ceil(D)D': (_t, [a]) => Math.ceil(a),
    'floor(D)D': (_t, [a]) => Math.floor(a),
    'exp(D)D': (_t, [a]) => Math.exp(a),
    'log(D)D': (_t, [a]) => Math.log(a),
    'pow(DD)D': (_t, [a, c]) => Math.pow(a, c),
    'random()D': () => Math.random(),
    'rint(D)D': (_t, [a]) => {
      const r = Math.round(a);
      return Math.abs(a % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
    },
  });

  vm.registerNatives('java/lang/Character', {
    'isLowerCase(C)Z': (_t, [c]) => { const s = String.fromCharCode(c); return b(s !== s.toUpperCase() && s === s.toLowerCase()); },
    'isUpperCase(C)Z': (_t, [c]) => { const s = String.fromCharCode(c); return b(s !== s.toLowerCase() && s === s.toUpperCase()); },
    'isLetter(C)Z': (_t, [c]) => b(/\p{L}/u.test(String.fromCharCode(c))),
    'toLowerCase(C)C': (_t, [c]) => { const r = String.fromCharCode(c).toLowerCase(); return r.length === 1 ? r.charCodeAt(0) : c; },
    'toUpperCase(C)C': (_t, [c]) => { const r = String.fromCharCode(c).toUpperCase(); return r.length === 1 ? r.charCodeAt(0) : c; },
  });
  const nfe = (s: string): never => vm.throwNew('java/lang/NumberFormatException', s);
  vm.registerNatives('java/lang/Integer', {
    'parseInt(Ljava/lang/String;I)I': (_t, [s, radix]) => {
      if (s === null) nfe('null');
      const r = parseJavaInteger(S(s), radix, 32);
      if (r === null) nfe(`For input string: "${S(s)}"`);
      return Number(r);
    },
    'toString(II)Ljava/lang/String;': (_t, [i, radix]) => str(i.toString(radix < 2 || radix > 36 ? 10 : radix)),
    'toHexString(I)Ljava/lang/String;': (_t, [i]) => str((i >>> 0).toString(16)),
    'toOctalString(I)Ljava/lang/String;': (_t, [i]) => str((i >>> 0).toString(8)),
    'toBinaryString(I)Ljava/lang/String;': (_t, [i]) => str((i >>> 0).toString(2)),
  });
  vm.registerNatives('java/lang/Long', {
    'parseLong(Ljava/lang/String;I)J': (_t, [s, radix]) => {
      if (s === null) nfe('null');
      const r = parseJavaInteger(S(s), radix, 64);
      if (r === null) nfe(`For input string: "${S(s)}"`);
      return r;
    },
    'toString(JI)Ljava/lang/String;': (_t, [l, radix]) => str(l.toString(radix < 2 || radix > 36 ? 10 : radix)),
    'toHexString(J)Ljava/lang/String;': (_t, [l]) => str(BigInt.asUintN(64, l).toString(16)),
  });
  const buf = new DataView(new ArrayBuffer(8));
  vm.registerNatives('java/lang/Float', {
    'parseFloat(Ljava/lang/String;)F': (_t, [s]) => {
      if (s === null) npe();
      const v = parseJavaDouble(S(s));
      if (v === null) nfe(`For input string: "${S(s)}"`);
      return Math.fround(v as number);
    },
    'toString(F)Ljava/lang/String;': (_t, [f]) => str(javaFloatingToString(f, true)),
    'floatToIntBits(F)I': (_t, [f]) => { buf.setFloat32(0, f); return f !== f ? 0x7fc00000 : buf.getInt32(0); },
    'intBitsToFloat(I)F': (_t, [i]) => { buf.setInt32(0, i); return buf.getFloat32(0); },
  });
  vm.registerNatives('java/lang/Double', {
    'parseDouble(Ljava/lang/String;)D': (_t, [s]) => {
      if (s === null) npe();
      const v = parseJavaDouble(S(s));
      if (v === null) nfe(`For input string: "${S(s)}"`);
      return v;
    },
    'toString(D)Ljava/lang/String;': (_t, [d]) => str(javaFloatingToString(d, false)),
    'doubleToLongBits(D)J': (_t, [d]) => { buf.setFloat64(0, d); return d !== d ? 0x7ff8000000000000n : buf.getBigInt64(0); },
    'longBitsToDouble(J)D': (_t, [l]) => { buf.setBigInt64(0, l); return buf.getFloat64(0); },
  });

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n: number) => String(n).padStart(2, '0');
  vm.registerNatives('java/util/Date', {
    'toString0(J)Ljava/lang/String;': (_t, [ms]) => {
      const d = new Date(Number(ms));
      const off = -d.getTimezoneOffset();
      const tz = 'GMT' + (off >= 0 ? '+' : '-') + p2(Math.floor(Math.abs(off) / 60)) + ':' + p2(Math.abs(off) % 60);
      return str(`${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${tz} ${d.getFullYear()}`);
    },
  });
  vm.registerNatives('java/util/TimeZone', {
    'defaultOffset0()I': () => -new Date().getTimezoneOffset() * 60000,
  });
  vm.registerNatives('j2me4w/TimeZone0', {
    'fields(JI[I)V': (_t, [ms, offset, arr]) => {
      const d = new Date(Number(ms) + offset);
      const f = arr.a as Int32Array;
      const start = Date.UTC(d.getUTCFullYear(), 0, 1);
      const doy = Math.floor((d.getTime() - start) / 86400000) + 1;
      f[0] = 1;
      f[1] = d.getUTCFullYear();
      f[2] = d.getUTCMonth();
      f[3] = Math.floor((doy - 1) / 7) + 1;
      f[4] = Math.floor((d.getUTCDate() - 1) / 7) + 1;
      f[5] = d.getUTCDate();
      f[6] = doy;
      f[7] = d.getUTCDay() + 1;
      f[8] = Math.floor((d.getUTCDate() - 1) / 7) + 1;
      f[9] = d.getUTCHours() >= 12 ? 1 : 0;
      f[10] = d.getUTCHours() % 12;
      f[11] = d.getUTCHours();
      f[12] = d.getUTCMinutes();
      f[13] = d.getUTCSeconds();
      f[14] = d.getUTCMilliseconds();
      f[15] = offset;
      f[16] = 0;
    },
    'time([II)J': (_t, [arr, offset]) => {
      const f = arr.a as Int32Array;
      return BigInt(Date.UTC(f[1], f[2], f[5], f[11], f[12], f[13], f[14]) - offset);
    },
  });

  const bufs: Record<'out' | 'err', number[]> = { out: [], err: [] };
  const emit = (stream: 'out' | 'err') => {
    const bytes = bufs[stream];
    if (bytes.length === 0) return;
    vm.print(stream, decodeBytes(new Uint8Array(bytes), 'UTF-8') ?? '');
    bytes.length = 0;
  };
  const write = (stream: 'out' | 'err', byte: number) => {
    if (byte === 10) emit(stream);
    else if (byte !== 13) bufs[stream].push(byte & 0xff);
  };
  const flushConsole = () => { emit('out'); emit('err'); };
  vm.exitListeners.push(flushConsole);
  vm.registerNatives('j2me4w/ConsoleOutputStream', {
    'write0(ZI)V': (_t, [err, v]) => write(err ? 'err' : 'out', v),
    'writeArray0(Z[BII)V': (_t, [err, arr, off, len]) => {
      if (arr === null) npe();
      const a = arr.a as Int8Array;
      if (off < 0 || len < 0 || off + len > a.length) vm.throwNew('java/lang/IndexOutOfBoundsException');
      const s = err ? 'err' : 'out';
      for (let i = 0; i < len; i++) write(s, a[off + i]);
    },
  });
}

function charsToString(a: Uint16Array, off: number, count: number): string {
  let s = '';
  for (let i = 0; i < count; i += 4096) {
    s += String.fromCharCode.apply(null, Array.from(a.subarray(off + i, off + Math.min(count, i + 4096))));
  }
  return s;
}

const DEFAULT_PROPERTIES: Record<string, string> = {
  'microedition.platform': 'j2me4w',
  'microedition.configuration': 'CLDC-1.1',
  'microedition.profiles': 'MIDP-2.0',
  'microedition.encoding': 'UTF-8',
  'microedition.locale': 'en-US',
  'microedition.jtwi.version': '1.0',
  'microedition.media.version': '1.1',
  'supports.mixing': 'false',
  'supports.audio.capture': 'false',
  'supports.video.capture': 'false',
  'supports.recording': 'false',
};
