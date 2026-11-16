package javax.microedition.lcdui;

public class TextBox extends Screen {
    private final TextBuffer buf;
    public TextBox(String title, String text, int maxSize, int constraints) {
        this.title = title;
        buf = new TextBuffer(text, maxSize, constraints);
    }
    public String getString() { return buf.text; }
    public void setString(String text) { buf.set(text); repaintIfShown(); }
    public int getChars(char[] data) { return buf.getChars(data); }
    public void setChars(char[] data, int offset, int length) { buf.set(data == null ? "" : new String(data, offset, length)); repaintIfShown(); }
    public void insert(String src, int position) { buf.insert(src, position); repaintIfShown(); }
    public void insert(char[] data, int offset, int length, int position) { insert(new String(data, offset, length), position); }
    public void delete(int offset, int length) { buf.delete(offset, length); repaintIfShown(); }
    public int getMaxSize() { return buf.maxSize; }
    public int setMaxSize(int maxSize) { return buf.setMaxSize(maxSize); }
    public int size() { return buf.text.length(); }
    public int getCaretPosition() { return buf.text.length(); }
    public void setConstraints(int constraints) { buf.constraints = constraints; }
    public int getConstraints() { return buf.constraints; }
    public void setInitialInputMode(String characterSubset) {}

    void paintContent(Graphics g, int y, int w, int h) {
        Font f = textFont();
        g.setColor(Screen.BORDER);
        g.drawRect(2, y + 2, w - 5, h - 5);
        g.setColor(Screen.FG);
        drawLines(g, wrap(buf.display(), f, w - 10), 5, y + 5, f);
        g.setColor(0x808080);
        g.drawString("[Fire] edit", w - 4, y + h - 4, Graphics.BOTTOM | Graphics.RIGHT);
    }

    boolean screenKey(int action, int keyCode) {
        if (action == Canvas.FIRE || (keyCode > 0 && keyCode != '*' && keyCode != '#')) {
            if ((buf.constraints & TextField.UNEDITABLE) != 0) return false;
            String r = j2me4w.TextInput.edit(title, buf.text, buf.maxSize, buf.constraints);
            if (r != null) buf.set(r);
            return true;
        }
        return false;
    }
}
