package javax.microedition.lcdui.game;

import javax.microedition.lcdui.Graphics;
import java.util.Vector;

public class LayerManager {
    private final Vector layers = new Vector();
    private int vx, vy, vw = Integer.MAX_VALUE, vh = Integer.MAX_VALUE;
    public LayerManager() {}
    public void append(Layer l) { remove(l); layers.addElement(l); }
    public void insert(Layer l, int index) {
        if (l == null) throw new NullPointerException();
        remove(l);
        layers.insertElementAt(l, index);
    }
    public Layer getLayerAt(int index) { return (Layer) layers.elementAt(index); }
    public int getSize() { return layers.size(); }
    public void remove(Layer l) {
        if (l == null) throw new NullPointerException();
        layers.removeElement(l);
    }
    public void setViewWindow(int x, int y, int width, int height) {
        if (width < 0 || height < 0) throw new IllegalArgumentException();
        vx = x; vy = y; vw = width; vh = height;
    }
    public void paint(Graphics g, int x, int y) {
        int cx = g.getClipX(), cy = g.getClipY(), cw = g.getClipWidth(), ch = g.getClipHeight();
        g.translate(x - vx, y - vy);
        g.clipRect(vx, vy, vw, vh);
        for (int i = layers.size() - 1; i >= 0; i--) {
            Layer l = (Layer) layers.elementAt(i);
            if (l.visible) l.paint(g);
        }
        g.translate(vx - x, vy - y);
        g.setClip(cx, cy, cw, ch);
    }
}
