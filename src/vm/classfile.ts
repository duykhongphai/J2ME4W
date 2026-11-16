// Parser for the Java .class file format (versions 45 - 52; J2ME uses 45-49).

export const enum Tag {
  Utf8 = 1,
  Integer = 3,
  Float = 4,
  Long = 5,
  Double = 6,
  Class = 7,
  String = 8,
  Fieldref = 9,
  Methodref = 10,
  InterfaceMethodref = 11,
  NameAndType = 12,
  MethodHandle = 15,
  MethodType = 16,
  InvokeDynamic = 18,
}

export const enum Acc {
  PUBLIC = 0x0001,
  PRIVATE = 0x0002,
  PROTECTED = 0x0004,
  STATIC = 0x0008,
  FINAL = 0x0010,
  SYNCHRONIZED = 0x0020,
  SUPER = 0x0020,
  VOLATILE = 0x0040,
  TRANSIENT = 0x0080,
  NATIVE = 0x0100,
  INTERFACE = 0x0200,
  ABSTRACT = 0x0400,
}

export type CPEntry =
  | { tag: Tag.Utf8; value: string }
  | { tag: Tag.Integer; value: number }
  | { tag: Tag.Float; value: number }
  | { tag: Tag.Long; value: bigint }
  | { tag: Tag.Double; value: number }
  | { tag: Tag.Class; nameIndex: number }
  | { tag: Tag.String; stringIndex: number }
  | { tag: Tag.Fieldref | Tag.Methodref | Tag.InterfaceMethodref; classIndex: number; natIndex: number }
  | { tag: Tag.NameAndType; nameIndex: number; descIndex: number }
  | { tag: Tag.MethodHandle | Tag.MethodType | Tag.InvokeDynamic }
  | null;

export interface ExceptionHandler {
  startPc: number;
  endPc: number;
  handlerPc: number;
  catchType: number; // cp index, 0 = any
}

export interface CodeAttr {
  maxStack: number;
  maxLocals: number;
  code: Uint8Array;
  handlers: ExceptionHandler[];
  lineNumbers: number[] | null; // flattened [startPc, line, ...]
}

export interface MemberInfo {
  access: number;
  name: string;
  desc: string;
  code: CodeAttr | null;
  constantValueIndex: number;
}

export interface ClassFile {
  major: number;
  cp: CPEntry[];
  access: number;
  thisClass: string;
  superClass: string | null;
  interfaces: string[];
  fields: MemberInfo[];
  methods: MemberInfo[];
  sourceFile: string | null;
}

export class ClassFormatError extends Error {}

/** Decodes the JVM's "modified UTF-8". */
export function decodeModifiedUtf8(b: Uint8Array, start: number, len: number): string {
  let out = '';
  let i = start;
  const end = start + len;
  // fast path for ASCII
  let ascii = true;
  for (let k = start; k < end; k++) if (b[k] === 0 || b[k] >= 0x80) { ascii = false; break; }
  if (ascii) {
    for (let k = start; k < end; k += 4096) {
      out += String.fromCharCode.apply(null, Array.from(b.subarray(k, Math.min(end, k + 4096))));
    }
    return out;
  }
  const codes: number[] = [];
  while (i < end) {
    const c = b[i];
    if (c < 0x80) { codes.push(c); i++; }
    else if ((c & 0xe0) === 0xc0) { codes.push(((c & 0x1f) << 6) | (b[i + 1] & 0x3f)); i += 2; }
    else { codes.push(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)); i += 3; }
  }
  for (let k = 0; k < codes.length; k += 4096) out += String.fromCharCode.apply(null, codes.slice(k, k + 4096));
  return out;
}

