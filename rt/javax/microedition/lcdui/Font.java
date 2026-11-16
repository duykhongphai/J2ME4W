package javax.microedition.lcdui;

public final class Font {
    public static final int FACE_SYSTEM = 0, FACE_MONOSPACE = 32, FACE_PROPORTIONAL = 64;
    public static final int STYLE_PLAIN = 0, STYLE_BOLD = 1, STYLE_ITALIC = 2, STYLE_UNDERLINED = 4;
    public static final int SIZE_SMALL = 8, SIZE_MEDIUM = 0, SIZE_LARGE = 16;
    public static final int FONT_STATIC_TEXT = 0, FONT_INPUT_TEXT = 1;

    private static Font defaultFont;
    private static final java.util.Hashtable cache = new java.util.Hashtable();

    final int face, style, size;
    private final int height, baseline;

    private Font(int face, int style, int size) {
        this.face = face;
        this.style = style;
        this.size = size;
        this.height = height0(face, style, size);
        this.baseline = baseline0(face, style, size);
    }

    public static Font getDefaultFont() {
        if (defaultFont == null) defaultFont = getFont(FACE_SYSTEM, STYLE_PLAIN, SIZE_MEDIUM);
        return defaultFont;
    }
    public static Font getFont(int fontSpecifier) {
        if (fontSpecifier != FONT_STATIC_TEXT && fontSpecifier != FONT_INPUT_TEXT) throw new IllegalArgumentException();
        return getDefaultFont();
    }
    public static Font getFont(int face, int style, int size) {
        if (face != FACE_SYSTEM && face != FACE_MONOSPACE && face != FACE_PROPORTIONAL) throw new IllegalArgumentException("face");
        if ((style & ~7) != 0) throw new IllegalArgumentException("style");
        if (size != SIZE_SMALL && size != SIZE_MEDIUM && size != SIZE_LARGE) throw new IllegalArgumentException("size");
        Integer key = new Integer(face | (style << 8) | (size << 16));
        Font f = (Font) cache.get(key);
        if (f == null) {
            f = new Font(face, style, size);
            cache.put(key, f);
        }
        return f;
    }
    public int getStyle() { return style; }
    public int getSize() { return size; }
    public int getFace() { return face; }
    public boolean isPlain() { return style == STYLE_PLAIN; }
    public boolean isBold() { return (style & STYLE_BOLD) != 0; }
    public boolean isItalic() { return (style & STYLE_ITALIC) != 0; }
    public boolean isUnderlined() { return (style & STYLE_UNDERLINED) != 0; }
    public int getHeight() { return height; }
    public int getBaselinePosition() { return baseline; }
    public int charWidth(char ch) { return stringWidth0(face, style, size, String.valueOf(ch)); }
    public int charsWidth(char[] ch, int offset, int length) { return stringWidth0(face, style, size, new String(ch, offset, length)); }
    public int stringWidth(String str) { return stringWidth0(face, style, size, str); }
    public int substringWidth(String str, int offset, int len) {
        return stringWidth0(face, style, size, str.substring(offset, offset + len));
    }

    private static native int height0(int face, int style, int size);
    private static native int baseline0(int face, int style, int size);
    private static native int stringWidth0(int face, int style, int size, String s);
}
