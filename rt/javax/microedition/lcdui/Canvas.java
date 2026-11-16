package javax.microedition.lcdui;

public abstract class Canvas extends Displayable {
    public static final int UP = 1, DOWN = 6, LEFT = 2, RIGHT = 5, FIRE = 8;
    public static final int GAME_A = 9, GAME_B = 10, GAME_C = 11, GAME_D = 12;
    public static final int KEY_NUM0 = 48, KEY_NUM1 = 49, KEY_NUM2 = 50, KEY_NUM3 = 51, KEY_NUM4 = 52,
        KEY_NUM5 = 53, KEY_NUM6 = 54, KEY_NUM7 = 55, KEY_NUM8 = 56, KEY_NUM9 = 57, KEY_STAR = 42, KEY_POUND = 35;

    boolean fullScreen;
    boolean suppressGameKeys;

    protected Canvas() {}

    public boolean isDoubleBuffered() { return true; }
    public boolean hasPointerEvents() { return true; }
    public boolean hasPointerMotionEvents() { return true; }
    public boolean hasRepeatEvents() { return true; }

    public int getKeyCode(int gameAction) {
        switch (gameAction) {
            case UP: return -1;
            case DOWN: return -2;
            case LEFT: return -3;
            case RIGHT: return -4;
            case FIRE: return -5;
            case GAME_A: return KEY_NUM1;
            case GAME_B: return KEY_NUM3;
            case GAME_C: return KEY_NUM7;
            case GAME_D: return KEY_NUM9;
        }
        throw new IllegalArgumentException();
    }
    public String getKeyName(int keyCode) {
        switch (keyCode) {
            case -1: return "Up";
            case -2: return "Down";
            case -3: return "Left";
            case -4: return "Right";
            case -5: return "Select";
            case -6: return "Soft1";
            case -7: return "Soft2";
            case -8: return "Clear";
            case KEY_STAR: return "*";
            case KEY_POUND: return "#";
        }
        if (keyCode >= KEY_NUM0 && keyCode <= KEY_NUM9) return String.valueOf((char) keyCode);
        if (keyCode > 0) return String.valueOf((char) keyCode);
        throw new IllegalArgumentException();
    }
    public int getGameAction(int keyCode) { return gameAction(keyCode); }

    static int gameAction(int keyCode) {
        switch (keyCode) {
            case -1: case KEY_NUM2: return UP;
            case -2: case KEY_NUM8: return DOWN;
            case -3: case KEY_NUM4: return LEFT;
            case -4: case KEY_NUM6: return RIGHT;
            case -5: case KEY_NUM5: return FIRE;
            case KEY_NUM1: return GAME_A;
            case KEY_NUM3: return GAME_B;
            case KEY_NUM7: return GAME_C;
            case KEY_NUM9: return GAME_D;
        }
        return 0;
    }

    public void setFullScreenMode(boolean mode) {
        if (fullScreen != mode) {
            fullScreen = mode;
            repaintIfShown();
        }
    }

    protected void keyPressed(int keyCode) {}
    protected void keyRepeated(int keyCode) {}
    protected void keyReleased(int keyCode) {}
    protected void pointerPressed(int x, int y) {}
    protected void pointerReleased(int x, int y) {}
    protected void pointerDragged(int x, int y) {}

    public final void repaint(int x, int y, int width, int height) { if (shown) Display.requestRepaint(); }
    public final void repaint() { if (shown) Display.requestRepaint(); }
    public final void serviceRepaints() { Display.serviceRepaints(); }

    protected void showNotify() {}
    protected void hideNotify() {}
    protected abstract void paint(Graphics g);

    void paint0(Graphics g) { paint(g); }
    void keyEvent0(int type, int keyCode) {
        if (suppressGameKeys && gameAction(keyCode) != 0) return;
        if (type == EventLoop.KEY_PRESSED) keyPressed(keyCode);
        else if (type == EventLoop.KEY_RELEASED) keyReleased(keyCode);
        else keyRepeated(keyCode);
    }
    void pointerEvent0(int type, int x, int y) {
        if (type == EventLoop.POINTER_PRESSED) pointerPressed(x, y);
        else if (type == EventLoop.POINTER_RELEASED) pointerReleased(x, y);
        else pointerDragged(x, y);
    }
    void showNotify0() { showNotify(); }
    void hideNotify0() { hideNotify(); }
}
