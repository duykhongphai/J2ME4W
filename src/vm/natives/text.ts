// Text helpers: charset encode/decode and Java-compatible number formatting/parsing.

const utf8Enc = new TextEncoder();
const singleByteTables = new Map<string, Map<number, number> | null>();

export const DEFAULT_ENCODING = 'UTF-8';

function normalizeEncoding(enc: string | null): string {
  const e = (enc ?? DEFAULT_ENCODING).trim().toLowerCase().replace(/_/g, '-');
  switch (e) {
    case 'utf8': return 'utf-8';
    case 'iso8859-1': case 'iso-8859-1': case 'latin1': case 'iso8859-1-': return 'iso-8859-1';
    case 'us-ascii': case 'ascii': return 'us-ascii';
    case 'cp1251': case 'windows-1251': return 'windows-1251';
    case 'cp1252': case 'windows-1252': return 'windows-1252';
    case 'utf-16be': case 'utf-16': return 'utf-16be';
    default: return e;
  }
}

/** Decodes bytes; returns null for unsupported encodings. */
export function decodeBytes(bytes: Uint8Array, enc: string | null): string | null {
  const e = normalizeEncoding(enc);
  if (e === 'iso-8859-1' || e === 'us-ascii') {
    let s = '';
    for (let i = 0; i < bytes.length; i += 4096) {
      s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 4096)));
    }
    return s;
  }
  try {
    return new TextDecoder(e).decode(bytes);
  } catch {
    return null;
  }
}

/** Encodes a string; returns null for unsupported encodings. */
export function encodeString(s: string, enc: string | null): Uint8Array | null {
  const e = normalizeEncoding(enc);
  if (e === 'utf-8') return utf8Enc.encode(s);
  if (e === 'iso-8859-1' || e === 'us-ascii') {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out[i] = c < 256 ? c : 63;
    }
    return out;
  }
  if (e === 'utf-16be') {
    const out = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) { out[2 * i] = s.charCodeAt(i) >> 8; out[2 * i + 1] = s.charCodeAt(i) & 0xff; }
    return out;
  }
  // single-byte charsets: build a reverse table from the decoder
  let table = singleByteTables.get(e);
  if (table === undefined) {
    table = null;
    try {
      const dec = new TextDecoder(e);
      const all = new Uint8Array(256).map((_, i) => i);
      const chars = dec.decode(all);
      if (chars.length === 256) {
        table = new Map();
        for (let i = 0; i < 256; i++) table.set(chars.charCodeAt(i), i);
      }
    } catch { /* unsupported */ }
    singleByteTables.set(e, table);
  }
  if (!table) return null;
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = table.get(s.charCodeAt(i)) ?? 63;
  return out;
}

/** Java's Double.toString / Float.toString formatting. */
export function javaFloatingToString(v: number, isFloat: boolean): string {
  if (v !== v) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  let exp: string;
  if (isFloat) {
    let p = 1;
    for (; p < 9; p++) if (Math.fround(Number(v.toPrecision(p))) === v) break;
    exp = v.toExponential(p - 1);
  } else {
    exp = v.toExponential();
  }
  // exp looks like "-1.2345e+3"
  const neg = exp[0] === '-';
  if (neg) exp = exp.slice(1);
  const ei = exp.indexOf('e');
  const digits = exp.slice(0, ei).replace('.', '');
  const e = parseInt(exp.slice(ei + 1), 10);
  const abs = Math.abs(v);
  let out: string;
  if (abs >= 1e-3 && abs < 1e7) {
    if (e >= 0) {
      const intPart = digits.slice(0, e + 1).padEnd(e + 1, '0');
      const frac = digits.slice(e + 1);
      out = intPart + '.' + (frac.length ? frac : '0');
    } else {
      out = '0.' + '0'.repeat(-e - 1) + digits;
    }
  } else {
    out = digits[0] + '.' + (digits.length > 1 ? digits.slice(1) : '0') + 'E' + e;
  }
  return neg ? '-' + out : out;
}

const FLOAT_RE = /^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?)$/;

/** Java Double.parseDouble semantics; returns null if invalid. */
export function parseJavaDouble(s: string): number | null {
  const t = s.trim();
  if (!FLOAT_RE.test(t)) return null;
  const clean = t.replace(/[fFdD]$/, '');
  const v = Number(clean);
  return Number.isNaN(v) && !clean.endsWith('NaN') ? null : v;
}

/** Integer/Long.parseX semantics. Returns null on error. */
export function parseJavaInteger(s: string, radix: number, bits: 32 | 64): bigint | null {
  if (radix < 2 || radix > 36 || s.length === 0) return null;
  let i = 0;
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    i = 1;
    if (s.length === 1) return null;
  }
  const r = BigInt(radix);
  let v = 0n;
  for (; i < s.length; i++) {
    const d = digitValue(s.charCodeAt(i));
    if (d < 0 || d >= radix) return null;
    v = v * r + BigInt(d);
  }
  if (neg) v = -v;
  const min = bits === 32 ? -2147483648n : -9223372036854775808n;
  const max = bits === 32 ? 2147483647n : 9223372036854775807n;
  if (v < min || v > max) return null;
  return v;
}

function digitValue(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 122) return c - 87;
  if (c >= 65 && c <= 90) return c - 55;
  if (c >= 0xff10 && c <= 0xff19) return c - 0xff10; // fullwidth digits
  return -1;
}
