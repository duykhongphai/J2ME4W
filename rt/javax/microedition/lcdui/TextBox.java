package javax.microedition.lcdui;

import java.util.Vector;

/**
 * Full-screen text editor. Like on real phones, the host's text editor opens as soon as the TextBox is
 * shown; it also opens on Fire, on a click/tap and on any key that types a character. The screen's
 * commands are offered in the editor, so the user can type and confirm in one step.
 */
public class TextBox extends Screen {
    private final TextBuffer buf;
    private boolean editing;
    private int shownSerial;

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
        g.drawString("Tap or press Fire to type", w - 4, y + h - 4, Graphics.BOTTOM | Graphics.RIGHT);
    }

    void showNotify0() {
        final int serial = ++shownSerial;
        // open the editor right away, but not inside setCurrent(): the game thread must not block here
        Display.runLater(new Runnable() {
            public void run() { if (serial == shownSerial && shown) edit(); }
        });
    }

    void hideNotify0() { shownSerial++; }

    /** Opens the host editor; runs on the event thread. */
    void edit() {
        if (editing || (buf.constraints & TextField.UNEDITABLE) != 0) return;
        editing = true;
        try {
            Vector cmds = softCommands();
            String[] labels = new String[cmds.size()];
            for (int i = 0; i < labels.length; i++) {
                Command c = (Command) cmds.elementAt(i);
                // \u0001 marks Back/Cancel/Exit/Stop so the host maps Enter to a positive command
                labels[i] = (c.isNegative() ? "\u0001" : "") + c.getLabel();
            }
            String[] result = new String[1];
            int r = j2me4w.TextInput.edit2(title, buf.text, buf.maxSize, buf.constraints, labels, result);
            if (r == -2) return;
            String t = result[0] == null ? "" : result[0];
            if (t.length() > buf.maxSize) t = t.substring(0, buf.maxSize);
            buf.set(t);
            repaintIfShown();
            if (r >= 0 && r < cmds.size() && Display.current == this) fireCommand((Command) cmds.elementAt(r));
        } finally {
            editing = false;
        }
    }

    boolean screenKey(int action, int keyCode) {
        if (action == Canvas.FIRE || (keyCode > 0 && keyCode != '*' && keyCode != '#')) {
            edit();
            return true;
        }
        return false;
    }

    void pointerEvent0(int type, int x, int y) {
        if (type == EventLoop.POINTER_RELEASED) edit();
    }
}
