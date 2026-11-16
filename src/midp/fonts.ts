// Font metrics and glyph rasterization for the software renderer.
import type { FontRenderer, FontSpec, Glyph } from './surface';

/** Pixel sizes for SIZE_SMALL (8), SIZE_MEDIUM (0), SIZE_LARGE (16). */
export interface FontSizes { small: number; medium: number; large: number }

export function defaultFontSizes(screenWidth: number): FontSizes {
  if (screenWidth <= 128) return { small: 9, medium: 11, large: 13 };
  if (screenWidth <= 176) return { small: 10, medium: 12, large: 14 };
  if (screenWidth <= 240) return { small: 12, medium: 14, large: 17 };
  return { small: 14, medium: 16, large: 20 };
}

function pxSize(sizes: FontSizes, f: FontSpec): number {
  return f.size === 8 ? sizes.small : f.size === 16 ? sizes.large : sizes.medium;
}

const key = (f: FontSpec) => f.face | (f.style << 8) | (f.size << 16);

/** Headless renderer: deterministic metrics, invisible glyphs. */
export class NullFontRenderer implements FontRenderer {
  constructor(private sizes: FontSizes = defaultFontSizes(240)) {}
  height(f: FontSpec) { return pxSize(this.sizes, f) + 3; }
  ascent(f: FontSpec) { return pxSize(this.sizes, f); }
  stringWidth(f: FontSpec, s: string) { return s.length * Math.round(pxSize(this.sizes, f) * 0.55); }
  glyph(f: FontSpec): Glyph {
    return { mask: new Uint8Array(0), w: 0, h: 0, ox: 0, oy: 0, advance: Math.round(pxSize(this.sizes, f) * 0.55) };
  }
}

interface Metrics { ascent: number; descent: number }

/** Renders glyphs with a 2D canvas and caches their coverage masks. */
export class CanvasFontRenderer implements FontRenderer {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private metrics = new Map<number, Metrics>();
  private glyphs = new Map<string, Glyph>();
  private widthCache = new Map<string, number>();

  constructor(
    private sizes: FontSizes,
    private family = 'Arial, Helvetica, sans-serif',
    private monoFamily = '"Courier New", monospace',
    /** Snap coverage to on/off for a crisp "phone font" look. */
    private crisp = false,
  ) {
    const canvas: any = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(64, 64)
      : Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
  }

  private css(f: FontSpec): string {
    const fam = f.face === 32 ? this.monoFamily : this.family;
    return `${f.style & 2 ? 'italic ' : ''}${f.style & 1 ? 'bold ' : ''}${pxSize(this.sizes, f)}px ${fam}`;
  }

  private m(f: FontSpec): Metrics {
    const k = key(f);
    let m = this.metrics.get(k);
    if (!m) {
      const px = pxSize(this.sizes, f);
      this.ctx.font = this.css(f);
      const tm = this.ctx.measureText('Mgjy');
      const ascent = Math.ceil((tm as any).fontBoundingBoxAscent ?? px * 0.9);
      const descent = Math.ceil((tm as any).fontBoundingBoxDescent ?? px * 0.25);
      m = { ascent, descent };
      this.metrics.set(k, m);
    }
    return m;
  }

  height(f: FontSpec) { const m = this.m(f); return m.ascent + m.descent; }
  ascent(f: FontSpec) { return this.m(f).ascent; }

  stringWidth(f: FontSpec, s: string): number {
    const k = key(f) + ':' + s;
    let w = this.widthCache.get(k);
    if (w === undefined) {
      w = 0;
      for (const ch of s) w += this.glyph(f, ch).advance;
      if (this.widthCache.size > 5000) this.widthCache.clear();
      this.widthCache.set(k, w);
    }
    return w;
  }

  glyph(f: FontSpec, ch: string): Glyph {
    const k = key(f) + ':' + ch;
    let g = this.glyphs.get(k);
    if (g) return g;
    const m = this.m(f);
    const ctx = this.ctx;
    ctx.font = this.css(f);
    const adv = Math.max(1, Math.round(ctx.measureText(ch).width));
    const pad = 2;
    const w = adv + pad * 2 + 2, h = m.ascent + m.descent + pad * 2;
    const canvas = ctx.canvas as any;
    if (canvas.width < w || canvas.height < h) {
      canvas.width = Math.max(canvas.width, w);
      canvas.height = Math.max(canvas.height, h);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = this.css(f);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, pad, pad + m.ascent);
    const data = ctx.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3];
      mask[i] = this.crisp ? (a >= 110 ? 255 : 0) : a;
    }
    g = { mask, w, h, ox: -pad, oy: -pad, advance: adv };
    this.glyphs.set(k, g);
    return g;
  }
}
