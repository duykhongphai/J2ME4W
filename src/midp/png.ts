// Synchronous PNG decoder (all color types, bit depths, tRNS and Adam7 interlacing).
// Synchronous decoding lets Image.createImage() return immediately and gives exact pixels
// (no browser color management), which matters for getRGB()-based games.
import { inflateSync, unzlibSync } from 'fflate';
import { Surface } from './surface';

const ADAM7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
];

export function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

export function decodePng(data: Uint8Array): Surface | null {
  if (!isPng(data)) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let idatLen = 0;
  while (p + 8 <= data.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(data[p + 4], data[p + 5], data[p + 6], data[p + 7]);
    const body = data.subarray(p + 8, Math.min(data.length, p + 8 + len));
    p += 12 + len;
    if (type === 'IHDR') {
      w = dv.getUint32(body.byteOffset - data.byteOffset);
      h = dv.getUint32(body.byteOffset - data.byteOffset + 4);
      depth = body[8];
      ctype = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') { idat.push(body); idatLen += body.length; }
    else if (type === 'IEND') break;
  }
  if (!w || !h || w > 8192 || h > 8192) return null;
  const z = new Uint8Array(idatLen);
  let o = 0;
  for (const c of idat) { z.set(c, o); o += c.length; }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(z);
  } catch {
    try { raw = inflateSync(z.subarray(2)); } catch { return null; }
  }

  const channels = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 4 ? 2 : ctype === 6 ? 4 : 0;
  if (!channels) return null;
  const bitsPP = channels * depth;
  const bpp = Math.max(1, bitsPP >> 3);
  const out = new Surface(w, h, 0);
  const px = out.px;
  const maxV = (1 << depth) - 1;

  // transparency key
  let keyGray = -1, keyR = -1, keyG = -1, keyB = -1;
  if (trns && ctype === 0 && trns.length >= 2) keyGray = (trns[0] << 8) | trns[1];
  if (trns && ctype === 2 && trns.length >= 6) {
    keyR = (trns[0] << 8) | trns[1]; keyG = (trns[2] << 8) | trns[3]; keyB = (trns[4] << 8) | trns[5];
  }

  let rp = 0;
  const passes = interlace ? ADAM7 : [[0, 0, 1, 1]];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * bitsPP) / 8);
    let prev = new Uint8Array(stride);
    let cur = new Uint8Array(stride);
    for (let r = 0; r < ph; r++) {
      if (rp + 1 + stride > raw.length) return out;
      const ft = raw[rp++];
      cur.set(raw.subarray(rp, rp + stride));
      rp += stride;
      unfilter(ft, cur, prev, bpp);
      const y = y0 + r * dy;
      for (let c = 0; c < pw; c++) {
        const x = x0 + c * dx;
        let R: number, G: number, B: number, A = 255;
        if (depth === 16) {
          const i = c * channels * 2;
          const s = (k: number) => (cur[i + 2 * k] << 8) | cur[i + 2 * k + 1];
          if (ctype === 0) { const v = s(0); R = G = B = v >> 8; if (v === keyGray) A = 0; }
          else if (ctype === 2) { const r16 = s(0), g16 = s(1), b16 = s(2); R = r16 >> 8; G = g16 >> 8; B = b16 >> 8; if (r16 === keyR && g16 === keyG && b16 === keyB) A = 0; }
          else if (ctype === 4) { R = G = B = s(0) >> 8; A = s(1) >> 8; }
          else { R = s(0) >> 8; G = s(1) >> 8; B = s(2) >> 8; A = s(3) >> 8; }
        } else if (depth === 8) {
          const i = c * channels;
          if (ctype === 0) { R = G = B = cur[i]; if (cur[i] === keyGray) A = 0; }
          else if (ctype === 2) { R = cur[i]; G = cur[i + 1]; B = cur[i + 2]; if (R === keyR && G === keyG && B === keyB) A = 0; }
          else if (ctype === 3) {
            const idx = cur[i];
            if (!palette || idx * 3 + 2 >= palette.length) { R = G = B = 0; }
            else { R = palette[idx * 3]; G = palette[idx * 3 + 1]; B = palette[idx * 3 + 2]; }
            if (trns && idx < trns.length) A = trns[idx];
          } else if (ctype === 4) { R = G = B = cur[i]; A = cur[i + 1]; }
          else { R = cur[i]; G = cur[i + 1]; B = cur[i + 2]; A = cur[i + 3]; }
        } else {
          // 1, 2, 4 bit gray or palette
          const bit = c * depth;
          const v = (cur[bit >> 3] >> (8 - depth - (bit & 7))) & maxV;
          if (ctype === 3) {
            if (!palette || v * 3 + 2 >= palette.length) { R = G = B = 0; }
            else { R = palette[v * 3]; G = palette[v * 3 + 1]; B = palette[v * 3 + 2]; }
            if (trns && v < trns.length) A = trns[v];
          } else {
            R = G = B = Math.round((v * 255) / maxV);
            if (v === keyGray) A = 0;
          }
        }
        px[y * w + x] = ((A << 24) | (B << 16) | (G << 8) | R) >>> 0;
      }
      const t = prev; prev = cur; cur = t;
    }
  }
  return out;
}

function unfilter(ft: number, cur: Uint8Array, prev: Uint8Array, bpp: number): void {
  const n = cur.length;
  switch (ft) {
    case 0: return;
    case 1: for (let i = bpp; i < n; i++) cur[i] = (cur[i] + cur[i - bpp]) & 0xff; return;
    case 2: for (let i = 0; i < n; i++) cur[i] = (cur[i] + prev[i]) & 0xff; return;
    case 3:
      for (let i = 0; i < n; i++) cur[i] = (cur[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1)) & 0xff;
      return;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        cur[i] = (cur[i] + pred) & 0xff;
      }
      return;
  }
}
