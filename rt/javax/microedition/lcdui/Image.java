package javax.microedition.lcdui;

import java.io.IOException;
import java.io.InputStream;

public class Image {
    private Image() {}

    public static Image createImage(int width, int height) {
        if (width <= 0 || height <= 0) throw new IllegalArgumentException();
        return create0(width, height);
    }
    public static Image createImage(Image source) {
        if (!source.isMutable()) return source;
        return region0(source, 0, 0, source.getWidth(), source.getHeight(), 0, false);
    }
    public static Image createImage(String name) throws IOException {
        if (name == null) throw new NullPointerException();
        String path = name.startsWith("/") ? name.substring(1) : name;
        byte[] data = j2me4w.Resources.get(path);
        if (data == null) throw new IOException("Resource not found: " + name);
        Image img = decode0(data, 0, data.length);
        if (img == null) throw new IOException("Cannot decode image: " + name);
        return img;
    }
    public static Image createImage(byte[] imageData, int imageOffset, int imageLength) {
        if (imageData == null) throw new NullPointerException();
        if (imageOffset < 0 || imageLength < 0 || imageOffset + imageLength > imageData.length) throw new ArrayIndexOutOfBoundsException();
        Image img = decode0(imageData, imageOffset, imageLength);
        if (img == null) throw new IllegalArgumentException("Cannot decode image");
        return img;
    }
    public static Image createImage(Image image, int x, int y, int width, int height, int transform) {
        if (image == null) throw new NullPointerException();
        if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > image.getWidth() || y + height > image.getHeight())
            throw new IllegalArgumentException();
        if (transform < 0 || transform > 7) throw new IllegalArgumentException();
        return region0(image, x, y, width, height, transform, false);
    }
    public static Image createImage(InputStream stream) throws IOException {
        if (stream == null) throw new NullPointerException();
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream(4096);
        byte[] buf = new byte[4096];
        int n;
        while ((n = stream.read(buf, 0, buf.length)) > 0) bos.write(buf, 0, n);
        byte[] data = bos.toByteArray();
        Image img = decode0(data, 0, data.length);
        if (img == null) throw new IOException("Cannot decode image");
        return img;
    }
    public static Image createRGBImage(int[] rgb, int width, int height, boolean processAlpha) {
        if (rgb == null) throw new NullPointerException();
        if (width <= 0 || height <= 0) throw new IllegalArgumentException();
        if (width * height > rgb.length) throw new ArrayIndexOutOfBoundsException();
        return rgb0(rgb, width, height, processAlpha);
    }

    public Graphics getGraphics() {
        if (!isMutable()) throw new IllegalStateException("Image is immutable");
        return graphics0();
    }
    public native int getWidth();
    public native int getHeight();
    public native boolean isMutable();
    public void getRGB(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height) {
        if (rgbData == null) throw new NullPointerException();
        if (x < 0 || y < 0 || x + width > getWidth() || y + height > getHeight()) throw new IllegalArgumentException();
        getRGB0(rgbData, offset, scanlength, x, y, width, height);
    }

    private static native Image create0(int w, int h);
    private static native Image decode0(byte[] data, int off, int len);
    private static native Image region0(Image src, int x, int y, int w, int h, int transform, boolean mutable);
    private static native Image rgb0(int[] rgb, int w, int h, boolean alpha);
    private native Graphics graphics0();
    private native void getRGB0(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height);
}
