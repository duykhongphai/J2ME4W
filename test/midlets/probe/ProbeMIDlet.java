import java.util.Vector;
import javax.microedition.lcdui.*;
import javax.microedition.lcdui.game.*;
import javax.microedition.midlet.*;
import javax.microedition.rms.*;

public class ProbeMIDlet extends MIDlet implements CommandListener {
    private Display display;
    private List menu;
    private final Command exit = new Command("Exit", Command.EXIT, 1);

    protected void startApp() {
        System.out.println("startApp " + getAppProperty("MIDlet-Name") + " " + getAppProperty("Probe-Attr"));
        display = Display.getDisplay(this);
        try {
            rms();
            images();
        } catch (Throwable t) {
            System.out.println("FAILED " + t);
            t.printStackTrace();
        }
        display.setCurrent(new ProbeCanvas(this));
    }

    static String hex(int v) {
        String s = Integer.toHexString(v);
        while (s.length() < 8) s = "0" + s;
        return s;
    }

    private void rms() throws Exception {
        RecordStore rs = RecordStore.openRecordStore("probe", true);
        int a = rs.addRecord("hello".getBytes(), 0, 5);
        int b = rs.addRecord(new byte[] { 1, 2, 3 }, 0, 3);
        rs.setRecord(a, "world!".getBytes(), 0, 6);
        RecordEnumeration en = rs.enumerateRecords(null, null, false);
        StringBuffer sb = new StringBuffer();
        while (en.hasNextElement()) sb.append(en.nextRecordId()).append(',');
        System.out.println("rms ids=" + a + "," + b + " records=" + rs.getNumRecords() + " enum=" + sb + " rec=" + new String(rs.getRecord(a)) + " size=" + rs.getRecordSize(b));
        rs.deleteRecord(b);
        try { rs.getRecord(b); } catch (InvalidRecordIDException e) { System.out.println("rms deleted ok"); }
        rs.closeRecordStore();
        RecordStore again = RecordStore.openRecordStore("probe", false);
        System.out.println("rms reopen " + again.getNumRecords() + " next=" + again.getNextRecordID() + " stores=" + RecordStore.listRecordStores().length);
        again.closeRecordStore();
        try { RecordStore.openRecordStore("missing", false); } catch (RecordStoreNotFoundException e) { System.out.println("rms notfound ok"); }
    }

    private void images() throws Exception {
        Image rgba = Image.createImage("/rgba.png");
        int[] px = new int[12];
        rgba.getRGB(px, 0, 4, 0, 0, 4, 3);
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < px.length; i++) sb.append(hex(px[i])).append(' ');
        System.out.println("rgba " + rgba.getWidth() + "x" + rgba.getHeight() + " " + rgba.isMutable() + " " + sb);

        Image pal = Image.createImage("/pal.png");
        int[] pp = new int[6];
        pal.getRGB(pp, 0, 3, 0, 0, 3, 2);
        sb = new StringBuffer();
        for (int i = 0; i < pp.length; i++) sb.append(hex(pp[i])).append(' ');
        System.out.println("pal " + sb);

        Image gray = Image.createImage("/gray.png");
        int[] gp = new int[5];
        gray.getRGB(gp, 0, 5, 0, 0, 5, 1);
        sb = new StringBuffer();
        for (int i = 0; i < gp.length; i++) sb.append(hex(gp[i])).append(' ');
        System.out.println("gray " + sb);

        Image m = Image.createImage(6, 4);
        Graphics g = m.getGraphics();
        g.setColor(0x102030);
        g.fillRect(1, 1, 2, 2);
        g.setColor(0xFF0000);
        g.drawLine(0, 3, 5, 3);
        g.translate(4, 0);
        g.setColor(0x00FF00);
        g.drawRect(0, 0, 1, 1);
        int[] mp = new int[24];
        m.getRGB(mp, 0, 6, 0, 0, 6, 4);
        sb = new StringBuffer();
        for (int i = 0; i < mp.length; i++) sb.append(mp[i] == -1 ? "." : mp[i] == 0xFF102030 ? "a" : mp[i] == 0xFFFF0000 ? "r" : mp[i] == 0xFF00FF00 ? "g" : "?");
        System.out.println("mutable " + m.isMutable() + " " + sb + " clip=" + g.getClipX() + "," + g.getClipY() + "," + g.getClipWidth() + "," + g.getClipHeight());

