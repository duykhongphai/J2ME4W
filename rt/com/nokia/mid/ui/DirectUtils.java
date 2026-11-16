package com.nokia.mid.ui;

import javax.microedition.lcdui.*;

public class DirectUtils {
    private DirectUtils() {}
    public static DirectGraphics getDirectGraphics(Graphics g) { return new j2me4w.NokiaDirectGraphics(g); }
    public static Image createImage(byte[] imageData, int imageOffset, int imageLength) {
        return Image.createImage(imageData, imageOffset, imageLength);
    }
    public static Image createImage(int width, int height, int argb) {
        if (width <= 0 || height <= 0) throw new IllegalArgumentException();
        return j2me4w.GraphicsExt.createARGBImage(width, height, argb);
    }
}
