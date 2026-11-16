// Bytecode interpreter. Non-recursive: Java calls push frames on the thread's own stack,
// so a thread can be suspended at any instruction boundary (green threads).
import { Frame, JArray, JClass, JMethod, JObject, JThread, ThreadState, TOP } from './model';
import { FRAMES_PUSHED, JavaThrow, RETRY, SUSPEND, YIELD, type VM } from './vm';

const INT_MIN = -2147483648;
const LONG_MAX = 0x7fffffffffffffffn;
const LONG_MIN = -0x8000000000000000n;

function f2i(v: number): number {
  if (v !== v) return 0;
  if (v >= 2147483647) return 2147483647;
  if (v <= INT_MIN) return INT_MIN;
  return v | 0;
}

function f2l(v: number): bigint {
  if (v !== v) return 0n;
  if (v >= 9223372036854775807) return LONG_MAX;
  if (v <= -9223372036854775808) return LONG_MIN;
  return BigInt(Math.trunc(v));
}

const s8 = (v: number) => (v << 24) >> 24;
const s16 = (v: number) => (v << 16) >> 16;

/**
 * Runs thread `t` for up to `budget` instructions, or until it blocks or finishes.
 */
export function execute(vm: VM, t: JThread, budget: number): void {
  // Resume bookkeeping for a thread coming back from Object.wait / a suspended native.
  if (t.reacquire) {
    const { mon, count } = t.reacquire;
    if (mon.owner === null) {
      mon.owner = t;
      mon.count = count;
      t.reacquire = null;
    } else {
      mon.entryQ.push(t);
      t.state = ThreadState.Blocked;
      return;
    }
  }
  if (t.pendingThrow) {
    const ex = t.pendingThrow;
    t.pendingThrow = null;
    t.hasPending = false;
    if (!throwInto(vm, t, ex, false)) return;
  } else if (t.hasPending) {
    const top = t.frames[t.frames.length - 1];
    top.stack.push(t.pending);
    if (t.pendingWide) top.stack.push(TOP);
    t.hasPending = false;
    t.pending = undefined;
  }

  outer: for (;;) {
    const f = t.frames[t.frames.length - 1];
    if (f === undefined) {
      vm.threadFinished(t);
      return;
    }
    const m = f.m;
    const code = m.code!;
    const stack = f.stack;
    const locals = f.locals;
    const cls = m.cls;
    let pc = f.pc;
    let opPc = pc;

    try {
      for (;;) {
        if (--budget < 0) {
          f.pc = pc;
          return;
        }
        opPc = pc;
        const op = code[pc++];
        switch (op) {
          case 0: break; // nop
          case 1: stack.push(null); break;
          case 2: case 3: case 4: case 5: case 6: case 7: case 8: stack.push(op - 3); break;
          case 9: stack.push(0n, TOP); break;
          case 10: stack.push(1n, TOP); break;
          case 11: stack.push(0); break;
          case 12: stack.push(1); break;
          case 13: stack.push(2); break;
          case 14: stack.push(0, TOP); break;
          case 15: stack.push(1, TOP); break;
          case 16: stack.push(s8(code[pc++])); break; // bipush
          case 17: stack.push(s16((code[pc] << 8) | code[pc + 1])); pc += 2; break; // sipush
          case 18: stack.push(vm.resolveConstant(cls, code[pc++])); break; // ldc
          case 19: stack.push(vm.resolveConstant(cls, (code[pc] << 8) | code[pc + 1])); pc += 2; break; // ldc_w
          case 20: stack.push(vm.resolveConstant(cls, (code[pc] << 8) | code[pc + 1]), TOP); pc += 2; break; // ldc2_w

          // loads
          case 21: case 23: case 25: stack.push(locals[code[pc++]]); break;
          case 22: case 24: stack.push(locals[code[pc++]], TOP); break;
          case 26: case 27: case 28: case 29: stack.push(locals[op - 26]); break;
          case 30: case 31: case 32: case 33: stack.push(locals[op - 30], TOP); break;
          case 34: case 35: case 36: case 37: stack.push(locals[op - 34]); break;
          case 38: case 39: case 40: case 41: stack.push(locals[op - 38], TOP); break;
          case 42: case 43: case 44: case 45: stack.push(locals[op - 42]); break;

          // array loads
          case 46: case 48: case 50: case 51: case 52: case 53: {
            const i = stack.pop();
            const a = stack.pop() as JArray;
            if (a === null) vm.throwNew('java/lang/NullPointerException');
            if (i >>> 0 >= a.a.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
            stack.push(a.a[i]);
            break;
          }
          case 47: case 49: {
            const i = stack.pop();
            const a = stack.pop() as JArray;
            if (a === null) vm.throwNew('java/lang/NullPointerException');
            if (i >>> 0 >= a.a.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
            stack.push(a.a[i], TOP);
            break;
          }

          // stores
          case 54: case 56: case 58: locals[code[pc++]] = stack.pop(); break;
          case 55: case 57: { stack.pop(); locals[code[pc++]] = stack.pop(); break; }
          case 59: case 60: case 61: case 62: locals[op - 59] = stack.pop(); break;
          case 63: case 64: case 65: case 66: stack.pop(); locals[op - 63] = stack.pop(); break;
          case 67: case 68: case 69: case 70: locals[op - 67] = stack.pop(); break;
          case 71: case 72: case 73: case 74: stack.pop(); locals[op - 71] = stack.pop(); break;
          case 75: case 76: case 77: case 78: locals[op - 75] = stack.pop(); break;

          // array stores
          case 79: case 81: case 84: case 85: case 86: {
            const v = stack.pop();
            const i = stack.pop();
            const a = stack.pop() as JArray;
            if (a === null) vm.throwNew('java/lang/NullPointerException');
            if (i >>> 0 >= a.a.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
            a.a[i] = v;
            break;
          }
          case 80: case 82: {
            stack.pop();
            const v = stack.pop();
            const i = stack.pop();
            const a = stack.pop() as JArray;
            if (a === null) vm.throwNew('java/lang/NullPointerException');
            if (i >>> 0 >= a.a.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
            a.a[i] = v;
            break;
          }
          case 83: { // aastore
            const v = stack.pop() as JObject | null;
            const i = stack.pop();
            const a = stack.pop() as JArray;
            if (a === null) vm.throwNew('java/lang/NullPointerException');
            if (i >>> 0 >= a.a.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException', String(i));
            if (v !== null) {
              const cc = a.cls.componentClass!;
              if (cc.name !== 'java/lang/Object' && !vm.isAssignable(v.cls, cc)) {
                vm.throwNew('java/lang/ArrayStoreException', v.cls.javaName);
              }
            }
            (a.a as any[])[i] = v;
            break;
          }

          // stack
          case 87: stack.pop(); break;
          case 88: stack.pop(); stack.pop(); break;
          case 89: stack.push(stack[stack.length - 1]); break;
          case 90: { const v1 = stack.pop(), v2 = stack.pop(); stack.push(v1, v2, v1); break; }
          case 91: { const v1 = stack.pop(), v2 = stack.pop(), v3 = stack.pop(); stack.push(v1, v3, v2, v1); break; }
          case 92: { const n = stack.length; stack.push(stack[n - 2], stack[n - 1]); break; }
          case 93: { const v1 = stack.pop(), v2 = stack.pop(), v3 = stack.pop(); stack.push(v2, v1, v3, v2, v1); break; }
          case 94: {
            const v1 = stack.pop(), v2 = stack.pop(), v3 = stack.pop(), v4 = stack.pop();
            stack.push(v2, v1, v4, v3, v2, v1);
            break;
          }
          case 95: { const v1 = stack.pop(), v2 = stack.pop(); stack.push(v1, v2); break; }

          // int arithmetic
          case 96: { const b = stack.pop(); stack.push((stack.pop() + b) | 0); break; }
          case 100: { const b = stack.pop(); stack.push((stack.pop() - b) | 0); break; }
          case 104: { const b = stack.pop(); stack.push(Math.imul(stack.pop(), b)); break; }
          case 108: {
            const b = stack.pop();
            if (b === 0) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            stack.push((stack.pop() / b) | 0);
            break;
          }
          case 112: {
            const b = stack.pop();
            if (b === 0) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            stack.push((stack.pop() % b) | 0);
            break;
          }
          case 116: stack.push(-stack.pop() | 0); break;
          case 120: { const b = stack.pop(); stack.push(stack.pop() << b); break; }
          case 122: { const b = stack.pop(); stack.push(stack.pop() >> b); break; }
          case 124: { const b = stack.pop(); stack.push((stack.pop() >>> b) | 0); break; }
          case 126: { const b = stack.pop(); stack.push(stack.pop() & b); break; }
          case 128: { const b = stack.pop(); stack.push(stack.pop() | b); break; }
          case 130: { const b = stack.pop(); stack.push(stack.pop() ^ b); break; }

          // long arithmetic
          case 97: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(BigInt.asIntN(64, stack.pop() + b), TOP); break; }
          case 101: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(BigInt.asIntN(64, (stack.pop() as bigint) - b), TOP); break; }
          case 105: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(BigInt.asIntN(64, (stack.pop() as bigint) * b), TOP); break; }
          case 109: {
            stack.pop(); const b = stack.pop(); stack.pop();
            if (b === 0n) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            stack.push(BigInt.asIntN(64, (stack.pop() as bigint) / b), TOP);
            break;
          }
          case 113: {
            stack.pop(); const b = stack.pop(); stack.pop();
            if (b === 0n) vm.throwNew('java/lang/ArithmeticException', '/ by zero');
            stack.push(stack.pop() % b, TOP);
            break;
          }
          case 117: { stack.pop(); stack.push(BigInt.asIntN(64, -(stack.pop() as bigint)), TOP); break; }
          case 121: { const s = stack.pop(); stack.pop(); stack.push(BigInt.asIntN(64, stack.pop() << BigInt(s & 63)), TOP); break; }
          case 123: { const s = stack.pop(); stack.pop(); stack.push(stack.pop() >> BigInt(s & 63), TOP); break; }
          case 125: {
            const s = stack.pop(); stack.pop();
            stack.push(BigInt.asIntN(64, BigInt.asUintN(64, stack.pop()) >> BigInt(s & 63)), TOP);
            break;
          }
          case 127: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() & b, TOP); break; }
          case 129: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() | b, TOP); break; }
          case 131: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() ^ b, TOP); break; }

          // float arithmetic
          case 98: { const b = stack.pop(); stack.push(Math.fround(stack.pop() + b)); break; }
          case 102: { const b = stack.pop(); stack.push(Math.fround(stack.pop() - b)); break; }
          case 106: { const b = stack.pop(); stack.push(Math.fround(stack.pop() * b)); break; }
          case 110: { const b = stack.pop(); stack.push(Math.fround(stack.pop() / b)); break; }
          case 114: { const b = stack.pop(); stack.push(Math.fround(stack.pop() % b)); break; }
          case 118: stack.push(-stack.pop()); break;

          // double arithmetic
          case 99: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() + b, TOP); break; }
          case 103: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() - b, TOP); break; }
          case 107: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() * b, TOP); break; }
          case 111: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() / b, TOP); break; }
          case 115: { stack.pop(); const b = stack.pop(); stack.pop(); stack.push(stack.pop() % b, TOP); break; }
          case 119: { stack.pop(); stack.push(-stack.pop(), TOP); break; }

          case 132: { // iinc
            const idx = code[pc++];
            locals[idx] = (locals[idx] + s8(code[pc++])) | 0;
            break;
          }

          // conversions
          case 133: stack.push(BigInt(stack.pop()), TOP); break; // i2l
          case 134: stack.push(Math.fround(stack.pop())); break; // i2f
          case 135: stack.push(stack.pop(), TOP); break; // i2d
          case 136: stack.pop(); stack.push(Number(BigInt.asIntN(32, stack.pop()))); break; // l2i
          case 137: stack.pop(); stack.push(Math.fround(Number(stack.pop()))); break; // l2f
          case 138: stack.pop(); stack.push(Number(stack.pop()), TOP); break; // l2d
          case 139: stack.push(f2i(stack.pop())); break; // f2i
          case 140: stack.push(f2l(stack.pop()), TOP); break; // f2l
          case 141: stack.push(stack.pop(), TOP); break; // f2d
          case 142: stack.pop(); stack.push(f2i(stack.pop())); break; // d2i
          case 143: stack.pop(); stack.push(f2l(stack.pop()), TOP); break; // d2l
          case 144: stack.pop(); stack.push(Math.fround(stack.pop())); break; // d2f
          case 145: stack.push(s8(stack.pop())); break; // i2b
          case 146: stack.push(stack.pop() & 0xffff); break; // i2c
          case 147: stack.push(s16(stack.pop())); break; // i2s

          // comparisons
          case 148: {
            stack.pop(); const b = stack.pop(); stack.pop(); const a = stack.pop();
            stack.push(a > b ? 1 : a < b ? -1 : 0);
            break;
          }
          case 149: case 150: {
            const b = stack.pop(), a = stack.pop();
            stack.push(a > b ? 1 : a < b ? -1 : a === b ? 0 : op === 149 ? -1 : 1);
            break;
          }
          case 151: case 152: {
            stack.pop(); const b = stack.pop(); stack.pop(); const a = stack.pop();
            stack.push(a > b ? 1 : a < b ? -1 : a === b ? 0 : op === 151 ? -1 : 1);
            break;
          }

          // branches
          case 153: if (stack.pop() === 0) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 154: if (stack.pop() !== 0) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 155: if (stack.pop() < 0) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 156: if (stack.pop() >= 0) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 157: if (stack.pop() > 0) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 158: if (stack.pop() <= 0) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 159: { const b = stack.pop(); if (stack.pop() === b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 160: { const b = stack.pop(); if (stack.pop() !== b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 161: { const b = stack.pop(); if (stack.pop() < b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 162: { const b = stack.pop(); if (stack.pop() >= b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 163: { const b = stack.pop(); if (stack.pop() > b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 164: { const b = stack.pop(); if (stack.pop() <= b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 165: { const b = stack.pop(); if (stack.pop() === b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 166: { const b = stack.pop(); if (stack.pop() !== b) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break; }
          case 167: pc = opPc + s16((code[pc] << 8) | code[pc + 1]); break; // goto
          case 168: stack.push(pc + 2); pc = opPc + s16((code[pc] << 8) | code[pc + 1]); break; // jsr
          case 169: pc = locals[code[pc]]; break; // ret
          case 170: { // tableswitch
            pc = (pc + 3) & ~3;
            const def = readS4(code, pc);
            const lo = readS4(code, pc + 4);
            const hi = readS4(code, pc + 8);
            const k = stack.pop();
            pc = k < lo || k > hi ? opPc + def : opPc + readS4(code, pc + 12 + (k - lo) * 4);
            break;
          }
          case 171: { // lookupswitch
            pc = (pc + 3) & ~3;
            const def = readS4(code, pc);
            const n = readS4(code, pc + 4);
            const k = stack.pop();
            let target = opPc + def;
            // pairs are sorted: binary search
            let lo = 0, hi = n - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              const mk = readS4(code, pc + 8 + mid * 8);
              if (mk === k) { target = opPc + readS4(code, pc + 12 + mid * 8); break; }
              if (mk < k) lo = mid + 1; else hi = mid - 1;
            }
            pc = target;
            break;
          }

          // returns
          case 172: case 174: case 176: case 173: case 175: case 177: {
            let rv: unknown;
            if (op === 177) rv = undefined;
            else if (op === 173 || op === 175) { stack.pop(); rv = stack.pop(); }
            else rv = stack.pop();
            if (f.lockObj) vm.monitorExit(t, f.lockObj);
            t.frames.pop();
            if (m.name === '<clinit>') vm.clinitDone(cls, true);
            const caller = t.frames[t.frames.length - 1];
            if (caller === undefined) {
              vm.threadFinished(t);
              return;
            }
            if (f.retOverride !== undefined) caller.stack.push(f.retOverride);
            else if (op !== 177) {
              caller.stack.push(rv);
              if (op === 173 || op === 175) caller.stack.push(TOP);
            }
            continue outer;
          }

          // fields
          case 178: { // getstatic
            const fld = vm.resolveField(cls, (code[pc] << 8) | code[pc + 1]);
            const fc = fld.cls;
            if (fc.state !== 2) {
              const r = vm.ensureInit(t, fc);
              if (r !== 0) { f.pc = opPc; if (r === 2) return; continue outer; }
            }
            pc += 2;
            stack.push(fc.statics[fld.slot]);
            if (fld.wide) stack.push(TOP);
            break;
          }
          case 179: { // putstatic
            const fld = vm.resolveField(cls, (code[pc] << 8) | code[pc + 1]);
            const fc = fld.cls;
            if (fc.state !== 2) {
              const r = vm.ensureInit(t, fc);
              if (r !== 0) { f.pc = opPc; if (r === 2) return; continue outer; }
            }
            pc += 2;
            if (fld.wide) stack.pop();
            fc.statics[fld.slot] = stack.pop();
            break;
          }
          case 180: { // getfield
            const fld = vm.resolveField(cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            const o = stack.pop() as JObject;
            if (o === null) vm.throwNew('java/lang/NullPointerException', `getfield ${fld.name}`);
            stack.push(o.f[fld.slot]);
            if (fld.wide) stack.push(TOP);
            break;
          }
          case 181: { // putfield
            const fld = vm.resolveField(cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            if (fld.wide) stack.pop();
            const v = stack.pop();
            const o = stack.pop() as JObject;
            if (o === null) vm.throwNew('java/lang/NullPointerException', `putfield ${fld.name}`);
            o.f[fld.slot] = v;
            break;
          }

          // invocation
          case 182: case 183: case 184: case 185: {
            const ref = vm.resolveMethod(cls, (code[pc] << 8) | code[pc + 1]);
            pc += op === 185 ? 4 : 2;
            let target: JMethod | null = ref;
            if (op === 184) {
              const tc = ref.cls;
              if (tc.state !== 2) {
                const r = vm.ensureInit(t, tc);
                if (r !== 0) { f.pc = opPc; if (r === 2) return; continue outer; }
              }
            } else {
              const recv = stack[stack.length - ref.argSlots] as JObject | null;
              if (recv === null || recv === undefined) {
                vm.throwNew('java/lang/NullPointerException', `${ref.cls.javaName}.${ref.name}`);
              }
              if (op === 183) {
                // invokespecial: super calls dispatch from the current class's superclass
                if (ref.name !== '<init>' && !ref.isPrivate && (cls.access & 0x0020) !== 0
                    && cls.superClass && cls !== ref.cls && cls.isSubclassOf(ref.cls)) {
                  target = cls.superClass.vlookup(ref.key) ?? ref;
                }
              } else if (!ref.isPrivate) {
                target = recv.cls.vlookup(ref.key);
                if (target === null) vm.throwNew('java/lang/AbstractMethodError', `${recv.cls.javaName}.${ref.name}${ref.desc}`);
              }
            }
            const tm = target!;
            if (tm.isAbstract) vm.throwNew('java/lang/AbstractMethodError', `${tm.cls.javaName}.${tm.name}${tm.desc}`);
            const nargs = tm.argSlots;

            if (tm.native !== null) {
              const raw = stack.splice(stack.length - nargs, nargs);
              let args = raw;
              if (tm.argIndex !== null) {
                args = [];
                for (const i of tm.argIndex) args.push(raw[i]);
              }
              f.pc = pc;
              const res = tm.native(t, args);
              if (res === SUSPEND) {
                if (t.state === ThreadState.Runnable) t.state = ThreadState.Blocked;
                return;
              }
              if (res === FRAMES_PUSHED) continue outer;
              if (res === YIELD) return;
              if (res === RETRY) {
                for (const v of raw) stack.push(v);
                f.pc = opPc;
                return;
              }
              if (tm.ret !== 'V') {
                stack.push(res);
                if (tm.retWide) stack.push(TOP);
              }
              if (t.state !== ThreadState.Runnable) return;
              break;
            }

            let lock: JObject | null = null;
            if (tm.isSync) {
              lock = tm.isStatic ? vm.classObject(tm.cls) : stack[stack.length - nargs];
              if (!vm.monitorEnter(t, lock!)) { f.pc = opPc; return; }
            }
            if (t.frames.length >= 3000) {
              if (lock) vm.monitorExit(t, lock);
              vm.throwNew('java/lang/StackOverflowError');
            }
            const nf = new Frame(tm, stack.splice(stack.length - nargs, nargs));
            nf.lockObj = lock;
            f.pc = pc;
            t.frames.push(nf);
            continue outer;
          }
          case 186: vm.throwNew('java/lang/InternalError', 'invokedynamic is not supported');

          case 187: { // new
            const c = vm.resolveClass(cls, (code[pc] << 8) | code[pc + 1]);
            if (c.state !== 2) {
              const r = vm.ensureInit(t, c);
              if (r !== 0) { f.pc = opPc; if (r === 2) return; continue outer; }
            }
            pc += 2;
            if (c.isInterface || (c.access & 0x0400) !== 0) vm.throwNew('java/lang/InstantiationError', c.javaName);
            stack.push(vm.newObject(c));
            break;
          }
          case 188: { // newarray
            const atype = code[pc++];
            stack.push(vm.newArray(NEWARRAY_TYPES[atype], stack.pop()));
            break;
          }
          case 189: { // anewarray
            const c = vm.resolveClass(cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            const n = stack.pop();
            stack.push(vm.newArray(c.isArray ? '[' + c.name : '[L' + c.name + ';', n));
            break;
          }
          case 190: { // arraylength
            const a = stack.pop() as JArray;
            if (a === null) vm.throwNew('java/lang/NullPointerException', 'arraylength');
            stack.push(a.a.length);
            break;
          }
          case 191: { // athrow
            const ex = stack.pop() as JObject;
            if (ex === null) vm.throwNew('java/lang/NullPointerException', 'throw null');
            throw new JavaThrow(ex);
          }
          case 192: { // checkcast
            const c = vm.resolveClass(cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            const o = stack[stack.length - 1] as JObject | null;
            if (o !== null && !vm.isAssignable(o.cls, c)) {
              vm.throwNew('java/lang/ClassCastException', `${o.cls.javaName} cannot be cast to ${c.javaName}`);
            }
            break;
          }
          case 193: { // instanceof
            const c = vm.resolveClass(cls, (code[pc] << 8) | code[pc + 1]);
            pc += 2;
            const o = stack.pop() as JObject | null;
            stack.push(o !== null && vm.isAssignable(o.cls, c) ? 1 : 0);
            break;
          }
          case 194: { // monitorenter
            const o = stack[stack.length - 1] as JObject | null;
            if (o === null) { stack.pop(); vm.throwNew('java/lang/NullPointerException', 'monitorenter'); }
            if (!vm.monitorEnter(t, o)) { f.pc = opPc; return; }
            stack.pop();
            break;
          }
          case 195: { // monitorexit
            const o = stack.pop() as JObject | null;
            if (o === null) vm.throwNew('java/lang/NullPointerException', 'monitorexit');
            vm.monitorExit(t, o);
            break;
          }
          case 196: { // wide
            const op2 = code[pc++];
            const idx = (code[pc] << 8) | code[pc + 1];
            pc += 2;
            switch (op2) {
              case 21: case 23: case 25: stack.push(locals[idx]); break;
              case 22: case 24: stack.push(locals[idx], TOP); break;
              case 54: case 56: case 58: locals[idx] = stack.pop(); break;
              case 55: case 57: stack.pop(); locals[idx] = stack.pop(); break;
              case 132: locals[idx] = (locals[idx] + s16((code[pc] << 8) | code[pc + 1])) | 0; pc += 2; break;
              case 169: pc = locals[idx]; break;
              default: throw new Error(`bad wide opcode ${op2}`);
            }
            break;
          }
          case 197: { // multianewarray
            const c = vm.resolveClass(cls, (code[pc] << 8) | code[pc + 1]);
            const dims = code[pc + 2];
            pc += 3;
            const counts = stack.splice(stack.length - dims, dims) as number[];
            for (const n of counts) if (n < 0) vm.throwNew('java/lang/NegativeArraySizeException', String(n));
            stack.push(vm.newMultiArray(c.name, counts));
            break;
          }
          case 198: if (stack.pop() === null) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 199: if (stack.pop() !== null) pc = opPc + s16((code[pc] << 8) | code[pc + 1]); else pc += 2; break;
          case 200: pc = opPc + readS4(code, pc); break; // goto_w
          case 201: stack.push(pc + 4); pc = opPc + readS4(code, pc); break; // jsr_w
          default:
            throw new Error(`unknown opcode ${op} at ${cls.name}.${m.name}${m.desc}:${opPc}`);
        }
      }
    } catch (e) {
      if (!(e instanceof JavaThrow)) {
        f.pc = opPc;
        throw e;
      }
      // the faulting frame may not be the top one if a native pushed frames before throwing
      if (t.frames[t.frames.length - 1] === f) f.pc = opPc;
      if (!throwInto(vm, t, e.ex, true)) return;
      continue outer;
    }
  }
}

/**
 * Unwinds `t` until a handler for `ex` is found.
 * `exactTop`: the top frame's pc points at the faulting instruction (otherwise it points after an invoke).
 * Returns false if the thread died from an uncaught exception.
 */
export function throwInto(vm: VM, t: JThread, ex: JObject, exactTop: boolean): boolean {
  let first = true;
  for (;;) {
    const f = t.frames[t.frames.length - 1];
    if (f === undefined) {
      uncaught(vm, t, ex);
      return false;
    }
    const pc = first && exactTop ? f.pc : f.pc - 1;
    first = false;
    for (const h of f.m.handlers) {
      if (pc < h.startPc || pc >= h.endPc) continue;
      if (h.catchType !== 0) {
        let c: JClass;
        try {
          c = vm.resolveClass(f.m.cls, h.catchType);
        } catch {
          continue;
        }
        if (!vm.isAssignable(ex.cls, c)) continue;
      }
      f.stack.length = 0;
      f.stack.push(ex);
      f.pc = h.handlerPc;
      return true;
    }
    if (f.lockObj) {
      try { vm.monitorExit(t, f.lockObj); } catch { /* ignore */ }
    }
    if (f.m.name === '<clinit>') vm.clinitDone(f.m.cls, false);
    t.frames.pop();
  }
}

function uncaught(vm: VM, t: JThread, ex: JObject): void {
  vm.print('err', `Uncaught exception in thread "${t.name}": ${vm.describeThrowable(ex)}`);
  const trace: string[] = ex.nat?.trace ?? [];
  for (const l of trace) vm.print('err', '    at ' + l);
  vm.threadFinished(t);
}

function readS4(code: Uint8Array, p: number): number {
  return (code[p] << 24) | (code[p + 1] << 16) | (code[p + 2] << 8) | code[p + 3];
}

const NEWARRAY_TYPES: Record<number, string> = {
  4: '[Z', 5: '[C', 6: '[F', 7: '[D', 8: '[B', 9: '[S', 10: '[I', 11: '[J',
};
