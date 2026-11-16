package javax.microedition.lcdui;

public class List extends Screen implements Choice {
    public static final Command SELECT_COMMAND = new Command("", Command.SCREEN, 0);
    private final ChoiceModel m;
    private Command selectCommand = SELECT_COMMAND;
    private int scroll;

    public List(String title, int listType) { this(title, listType, new String[0], null); }
    public List(String title, int listType, String[] stringElements, Image[] imageElements) {
        if (listType != IMPLICIT && listType != EXCLUSIVE && listType != MULTIPLE) throw new IllegalArgumentException();
        this.title = title;
        m = new ChoiceModel(listType, stringElements, imageElements);
    }
    public int size() { return m.size(); }
    public String getString(int i) { m.check(i); return (String) m.strings.elementAt(i); }
    public Image getImage(int i) { m.check(i); return (Image) m.images.elementAt(i); }
    public int append(String s, Image img) { int r = m.append(s, img); repaintIfShown(); return r; }
    public void insert(int i, String s, Image img) { m.insert(i, s, img); repaintIfShown(); }
    public void delete(int i) { m.delete(i); repaintIfShown(); }
    public void deleteAll() { m.deleteAll(); repaintIfShown(); }
    public void set(int i, String s, Image img) { m.set(i, s, img); repaintIfShown(); }
    public boolean isSelected(int i) { return m.isSelected(i); }
    public int getSelectedIndex() { return m.type == IMPLICIT && m.size() > 0 ? m.cursor : m.getSelectedIndex(); }
    public int getSelectedFlags(boolean[] r) { return m.getSelectedFlags(r); }
    public void setSelectedIndex(int i, boolean sel) { m.setSelectedIndex(i, sel); if (sel) m.cursor = i; repaintIfShown(); }
    public void setSelectedFlags(boolean[] f) { m.setSelectedFlags(f); repaintIfShown(); }
    public void setFitPolicy(int p) { m.fitPolicy = p; }
    public int getFitPolicy() { return m.fitPolicy; }
    public void setFont(int i, Font f) { m.setFont(i, f); repaintIfShown(); }
    public Font getFont(int i) { return m.getFont(i); }
    public void setSelectCommand(Command command) {
        if (m.type != IMPLICIT) return;
        if (selectCommand != null && selectCommand != SELECT_COMMAND) removeCommand(selectCommand);
        selectCommand = command;
        if (command != null && command != SELECT_COMMAND) addCommand(command);
    }
    public void removeCommand(Command cmd) {
        if (cmd == selectCommand) selectCommand = null;
        super.removeCommand(cmd);
    }

    void paintContent(Graphics g, int y, int w, int h) {
        int n = m.size();
        if (n == 0) return;
        int cy = 0;
        for (int i = 0; i < m.cursor; i++) cy += m.rowHeight(i);
        int ch = m.rowHeight(m.cursor);
        if (cy < scroll) scroll = cy;
        if (cy + ch > scroll + h) scroll = cy + ch - h;
        int yy = y - scroll;
        for (int i = 0; i < n; i++) {
            int rh = m.rowHeight(i);
            if (yy + rh > y && yy < y + h) m.paintRow(g, i, 0, yy, w, i == m.cursor);
            yy += rh;
        }
    }

    boolean screenKey(int action, int keyCode) {
        int n = m.size();
        if (n == 0) return false;
        if (action == Canvas.UP) { m.cursor = (m.cursor + n - 1) % n; return true; }
        if (action == Canvas.DOWN) { m.cursor = (m.cursor + 1) % n; return true; }
        if (action == Canvas.FIRE) {
            if (m.type == IMPLICIT) {
                m.setSelectedIndex(m.cursor, true);
                if (selectCommand != null && listener != null) listener.commandAction(selectCommand, this);
            } else if (m.type == EXCLUSIVE) {
                m.setSelectedIndex(m.cursor, true);
            } else {
                m.setSelectedIndex(m.cursor, !m.isSelected(m.cursor));
            }
            return true;
        }
        return false;
    }

    void pointerEvent0(int type, int x, int y) {
        if (type != EventLoop.POINTER_PRESSED) return;
        int top = title != null ? titleFont().getHeight() + 4 : 0;
        int yy = top - scroll;
        for (int i = 0; i < m.size(); i++) {
            int rh = m.rowHeight(i);
            if (y >= yy && y < yy + rh) {
                boolean again = m.cursor == i;
                m.cursor = i;
                if (again || m.type != IMPLICIT) screenKey(Canvas.FIRE, -5);
                repaintIfShown();
                return;
            }
            yy += rh;
        }
    }
}
