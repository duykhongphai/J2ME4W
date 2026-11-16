package j2me4w;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public final class GraphicsExt {
    private GraphicsExt() {}
    public static native void setARGBColor(Graphics g, int argb);
    public static native int getAlpha(Graphics g);
    public static native void fillPolygon(Graphics g, int[] xs, int xOff, int[] ys, int yOff, int n);
    public static native void drawPolygon(Graphics g, int[] xs, int xOff, int[] ys, int yOff, int n);
    public static native void getPixels(Graphics g, int[] argb, int off, int scan, int x, int y, int w, int h);
    public static native Image createARGBImage(int w, int h, int argb);
}
