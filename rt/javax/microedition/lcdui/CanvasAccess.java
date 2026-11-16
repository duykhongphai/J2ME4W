package javax.microedition.lcdui;

public final class CanvasAccess {
    private CanvasAccess() {}
    public static void setSuppressGameKeys(Canvas c, boolean b) { c.suppressGameKeys = b; }
    public static void present(Image img) { Display.present0(img); }
}
