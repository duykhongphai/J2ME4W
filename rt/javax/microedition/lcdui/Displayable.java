package javax.microedition.lcdui;

import java.util.Vector;

public abstract class Displayable {
    String title;
    Ticker ticker;
    final Vector commands = new Vector();
    CommandListener listener;
    boolean shown;

    Displayable() {}

    public String getTitle() { return title; }
    public void setTitle(String s) { title = s; repaintIfShown(); }
    public Ticker getTicker() { return ticker; }
    public void setTicker(Ticker t) { ticker = t; }
    public boolean isShown() { return shown; }
    public void addCommand(Command cmd) {
        if (cmd == null) throw new NullPointerException();
        if (!commands.contains(cmd)) {
            int i = 0;
            while (i < commands.size() && ((Command) commands.elementAt(i)).getPriority() <= cmd.getPriority()) i++;
            commands.insertElementAt(cmd, i);
            Display.commandsChanged(this);
        }
    }
    public void removeCommand(Command cmd) {
        if (commands.removeElement(cmd)) Display.commandsChanged(this);
    }
    public void setCommandListener(CommandListener l) { listener = l; }
    public int getWidth() { return Display.width0(); }
    public int getHeight() { return Display.height0(); }
    protected void sizeChanged(int w, int h) {}

    void repaintIfShown() { if (shown) Display.requestRepaint(); }

    /** Commands to show on the soft keys (may include item commands). */
    Vector softCommands() { return commands; }
    void fireCommand(Command c) {
        if (listener != null) listener.commandAction(c, this);
    }

    // hooks driven by Display / EventLoop
    abstract void paint0(Graphics g);
    void keyEvent0(int type, int keyCode) {}
    void pointerEvent0(int type, int x, int y) {}
    void showNotify0() {}
    void hideNotify0() {}
}
