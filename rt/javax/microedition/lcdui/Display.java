package javax.microedition.lcdui;

import java.util.Vector;
import javax.microedition.midlet.MIDlet;

public class Display {
    public static final int LIST_ELEMENT = 1, CHOICE_GROUP_ELEMENT = 2, ALERT = 3;
    public static final int COLOR_BACKGROUND = 0, COLOR_FOREGROUND = 1, COLOR_HIGHLIGHTED_BACKGROUND = 2,
        COLOR_HIGHLIGHTED_FOREGROUND = 3, COLOR_BORDER = 4, COLOR_HIGHLIGHTED_BORDER = 5;

    private static Display instance;
    static Displayable current;
    static boolean repaintPending;
    static Image screen;
    static final Vector serialQueue = new Vector();

    // soft-key / menu state
    static Command leftCmd, rightCmd;
    static Vector leftMenu, rightMenu;
    static Vector menu;
    static int menuIndex;

    private Display() {}

    public static Display getDisplay(MIDlet m) {
        if (instance == null) instance = new Display();
        return instance;
    }

    public Displayable getCurrent() { return current; }

    public void setCurrent(Displayable next) {
        if (next == null) return;
        if (next instanceof Alert && ((Alert) next).next == null && current != next) ((Alert) next).next = current;
        show(next);
    }
    public void setCurrent(Alert alert, Displayable next) {
        if (alert == null || next == null) throw new NullPointerException();
        if (next instanceof Alert) throw new IllegalArgumentException();
        alert.next = next;
        show(alert);
    }
    public void setCurrentItem(Item item) {
        if (item.owner != null) {
            item.owner.focusItem(item);
            show(item.owner);
        }
    }

    static void show(Displayable next) {
        if (next == current) { requestRepaint(); return; }
        Displayable old = current;
        current = next;
        menu = null;
        if (old != null) { old.shown = false; old.hideNotify0(); }
        next.shown = true;
        next.showNotify0();
        commandsChanged(next);
        requestRepaint();
    }

    public boolean isColor() { return true; }
    public int numColors() { return 1 << 24; }
    public int numAlphaLevels() { return 256; }
    public boolean vibrate(int duration) { vibrate0(duration); return true; }
    public boolean flashBacklight(int duration) { return true; }
    public int getBestImageWidth(int imageType) { return width0(); }
    public int getBestImageHeight(int imageType) { return height0(); }
    public int getBorderStyle(boolean highlighted) { return highlighted ? Graphics.DOTTED : Graphics.SOLID; }
    public int getColor(int colorSpecifier) {
        switch (colorSpecifier) {
            case COLOR_BACKGROUND: return 0xFFFFFF;
            case COLOR_FOREGROUND: return 0x000000;
            case COLOR_HIGHLIGHTED_BACKGROUND: return 0x2060C0;
            case COLOR_HIGHLIGHTED_FOREGROUND: return 0xFFFFFF;
            case COLOR_BORDER: return 0x808080;
            case COLOR_HIGHLIGHTED_BORDER: return 0x2060C0;
        }
        throw new IllegalArgumentException();
    }
    public void callSerially(Runnable r) { runLater(r); }

    /** Runs r on the event thread after the current event. */
    static void runLater(Runnable r) {
        synchronized (serialQueue) { serialQueue.addElement(r); }
        postEvent0(EventLoop.SERIAL, 0, 0);
    }

    // ------------------------------------------------------------ painting
    static void requestRepaint() {
        if (!repaintPending) {
            repaintPending = true;
            postEvent0(EventLoop.REPAINT, 0, 0);
        }
    }
    static void serviceRepaints() { if (repaintPending) paintNow(); }
    static void paintNow() {
        repaintPending = false;
        Displayable d = current;
        if (d == null) return;
        if (screen == null) screen = screen0();
        Graphics g = screen.getGraphics();
        d.paint0(g);
        if (menu != null) paintMenu(screen.getGraphics());
        present0(screen);
    }

