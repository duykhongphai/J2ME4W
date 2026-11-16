package javax.microedition.lcdui;

public class StringItem extends Item {
    private String text;
    private int appearance;
    private Font font;
    public StringItem(String label, String text) { this(label, text, PLAIN); }
    public StringItem(String label, String text, int appearanceMode) {
        super(label);
        this.text = text;
        this.appearance = appearanceMode;
    }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; repaint(); }
    public int getAppearanceMode() { return appearance; }
    public void setFont(Font font) { this.font = font; repaint(); }
    public Font getFont() { return font != null ? font : Screen.textFont(); }
    int contentHeight(int w) {
        if (text == null || text.length() == 0) return 0;
        Font f = getFont();
        return Screen.wrap(text, f, w - (appearance == BUTTON ? 8 : 0)).size() * f.getHeight() + (appearance == BUTTON ? 6 : 0);
    }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) {
        if (text == null) return;
        Font f = getFont();
        g.setFont(f);
        if (appearance == BUTTON) {
            int h = contentHeight(w);
            g.setColor(focused ? Screen.HI_BG : 0xEEEEEE);
            g.fillRect(x, y, w - 1, h - 1);
            g.setColor(Screen.BORDER);
            g.drawRect(x, y, w - 1, h - 1);
            g.setColor(Screen.FG);
            Screen.drawLines(g, Screen.wrap(text, f, w - 8), x + 4, y + 3, f);
        } else {
            g.setColor(appearance == HYPERLINK ? 0x0000CC : Screen.FG);
            Screen.drawLines(g, Screen.wrap(text, f, w), x, y, f);
        }
        g.setFont(Screen.textFont());
    }
}
