package javax.microedition.lcdui;

import java.util.Vector;

public class Form extends Screen {
    final Vector items = new Vector();
    ItemStateListener stateListener;
    private int focus = -1;
    private int scroll;

    public Form(String title) { this.title = title; }
    public Form(String title, Item[] items) {
        this.title = title;
        if (items != null) for (int i = 0; i < items.length; i++) append(items[i]);
    }
    public int append(Item item) {
        if (item.owner != null) throw new IllegalStateException();
        item.owner = this;
        items.addElement(item);
        if (focus < 0 && item.focusable()) { focus = items.size() - 1; Display.commandsChanged(this); }
        repaintIfShown();
        return items.size() - 1;
    }
    public int append(String str) { return append(new StringItem(null, str)); }
    public int append(Image img) { return append(new ImageItem(null, img, Item.LAYOUT_DEFAULT, null)); }
    public void insert(int itemNum, Item item) {
        if (item.owner != null) throw new IllegalStateException();
        if (itemNum < 0 || itemNum > items.size()) throw new IndexOutOfBoundsException();
        item.owner = this;
        items.insertElementAt(item, itemNum);
        if (focus >= itemNum) focus++;
        repaintIfShown();
    }
    public void delete(int itemNum) {
        Item it = (Item) items.elementAt(itemNum);
        it.owner = null;
        items.removeElementAt(itemNum);
        if (focus == itemNum) focus = -1;
        else if (focus > itemNum) focus--;
        if (focus < 0) focus = nextFocusable(-1, 1);
        Display.commandsChanged(this);
        repaintIfShown();
    }
    public void deleteAll() {
        for (int i = 0; i < items.size(); i++) ((Item) items.elementAt(i)).owner = null;
        items.removeAllElements();
        focus = -1;
        scroll = 0;
        Display.commandsChanged(this);
        repaintIfShown();
    }
    public void set(int itemNum, Item item) {
        if (item.owner != null) throw new IllegalStateException();
        ((Item) items.elementAt(itemNum)).owner = null;
        item.owner = this;
        items.setElementAt(item, itemNum);
        repaintIfShown();
    }
    public Item get(int itemNum) { return (Item) items.elementAt(itemNum); }
    public void setItemStateListener(ItemStateListener l) { stateListener = l; }
    public int size() { return items.size(); }

    void focusItem(Item item) {
        int i = items.indexOf(item);
        if (i >= 0) { focus = i; Display.commandsChanged(this); repaintIfShown(); }
    }

    private int nextFocusable(int from, int dir) {
        for (int i = from + dir; i >= 0 && i < items.size(); i += dir)
            if (((Item) items.elementAt(i)).focusable()) return i;
        return -1;
    }

    Item focused() { return focus >= 0 && focus < items.size() ? (Item) items.elementAt(focus) : null; }

    Vector softCommands() {
        Item f = focused();
        if (f == null || f.commands.isEmpty()) return commands;
        Vector v = new Vector();
        for (int i = 0; i < f.commands.size(); i++) v.addElement(f.commands.elementAt(i));
        for (int i = 0; i < commands.size(); i++) v.addElement(commands.elementAt(i));
        return v;
    }

    void fireCommand(Command c) {
        Item f = focused();
        if (f != null && f.commands.contains(c)) {
            if (f.itemListener != null) f.itemListener.commandAction(c, f);
            return;
        }
        super.fireCommand(c);
    }

    private int lastViewH = 100;

    void paintContent(Graphics g, int y, int w, int h) {
        lastViewH = h;
        int iw = w - 8;
        // keep focus visible
        if (focus >= 0) {
            int fy = 0;
            for (int i = 0; i < focus; i++) fy += ((Item) items.elementAt(i)).height(iw) + 4;
            int fh = ((Item) items.elementAt(focus)).height(iw);
            if (fy < scroll) scroll = fy;
            if (fy + fh > scroll + h) scroll = fy + fh - h;
        }
        int yy = y + 2 - scroll;
        for (int i = 0; i < items.size(); i++) {
            Item it = (Item) items.elementAt(i);
            int ih = it.height(iw);
            if (yy + ih > y && yy < y + h) it.paint(g, 4, yy, iw, i == focus);
            yy += ih + 4;
        }
    }

    boolean screenKey(int action, int keyCode) {
        Item f = focused();
        if (f != null && f.itemKey(action, keyCode)) return true;
        if (action == Canvas.UP || action == Canvas.DOWN) {
            int dir = action == Canvas.UP ? -1 : 1;
            int n = nextFocusable(focus, dir);
            if (n >= 0) {
                focus = n;
                Display.commandsChanged(this);
            } else {
                scroll += dir * Screen.textFont().getHeight();
                if (scroll < 0) scroll = 0;
            }
            return true;
        }
        if (action == Canvas.FIRE && f != null) { f.activate(); return true; }
        return false;
    }

    /** Mouse / touch: a tap selects the item under it and acts on it (opens text fields, picks choices...). */
    void pointerEvent0(int type, int x, int y) {
        if (type != EventLoop.POINTER_RELEASED) return;
        int top = title != null ? titleFont().getHeight() + 4 : 0;
        int iw = getWidth() - 8;
        int yy = top + 2 - scroll;
        for (int i = 0; i < items.size(); i++) {
            Item it = (Item) items.elementAt(i);
            int ih = it.height(iw);
            if (y >= yy && y < yy + ih + 4) {
                if (it.focusable() && focus != i) {
                    focus = i;
                    Display.commandsChanged(this);
                }
                repaintIfShown();
                if (it.focusable()) it.itemPointer(x - 4, y - yy, iw);
                repaintIfShown();
                return;
            }
            yy += ih + 4;
        }
    }
}
