package javax.microedition.lcdui;

import java.util.Vector;

public abstract class Item {
    public static final int LAYOUT_DEFAULT = 0, LAYOUT_LEFT = 1, LAYOUT_RIGHT = 2, LAYOUT_CENTER = 3,
        LAYOUT_TOP = 0x10, LAYOUT_BOTTOM = 0x20, LAYOUT_VCENTER = 0x30, LAYOUT_NEWLINE_BEFORE = 0x100,
        LAYOUT_NEWLINE_AFTER = 0x200, LAYOUT_SHRINK = 0x400, LAYOUT_EXPAND = 0x800, LAYOUT_VSHRINK = 0x1000,
        LAYOUT_VEXPAND = 0x2000, LAYOUT_2 = 0x4000;
    public static final int PLAIN = 0, HYPERLINK = 1, BUTTON = 2;

    String label;
    int layout;
    Form owner;
    final Vector commands = new Vector();
    ItemCommandListener itemListener;
    Command defaultCommand;
    int prefW = -1, prefH = -1;

    Item(String label) { this.label = label; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; repaint(); }
    public int getLayout() { return layout; }
    public void setLayout(int layout) { this.layout = layout; repaint(); }
    public void addCommand(Command cmd) {
        if (cmd == null) throw new NullPointerException();
        if (!commands.contains(cmd)) commands.addElement(cmd);
        if (owner != null) Display.commandsChanged(owner);
    }
    public void removeCommand(Command cmd) {
        commands.removeElement(cmd);
        if (defaultCommand == cmd) defaultCommand = null;
        if (owner != null) Display.commandsChanged(owner);
    }
    public void setItemCommandListener(ItemCommandListener l) { itemListener = l; }
    public void setDefaultCommand(Command cmd) {
        defaultCommand = cmd;
        if (cmd != null) addCommand(cmd);
    }
    public int getPreferredWidth() { return prefW >= 0 ? prefW : Display.width0(); }
    public int getPreferredHeight() { return prefH >= 0 ? prefH : height(Display.width0()); }
    public int getMinimumWidth() { return 16; }
    public int getMinimumHeight() { return Screen.textFont().getHeight(); }
    public void setPreferredSize(int width, int height) { prefW = width; prefH = height; repaint(); }
    public void notifyStateChanged() {
        if (owner != null && owner.stateListener != null) owner.stateListener.itemStateChanged(this);
    }

    void repaint() { if (owner != null) owner.repaintIfShown(); }

    int labelHeight(int w) {
        if (label == null || label.length() == 0) return 0;
        Font f = Screen.titleFont();
        return Screen.wrap(label, f, w).size() * f.getHeight();
    }
    int height(int w) { return labelHeight(w) + contentHeight(w); }
    void paint(Graphics g, int x, int y, int w, boolean focused) {
        if (label != null && label.length() > 0) {
            Font f = Screen.titleFont();
            g.setFont(f);
            g.setColor(Screen.FG);
            y = Screen.drawLines(g, Screen.wrap(label, f, w), x, y, f);
            g.setFont(Screen.textFont());
        }
        paintContent(g, x, y, w, focused);
    }
    abstract int contentHeight(int w);
    abstract void paintContent(Graphics g, int x, int y, int w, boolean focused);
    boolean focusable() { return !commands.isEmpty(); }
    /** Returns true when the item consumed the key. */
    boolean itemKey(int action, int keyCode) { return false; }
    void activate() {
        if (defaultCommand != null && itemListener != null) itemListener.commandAction(defaultCommand, this);
    }
}
