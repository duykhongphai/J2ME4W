package javax.microedition.lcdui;

public abstract class CustomItem extends Item {
    protected static final int TRAVERSE_HORIZONTAL = 1, TRAVERSE_VERTICAL = 2, KEY_PRESS = 4, KEY_RELEASE = 8,
        KEY_REPEAT = 0x10, POINTER_PRESS = 0x20, POINTER_RELEASE = 0x40, POINTER_DRAG = 0x80, NONE = 0;
    protected CustomItem(String label) { super(label); }
    public int getGameAction(int keyCode) { return Canvas.gameAction(keyCode); }
    protected final int getInteractionModes() { return KEY_PRESS | KEY_RELEASE | TRAVERSE_VERTICAL; }
    protected abstract int getMinContentWidth();
    protected abstract int getMinContentHeight();
    protected abstract int getPrefContentWidth(int height);
    protected abstract int getPrefContentHeight(int width);
    protected abstract void paint(Graphics g, int w, int h);
    protected final void invalidate() { repaint(); }
    protected final void repaint(int x, int y, int w, int h) { repaint(); }
    protected void keyPressed(int keyCode) {}
    protected void keyReleased(int keyCode) {}
    protected void keyRepeated(int keyCode) {}
    protected void pointerPressed(int x, int y) {}
    protected void pointerReleased(int x, int y) {}
    protected void pointerDragged(int x, int y) {}
    protected void showNotify() {}
    protected void hideNotify() {}
    protected void sizeChanged(int w, int h) {}
    protected boolean traverse(int dir, int viewportWidth, int viewportHeight, int[] visRect_inout) { return false; }
    protected void traverseOut() {}
    boolean focusable() { return true; }
    int contentHeight(int w) { return getPrefContentHeight(w); }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) {
        int cw = Math.min(w, getPrefContentWidth(-1));
        int ch = getPrefContentHeight(w);
        int cx = g.getClipX(), cy = g.getClipY(), cwid = g.getClipWidth(), chei = g.getClipHeight();
        g.translate(x, y);
        g.clipRect(0, 0, cw, ch);
        paint(g, cw, ch);
        g.translate(-x, -y);
        g.setClip(cx, cy, cwid, chei);
    }
    boolean itemKey(int action, int keyCode) { keyPressed(keyCode); return action != Canvas.UP && action != Canvas.DOWN; }
    void itemPointer(int x, int y, int w) {
        int cy = y - labelHeight(w);
        pointerPressed(x, cy);
        pointerReleased(x, cy);
    }
}
