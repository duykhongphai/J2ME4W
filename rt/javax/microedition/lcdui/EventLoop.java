package javax.microedition.lcdui;

import javax.microedition.midlet.MIDlet;

/** Internal: the system event thread. */
public final class EventLoop {
    static final int KEY_PRESSED = 1, KEY_RELEASED = 2, KEY_REPEATED = 3;
    static final int POINTER_PRESSED = 4, POINTER_RELEASED = 5, POINTER_DRAGGED = 6;
    static final int REPAINT = 7, SERIAL = 8, PAUSE = 9, RESUME = 10;

    private static MIDlet midlet;
    private EventLoop() {}

    public static void setMIDlet(MIDlet m) { midlet = m; }

    public static void run() {
        int[] ev = new int[3];
        while (true) {
            Display.waitEvent0(ev);
            try {
                dispatch(ev[0], ev[1], ev[2]);
            } catch (Throwable t) {
                System.err.println("Uncaught exception in event handler:");
                t.printStackTrace();
            }
        }
    }

    static void dispatch(int type, int a, int b) {
        Displayable d = Display.current;
        switch (type) {
            case KEY_PRESSED:
            case KEY_RELEASED:
            case KEY_REPEATED:
                if (d == null) return;
                if (Display.menu != null) {
                    if (type == KEY_PRESSED) Display.menuKey(a);
                    return;
                }
                if ((a == -6 || a == -7) && Display.hasSoftCommand(a)) {
                    if (type == KEY_PRESSED) Display.softKey(a);
                    return;
                }
                d.keyEvent0(type, a);
                return;
            case POINTER_PRESSED:
            case POINTER_RELEASED:
            case POINTER_DRAGGED:
                if (d != null && Display.menu == null) d.pointerEvent0(type, a, b);
                return;
            case REPAINT:
                if (Display.repaintPending) Display.paintNow();
                return;
            case SERIAL:
                Runnable r = null;
                synchronized (Display.serialQueue) {
                    if (!Display.serialQueue.isEmpty()) {
                        r = (Runnable) Display.serialQueue.elementAt(0);
                        Display.serialQueue.removeElementAt(0);
                    }
                }
                if (r != null) r.run();
                return;
            case PAUSE:
                if (midlet != null) javax.microedition.midlet.MIDletBridge.pause(midlet);
                if (d != null) d.hideNotify0();
                return;
            case RESUME:
                if (d != null) { d.showNotify0(); Display.requestRepaint(); }
                if (midlet != null) {
                    try { javax.microedition.midlet.MIDletBridge.start(midlet); } catch (Throwable t) { t.printStackTrace(); }
                }
                return;
        }
    }
}
