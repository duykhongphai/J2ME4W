package javax.microedition.lcdui;

public class ImageItem extends Item {
    private Image image;
    private String altText;
    private int appearance;
    public ImageItem(String label, Image img, int layout, String altText) { this(label, img, layout, altText, PLAIN); }
    public ImageItem(String label, Image image, int layout, String altText, int appearanceMode) {
        super(label);
        this.image = image;
        this.layout = layout;
        this.altText = altText;
        this.appearance = appearanceMode;
    }
    public Image getImage() { return image; }
    public void setImage(Image img) { image = img; repaint(); }
    public String getAltText() { return altText; }
    public void setAltText(String text) { altText = text; }
    public int getAppearanceMode() { return appearance; }
    int contentHeight(int w) { return image == null ? 0 : image.getHeight() + 2; }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) {
        if (image == null) return;
        int h = layout & 3;
        if (h == LAYOUT_CENTER) g.drawImage(image, x + w / 2, y, Graphics.TOP | Graphics.HCENTER);
        else if (h == LAYOUT_RIGHT) g.drawImage(image, x + w, y, Graphics.TOP | Graphics.RIGHT);
        else g.drawImage(image, x, y, Graphics.TOP | Graphics.LEFT);
    }
}
