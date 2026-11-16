package javax.microedition.lcdui;

public class TextField extends Item {
    public static final int ANY = 0, EMAILADDR = 1, NUMERIC = 2, PHONENUMBER = 3, URL = 4, DECIMAL = 5;
    public static final int PASSWORD = 0x10000, UNEDITABLE = 0x20000, SENSITIVE = 0x40000, NON_PREDICTIVE = 0x80000,
        INITIAL_CAPS_WORD = 0x100000, INITIAL_CAPS_SENTENCE = 0x200000, CONSTRAINT_MASK = 0xFFFF;

    final TextBuffer buf;

    public TextField(String label, String text, int maxSize, int constraints) {
        super(label);
        buf = new TextBuffer(text, maxSize, constraints);
    }
    public String getString() { return buf.text; }
    public void setString(String text) { buf.set(text); repaint(); }
    public int getChars(char[] data) { return buf.getChars(data); }
    public void setChars(char[] data, int offset, int length) { buf.set(data == null ? "" : new String(data, offset, length)); repaint(); }
    public void insert(String src, int position) { buf.insert(src, position); repaint(); }
    public void insert(char[] data, int offset, int length, int position) { insert(new String(data, offset, length), position); }
    public void delete(int offset, int length) { buf.delete(offset, length); repaint(); }
    public int getMaxSize() { return buf.maxSize; }
    public int setMaxSize(int maxSize) { return buf.setMaxSize(maxSize); }
    public int size() { return buf.text.length(); }
    public int getCaretPosition() { return buf.text.length(); }
    public void setConstraints(int constraints) { buf.constraints = constraints; repaint(); }
    public int getConstraints() { return buf.constraints; }
    public void setInitialInputMode(String characterSubset) {}

    boolean focusable() { return true; }
    int contentHeight(int w) { return Screen.textFont().getHeight() + 6; }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) {
        int h = contentHeight(w);
        g.setColor(focused ? Screen.HI_BG : 0xFFFFFF);
        g.fillRect(x, y, w - 1, h - 1);
        g.setColor(focused ? Screen.TITLE_BG : Screen.BORDER);
        g.drawRect(x, y, w - 1, h - 1);
        g.setColor(Screen.FG);
        g.drawString(buf.display(), x + 3, y + 3, Graphics.TOP | Graphics.LEFT);
    }
    void activate() {
        if ((buf.constraints & UNEDITABLE) != 0) { super.activate(); return; }
        String r = j2me4w.TextInput.edit(label, buf.text, buf.maxSize, buf.constraints);
        if (r != null) {
            buf.set(r);
            repaint();
            notifyStateChanged();
        }
    }
}

final class TextBuffer {
    String text;
    int maxSize;
    int constraints;
    TextBuffer(String text, int maxSize, int constraints) {
        if (maxSize <= 0) throw new IllegalArgumentException();
        this.maxSize = maxSize;
        this.constraints = constraints;
        set(text);
    }
    void set(String t) {
        if (t == null) t = "";
        if (t.length() > maxSize) throw new IllegalArgumentException("text too long");
        text = t;
    }
    int getChars(char[] data) {
        text.getChars(0, text.length(), data, 0);
        return text.length();
    }
    void insert(String src, int pos) {
        if (pos < 0) pos = 0;
        if (pos > text.length()) pos = text.length();
        set(text.substring(0, pos) + src + text.substring(pos));
    }
    void delete(int off, int len) {
        if (off < 0 || len < 0 || off + len > text.length()) throw new StringIndexOutOfBoundsException();
        text = text.substring(0, off) + text.substring(off + len);
    }
    int setMaxSize(int m) {
        if (m <= 0) throw new IllegalArgumentException();
        maxSize = m;
        if (text.length() > m) text = text.substring(0, m);
        return m;
    }
    String display() {
        if ((constraints & TextField.PASSWORD) == 0) return text;
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < text.length(); i++) sb.append('*');
        return sb.toString();
    }
}
