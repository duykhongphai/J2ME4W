package javax.microedition.lcdui;

import java.util.Vector;

public abstract class Screen extends Displayable {
    static final int BG = 0xFFFFFF, FG = 0x000000, TITLE_BG = 0x2060C0, TITLE_FG = 0xFFFFFF,
        HI_BG = 0xCCE0FF, BORDER = 0x808080;

    Screen() {}

    static Font textFont() { return Font.getDefaultFont(); }
    static Font titleFont() { return Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_MEDIUM); }

    void paint0(Graphics g) {
        int w = getWidth(), h = getHeight();
        g.setClip(0, 0, w, h);
        g.setColor(BG);
        g.fillRect(0, 0, w, h);
        int top = 0;
        if (title != null) {
            Font tf = titleFont();
            top = tf.getHeight() + 4;
            g.setColor(TITLE_BG);
            g.fillRect(0, 0, w, top);
            g.setColor(TITLE_FG);
            g.setFont(tf);
            g.drawString(title, 4, 2, Graphics.TOP | Graphics.LEFT);
        }
        g.setClip(0, top, w, h - top);
        g.setFont(textFont());
        paintContent(g, top, w, h - top);
    }

    abstract void paintContent(Graphics g, int y, int w, int h);

    void keyEvent0(int type, int keyCode) {
        if (type == EventLoop.KEY_RELEASED) return;
        if (screenKey(Canvas.gameAction(keyCode), keyCode)) repaintIfShown();
    }

    boolean screenKey(int action, int keyCode) { return false; }

    static Vector wrap(String text, Font f, int width) {
        Vector lines = new Vector();
        if (text == null) return lines;
        if (width < 8) width = 8;
        int start = 0;
        int n = text.length();
        while (start <= n) {
            int nl = text.indexOf('\n', start);
            String para = nl < 0 ? text.substring(start) : text.substring(start, nl);
            wrapPara(para, f, width, lines);
            if (nl < 0) break;
            start = nl + 1;
        }
        return lines;
    }

    private static void wrapPara(String s, Font f, int width, Vector lines) {
        if (s.length() == 0) { lines.addElement(""); return; }
        while (s.length() > 0) {
            if (f.stringWidth(s) <= width) { lines.addElement(s); return; }
            int cut = 1;
            while (cut < s.length() && f.stringWidth(s.substring(0, cut + 1)) <= width) cut++;
            int sp = s.lastIndexOf(' ', cut);
            int brk = sp > 0 ? sp : cut;
            lines.addElement(s.substring(0, brk));
            s = s.substring(sp > 0 ? brk + 1 : brk);
        }
    }

    static int drawLines(Graphics g, Vector lines, int x, int y, Font f) {
        for (int i = 0; i < lines.size(); i++) {
            g.drawString((String) lines.elementAt(i), x, y, Graphics.TOP | Graphics.LEFT);
            y += f.getHeight();
        }
        return y;
    }
}
