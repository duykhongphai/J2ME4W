import java.awt.image.BufferedImage;
import java.awt.image.IndexColorModel;
import java.io.File;
import javax.imageio.ImageIO;

public class GenPng {
    public static void main(String[] args) throws Exception {
        File dir = new File(args[0]);
        dir.mkdirs();

        BufferedImage rgba = new BufferedImage(4, 3, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 3; y++)
            for (int x = 0; x < 4; x++)
                rgba.setRGB(x, y, ((x * 80) << 24) | ((x * 60) << 16) | ((y * 100) << 8) | (x + y * 4) * 10);
        ImageIO.write(rgba, "png", new File(dir, "rgba.png"));

        byte[] r = { (byte) 255, 0, 0, 10 }, g = { 0, (byte) 255, 0, 20 }, b = { 0, 0, (byte) 255, 30 }, a = { (byte) 255, (byte) 255, (byte) 128, 0 };
        IndexColorModel cm = new IndexColorModel(2, 4, r, g, b, a);
        BufferedImage pal = new BufferedImage(3, 2, BufferedImage.TYPE_BYTE_BINARY, cm);
        int[] idx = { 0, 1, 2, 3, 2, 1 };
        for (int i = 0; i < 6; i++) pal.getRaster().setSample(i % 3, i / 3, 0, idx[i]);
        ImageIO.write(pal, "png", new File(dir, "pal.png"));

        BufferedImage gray = new BufferedImage(5, 1, BufferedImage.TYPE_BYTE_GRAY);
        for (int x = 0; x < 5; x++) gray.getRaster().setSample(x, 0, 0, x * 60);
        ImageIO.write(gray, "png", new File(dir, "gray.png"));

        BufferedImage spr = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                boolean border = x < 2 || y < 2 || x > 13 || y > 13;
                boolean eye = (y == 5 || y == 6) && (x == 5 || x == 10);
                spr.setRGB(x, y, border ? 0 : eye ? 0xFF202020 : 0xFFFFD020);
            }
        ImageIO.write(spr, "png", new File(dir, "player.png"));
    }
}
