package javax.microedition.lcdui.game;

import javax.microedition.lcdui.*;

public abstract class GameCanvas extends Canvas {
    public static final int UP_PRESSED = 1 << Canvas.UP, DOWN_PRESSED = 1 << Canvas.DOWN,
        LEFT_PRESSED = 1 << Canvas.LEFT, RIGHT_PRESSED = 1 << Canvas.RIGHT, FIRE_PRESSED = 1 << Canvas.FIRE,
        GAME_A_PRESSED = 1 << Canvas.GAME_A, GAME_B_PRESSED = 1 << Canvas.GAME_B,
        GAME_C_PRESSED = 1 << Canvas.GAME_C, GAME_D_PRESSED = 1 << Canvas.GAME_D;

    private Image buffer;

    protected GameCanvas(boolean suppressKeyEvents) {
        CanvasAccess.setSuppressGameKeys(this, suppressKeyEvents);
        buffer = Image.createImage(getWidth(), getHeight());
    }

    protected Graphics getGraphics() { return buffer.getGraphics(); }

    public int getKeyStates() { return keyStates0(); }
    private static native int keyStates0();

    public void paint(Graphics g) { g.drawImage(buffer, 0, 0, Graphics.TOP | Graphics.LEFT); }

    public void flushGraphics(int x, int y, int width, int height) { flushGraphics(); }
    public void flushGraphics() { if (isShown()) CanvasAccess.present(buffer); }
}