export function parseClassFile(bytes: Uint8Array): ClassFile {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u1 = () => bytes[p++];
  const u2 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u4 = () => { const v = dv.getUint32(p); p += 4; return v; };

  if (u4() !== 0xcafebabe) throw new ClassFormatError('bad magic');
  u2(); // minor
  const major = u2();
  const cpCount = u2();
  const cp: CPEntry[] = new Array(cpCount).fill(null);
  for (let i = 1; i < cpCount; i++) {
    const tag = u1() as Tag;
    switch (tag) {
      case Tag.Utf8: {
        const len = u2();
        cp[i] = { tag, value: decodeModifiedUtf8(bytes, p, len) };
        p += len;
        break;
      }
      case Tag.Integer: cp[i] = { tag, value: dv.getInt32(p) }; p += 4; break;
      case Tag.Float: cp[i] = { tag, value: dv.getFloat32(p) }; p += 4; break;
      case Tag.Long: cp[i] = { tag, value: dv.getBigInt64(p) }; p += 8; i++; break;
      case Tag.Double: cp[i] = { tag, value: dv.getFloat64(p) }; p += 8; i++; break;
      case Tag.Class: cp[i] = { tag, nameIndex: u2() }; break;
      case Tag.String: cp[i] = { tag, stringIndex: u2() }; break;
      case Tag.Fieldref:
      case Tag.Methodref:
      case Tag.InterfaceMethodref:
        cp[i] = { tag, classIndex: u2(), natIndex: u2() };
        break;
      case Tag.NameAndType: cp[i] = { tag, nameIndex: u2(), descIndex: u2() }; break;
      case Tag.MethodHandle: p += 3; cp[i] = { tag }; break;
      case Tag.MethodType: p += 2; cp[i] = { tag }; break;
      case Tag.InvokeDynamic: p += 4; cp[i] = { tag }; break;
      default:
        throw new ClassFormatError(`bad constant pool tag ${tag} at ${i}`);
    }
  }
  const utf8 = (i: number) => {
    const e = cp[i];
    if (!e || e.tag !== Tag.Utf8) throw new ClassFormatError(`cp ${i} is not Utf8`);
    return e.value;
  };
  const className = (i: number) => {
    const e = cp[i];
    if (!e || e.tag !== Tag.Class) throw new ClassFormatError(`cp ${i} is not Class`);
    return utf8(e.nameIndex);
  };

  const access = u2();
  const thisClass = className(u2());
  const superIdx = u2();
  const superClass = superIdx ? className(superIdx) : null;
  const ifCount = u2();
  const interfaces: string[] = [];
  for (let i = 0; i < ifCount; i++) interfaces.push(className(u2()));

  let sourceFile: string | null = null;

  const readMembers = (isMethod: boolean): MemberInfo[] => {
    const count = u2();
    const res: MemberInfo[] = [];
    for (let i = 0; i < count; i++) {
      const m: MemberInfo = { access: u2(), name: utf8(u2()), desc: utf8(u2()), code: null, constantValueIndex: 0 };
      const ac = u2();
      for (let a = 0; a < ac; a++) {
        const an = utf8(u2());
        const alen = u4();
        const aend = p + alen;
        if (isMethod && an === 'Code') {
          const maxStack = u2();
          const maxLocals = u2();
          const codeLen = u4();
          const code = bytes.slice(p, p + codeLen);
          p += codeLen;
          const hc = u2();
          const handlers: ExceptionHandler[] = [];
          for (let h = 0; h < hc; h++) handlers.push({ startPc: u2(), endPc: u2(), handlerPc: u2(), catchType: u2() });
          let lineNumbers: number[] | null = null;
          const cac = u2();
          for (let c = 0; c < cac; c++) {
            const cn = utf8(u2());
            const clen = u4();
            const cend = p + clen;
            if (cn === 'LineNumberTable') {
              const n = u2();
              lineNumbers = lineNumbers ?? [];
              for (let k = 0; k < n; k++) lineNumbers.push(u2(), u2());
            }
            p = cend;
          }
          m.code = { maxStack, maxLocals, code, handlers, lineNumbers };
        } else if (!isMethod && an === 'ConstantValue') {
          m.constantValueIndex = u2();
        }
        p = aend;
      }
      res.push(m);
    }
    return res;
  };

  const fields = readMembers(false);
  const methods = readMembers(true);
  const ac = u2();
  for (let a = 0; a < ac; a++) {
    const an = utf8(u2());
    const alen = u4();
    const aend = p + alen;
    if (an === 'SourceFile') sourceFile = utf8(u2());
    p = aend;
  }
  return { major, cp, access, thisClass, superClass, interfaces, fields, methods, sourceFile };
}
