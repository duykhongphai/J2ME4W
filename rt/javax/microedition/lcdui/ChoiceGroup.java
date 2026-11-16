package javax.microedition.lcdui;

public class ChoiceGroup extends Item implements Choice {
    private final ChoiceModel m;
    public ChoiceGroup(String label, int choiceType) { this(label, choiceType, new String[0], null); }
    public ChoiceGroup(String label, int choiceType, String[] stringElements, Image[] imageElements) {
        super(label);
        if (choiceType != EXCLUSIVE && choiceType != MULTIPLE && choiceType != POPUP) throw new IllegalArgumentException();
        m = new ChoiceModel(choiceType == POPUP ? EXCLUSIVE : choiceType, stringElements, imageElements);
        popup = choiceType == POPUP;
    }
    private final boolean popup;
    public int size() { return m.size(); }
    public String getString(int i) { m.check(i); return (String) m.strings.elementAt(i); }
    public Image getImage(int i) { m.check(i); return (Image) m.images.elementAt(i); }
    public int append(String s, Image img) { int r = m.append(s, img); repaint(); return r; }
    public void insert(int i, String s, Image img) { m.insert(i, s, img); repaint(); }
    public void delete(int i) { m.delete(i); repaint(); }
    public void deleteAll() { m.deleteAll(); repaint(); }
    public void set(int i, String s, Image img) { m.set(i, s, img); repaint(); }
    public boolean isSelected(int i) { return m.isSelected(i); }
    public int getSelectedIndex() { return m.getSelectedIndex(); }
    public int getSelectedFlags(boolean[] r) { return m.getSelectedFlags(r); }
    public void setSelectedIndex(int i, boolean sel) { m.setSelectedIndex(i, sel); repaint(); }
    public void setSelectedFlags(boolean[] f) { m.setSelectedFlags(f); repaint(); }
    public void setFitPolicy(int p) { m.fitPolicy = p; }
    public int getFitPolicy() { return m.fitPolicy; }
    public void setFont(int i, Font f) { m.setFont(i, f); repaint(); }
    public Font getFont(int i) { return m.getFont(i); }

    boolean focusable() { return m.size() > 0; }
    int contentHeight(int w) {
        if (popup) return m.size() == 0 ? 0 : m.rowHeight(Math.max(0, m.getSelectedIndex())) + 2;
        int h = 0;
        for (int i = 0; i < m.size(); i++) h += m.rowHeight(i);
        return h;
    }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) {
        if (popup) {
            int sel = m.getSelectedIndex();
            if (sel < 0) return;
            g.setColor(Screen.BORDER);
            g.drawRect(x, y, w - 1, m.rowHeight(sel));
            m.paintRow(g, sel, x + 1, y + 1, w - 2, focused);
            g.setColor(focused ? 0xFFFFFF : Screen.FG);
            g.drawString("v", x + w - 4, y + 2, Graphics.TOP | Graphics.RIGHT);
            return;
        }
        for (int i = 0; i < m.size(); i++) {
            m.paintRow(g, i, x, y, w, focused && i == m.cursor);
            y += m.rowHeight(i);
        }
    }
    boolean itemKey(int action, int keyCode) {
        int n = m.size();
        if (n == 0) return false;
        if (popup) {
            if (action == Canvas.FIRE || action == Canvas.RIGHT) {
                m.setSelectedIndex((Math.max(0, m.getSelectedIndex()) + 1) % n, true);
                notifyStateChanged();
                return true;
            }
            if (action == Canvas.LEFT) {
                m.setSelectedIndex((Math.max(0, m.getSelectedIndex()) + n - 1) % n, true);
                notifyStateChanged();
                return true;
            }
            return false;
        }
        if (action == Canvas.UP && m.cursor > 0) { m.cursor--; return true; }
        if (action == Canvas.DOWN && m.cursor < n - 1) { m.cursor++; return true; }
        if (action == Canvas.FIRE) {
            if (m.type == MULTIPLE) m.setSelectedIndex(m.cursor, !m.isSelected(m.cursor));
            else m.setSelectedIndex(m.cursor, true);
            notifyStateChanged();
            return true;
        }
        return false;
    }
}
