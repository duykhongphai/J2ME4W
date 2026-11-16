package javax.microedition.lcdui;

public class Alert extends Screen {
    public static final int FOREVER = -2;
    public static final Command DISMISS_COMMAND = new Command("Done", Command.OK, 0);

    private String text;
    private Image image;
    private AlertType type;
    private int timeout = getDefaultTimeout();
    private Gauge indicator;
    Displayable next;
    private int shownSerial;

    public Alert(String title) { this(title, null, null, null); }
    public Alert(String title, String alertText, Image alertImage, AlertType alertType) {
        this.title = title;
        this.text = alertText;
        this.image = alertImage;
        this.type = alertType;
    }
    public int getDefaultTimeout() { return 2000; }
    public int getTimeout() { return timeout; }
    public void setTimeout(int time) {
        if (time <= 0 && time != FOREVER) throw new IllegalArgumentException();
        timeout = time;
    }
    public AlertType getType() { return type; }
    public void setType(AlertType type) { this.type = type; }
    public String getString() { return text; }
    public void setString(String str) { text = str; repaintIfShown(); }
    public Image getImage() { return image; }
    public void setImage(Image img) { image = img; repaintIfShown(); }
    public void setIndicator(Gauge indicator) { this.indicator = indicator; }
    public Gauge getIndicator() { return indicator; }

    java.util.Vector softCommands() {
        if (commands.isEmpty()) {
            java.util.Vector v = new java.util.Vector();
            v.addElement(DISMISS_COMMAND);
            return v;
        }
        return commands;
    }

    void fireCommand(Command c) {
        if (listener != null) listener.commandAction(c, this);
        else dismiss();
    }

    void dismiss() {
        if (Display.current != this) return;
        Displayable n = next;
        next = null;
        if (n != null) Display.show(n);
    }

    void showNotify0() {
        final int serial = ++shownSerial;
        if (timeout != FOREVER && commands.isEmpty()) {
            final int t = timeout;
            new Thread() {
                public void run() {
                    try { Thread.sleep(t); } catch (InterruptedException e) {}
                    if (serial == shownSerial && Display.current == Alert.this) {
                        if (listener != null) listener.commandAction(DISMISS_COMMAND, Alert.this);
                        else dismiss();
                    }
                }
            }.start();
        }
    }

    void paintContent(Graphics g, int y, int w, int h) {
        Font f = textFont();
        y += 4;
        if (image != null) {
            g.drawImage(image, w / 2, y, Graphics.TOP | Graphics.HCENTER);
            y += image.getHeight() + 4;
        }
        g.setColor(FG);
        y = drawLines(g, wrap(text, f, w - 8), 4, y, f);
        if (indicator != null) indicator.paint(g, 4, y + 4, w - 8, false);
    }

    boolean screenKey(int action, int keyCode) {
        if (action == Canvas.FIRE) { fireCommand(DISMISS_COMMAND); return true; }
        return false;
    }
}