        int[] src = { 1, 2, 3, 4, 5, 6 };
        for (int i = 0; i < 6; i++) src[i] |= 0xFF000000;
        Image s = Image.createRGBImage(src, 3, 2, false);
        int[] trans = { Sprite.TRANS_NONE, Sprite.TRANS_ROT90, Sprite.TRANS_ROT180, Sprite.TRANS_ROT270, Sprite.TRANS_MIRROR,
            Sprite.TRANS_MIRROR_ROT90, Sprite.TRANS_MIRROR_ROT180, Sprite.TRANS_MIRROR_ROT270 };
        sb = new StringBuffer();
        for (int t = 0; t < trans.length; t++) {
            Image ti = Image.createImage(s, 0, 0, 3, 2, trans[t]);
            int[] tp = new int[6];
            ti.getRGB(tp, 0, ti.getWidth(), 0, 0, ti.getWidth(), ti.getHeight());
            sb.append(ti.getWidth()).append('x').append(ti.getHeight()).append(':');
            for (int i = 0; i < 6; i++) sb.append(tp[i] & 0xFF);
            sb.append(' ');
        }
        System.out.println("transforms " + sb);

        Font f = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_LARGE);
        System.out.println("font " + (f.getHeight() > 0) + " " + (f.stringWidth("abc") > 0) + " " + f.isBold() + " " + (f == Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_LARGE)));

        Sprite sp = new Sprite(rgba, 2, 3);
        sp.defineReferencePixel(1, 1);
        sp.setRefPixelPosition(10, 10);
        sp.setTransform(Sprite.TRANS_ROT90);
        System.out.println("sprite frames=" + sp.getRawFrameCount() + " pos=" + sp.getX() + "," + sp.getY() + " size=" + sp.getWidth() + "x" + sp.getHeight() + " ref=" + sp.getRefPixelX() + "," + sp.getRefPixelY());
        Sprite other = new Sprite(rgba, 2, 3);
        other.setPosition(11, 9);
        System.out.println("collide " + sp.collidesWith(other, false));
    }

    void showMenu() {
        menu = new List("Menu", List.IMPLICIT, new String[] { "Alpha", "Beta", "Gamma" }, null);
        menu.addCommand(exit);
        menu.setCommandListener(this);
        display.setCurrent(menu);
        System.out.println("menu shown");
    }

    public void commandAction(Command c, Displayable d) {
        if (c == List.SELECT_COMMAND) {
            System.out.println("selected " + menu.getString(menu.getSelectedIndex()));
        } else if (c == exit) {
            System.out.println("exit");
            notifyDestroyed();
        }
    }

    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
}

class ProbeCanvas extends GameCanvas implements Runnable {
    private final ProbeMIDlet midlet;
    private volatile boolean running = true;
    private int x = 20;
    private int frames;
    private int lastStates = -1;

    ProbeCanvas(ProbeMIDlet m) {
        super(false);
        midlet = m;
        setFullScreenMode(true);
        System.out.println("canvas " + getWidth() + "x" + getHeight());
    }

    protected void showNotify() {
        System.out.println("showNotify");
        new Thread(this).start();
    }

    protected void hideNotify() {
        running = false;
        System.out.println("hideNotify");
    }

    public void run() {
        Graphics g = getGraphics();
        while (running) {
            int ks = getKeyStates();
            if ((ks & RIGHT_PRESSED) != 0) x += 2;
            if (ks != lastStates && ks != 0) System.out.println("keyStates " + ks);
            lastStates = ks;
            g.setColor(0x000080);
            g.fillRect(0, 0, getWidth(), getHeight());
            g.setColor(0xFFFFFF);
            g.fillRect(x, 30, 10, 10);
            g.drawString("frame", 0, 0, Graphics.TOP | Graphics.LEFT);
            flushGraphics();
            if (++frames == 1) System.out.println("first frame");
            try { Thread.sleep(20); } catch (InterruptedException e) {}
        }
        System.out.println("loop ended x>20=" + (x > 20));
    }

    protected void keyPressed(int keyCode) {
        System.out.println("keyPressed " + keyCode + " action " + getGameAction(keyCode));
        if (keyCode == KEY_NUM0) midlet.showMenu();
    }

    protected void keyReleased(int keyCode) {
        System.out.println("keyReleased " + keyCode);
    }
}
