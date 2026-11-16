package javax.microedition.lcdui;

public class Graphics {
    public static final int HCENTER = 1, VCENTER = 2, LEFT = 4, RIGHT = 8, TOP = 16, BOTTOM = 32, BASELINE = 64;
    public static final int SOLID = 0, DOTTED = 1;

    private Font font;

    Graphics() {}

    public native void translate(int x, int y);
    public native int getTranslateX();
    public native int getTranslateY();
    public native int getColor();
    public int getRedComponent() { return (getColor() >> 16) & 0xFF; }
    public int getGreenComponent() { return (getColor() >> 8) & 0xFF; }
    public int getBlueComponent() { return getColor() & 0xFF; }
    public int getGrayScale() { return (getRedComponent() + getGreenComponent() + getBlueComponent()) / 3; }
    public void setColor(int red, int green, int blue) {
        if ((red | green | blue) < 0 || red > 255 || green > 255 || blue > 255) throw new IllegalArgumentException();
        setColor((red << 16) | (green << 8) | blue);
    }
    public native void setColor(int rgb);
    public void setGrayScale(int value) {
        if (value < 0 || value > 255) throw new IllegalArgumentException();
        setColor(value, value, value);
    }
    public Font getFont() { return font != null ? font : Font.getDefaultFont(); }
    public void setFont(Font f) {
        if (f == null) f = Font.getDefaultFont();
        font = f;
        setFont0(f.face, f.style, f.size);
    }
    private native void setFont0(int face, int style, int size);
    public native void setStrokeStyle(int style);
    public native int getStrokeStyle();
    public native int getClipX();
    public native int getClipY();
    public native int getClipWidth();
    public native int getClipHeight();
    public native void clipRect(int x, int y, int width, int height);
    public native void setClip(int x, int y, int width, int height);
    public native void drawLine(int x1, int y1, int x2, int y2);
    public native void fillRect(int x, int y, int width, int height);
    public native void drawRect(int x, int y, int width, int height);
    public native void drawRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight);
    public native void fillRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight);
    public native void fillArc(int x, int y, int width, int height, int startAngle, int arcAngle);
    public native void drawArc(int x, int y, int width, int height, int startAngle, int arcAngle);
    public void drawString(String str, int x, int y, int anchor) {
        if (str == null) throw new NullPointerException();
        drawString0(str, x, y, anchor);
    }
    private native void drawString0(String str, int x, int y, int anchor);
    public void drawSubstring(String str, int offset, int len, int x, int y, int anchor) {
        drawString(str.substring(offset, offset + len), x, y, anchor);
    }
    public void drawChar(char character, int x, int y, int anchor) { drawString0(String.valueOf(character), x, y, anchor); }
    public void drawChars(char[] data, int offset, int length, int x, int y, int anchor) {
        drawString0(new String(data, offset, length), x, y, anchor);
    }
    public void drawImage(Image img, int x, int y, int anchor) {
        if (img == null) throw new NullPointerException();
        drawImage0(img, x, y, anchor);
    }
    private native void drawImage0(Image img, int x, int y, int anchor);
    public void drawRegion(Image src, int x_src, int y_src, int width, int height, int transform, int x_dest, int y_dest, int anchor) {
        if (src == null) throw new NullPointerException();
        if (transform < 0 || transform > 7) throw new IllegalArgumentException();
        drawRegion0(src, x_src, y_src, width, height, transform, x_dest, y_dest, anchor);
    }
    private native void drawRegion0(Image src, int x_src, int y_src, int width, int height, int transform, int x_dest, int y_dest, int anchor);
    public native void copyArea(int x_src, int y_src, int width, int height, int x_dest, int y_dest, int anchor);
    public native void fillTriangle(int x1, int y1, int x2, int y2, int x3, int y3);
    public void drawRGB(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height, boolean processAlpha) {
        if (rgbData == null) throw new NullPointerException();
        drawRGB0(rgbData, offset, scanlength, x, y, width, height, processAlpha);
    }
    private native void drawRGB0(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height, boolean processAlpha);
    public int getDisplayColor(int color) { return color & 0xFFFFFF; }
}
