// Natives for MIDP (lcdui, game, rms, media), Nokia extensions and the j2me4w helpers.
import { JArray, JObject, type JThread } from '../vm/model';
import { SUSPEND, type VM } from '../vm/vm';
import { decodePng } from './png';
import type { Platform } from './platform';
import { GraphicsState, Surface, swapRB, transformRegion } from './surface';

interface ImagePeer { surf: Surface; mutable: boolean }

const b = (x: boolean) => (x ? 1 : 0);

export function registerMidpNatives(vm: VM, p: Platform): void {
  const npe = (): never => vm.throwNew('java/lang/NullPointerException');
  const S = (o: JObject | null) => (o === null ? npe() : o.s ?? '');
  const LCDUI = 'javax/microedition/lcdui';

  const makeImage = (surf: Surface, mutable: boolean): JObject => {
    const o = vm.newObjectByName(`${LCDUI}/Image`);
    o.nat = { surf, mutable } satisfies ImagePeer;
    return o;
  };
  const img = (o: JObject | null): ImagePeer => (o === null ? npe() : o.nat as ImagePeer);
  const makeGraphics = (surf: Surface): JObject => {
    const o = vm.newObjectByName(`${LCDUI}/Graphics`);
    o.nat = new GraphicsState(surf, p.fonts);
    return o;
  };
  const gs = (o: JObject): GraphicsState => o.nat as GraphicsState;
  const ints = (a: JArray | null) => (a === null ? npe() : a.a as Int32Array);

  // ---------------------------------------------------------------- Graphics
  vm.registerNatives(`${LCDUI}/Graphics`, {
    'translate(II)V': (_t, [g, x, y]) => { gs(g).tx += x; gs(g).ty += y; },
    'getTranslateX()I': (_t, [g]) => gs(g).tx,
    'getTranslateY()I': (_t, [g]) => gs(g).ty,
    'getColor()I': (_t, [g]) => gs(g).color & 0xffffff,
    'setColor(I)V': (_t, [g, c]) => { gs(g).color = (0xff000000 | c) >>> 0; },
    'setFont0(III)V': (_t, [g, face, style, size]) => { gs(g).font = { face, style, size }; },
    'setStrokeStyle(I)V': (_t, [g, s]) => {
      if (s !== 0 && s !== 1) vm.throwNew('java/lang/IllegalArgumentException');
      gs(g).stroke = s;
    },
    'getStrokeStyle()I': (_t, [g]) => gs(g).stroke,
    'getClipX()I': (_t, [g]) => gs(g).cx - gs(g).tx,
    'getClipY()I': (_t, [g]) => gs(g).cy - gs(g).ty,
    'getClipWidth()I': (_t, [g]) => gs(g).cw,
    'getClipHeight()I': (_t, [g]) => gs(g).ch,
    'clipRect(IIII)V': (_t, [g, x, y, w, h]) => gs(g).clipRect(x, y, w, h),
    'setClip(IIII)V': (_t, [g, x, y, w, h]) => gs(g).setClip(x, y, w, h),
    'drawLine(IIII)V': (_t, [g, x1, y1, x2, y2]) => gs(g).drawLine(x1, y1, x2, y2),
    'fillRect(IIII)V': (_t, [g, x, y, w, h]) => gs(g).fillRect(x, y, w, h),
    'drawRect(IIII)V': (_t, [g, x, y, w, h]) => gs(g).drawRect(x, y, w, h),
    'drawRoundRect(IIIIII)V': (_t, [g, x, y, w, h, aw, ah]) => gs(g).drawRoundRect(x, y, w, h, aw, ah),
    'fillRoundRect(IIIIII)V': (_t, [g, x, y, w, h, aw, ah]) => gs(g).fillRoundRect(x, y, w, h, aw, ah),
    'fillArc(IIIIII)V': (_t, [g, x, y, w, h, s, e]) => gs(g).fillArc(x, y, w, h, s, e),
    'drawArc(IIIIII)V': (_t, [g, x, y, w, h, s, e]) => gs(g).drawArc(x, y, w, h, s, e),
    'drawString0(Ljava/lang/String;III)V': (_t, [g, s, x, y, anchor]) => gs(g).drawString(S(s), x, y, anchor),
    [`drawImage0(L${LCDUI}/Image;III)V`]: (_t, [g, im, x, y, anchor]) => gs(g).drawImage(img(im).surf, x, y, anchor),
    [`drawRegion0(L${LCDUI}/Image;IIIIIIII)V`]: (_t, [g, im, sx, sy, w, h, tr, x, y, anchor]) => {
      const src = img(im).surf;
      if (sx < 0 || sy < 0 || w < 0 || h < 0 || sx + w > src.w || sy + h > src.h) {
        vm.throwNew('java/lang/IllegalArgumentException', 'region exceeds image bounds');
      }
      gs(g).drawRegion(src, sx, sy, w, h, tr, x, y, anchor);
    },
    'copyArea(IIIIIII)V': (_t, [g, sx, sy, w, h, dx, dy, anchor]) => gs(g).copyArea(sx, sy, w, h, dx, dy, anchor),
    'fillTriangle(IIIIII)V': (_t, [g, x1, y1, x2, y2, x3, y3]) => gs(g).fillTriangle(x1, y1, x2, y2, x3, y3),
    'drawRGB0([IIIIIIIZ)V': (_t, [g, rgb, off, scan, x, y, w, h, alpha]) => {
      const a = ints(rgb);
      if (w > 0 && h > 0) {
        const last = off + (h - 1) * scan + w - 1;
        if (off < 0 || last >= a.length || off + (h - 1) * scan < 0) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException');
      }
      gs(g).drawRGB(a, off, scan, x, y, w, h, alpha !== 0);
    },
  });

  // ---------------------------------------------------------------- Image
  vm.registerNatives(`${LCDUI}/Image`, {
    'getWidth()I': (_t, [self]) => img(self).surf.w,
    'getHeight()I': (_t, [self]) => img(self).surf.h,
    'isMutable()Z': (_t, [self]) => b(img(self).mutable),
    [`create0(II)L${LCDUI}/Image;`]: (_t, [w, h]) => makeImage(new Surface(w, h, 0xffffffff), true),
    [`decode0([BII)L${LCDUI}/Image;`]: (t, [arr, off, len]) => {
      const a = arr.a as Int8Array;
      const bytes = new Uint8Array(a.buffer, a.byteOffset + off, len);
      const surf = decodePng(bytes);
      if (surf) return makeImage(surf, false);
      if (!p.host.decodeImage) return null;
      const copy = bytes.slice();
      p.host.decodeImage(copy).then(
        (s) => vm.resume(t, s ? makeImage(s, false) : null),
        () => vm.resume(t, null),
      );
      return SUSPEND;
    },
    [`region0(L${LCDUI}/Image;IIIIIZ)L${LCDUI}/Image;`]: (_t, [src, x, y, w, h, tr, mutable]) =>
      makeImage(transformRegion(img(src).surf, x, y, w, h, tr, p.fonts), mutable !== 0),
    [`rgb0([IIIZ)L${LCDUI}/Image;`]: (_t, [rgb, w, h, alpha]) => {
      const a = ints(rgb);
      const s = new Surface(w, h, 0);
      for (let i = 0; i < w * h; i++) s.px[i] = alpha ? swapRB(a[i]) : (swapRB(a[i]) | 0xff000000) >>> 0;
      return makeImage(s, false);
    },
    [`graphics0()L${LCDUI}/Graphics;`]: (_t, [self]) => makeGraphics(img(self).surf),
    'getRGB0([IIIIIII)V': (_t, [self, rgb, off, scan, x, y, w, h]) => {
      const a = ints(rgb);
      const s = img(self).surf;
      if (Math.abs(scan) < w) vm.throwNew('java/lang/IllegalArgumentException', 'scanlength');
      for (let j = 0; j < h; j++) {
        const row = off + j * scan;
        if (row < 0 || row + w > a.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException');
        for (let i = 0; i < w; i++) a[row + i] = swapRB(s.px[(y + j) * s.w + x + i]) | 0;
      }
    },
  });

  // ---------------------------------------------------------------- Font
  vm.registerNatives(`${LCDUI}/Font`, {
    'height0(III)I': (_t, [face, style, size]) => p.fonts.height({ face, style, size }),
    'baseline0(III)I': (_t, [face, style, size]) => p.fonts.ascent({ face, style, size }),
    'stringWidth0(IIILjava/lang/String;)I': (_t, [face, style, size, s]) => p.fonts.stringWidth({ face, style, size }, S(s)),
  });

  // ---------------------------------------------------------------- Display
  let screenImage: JObject | null = null;
  vm.registerNatives(`${LCDUI}/Display`, {
    'width0()I': () => p.width,
    'height0()I': () => p.height,
    [`screen0()L${LCDUI}/Image;`]: () => (screenImage ??= makeImage(new Surface(p.width, p.height, 0xffffffff), true)),
    [`present0(L${LCDUI}/Image;)V`]: (_t, [im]) => p.host.present(img(im).surf),
    'postEvent0(III)V': (_t, [type, a, c]) => p.postEvent(type, a, c),
    'waitEvent0([I)V': (t, [arr]) => (p.takeEvent(t, arr) ? undefined : SUSPEND),
    'vibrate0(I)V': (_t, [ms]) => p.host.vibrate?.(ms),
    'setSoftLabels0(Ljava/lang/String;Ljava/lang/String;)V': (_t, [l, r]) =>
      p.host.setSoftLabels?.(vm.jstr(l), vm.jstr(r)),
  });

  vm.registerNatives(`${LCDUI}/game/GameCanvas`, {
    'keyStates0()I': () => p.readKeyStates(),
  });

  // ---------------------------------------------------------------- MIDlet / launcher
  vm.registerNatives('javax/microedition/midlet/MIDlet', {
    'exit0()V': () => { vm.exit(0, 'MIDlet exited'); },
    'getAppProperty0(Ljava/lang/String;)Ljava/lang/String;': (_t, [k]) => {
      const v = p.appProperties[S(k)];
      return v == null ? null : vm.str(v);
    },
    'platformRequest0(Ljava/lang/String;)V': (_t, [u]) => p.host.openUrl?.(S(u)),
  });
  vm.registerNatives('j2me4w/Launcher', {
    'fatal0(Ljava/lang/String;)V': (_t, [m]) => { p.host.onFatal?.(S(m)); vm.exit(1, S(m)); },
  });
  vm.registerNatives('j2me4w/TextInput', {
    'edit(Ljava/lang/String;Ljava/lang/String;II)Ljava/lang/String;': (t, [title, text, max, constraints]) => {
      if (!p.host.editText) return text;
      p.host.editText(vm.jstr(title), S(text), max, constraints).then(
        (r) => vm.resume(t, r == null ? null : vm.str(r.slice(0, max))),
        () => vm.resume(t, null),
      );
      return SUSPEND;
    },
  });

  // ---------------------------------------------------------------- vendor graphics helpers
  const G = `L${LCDUI}/Graphics;`;
  const points = (xs: JArray, xo: number, ys: JArray, yo: number, n: number) => {
    const X = ints(xs), Y = ints(ys);
    if (xo < 0 || yo < 0 || xo + n > X.length || yo + n > Y.length) vm.throwNew('java/lang/ArrayIndexOutOfBoundsException');
    return [Array.from(X.subarray(xo, xo + n)), Array.from(Y.subarray(yo, yo + n))] as const;
  };
  vm.registerNatives('j2me4w/GraphicsExt', {
    [`setARGBColor(${G}I)V`]: (_t, [g, c]) => { gs(g).color = c >>> 0; },
    [`getAlpha(${G})I`]: (_t, [g]) => gs(g).color >>> 24,
    [`fillPolygon(${G}[II[III)V`]: (_t, [g, xs, xo, ys, yo, n]) => { const [X, Y] = points(xs, xo, ys, yo, n); gs(g).fillPolygon(X, Y); },
    [`drawPolygon(${G}[II[III)V`]: (_t, [g, xs, xo, ys, yo, n]) => { const [X, Y] = points(xs, xo, ys, yo, n); gs(g).drawPolygon(X, Y); },
    [`getPixels(${G}[IIIIIII)V`]: (_t, [g, arr, off, scan, x, y, w, h]) => {
      const a = ints(arr);
      const st = gs(g);
      const s = st.surf;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const X = x + i + st.tx, Y = y + j + st.ty;
        a[off + j * scan + i] = X >= 0 && Y >= 0 && X < s.w && Y < s.h ? swapRB(s.px[Y * s.w + X]) | 0 : 0;
      }
    },
    [`createARGBImage(III)L${LCDUI}/Image;`]: (_t, [w, h, argb]) => makeImage(new Surface(w, h, swapRB(argb)), true),
  });
  vm.registerNatives('com/nokia/mid/ui/DeviceControl', {
    'vibrate0(I)V': (_t, [ms]) => p.host.vibrate?.(ms),
  });

  // ---------------------------------------------------------------- RMS
  vm.registerNatives('javax/microedition/rms/RecordStore', {
    'load0(Ljava/lang/String;)[B': (_t, [n]) => {
      const d = p.storage.get(S(n));
      return d ? vm.byteArray(d) : null;
    },
    'save0(Ljava/lang/String;[B)Z': (_t, [n, arr]) => {
      const a = arr.a as Int8Array;
      return b(p.storage.set(S(n), new Uint8Array(a.buffer, a.byteOffset, a.length).slice()));
    },
    'delete0(Ljava/lang/String;)Z': (_t, [n]) => b(p.storage.delete(S(n))),
    'list0()[Ljava/lang/String;': () => vm.strArray(p.storage.list()),
  });

  // ---------------------------------------------------------------- media
  const players = new Map<number, JObject>();
  const ended: JObject[] = [];
  let endWaiter: JThread | null = null;
  const audio = p.host.audio;
  const onEnd = (handle: number) => {
    const pl = players.get(handle);
    if (!pl) return;
    if (endWaiter) {
      const t = endWaiter;
      endWaiter = null;
      vm.resume(t, pl);
    } else {
      ended.push(pl);
    }
  };
  vm.registerNatives('j2me4w/AudioPlayer', {
    'create0(I[BLjava/lang/String;)V': (_t, [self, h, data, type]) => {
      players.set(h, self);
      const a = data === null ? null : data.a as Int8Array;
      audio?.create(h, a ? new Uint8Array(a.buffer, a.byteOffset, a.length).slice() : null, vm.jstr(type) ?? '');
    },
    'start0(II)V': (_t, [h, loops]) => {
      if (audio) audio.start(h, loops, () => onEnd(h));
    },
    'stop0(I)V': (_t, [h]) => audio?.stop(h),
    'close0(I)V': (_t, [h]) => { audio?.close(h); players.delete(h); },
    'setTime0(IJ)V': (_t, [h, us]) => audio?.setTime(h, Number(us)),
    'time0(I)J': (_t, [h]) => BigInt(Math.round(audio?.time(h) ?? 0)),
    'duration0(I)J': (_t, [h]) => BigInt(Math.round(audio?.duration(h) ?? -1)),
    'volume0(II)V': (_t, [h, level]) => audio?.volume(h, level),
    'toneSequence0(I[B)V': (_t, [h, seq]) => {
      const a = seq.a as Int8Array;
      audio?.toneSequence(h, new Uint8Array(a.buffer, a.byteOffset, a.length).slice());
    },
    'waitEnded0()Lj2me4w/AudioPlayer;': (t) => {
      const e = ended.shift();
      if (e) return e;
      endWaiter = t;
      return SUSPEND;
    },
  });
  vm.registerNatives('javax/microedition/media/Manager', {
    'playTone0(III)V': (_t, [note, dur, vol]) => audio?.tone(note, dur, vol),
  });
}
