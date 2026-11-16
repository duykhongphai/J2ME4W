package javax.microedition.lcdui.game;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public class TiledLayer extends Layer {
    private final int cols, rows;
    private int tileW, tileH;
    private Image image;
    private int tileCols, tileCount;
    private final int[] cells;
    private int[] anim = new int[4];
    private int animCount;

    public TiledLayer(int columns, int rows, Image image, int tileWidth, int tileHeight) {
        super(columns * tileWidth, rows * tileHeight);
        if (columns <= 0 || rows <= 0) throw new IllegalArgumentException();
        this.cols = columns;
        this.rows = rows;
        cells = new int[columns * rows];
        setTiles(image, tileWidth, tileHeight);
    }
    private void setTiles(Image img, int tw, int th) {
        if (img == null) throw new NullPointerException();
        if (tw <= 0 || th <= 0 || img.getWidth() % tw != 0 || img.getHeight() % th != 0) throw new IllegalArgumentException();
        image = img;
        tileW = tw;
        tileH = th;
        tileCols = img.getWidth() / tw;
        tileCount = tileCols * (img.getHeight() / th);
        width = cols * tw;
        height = rows * th;
    }
    public int createAnimatedTile(int staticTileIndex) {
        if (staticTileIndex < 0 || staticTileIndex > tileCount) throw new IndexOutOfBoundsException();
        if (animCount == anim.length) {
            int[] n = new int[anim.length * 2];
            System.arraycopy(anim, 0, n, 0, animCount);
            anim = n;
        }
        anim[animCount++] = staticTileIndex;
        return -animCount;
    }
    public void setAnimatedTile(int animatedTileIndex, int staticTileIndex) {
        int i = -animatedTileIndex - 1;
        if (i < 0 || i >= animCount) throw new IndexOutOfBoundsException();
        if (staticTileIndex < 0 || staticTileIndex > tileCount) throw new IndexOutOfBoundsException();
        anim[i] = staticTileIndex;
    }
    public int getAnimatedTile(int animatedTileIndex) {
        int i = -animatedTileIndex - 1;
        if (i < 0 || i >= animCount) throw new IndexOutOfBoundsException();
        return anim[i];
    }
    public void setCell(int col, int row, int tileIndex) {
        if (col < 0 || col >= cols || row < 0 || row >= rows) throw new IndexOutOfBoundsException();
        if (tileIndex > tileCount || -tileIndex > animCount) throw new IndexOutOfBoundsException();
        cells[row * cols + col] = tileIndex;
    }
    public int getCell(int col, int row) {
        if (col < 0 || col >= cols || row < 0 || row >= rows) throw new IndexOutOfBoundsException();
        return cells[row * cols + col];
    }
    public void fillCells(int col, int row, int numCols, int numRows, int tileIndex) {
        if (numCols < 0 || numRows < 0) throw new IllegalArgumentException();
        if (col < 0 || row < 0 || col + numCols > cols || row + numRows > rows) throw new IndexOutOfBoundsException();
        for (int r = row; r < row + numRows; r++)
            for (int c = col; c < col + numCols; c++) cells[r * cols + c] = tileIndex;
    }
    public final int getCellWidth() { return tileW; }
    public final int getCellHeight() { return tileH; }
    public final int getColumns() { return cols; }
    public final int getRows() { return rows; }
    public void setStaticTileSet(Image img, int tileWidth, int tileHeight) {
        int oldCount = tileCount;
        setTiles(img, tileWidth, tileHeight);
        if (tileCount < oldCount) {
            for (int i = 0; i < cells.length; i++) cells[i] = 0;
            animCount = 0;
        }
    }

    private int resolve(int t) { return t < 0 ? anim[-t - 1] : t; }

    void cellPixels(int col, int row, int[] out, int ox, int oy, int w, int h) {
        int t = resolve(getCell(col, row));
        if (t == 0) { for (int i = 0; i < w * h; i++) out[i] = 0; return; }
        t--;
        image.getRGB(out, 0, w, (t % tileCols) * tileW + ox, (t / tileCols) * tileH + oy, w, h);
    }

    public final void paint(Graphics g) {
        if (!visible) return;
        int clipX = g.getClipX(), clipY = g.getClipY();
        int clipX2 = clipX + g.getClipWidth(), clipY2 = clipY + g.getClipHeight();
        int c0 = Math.max(0, (clipX - x) / tileW), c1 = Math.min(cols - 1, (clipX2 - 1 - x) / tileW);
        int r0 = Math.max(0, (clipY - y) / tileH), r1 = Math.min(rows - 1, (clipY2 - 1 - y) / tileH);
        if (clipX2 - 1 - x < 0 || clipY2 - 1 - y < 0) return;
        for (int r = r0; r <= r1; r++) {
            int ty = y + r * tileH;
            for (int c = c0; c <= c1; c++) {
                int t = cells[r * cols + c];
                if (t == 0) continue;
                t = resolve(t);
                if (t == 0) continue;
                t--;
                g.drawRegion(image, (t % tileCols) * tileW, (t / tileCols) * tileH, tileW, tileH, 0, x + c * tileW, ty, Graphics.TOP | Graphics.LEFT);
            }
        }
    }
}
