package j2me4w;

import javax.microedition.midlet.MIDlet;
import javax.microedition.midlet.MIDletBridge;

public final class Launcher {
    private Launcher() {}
    public static void main(String midletClass) {
        MIDlet m;
        try {
            m = (MIDlet) Class.forName(midletClass).newInstance();
        } catch (Throwable t) {
            System.err.println("Cannot create MIDlet " + midletClass);
            t.printStackTrace();
            fatal0("Cannot create MIDlet: " + t);
            return;
        }
        javax.microedition.lcdui.EventLoop.setMIDlet(m);
        try {
            MIDletBridge.start(m);
        } catch (Throwable t) {
            t.printStackTrace();
            fatal0("startApp failed: " + t);
            return;
        }
        javax.microedition.lcdui.EventLoop.run();
    }
    private static native void fatal0(String message);
}
