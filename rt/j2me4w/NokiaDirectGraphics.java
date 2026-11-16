package j2me4w;

import javax.microedition.lcdui.*;
import com.nokia.mid.ui.DirectGraphics;

public final class NokiaDirectGraphics implements DirectGraphics {
    private final Graphics g;
    public NokiaDirectGraphics(Graphics g) { this.g = g; }

    // Sprite transform as 2x2 matrix rows {a,b,c,d}: x' = a*x + b*y, y' = c*x + d*y
    private static final int[][] MAT = {
        { 1, 0, 0, 1 },   // NONE
        { 1, 0, 0, -1 },  // MIRROR_ROT180 (vertical flip)
        { -1, 0, 0, 1 },  // MIRROR (horizontal flip)
        { -1, 0, 0, -1 }, // ROT180
        { 0, 1, 1, 0 },   // MIRROR_ROT270
        { 0, -1, 1, 0 },  // ROT90 (clockwise)
        { 0, 1, -1, 0 },  // ROT270
        { 0, -1, -1, 0 }, // MIRROR_ROT90
    };

    static int toTransform(int manipulation) {
        int[] m = { 1, 0, 0, 1 };
        if ((manipulation & FLIP_HORIZONTAL) != 0) m = mul(MAT[2], m);
        if ((manipulation & FLIP_VERTICAL) != 0) m = mul(MAT[1], m);
        int rot = manipulation & 0x1FF;
        // Nokia rotations are counter-clockwise
        if (rot == ROTATE_90) m = mul(MAT[6], m);
        else if (rot == ROTATE_180) m = mul(MAT[3], m);
        else if (rot == ROTATE_270) m = mul(MAT[5], m);
        for (int t = 0; t < 8; t++) {
            int[] c = MAT[t];
            if (c[0] == m[0] && c[1] == m[1] && c[2] == m[2] && c[3] == m[3]) return t;
        }
        return 0;
    }
    private static int[] mul(int[] a, int[] b) {
        return new int[] { a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3] };
    }

    public void setARGBColor(int argb) { GraphicsExt.setARGBColor(g, argb); }
    public int getAlphaComponent() { return GraphicsExt.getAlpha(g); }
    public int getNativePixelFormat() { return TYPE_INT_8888_ARGB; }

    public void drawImage(Image img, int x, int y, int anchor, int manipulation) {
        if (img == null) throw new NullPointerException();
        int t = toTransform(manipulation);
        if (t == 0) g.drawImage(img, x, y, anchor);
        else g.drawRegion(img, 0, 0, img.getWidth(), img.getHeight(), t, x, y, anchor);
    }
    private void withColor(int argb, Runnable r) {
        int old = g.getColor();
        int oldA = GraphicsExt.getAlpha(g);
        GraphicsExt.setARGBColor(g, argb);
        r.run();
        GraphicsExt.setARGBColor(g, (oldA << 24) | old);
    }
    public void drawTriangle(int x1, int y1, int x2, int y2, int x3, int y3, int argb) {
        drawPolygon(new int[] { x1, x2, x3 }, 0, new int[] { y1, y2, y3 }, 0, 3, argb);
    }
    public void fillTriangle(int x1, int y1, int x2, int y2, int x3, int y3, int argb) {
        fillPolygon(new int[] { x1, x2, x3 }, 0, new int[] { y1, y2, y3 }, 0, 3, argb);
    }
    public void drawPolygon(final int[] xs, final int xo, final int[] ys, final int yo, final int n, int argb) {
        withColor(argb, new Runnable() { public void run() { GraphicsExt.drawPolygon(g, xs, xo, ys, yo, n); } });
    }
    public void fillPolygon(final int[] xs, final int xo, final int[] ys, final int yo, final int n, int argb) {
        withColor(argb, new Runnable() { public void run() { GraphicsExt.fillPolygon(g, xs, xo, ys, yo, n); } });
    }

    private void drawARGB(int[] argb, boolean alpha, int x, int y, int w, int h, int manipulation) {
        int t = toTransform(manipulation);
        if (t == 0) { g.drawRGB(argb, 0, w, x, y, w, h, alpha); return; }
        Image img = Image.createRGBImage(argb, w, h, alpha);
        g.drawRegion(img, 0, 0, w, h, t, x, y, Graphics.TOP | Graphics.LEFT);
    }

    public void drawPixels(int[] pixels, boolean transparency, int offset, int scan, int x, int y, int w, int h, int manipulation, int format) {
        int[] out = new int[w * h];
        for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) {
            int p = pixels[offset + j * scan + i];
            out[j * w + i] = format == TYPE_INT_888_RGB || !transparency ? (p | 0xFF000000) : p;
        }
        drawARGB(out, transparency, x, y, w, h, manipulation);
    }
    public void drawPixels(short[] pixels, boolean transparency, int offset, int scan, int x, int y, int w, int h, int manipulation, int format) {
        int[] out = new int[w * h];
        for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) {
            int p = pixels[offset + j * scan + i] & 0xFFFF;
            int c;
            switch (format) {
                case TYPE_USHORT_4444_ARGB:
                    c = ((p >> 12) & 0xF) * 0x11000000 | ((p >> 8) & 0xF) * 0x110000 | ((p >> 4) & 0xF) * 0x1100 | (p & 0xF) * 0x11;
                    if (!transparency) c |= 0xFF000000;
                    break;
                case TYPE_USHORT_444_RGB:
                    c = 0xFF000000 | ((p >> 8) & 0xF) * 0x110000 | ((p >> 4) & 0xF) * 0x1100 | (p & 0xF) * 0x11;
                    break;
                case TYPE_USHORT_565_RGB:
                    c = 0xFF000000 | (((p >> 11) & 0x1F) * 255 / 31) << 16 | (((p >> 5) & 0x3F) * 255 / 63) << 8 | ((p & 0x1F) * 255 / 31);
                    break;
                case TYPE_USHORT_555_RGB:
                    c = 0xFF000000 | (((p >> 10) & 0x1F) * 255 / 31) << 16 | (((p >> 5) & 0x1F) * 255 / 31) << 8 | ((p & 0x1F) * 255 / 31);
                    break;
                case TYPE_USHORT_1555_ARGB:
                    c = ((p & 0x8000) != 0 || !transparency ? 0xFF000000 : 0) | (((p >> 10) & 0x1F) * 255 / 31) << 16 | (((p >> 5) & 0x1F) * 255 / 31) << 8 | ((p & 0x1F) * 255 / 31);
                    break;
                default:
                    throw new IllegalArgumentException("format " + format);
            }
            out[j * w + i] = c;
        }
        drawARGB(out, transparency, x, y, w, h, manipulation);
    }
    public void drawPixels(byte[] pixels, byte[] mask, int offset, int scan, int x, int y, int w, int h, int manipulation, int format) {
        int[] out = new int[w * h];
        for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) {
            int bit = offset + j * scan + i;
            int on = format == TYPE_BYTE_1_GRAY ? (pixels[bit >> 3] >> (7 - (bit & 7))) & 1 : (pixels[bit] != 0 ? 1 : 0);
            int vis = mask == null ? 1 : (mask[bit >> 3] >> (7 - (bit & 7))) & 1;
            out[j * w + i] = vis == 0 ? 0 : (on == 1 ? 0xFF000000 : 0xFFFFFFFF);
        }
        drawARGB(out, true, x, y, w, h, manipulation);
    }

    public void getPixels(int[] pixels, int offset, int scan, int x, int y, int w, int h, int format) {
        GraphicsExt.getPixels(g, pixels, offset, scan, x, y, w, h);
    }
    public void getPixels(short[] pixels, int offset, int scan, int x, int y, int w, int h, int format) {
        int[] tmp = new int[w * h];
        GraphicsExt.getPixels(g, tmp, 0, w, x, y, w, h);
        for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) {
            int c = tmp[j * w + i];
            int r = (c >> 16) & 0xFF, gg = (c >> 8) & 0xFF, b = c & 0xFF, a = (c >>> 24);
            short s;
            if (format == TYPE_USHORT_4444_ARGB) s = (short) (((a >> 4) << 12) | ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4));
            else if (format == TYPE_USHORT_444_RGB) s = (short) (((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4));
            else if (format == TYPE_USHORT_565_RGB) s = (short) (((r >> 3) << 11) | ((gg >> 2) << 5) | (b >> 3));
            else s = (short) (((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3));
            pixels[offset + j * scan + i] = s;
        }
    }
    public void getPixels(byte[] pixels, byte[] mask, int offset, int scan, int x, int y, int w, int h, int format) {
        throw new IllegalArgumentException("Unsupported format");
    }
}
