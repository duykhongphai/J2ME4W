package javax.microedition.lcdui.game;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public class Sprite extends Layer {
    public static final int TRANS_NONE = 0, TRANS_ROT90 = 5, TRANS_ROT180 = 3, TRANS_ROT270 = 6, TRANS_MIRROR = 2,
        TRANS_MIRROR_ROT90 = 7, TRANS_MIRROR_ROT180 = 1, TRANS_MIRROR_ROT270 = 4;

    private Image image;
    private int frameW, frameH, cols, rawFrames;
    private int[] sequence;
    private boolean customSequence;
    private int seqIndex;
    private int refX, refY;
    private int transform;
    private int colX, colY, colW, colH;

    public Sprite(Image image) { this(image, image.getWidth(), image.getHeight()); }
    public Sprite(Image image, int frameWidth, int frameHeight) {
        super(frameWidth, frameHeight);
        setImage0(image, frameWidth, frameHeight);
        initSequence();
        colX = 0; colY = 0; colW = frameWidth; colH = frameHeight;
    }
    public Sprite(Sprite s) {
        super(s.width, s.height);
        image = s.image;
        frameW = s.frameW; frameH = s.frameH; cols = s.cols; rawFrames = s.rawFrames;
        sequence = new int[s.sequence.length];
        System.arraycopy(s.sequence, 0, sequence, 0, sequence.length);
        customSequence = s.customSequence;
        seqIndex = s.seqIndex;
        refX = s.refX; refY = s.refY;
        transform = s.transform;
        colX = s.colX; colY = s.colY; colW = s.colW; colH = s.colH;
        x = s.x; y = s.y; visible = s.visible;
    }

    private void setImage0(Image img, int fw, int fh) {
        if (img == null) throw new NullPointerException();
        if (fw <= 0 || fh <= 0 || img.getWidth() % fw != 0 || img.getHeight() % fh != 0) throw new IllegalArgumentException();
        image = img;
        frameW = fw;
        frameH = fh;
        cols = img.getWidth() / fw;
        rawFrames = cols * (img.getHeight() / fh);
    }

    public void setImage(Image img, int frameWidth, int frameHeight) {
        int oldRefX = getRefPixelX(), oldRefY = getRefPixelY();
        int oldRaw = rawFrames;
        boolean sizeChanged = frameWidth != frameW || frameHeight != frameH;
        setImage0(img, frameWidth, frameHeight);
        if (rawFrames < oldRaw || !customSequence) {
            initSequence();
        }
        if (sizeChanged) {
            colX = 0; colY = 0; colW = frameWidth; colH = frameHeight;
            applyTransformSize();
            setRefPixelPosition(oldRefX, oldRefY);
        }
    }

    private void initSequence() {
        sequence = new int[rawFrames];
        for (int i = 0; i < rawFrames; i++) sequence[i] = i;
        customSequence = false;
        seqIndex = 0;
    }

    { }

    public void defineReferencePixel(int x, int y) { refX = x; refY = y; }
    public void setRefPixelPosition(int x, int y) {
        this.x = x - tx(refX, refY);
        this.y = y - ty(refX, refY);
    }
    public int getRefPixelX() { return x + tx(refX, refY); }
    public int getRefPixelY() { return y + ty(refX, refY); }

    public void setFrame(int sequenceIndex) {
        if (sequence == null) initSequence();
        if (sequenceIndex < 0 || sequenceIndex >= sequence.length) throw new IndexOutOfBoundsException();
        seqIndex = sequenceIndex;
    }
    public final int getFrame() { return seqIndex; }
    public int getRawFrameCount() { return rawFrames; }
    public int getFrameSequenceLength() { if (sequence == null) initSequence(); return sequence.length; }
    public void nextFrame() { if (sequence == null) initSequence(); seqIndex = (seqIndex + 1) % sequence.length; }
    public void prevFrame() { if (sequence == null) initSequence(); seqIndex = (seqIndex + sequence.length - 1) % sequence.length; }
    public void setFrameSequence(int[] seq) {
        if (seq == null) { initSequence(); return; }
        if (seq.length == 0) throw new IllegalArgumentException();
        for (int i = 0; i < seq.length; i++) if (seq[i] < 0 || seq[i] >= rawFrames) throw new ArrayIndexOutOfBoundsException();
        sequence = new int[seq.length];
        System.arraycopy(seq, 0, sequence, 0, seq.length);
        customSequence = true;
        seqIndex = 0;
    }

    public void setTransform(int t) {
        if (t < 0 || t > 7) throw new IllegalArgumentException();
        int rx = getRefPixelX(), ry = getRefPixelY();
        transform = t;
        applyTransformSize();
        setRefPixelPosition(rx, ry);
    }

    private void applyTransformSize() {
        if ((transform & 4) != 0) { width = frameH; height = frameW; }
        else { width = frameW; height = frameH; }
    }

    private int tx(int px, int py) {
        switch (transform) {
            case TRANS_NONE: case TRANS_MIRROR_ROT180: return px;
            case TRANS_MIRROR: case TRANS_ROT180: return frameW - 1 - px;
            case TRANS_ROT90: case TRANS_MIRROR_ROT90: return frameH - 1 - py;
            default: return py;
        }
    }
    private int ty(int px, int py) {
        switch (transform) {
            case TRANS_NONE: case TRANS_MIRROR: return py;
            case TRANS_MIRROR_ROT180: case TRANS_ROT180: return frameH - 1 - py;
            case TRANS_ROT90: case TRANS_MIRROR_ROT270: return px;
            default: return frameW - 1 - px;
        }
    }

    public void defineCollisionRectangle(int x, int y, int width, int height) {
        if (width < 0 || height < 0) throw new IllegalArgumentException();
        colX = x; colY = y; colW = width; colH = height;
    }

    private void colRect(int[] r) {
        int x1 = tx(colX, colY), y1 = ty(colX, colY);
        int x2 = tx(colX + colW - 1, colY + colH - 1), y2 = ty(colX + colW - 1, colY + colH - 1);
        r[0] = x + Math.min(x1, x2);
        r[1] = y + Math.min(y1, y2);
        r[2] = Math.abs(x2 - x1) + 1;
        r[3] = Math.abs(y2 - y1) + 1;
        if (colW == 0 || colH == 0) { r[2] = 0; r[3] = 0; }
    }

    private static boolean intersect(int[] a, int[] b, int[] out) {
        int x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
        int x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
        if (x2 <= x1 || y2 <= y1) return false;
        if (out != null) { out[0] = x1; out[1] = y1; out[2] = x2 - x1; out[3] = y2 - y1; }
        return true;
    }

    private boolean[] opaqueMask(int sx, int sy, int w, int h) {
        Image frame = Image.createImage(image, (sequence[seqIndex] % cols) * frameW, (sequence[seqIndex] / cols) * frameH, frameW, frameH, transform);
        int[] px = new int[w * h];
        frame.getRGB(px, 0, w, sx - x, sy - y, w, h);
        boolean[] m = new boolean[w * h];
        for (int i = 0; i < px.length; i++) m[i] = (px[i] >>> 24) != 0;
        return m;
    }

    public final boolean collidesWith(Sprite s, boolean pixelLevel) {
        if (!visible || !s.visible) return false;
        int[] a = new int[4], b = new int[4], r = new int[4];
        colRect(a);
        s.colRect(b);
        if (!intersect(a, b, r)) return false;
        if (!pixelLevel) return true;
        boolean[] m1 = opaqueMask(r[0], r[1], r[2], r[3]);
        boolean[] m2 = s.opaqueMask(r[0], r[1], r[2], r[3]);
        for (int i = 0; i < m1.length; i++) if (m1[i] && m2[i]) return true;
        return false;
    }

    public final boolean collidesWith(TiledLayer t, boolean pixelLevel) {
        if (!visible || !t.visible) return false;
        int[] a = new int[4], b = new int[] { t.x, t.y, t.width, t.height }, r = new int[4];
        colRect(a);
        if (!intersect(a, b, r)) return false;
        int tw = t.getCellWidth(), th = t.getCellHeight();
        int c0 = (r[0] - t.x) / tw, c1 = (r[0] + r[2] - 1 - t.x) / tw;
        int r0 = (r[1] - t.y) / th, r1 = (r[1] + r[3] - 1 - t.y) / th;
        for (int row = r0; row <= r1; row++) {
            for (int col = c0; col <= c1; col++) {
                if (t.getCell(col, row) == 0) continue;
                if (!pixelLevel) return true;
                int[] cell = new int[] { t.x + col * tw, t.y + row * th, tw, th }, ri = new int[4];
                if (!intersect(r, cell, ri)) continue;
                boolean[] m1 = opaqueMask(ri[0], ri[1], ri[2], ri[3]);
                int[] px = new int[ri[2] * ri[3]];
                t.cellPixels(col, row, px, ri[0] - cell[0], ri[1] - cell[1], ri[2], ri[3]);
                for (int i = 0; i < px.length; i++) if (m1[i] && (px[i] >>> 24) != 0) return true;
            }
        }
        return false;
    }

    public final boolean collidesWith(Image img, int ix, int iy, boolean pixelLevel) {
        if (!visible) return false;
        int[] a = new int[4], b = new int[] { ix, iy, img.getWidth(), img.getHeight() }, r = new int[4];
        colRect(a);
        if (!intersect(a, b, r)) return false;
        if (!pixelLevel) return true;
        boolean[] m1 = opaqueMask(r[0], r[1], r[2], r[3]);
        int[] px = new int[r[2] * r[3]];
        img.getRGB(px, 0, r[2], r[0] - ix, r[1] - iy, r[2], r[3]);
        for (int i = 0; i < px.length; i++) if (m1[i] && (px[i] >>> 24) != 0) return true;
        return false;
    }

    public final void paint(Graphics g) {
        if (!visible) return;
        if (sequence == null) initSequence();
        int f = sequence[seqIndex];
        g.drawRegion(image, (f % cols) * frameW, (f / cols) * frameH, frameW, frameH, transform, x, y, Graphics.TOP | Graphics.LEFT);
    }
}
