// Software rasterizer implementing MIDP Graphics semantics on a 32-bit pixel buffer.
// Pixels are stored in canvas ImageData order (little-endian uint32 = 0xAABBGGRR),
// so presenting a surface is a straight copy into an ImageData.

/** 0xAARRGGBB (Java) <-> 0xAABBGGRR (internal). The swap is its own inverse. */
export function swapRB(c: number): number {
  return ((c & 0xff00ff00) | ((c >>> 16) & 0xff) | ((c & 0xff) << 16)) >>> 0;
}

export class Surface {
  readonly px: Uint32Array;
  /** Incremented on every modification (used by hosts to skip redundant presents). */
  version = 0;
  /**
   * When set, drawing into this surface is skipped. Used for display surfaces of sessions running
   * in the background, so hidden games only run their logic.
   */
  skipDraw = false;
  constructor(public readonly w: number, public readonly h: number, fill = 0xffffffff) {
    this.px = new Uint32Array(w * h);
    if (fill) this.px.fill(fill);
  }

  clone(): Surface {
    const s = new Surface(this.w, this.h, 0);
    s.px.set(this.px);
    return s;
  }
}

export interface FontSpec { face: number; style: number; size: number }

export interface Glyph {
  /** Coverage mask (0-255), `w * h`. */
  mask: Uint8Array;
  w: number;
  h: number;
  /** Offset of the mask's top-left relative to the pen position on the text's top line. */
  ox: number;
  oy: number;
  advance: number;
}

export interface FontRenderer {
  height(f: FontSpec): number;
  ascent(f: FontSpec): number;
  stringWidth(f: FontSpec, s: string): number;
  glyph(f: FontSpec, ch: string): Glyph;
}

// Anchor constants
const HCENTER = 1, VCENTER = 2, LEFT = 4, RIGHT = 8, TOP = 16, BOTTOM = 32, BASELINE = 64;

export class GraphicsState {
  tx = 0;
  ty = 0;
  /** Clip rectangle in surface coordinates (may extend outside the surface). */
  cx = 0;
  cy = 0;
  cw: number;
  ch: number;
  /** Current color as Java ARGB. */
  color = 0xff000000;
  stroke = 0;
  font: FontSpec = { face: 0, style: 0, size: 0 };

  constructor(public surf: Surface, public fonts: FontRenderer) {
    this.cw = surf.w;
    this.ch = surf.h;
  }

  // ---------------------------------------------------------------- clip helpers
  /** Effective clip intersected with the surface: [x0, y0, x1, y1) */
  private clipBox(): [number, number, number, number] {
    const s = this.surf;
    return [
      Math.max(0, this.cx), Math.max(0, this.cy),
      Math.min(s.w, this.cx + this.cw), Math.min(s.h, this.cy + this.ch),
    ];
  }

  setClip(x: number, y: number, w: number, h: number): void {
    this.cx = x + this.tx;
    this.cy = y + this.ty;
    this.cw = Math.max(0, w);
    this.ch = Math.max(0, h);
  }

  clipRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(this.cx, x + this.tx);
    const y0 = Math.max(this.cy, y + this.ty);
    const x1 = Math.min(this.cx + this.cw, x + this.tx + w);
    const y1 = Math.min(this.cy + this.ch, y + this.ty + h);
    this.cx = x0;
    this.cy = y0;
    this.cw = Math.max(0, x1 - x0);
    this.ch = Math.max(0, y1 - y0);
  }

  // ---------------------------------------------------------------- pixel ops
  private get colorInternal(): number { return swapRB(this.color); }

  /** Fills [x0,x1) x [y0,y1) (surface coords, unclipped) with the current color. */
  private fillSpan(x0: number, y0: number, x1: number, y1: number): void {
    const [bx0, by0, bx1, by1] = this.clipBox();
    if (x0 < bx0) x0 = bx0;
    if (y0 < by0) y0 = by0;
    if (x1 > bx1) x1 = bx1;
    if (y1 > by1) y1 = by1;
    if (x0 >= x1 || y0 >= y1) return;
    const s = this.surf;
    const c = this.colorInternal;
    const a = c >>> 24;
    const px = s.px;
    if (a === 255) {
      for (let y = y0; y < y1; y++) px.fill(c, y * s.w + x0, y * s.w + x1);
    } else if (a !== 0) {
      for (let y = y0; y < y1; y++) {
        for (let i = y * s.w + x0, e = y * s.w + x1; i < e; i++) px[i] = blend(px[i], c, a);
      }
    }
    s.version++;
  }

  private plot(x: number, y: number, bx0: number, by0: number, bx1: number, by1: number, c: number): void {
    if (x < bx0 || y < by0 || x >= bx1 || y >= by1) return;
    const s = this.surf;
    const a = c >>> 24;
    const i = y * s.w + x;
    s.px[i] = a === 255 ? c : blend(s.px[i], c, a);
  }

  // ---------------------------------------------------------------- primitives
  fillRect(x: number, y: number, w: number, h: number): void {
    if (this.surf.skipDraw) return;
    if (w <= 0 || h <= 0) return;
    x += this.tx; y += this.ty;
    this.fillSpan(x, y, x + w, y + h);
  }

  drawRect(x: number, y: number, w: number, h: number): void {
    if (this.surf.skipDraw) return;
    if (w < 0 || h < 0) return;
    if (this.stroke !== 0) {
      this.drawLine(x, y, x + w, y); this.drawLine(x + w, y, x + w, y + h);
      this.drawLine(x, y + h, x + w, y + h); this.drawLine(x, y, x, y + h);
      return;
    }
    x += this.tx; y += this.ty;
    if (w === 0 || h === 0) { this.fillSpan(x, y, x + w + 1, y + h + 1); return; }
    this.fillSpan(x, y, x + w + 1, y + 1);
    this.fillSpan(x, y + h, x + w + 1, y + h + 1);
    this.fillSpan(x, y + 1, x + 1, y + h);
    this.fillSpan(x + w, y + 1, x + w + 1, y + h);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    if (this.surf.skipDraw) return;
    x1 += this.tx; y1 += this.ty; x2 += this.tx; y2 += this.ty;
    if (this.stroke === 0) {
      if (y1 === y2) { this.fillSpan(Math.min(x1, x2), y1, Math.max(x1, x2) + 1, y1 + 1); return; }
      if (x1 === x2) { this.fillSpan(x1, Math.min(y1, y2), x1 + 1, Math.max(y1, y2) + 1); return; }
    }
    const [bx0, by0, bx1, by1] = this.clipBox();
    const c = this.colorInternal;
    let dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    let n = 0;
    for (;;) {
      if (this.stroke === 0 || (n++ & 3) < 2) this.plot(x1, y1, bx0, by0, bx1, by1, c);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
    this.surf.version++;
  }

  /** Scanline polygon fill (even-odd, pixel centers). Points in translated coordinates. */
  fillPolygon(xs: number[], ys: number[]): void {
    if (this.surf.skipDraw) return;
    const n = xs.length;
    if (n < 3) return;
    const X = xs.map((v) => v + this.tx), Y = ys.map((v) => v + this.ty);
    const [bx0, by0, bx1, by1] = this.clipBox();
    let minY = Infinity, maxY = -Infinity;
    for (const v of Y) { if (v < minY) minY = v; if (v > maxY) maxY = v; }
    minY = Math.max(minY, by0);
    maxY = Math.min(maxY, by1 - 1);
    const nodes: number[] = [];
    for (let y = minY; y <= maxY; y++) {
      const cy = y + 0.5;
      nodes.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = Y[i], yj = Y[j];
        if ((yi <= cy && yj > cy) || (yj <= cy && yi > cy)) {
          nodes.push(X[i] + ((cy - yi) / (yj - yi)) * (X[j] - X[i]));
        }
      }
      nodes.sort((a, b) => a - b);
      for (let k = 0; k + 1 < nodes.length; k += 2) {
        const xa = Math.max(bx0, Math.ceil(nodes[k] - 0.5));
        const xb = Math.min(bx1, Math.ceil(nodes[k + 1] - 0.5));
        if (xb > xa) this.fillSpan(xa, y, xb, y + 1);
      }
    }
    // Include edges so thin triangles stay visible, like most phone implementations.
    for (let i = 0, j = n - 1; i < n; j = i++) this.drawLine(xs[j], ys[j], xs[i], ys[i]);
  }

  drawPolygon(xs: number[], ys: number[]): void {
    for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) this.drawLine(xs[j], ys[j], xs[i], ys[i]);
  }

  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.fillPolygon([x1, x2, x3], [y1, y2, y3]);
  }

  /** Arc test helper: is angle (deg, CCW from 3 o'clock) within [start, start+extent]? */
  private static inArc(ang: number, start: number, extent: number): boolean {
    if (extent >= 360 || extent <= -360) return true;
    if (extent < 0) { start += extent; extent = -extent; }
    start = ((start % 360) + 360) % 360;
    let d = ang - start;
    d = ((d % 360) + 360) % 360;
    return d <= extent;
  }

  fillArc(x: number, y: number, w: number, h: number, start: number, extent: number): void {
    if (this.surf.skipDraw) return;
    if (w <= 0 || h <= 0 || extent === 0) return;
    x += this.tx; y += this.ty;
    const [bx0, by0, bx1, by1] = this.clipBox();
    const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    const c = this.colorInternal;
    const full = extent >= 360 || extent <= -360;
    for (let py = Math.max(by0, y); py < Math.min(by1, y + h); py++) {
      const dy = (py + 0.5 - cy) / ry;
      for (let px = Math.max(bx0, x); px < Math.min(bx1, x + w); px++) {
        const dx = (px + 0.5 - cx) / rx;
        if (dx * dx + dy * dy > 1) continue;
        if (!full) {
          const ang = (Math.atan2(-dy * ry, dx * rx) * 180) / Math.PI;
          if (!GraphicsState.inArc(ang < 0 ? ang + 360 : ang, start, extent)) continue;
        }
        this.plot(px, py, bx0, by0, bx1, by1, c);
      }
    }
    this.surf.version++;
  }

  drawArc(x: number, y: number, w: number, h: number, start: number, extent: number): void {
    if (this.surf.skipDraw) return;
    if (w < 0 || h < 0 || extent === 0) return;
    const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    const steps = Math.max(8, Math.ceil((Math.abs(extent) / 360) * Math.PI * (rx + ry)));
    const s = start;
    let e = extent;
    if (e > 360) e = 360;
    if (e < -360) e = -360;
    let px = 0, py = 0;
    for (let i = 0; i <= steps; i++) {
      const a = ((s + (e * i) / steps) * Math.PI) / 180;
      const nx = Math.round(cx + Math.cos(a) * rx), ny = Math.round(cy - Math.sin(a) * ry);
      if (i > 0) this.drawLine(px, py, nx, ny);
      px = nx; py = ny;
    }
  }

  fillRoundRect(x: number, y: number, w: number, h: number, aw: number, ah: number): void {
    if (this.surf.skipDraw) return;
    if (w <= 0 || h <= 0) return;
    aw = Math.min(Math.abs(aw), w); ah = Math.min(Math.abs(ah), h);
    if (aw === 0 || ah === 0) { this.fillRect(x, y, w, h); return; }
    const rx = aw / 2, ry = ah / 2;
    for (let j = 0; j < h; j++) {
      let inset = 0;
      const yc = j + 0.5;
      if (yc < ry) { const d = (ry - yc) / ry; inset = rx - rx * Math.sqrt(Math.max(0, 1 - d * d)); }
      else if (yc > h - ry) { const d = (yc - (h - ry)) / ry; inset = rx - rx * Math.sqrt(Math.max(0, 1 - d * d)); }
      const i0 = Math.round(inset);
      if (w - 2 * i0 > 0) this.fillRect(x + i0, y + j, w - 2 * i0, 1);
    }
  }

  drawRoundRect(x: number, y: number, w: number, h: number, aw: number, ah: number): void {
    if (this.surf.skipDraw) return;
    if (w < 0 || h < 0) return;
    aw = Math.min(Math.abs(aw), w); ah = Math.min(Math.abs(ah), h);
    if (aw === 0 || ah === 0) { this.drawRect(x, y, w, h); return; }
    const rx = Math.floor(aw / 2), ry = Math.floor(ah / 2);
    this.drawLine(x + rx, y, x + w - rx, y);
    this.drawLine(x + rx, y + h, x + w - rx, y + h);
    this.drawLine(x, y + ry, x, y + h - ry);
    this.drawLine(x + w, y + ry, x + w, y + h - ry);
    this.drawArc(x, y, aw, ah, 90, 90);
    this.drawArc(x + w - aw, y, aw, ah, 0, 90);
    this.drawArc(x, y + h - ah, aw, ah, 180, 90);
    this.drawArc(x + w - aw, y + h - ah, aw, ah, 270, 90);
  }

  // ---------------------------------------------------------------- images
  /**
   * Draws a region of `src` with a Sprite transform. (x, y) and anchor are in translated coordinates.
   */
  drawRegion(src: Surface, sx: number, sy: number, w: number, h: number, transform: number,
             x: number, y: number, anchor: number, exactCopy = false): void {
    if (this.surf.skipDraw) return;
    if (w <= 0 || h <= 0) return;
    const swap = (transform & 4) !== 0;
    const W = swap ? h : w, H = swap ? w : h;
    if (anchor === 0) anchor = TOP | LEFT;
    if (anchor & HCENTER) x -= W >> 1; else if (anchor & RIGHT) x -= W;
    if (anchor & VCENTER) y -= H >> 1; else if (anchor & BOTTOM) y -= H;
    x += this.tx; y += this.ty;
    const [bx0, by0, bx1, by1] = this.clipBox();
    const u0 = Math.max(0, bx0 - x), v0 = Math.max(0, by0 - y);
    const u1 = Math.min(W, bx1 - x), v1 = Math.min(H, by1 - y);
    if (u0 >= u1 || v0 >= v1) return;
    // source coordinate as affine function of dest (u, v)
    let ax = 1, bx = 0, cx = 0, ay = 0, by = 1, cy = 0;
    switch (transform) {
      case 0: break;
      case 2: ax = -1; cx = w - 1; break; // MIRROR
      case 1: by = -1; cy = h - 1; break; // MIRROR_ROT180
      case 3: ax = -1; cx = w - 1; by = -1; cy = h - 1; break; // ROT180
      case 5: ax = 0; bx = 1; ay = -1; by = 0; cy = h - 1; break; // ROT90
      case 6: ax = 0; bx = -1; cx = w - 1; ay = 1; by = 0; break; // ROT270
      case 7: ax = 0; bx = -1; cx = w - 1; ay = -1; by = 0; cy = h - 1; break; // MIRROR_ROT90
      case 4: ax = 0; bx = 1; ay = 1; by = 0; break; // MIRROR_ROT270
    }
    let sp = src.px;
    if (src === this.surf) sp = sp.slice();
    const sw = src.w;
    const dst = this.surf.px, dw = this.surf.w;
    for (let v = v0; v < v1; v++) {
      let di = (y + v) * dw + x + u0;
      let srcX = ax * u0 + bx * v + cx, srcY = ay * u0 + by * v + cy;
      for (let u = u0; u < u1; u++, di++, srcX += ax, srcY += ay) {
        const p = sp[(sy + srcY) * sw + sx + srcX];
        const a = p >>> 24;
        if (exactCopy || a === 255) dst[di] = p;
        else if (a !== 0) dst[di] = blend(dst[di], p, a);
      }
    }
    this.surf.version++;
  }

  drawImage(src: Surface, x: number, y: number, anchor: number): void {
    this.drawRegion(src, 0, 0, src.w, src.h, 0, x, y, anchor);
  }

  /** rgb is Java ARGB ints. */
  drawRGB(rgb: Int32Array, offset: number, scan: number, x: number, y: number, w: number, h: number, alpha: boolean): void {
    if (this.surf.skipDraw) return;
    if (w <= 0 || h <= 0) return;
    x += this.tx; y += this.ty;
    const [bx0, by0, bx1, by1] = this.clipBox();
    const dst = this.surf.px, dw = this.surf.w;
    for (let j = Math.max(0, by0 - y); j < Math.min(h, by1 - y); j++) {
      const row = offset + j * scan;
      for (let i = Math.max(0, bx0 - x); i < Math.min(w, bx1 - x); i++) {
        const p = swapRB(rgb[row + i]);
        const di = (y + j) * dw + x + i;
        const a = p >>> 24;
        if (!alpha || a === 255) dst[di] = (p | 0xff000000) >>> 0;
        else if (a !== 0) dst[di] = blend(dst[di], p, a);
      }
    }
    this.surf.version++;
  }

  copyArea(sx: number, sy: number, w: number, h: number, dx: number, dy: number, anchor: number): void {
    if (this.surf.skipDraw) return;
    const tmp = new Surface(w, h, 0);
    const s = this.surf;
    const ox = sx + this.tx, oy = sy + this.ty;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const X = ox + i, Y = oy + j;
        if (X >= 0 && Y >= 0 && X < s.w && Y < s.h) tmp.px[j * w + i] = s.px[Y * s.w + X];
      }
    }
    this.drawRegion(tmp, 0, 0, w, h, 0, dx, dy, anchor, true);
  }

  // ---------------------------------------------------------------- text
  drawString(str: string, x: number, y: number, anchor: number): void {
    if (this.surf.skipDraw) return;
    const fr = this.fonts;
    const f = this.font;
    if (anchor === 0) anchor = TOP | LEFT;
    const width = fr.stringWidth(f, str);
    if (anchor & HCENTER) x -= width >> 1; else if (anchor & RIGHT) x -= width;
    if (anchor & BASELINE) y -= fr.ascent(f); else if (anchor & BOTTOM) y -= fr.height(f);
    x += this.tx; y += this.ty;
    const [bx0, by0, bx1, by1] = this.clipBox();
    const c = this.colorInternal;
    const ca = c >>> 24;
    const dst = this.surf.px, dw = this.surf.w;
    let pen = x;
    for (const ch of str) {
      const g = fr.glyph(f, ch);
      const gx = pen + g.ox, gy = y + g.oy;
      for (let j = Math.max(0, by0 - gy); j < Math.min(g.h, by1 - gy); j++) {
        for (let i = Math.max(0, bx0 - gx); i < Math.min(g.w, bx1 - gx); i++) {
          const m = g.mask[j * g.w + i];
          if (m === 0) continue;
          const a = (m * ca + 127) / 255 | 0;
          const di = (gy + j) * dw + gx + i;
          dst[di] = a >= 255 ? c : blend(dst[di], c, a);
        }
      }
      pen += g.advance;
    }
    if (f.style & 4) { // underline
      const save = { tx: this.tx, ty: this.ty };
      this.tx = 0; this.ty = 0;
      const uy = y + fr.ascent(f) + 1;
      this.fillSpan(x, uy, x + width, uy + 1);
      this.tx = save.tx; this.ty = save.ty;
    }
    this.surf.version++;
  }
}

/** src-over blend of internal-format color `c` with coverage/alpha `a` (0-255) over opaque-ish dst. */
export function blend(dst: number, c: number, a: number): number {
  const ia = 255 - a;
  const r = ((c & 0xff) * a + (dst & 0xff) * ia + 127) / 255 | 0;
  const g = (((c >>> 8) & 0xff) * a + ((dst >>> 8) & 0xff) * ia + 127) / 255 | 0;
  const b = (((c >>> 16) & 0xff) * a + ((dst >>> 16) & 0xff) * ia + 127) / 255 | 0;
  const da = dst >>> 24;
  const oa = a + ((da * ia + 127) / 255 | 0);
  return ((oa << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Applies a Sprite transform to a region, producing a new surface. */
export function transformRegion(src: Surface, x: number, y: number, w: number, h: number, transform: number, fonts: FontRenderer): Surface {
  const swap = (transform & 4) !== 0;
  const out = new Surface(swap ? h : w, swap ? w : h, 0);
  const g = new GraphicsState(out, fonts);
  g.drawRegion(src, x, y, w, h, transform, 0, 0, TOP | LEFT, true);
  return out;
}