    static void paintMenu(Graphics g) {
        Font f = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_MEDIUM);
        int lh = f.getHeight() + 6;
        int w = width0(), h = height0();
        int mh = lh * menu.size() + 4;
        if (mh > h - 8) mh = h - 8;
        int my = h - mh;
        g.setFont(f);
        g.setColor(0x000000);
        g.fillRect(0, my - 1, w, mh + 1);
        g.setColor(0xF4F4F4);
        g.fillRect(1, my, w - 2, mh);
        int first = 0;
        int visible = (mh - 4) / lh;
        if (menuIndex >= visible) first = menuIndex - visible + 1;
        for (int i = first; i < menu.size() && i - first < visible; i++) {
            int y = my + 2 + (i - first) * lh;
            if (i == menuIndex) {
                g.setColor(0x2060C0);
                g.fillRect(2, y, w - 4, lh);
                g.setColor(0xFFFFFF);
            } else {
                g.setColor(0x000000);
            }
            Command c = (Command) menu.elementAt(i);
            g.drawString((i + 1) + ". " + c.getLabel(), 8, y + 3, Graphics.TOP | Graphics.LEFT);
        }
    }

    // ------------------------------------------------------------ commands / soft keys
    static void commandsChanged(Displayable d) {
        if (d != current) return;
        Vector cmds = d.softCommands();
        Vector pos = new Vector(), neg = new Vector();
        for (int i = 0; i < cmds.size(); i++) {
            Command c = (Command) cmds.elementAt(i);
            if (c.isNegative()) neg.addElement(c); else pos.addElement(c);
        }
        // Single-sided command sets: keep both soft keys useful.
        if (pos.isEmpty() && neg.size() > 1) { pos.addElement(neg.elementAt(0)); neg.removeElementAt(0); }
        if (neg.isEmpty() && pos.size() > 1) {
            neg.addElement(pos.elementAt(pos.size() - 1));
            pos.removeElementAt(pos.size() - 1);
        }
        leftCmd = pos.size() == 1 ? (Command) pos.elementAt(0) : null;
        leftMenu = pos.size() > 1 ? pos : null;
        rightCmd = neg.size() == 1 ? (Command) neg.elementAt(0) : null;
        rightMenu = neg.size() > 1 ? neg : null;
        setSoftLabels0(leftMenu != null ? "Options" : leftCmd != null ? leftCmd.getLabel() : null,
                       rightMenu != null ? "Options" : rightCmd != null ? rightCmd.getLabel() : null);
    }

    static boolean hasSoftCommand(int keyCode) {
        if (keyCode == -6) return leftCmd != null || leftMenu != null;
        if (keyCode == -7) return rightCmd != null || rightMenu != null;
        return false;
    }

    static void softKey(int keyCode) {
        Command c = keyCode == -6 ? leftCmd : rightCmd;
        Vector m = keyCode == -6 ? leftMenu : rightMenu;
        if (m != null) {
            menu = m;
            menuIndex = 0;
            requestRepaint();
        } else if (c != null) {
            current.fireCommand(c);
        }
    }

    static void menuKey(int keyCode) {
        int action = Canvas.gameAction(keyCode);
        if (keyCode == -7 || keyCode == -8) {
            menu = null;
        } else if (action == Canvas.UP) {
            menuIndex = (menuIndex + menu.size() - 1) % menu.size();
        } else if (action == Canvas.DOWN) {
            menuIndex = (menuIndex + 1) % menu.size();
        } else if (keyCode == -6 || action == Canvas.FIRE || (keyCode >= '1' && keyCode <= '9')) {
            int i = action == Canvas.FIRE || keyCode == -6 ? menuIndex : keyCode - '1';
            if (keyCode == -5) i = menuIndex;
            Vector m = menu;
            menu = null;
            requestRepaint();
            if (i < m.size()) current.fireCommand((Command) m.elementAt(i));
            return;
        }
        requestRepaint();
    }

    // ------------------------------------------------------------ natives
    static native int width0();
    static native int height0();
    static native Image screen0();
    static native void present0(Image img);
    static native void postEvent0(int type, int a, int b);
    static native void waitEvent0(int[] ev);
    static native void vibrate0(int ms);
    static native void setSoftLabels0(String left, String right);
}
