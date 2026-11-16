package javax.microedition.lcdui;

public class Gauge extends Item {
    public static final int INDEFINITE = -1, CONTINUOUS_IDLE = 0, INCREMENTAL_IDLE = 1, CONTINUOUS_RUNNING = 2,
        INCREMENTAL_UPDATING = 3;
    private final boolean interactive;
    private int max, value;
    public Gauge(String label, boolean interactive, int maxValue, int initialValue) {
        super(label);
        this.interactive = interactive;
        this.max = maxValue;
        setValue(initialValue);
    }
    public void setValue(int v) {
        if (max != INDEFINITE) { if (v < 0) v = 0; if (v > max) v = max; }
        value = v;
        repaint();
    }
    public int getValue() { return value; }
    public void setMaxValue(int m) { max = m; setValue(value); }
    public int getMaxValue() { return max; }
    public boolean isInteractive() { return interactive; }
    boolean focusable() { return interactive || super.focusable(); }
    int contentHeight(int w) { return 12; }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) { paint0(g, x, y, w, focused); }
    void paint(Graphics g, int x, int y, int w, boolean focused) { super.paint(g, x, y, w, focused); }
    void paint0(Graphics g, int x, int y, int w, boolean focused) {
        g.setColor(focused ? Screen.TITLE_BG : Screen.BORDER);
        g.drawRect(x, y, w - 1, 10);
        int fill = max > 0 ? (w - 3) * value / max : 0;
        g.setColor(0x40A040);
        g.fillRect(x + 1, y + 1, fill + 1, 9);
    }
    boolean itemKey(int action, int keyCode) {
        if (!interactive) return false;
        if (action == Canvas.LEFT && value > 0) { setValue(value - 1); notifyStateChanged(); return true; }
        if (action == Canvas.RIGHT && value < max) { setValue(value + 1); notifyStateChanged(); return true; }
        return false;
    }
}
