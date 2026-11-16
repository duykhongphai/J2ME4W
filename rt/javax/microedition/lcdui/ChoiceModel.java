package javax.microedition.lcdui;

import java.util.Vector;

final class ChoiceModel {
    final int type;
    final Vector strings = new Vector();
    final Vector images = new Vector();
    final Vector selected = new Vector();
    final Vector fonts = new Vector();
    int cursor;
    int fitPolicy;

    ChoiceModel(int type, String[] s, Image[] img) {
        this.type = type;
        if (s != null) for (int i = 0; i < s.length; i++) append(s[i], img != null && i < img.length ? img[i] : null);
    }
    int size() { return strings.size(); }
    void check(int i) { if (i < 0 || i >= strings.size()) throw new IndexOutOfBoundsException(); }
    int append(String s, Image img) { insert(strings.size(), s, img); return strings.size() - 1; }
    void insert(int i, String s, Image img) {
        if (s == null) throw new NullPointerException();
        if (i < 0 || i > strings.size()) throw new IndexOutOfBoundsException();
        strings.insertElementAt(s, i);
        images.insertElementAt(img, i);
        fonts.insertElementAt(null, i);
        boolean sel = (type != Choice.MULTIPLE) && strings.size() == 1;
        selected.insertElementAt(sel ? Boolean.TRUE : Boolean.FALSE, i);
    }
    void delete(int i) {
        check(i);
        boolean wasSel = isSelected(i);
        strings.removeElementAt(i);
        images.removeElementAt(i);
        fonts.removeElementAt(i);
        selected.removeElementAt(i);
        if (cursor >= strings.size()) cursor = Math.max(0, strings.size() - 1);
        if (wasSel && type != Choice.MULTIPLE && strings.size() > 0) selected.setElementAt(Boolean.TRUE, Math.min(i, strings.size() - 1));
    }
    void deleteAll() { strings.removeAllElements(); images.removeAllElements(); selected.removeAllElements(); fonts.removeAllElements(); cursor = 0; }
    void set(int i, String s, Image img) {
        check(i);
        if (s == null) throw new NullPointerException();
        strings.setElementAt(s, i);
        images.setElementAt(img, i);
    }
    boolean isSelected(int i) { check(i); return ((Boolean) selected.elementAt(i)).booleanValue(); }
    int getSelectedIndex() {
        if (type == Choice.MULTIPLE) return -1;
        for (int i = 0; i < strings.size(); i++) if (isSelected(i)) return i;
        return -1;
    }
    int getSelectedFlags(boolean[] r) {
        int n = 0;
        for (int i = 0; i < strings.size(); i++) { r[i] = isSelected(i); if (r[i]) n++; }
        for (int i = strings.size(); i < r.length; i++) r[i] = false;
        return n;
    }
    void setSelectedIndex(int i, boolean sel) {
        check(i);
        if (type == Choice.MULTIPLE) { selected.setElementAt(sel ? Boolean.TRUE : Boolean.FALSE, i); return; }
        if (!sel) return;
        for (int k = 0; k < strings.size(); k++) selected.setElementAt(k == i ? Boolean.TRUE : Boolean.FALSE, k);
        cursor = i;
    }
    void setSelectedFlags(boolean[] f) {
        if (type == Choice.MULTIPLE) {
            for (int i = 0; i < strings.size(); i++) selected.setElementAt(f[i] ? Boolean.TRUE : Boolean.FALSE, i);
        } else {
            int first = 0;
            for (int i = 0; i < strings.size(); i++) if (f[i]) { first = i; break; }
            if (strings.size() > 0) setSelectedIndex(first, true);
        }
    }
    void setFont(int i, Font f) { check(i); fonts.setElementAt(f, i); }
    Font getFont(int i) { check(i); Font f = (Font) fonts.elementAt(i); return f != null ? f : Screen.textFont(); }
    int rowHeight(int i) {
        Image img = (Image) images.elementAt(i);
        int h = getFont(i).getHeight() + 4;
        if (img != null && img.getHeight() + 4 > h) h = img.getHeight() + 4;
        return h;
    }
    void paintRow(Graphics g, int i, int x, int y, int w, boolean hi) {
        int h = rowHeight(i);
        if (hi) {
            g.setColor(Screen.TITLE_BG);
            g.fillRect(x, y, w, h);
        }
        int tx = x + 4;
        if (type == Choice.EXCLUSIVE || type == Choice.MULTIPLE) {
            int s = 9, by = y + (h - s) / 2;
            g.setColor(0xFFFFFF);
            g.fillRect(tx, by, s, s);
            g.setColor(Screen.BORDER);
            g.drawRect(tx, by, s, s);
            if (isSelected(i)) {
                g.setColor(Screen.FG);
                g.fillRect(tx + 2, by + 2, s - 3, s - 3);
            }
            tx += s + 6;
        }
        Image img = (Image) images.elementAt(i);
        if (img != null) {
            g.drawImage(img, tx, y + h / 2, Graphics.VCENTER | Graphics.LEFT);
            tx += img.getWidth() + 4;
        }
        Font f = getFont(i);
        g.setFont(f);
        g.setColor(hi ? 0xFFFFFF : Screen.FG);
        g.drawString((String) strings.elementAt(i), tx, y + (h - f.getHeight()) / 2, Graphics.TOP | Graphics.LEFT);
        g.setFont(Screen.textFont());
    }
}
