import java.util.Random;
import javax.microedition.lcdui.*;
import javax.microedition.lcdui.game.*;
import javax.microedition.midlet.*;
import javax.microedition.rms.*;

/** Built-in demo: a small arcade game plus pages that exercise the MIDP UI. */
public class DemoMIDlet extends MIDlet implements CommandListener {
    Display display;
    private List menu;
    private final Command exitCmd = new Command("Exit", Command.EXIT, 1);
    final Command backCmd = new Command("Back", Command.BACK, 1);
    private final Command okCmd = new Command("OK", Command.OK, 1);
    private Form form;
    private TextBox user, pass;
    private TextField nameField;
    private Gauge volume;
    private ChoiceGroup level;

    protected void startApp() {
        if (display != null) return;
        display = Display.getDisplay(this);
        menu = new List("J2ME4W demo", List.IMPLICIT, new String[] { "Play Starfall", "Graphics test", "Form test", "Login test", "About" }, null);
        menu.addCommand(exitCmd);
        menu.setCommandListener(this);
        display.setCurrent(menu);
    }

    void showMenu() { display.setCurrent(menu); }

    public void commandAction(Command c, Displayable d) {
        if (c == exitCmd) {
            notifyDestroyed();
        } else if (c == backCmd) {
            showMenu();
        } else if (d == menu && c == List.SELECT_COMMAND) {
            switch (menu.getSelectedIndex()) {
                case 0: display.setCurrent(new StarfallCanvas(this)); break;
                case 1: {
                    GfxCanvas g = new GfxCanvas();
                    g.addCommand(backCmd);
                    g.setCommandListener(this);
                    display.setCurrent(g);
                    break;
                }
                case 2: display.setCurrent(buildForm()); break;
                case 3: {
                    // like an online game's login: one full-screen TextBox per field
                    user = new TextBox("Phone or email", "", 40, TextField.EMAILADDR);
                    user.addCommand(okCmd);
                    user.addCommand(backCmd);
                    user.setCommandListener(this);
                    display.setCurrent(user);
                    break;
                }
                case 4: {
                    Alert a = new Alert("About", "J2ME4W runs MIDP 2.0 games on a JVM written in TypeScript.\n\nEverything you see here is Java bytecode interpreted in your browser.", null, AlertType.INFO);
                    a.setTimeout(Alert.FOREVER);
                    display.setCurrent(a, menu);
                    break;
                }
            }
        } else if (d == user && c == okCmd) {
            pass = new TextBox("Password", "", 20, TextField.ANY | TextField.PASSWORD);
            pass.addCommand(okCmd);
            pass.addCommand(backCmd);
            pass.setCommandListener(this);
            display.setCurrent(pass);
        } else if (d == pass && c == okCmd) {
            System.out.println("login " + user.getString() + " / " + pass.getString().length() + " chars");
            Alert a = new Alert("Logged in", "User: " + user.getString() + "\nPassword: " + pass.getString().length() + " characters",
                null, AlertType.CONFIRMATION);
            a.setTimeout(Alert.FOREVER);
            display.setCurrent(a, menu);
        } else if (d == form && c == okCmd) {
            Alert a = new Alert("Saved", "Hello " + nameField.getString() + "!\nVolume " + volume.getValue()
                + ", level " + level.getString(level.getSelectedIndex()), null, AlertType.CONFIRMATION);
            display.setCurrent(a, menu);
        }
    }

    private Form buildForm() {
        if (form == null) {
            form = new Form("Form test");
            form.append(new StringItem("Welcome", "Use Up/Down to move between items and Fire to edit."));
            nameField = new TextField("Your name", "Player", 20, TextField.ANY);
            form.append(nameField);
            volume = new Gauge("Volume", true, 10, 6);
            form.append(volume);
            level = new ChoiceGroup("Level", Choice.EXCLUSIVE, new String[] { "Easy", "Normal", "Hard" }, null);
            level.setSelectedIndex(1, true);
            form.append(level);
            form.append(new ChoiceGroup("Sound", Choice.POPUP, new String[] { "On", "Off" }, null));
            form.addCommand(okCmd);
            form.addCommand(backCmd);
            form.setCommandListener(this);
        }
        return form;
    }

    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
}

/** Dodge the falling stars. Left/right (or drag) to move. */
class StarfallCanvas extends GameCanvas implements Runnable, CommandListener {
    private final DemoMIDlet midlet;
    private final Random rnd = new Random();
    private final int[] sx = new int[24], sy = new int[24], sv = new int[24], sr = new int[24];
    private int count;
    private int px, score, best, lives;
    private volatile boolean running;
    private boolean over;
    private int dragX = -1;
    private Image ship;
    private final Command back;

    StarfallCanvas(DemoMIDlet m) {
        super(true);
        midlet = m;
        setFullScreenMode(true);
        back = m.backCmd;
        addCommand(back);
        setCommandListener(this);
        ship = makeShip();
        best = loadBest();
        reset();
    }

    private static Image makeShip() {
        int w = 15, h = 12;
        int[] px = new int[w * h];
        for (int y = 0; y < h; y++) {
            int half = y * 7 / (h - 1);
            for (int x = 0; x < w; x++) {
                int d = Math.abs(x - 7);
                if (d <= half) px[y * w + x] = d == half || y == h - 1 ? 0xFF7FD6FF : 0xFF2A8BD8;
            }
        }
        px[4 * w + 7] = 0xFFFFFFFF;
        px[5 * w + 7] = 0xFFFFFFFF;
        return Image.createRGBImage(px, w, h, true);
    }

    private void reset() {
        px = getWidth() / 2;
        score = 0;
        lives = 3;
        count = 0;
        over = false;
    }

    private int loadBest() {
        try {
            RecordStore rs = RecordStore.openRecordStore("starfall", true);
            int b = 0;
            if (rs.getNumRecords() > 0) {
                byte[] d = rs.getRecord(1);
                b = ((d[0] & 0xFF) << 24) | ((d[1] & 0xFF) << 16) | ((d[2] & 0xFF) << 8) | (d[3] & 0xFF);
            }
            rs.closeRecordStore();
            return b;
        } catch (Exception e) {
            return 0;
        }
    }

    private void saveBest() {
        try {
            RecordStore rs = RecordStore.openRecordStore("starfall", true);
            byte[] d = { (byte) (best >> 24), (byte) (best >> 16), (byte) (best >> 8), (byte) best };
            if (rs.getNumRecords() == 0) rs.addRecord(d, 0, 4);
            else rs.setRecord(1, d, 0, 4);
            rs.closeRecordStore();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    protected void showNotify() {
        running = true;
        new Thread(this).start();
    }

    protected void hideNotify() { running = false; }

    public void commandAction(Command c, Displayable d) {
        running = false;
        midlet.showMenu();
    }

    protected void keyPressed(int keyCode) {
        if (over && getGameAction(keyCode) == FIRE) reset();
    }

    protected void pointerPressed(int x, int y) {
        dragX = x;
        if (over) reset();
    }
    protected void pointerDragged(int x, int y) { dragX = x; }
    protected void pointerReleased(int x, int y) { dragX = -1; }

    public void run() {
        Graphics g = getGraphics();
        int w = getWidth(), h = getHeight();
        int frame = 0;
        while (running) {
            long now = System.currentTimeMillis();
            int ks = getKeyStates();
            if (!over) {
                int speed = 4;
                if ((ks & LEFT_PRESSED) != 0) px -= speed;
                if ((ks & RIGHT_PRESSED) != 0) px += speed;
                if (dragX >= 0) px += (dragX - px) / 3;
                if (px < 8) px = 8;
                if (px > w - 8) px = w - 8;
                int spawn = 18 - Math.min(14, score / 150);
                if (frame % spawn == 0 && count < sx.length) {
                    sx[count] = 6 + rnd.nextInt(w - 12);
                    sy[count] = -10;
                    sr[count] = 3 + rnd.nextInt(5);
                    sv[count] = 2 + rnd.nextInt(3) + score / 400;
                    count++;
                }
                for (int i = 0; i < count; i++) {
                    sy[i] += sv[i];
                    int dx = sx[i] - px, dy = sy[i] - (h - 20);
                    if (dx * dx + dy * dy < (sr[i] + 6) * (sr[i] + 6)) {
                        lives--;
                        sy[i] = h + 50;
                        if (lives <= 0) {
                            over = true;
                            if (score > best) { best = score; saveBest(); }
                        }
                    }
                    if (sy[i] > h + 20) {
                        count--;
                        sx[i] = sx[count]; sy[i] = sy[count]; sv[i] = sv[count]; sr[i] = sr[count];
                        i--;
                    }
                }
                score++;
            } else if ((ks & FIRE_PRESSED) != 0) {
                reset();
            }
            draw(g, w, h, frame);
            flushGraphics();
            frame++;
            long spent = System.currentTimeMillis() - now;
            try { Thread.sleep(Math.max(5, 33 - spent)); } catch (InterruptedException e) {}
        }
    }

    private void draw(Graphics g, int w, int h, int frame) {
        // night sky gradient
        for (int y = 0; y < h; y += 4) {
            int t = y * 255 / h;
            g.setColor(10 + t / 12, 12 + t / 10, 40 + t / 4);
            g.fillRect(0, y, w, 4);
        }
        // parallax background dots
        g.setColor(0x506080);
        for (int i = 0; i < 30; i++) {
            int x = (i * 73) % w, y = (i * 151 + frame * (1 + i % 3)) % h;
            g.fillRect(x, y, 1, 1);
        }
        // stars
        for (int i = 0; i < count; i++) {
            int r = sr[i];
            g.setColor(0xFFC040);
            g.fillArc(sx[i] - r, sy[i] - r, r * 2, r * 2, 0, 360);
            g.setColor(0xFFF0B0);
            g.fillArc(sx[i] - r / 2, sy[i] - r / 2, r, r, 0, 360);
        }
        if (!over || frame % 10 < 5) g.drawImage(ship, px, h - 14, Graphics.HCENTER | Graphics.VCENTER);
        // HUD
        Font f = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_SMALL);
        g.setFont(f);
        g.setColor(0xFFFFFF);
        g.drawString("Score " + score / 10, 4, 3, Graphics.TOP | Graphics.LEFT);
        g.drawString("Best " + best / 10, w - 4, 3, Graphics.TOP | Graphics.RIGHT);
        for (int i = 0; i < lives; i++) {
            g.setColor(0xFF5060);
            g.fillTriangle(w / 2 - 14 + i * 12, 6, w / 2 - 8 + i * 12, 6, w / 2 - 11 + i * 12, 12);
        }
        if (over) {
            g.setColor(0x000000);
            g.fillRoundRect(w / 2 - 80, h / 2 - 34, 160, 68, 16, 16);
            g.setColor(0xFFC040);
            g.drawRoundRect(w / 2 - 80, h / 2 - 34, 160, 68, 16, 16);
            g.setFont(Font.getFont(Font.FACE_SYSTEM, Font.STYLE_BOLD, Font.SIZE_LARGE));
            g.drawString("GAME OVER", w / 2, h / 2 - 26, Graphics.TOP | Graphics.HCENTER);
            g.setFont(f);
            g.setColor(0xFFFFFF);
            g.drawString("Fire / tap to play again", w / 2, h / 2 + 8, Graphics.TOP | Graphics.HCENTER);
        }
    }
}

/** Draws every MIDP primitive so rendering bugs are easy to spot. */
class GfxCanvas extends Canvas {
    private int page;

    protected void keyPressed(int keyCode) {
        int a = getGameAction(keyCode);
        if (a == LEFT || a == RIGHT || a == FIRE) { page = 1 - page; repaint(); }
    }

    protected void pointerPressed(int x, int y) { page = 1 - page; repaint(); }

    protected void paint(Graphics g) {
        int w = getWidth(), h = getHeight();
        g.setColor(0xFFFFFF);
        g.fillRect(0, 0, w, h);
        Font small = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_SMALL);
        g.setFont(small);
        g.setColor(0x333333);
        g.drawString("Page " + (page + 1) + "/2 - Fire to switch", w / 2, h - 2, Graphics.BOTTOM | Graphics.HCENTER);
        if (page == 0) shapes(g, w); else images(g, w);
    }

    private void shapes(Graphics g, int w) {
        int cw = w / 3;
        g.setColor(0xD2551F);
        g.fillRect(8, 8, cw - 16, 30);
        g.setColor(0x000000);
        g.drawRect(cw + 8, 8, cw - 16, 30);
        g.setColor(0x2060C0);
        g.fillRoundRect(2 * cw + 8, 8, cw - 16, 30, 12, 12);
        g.setColor(0x20A060);
        g.fillArc(8, 46, cw - 16, 40, 0, 360);
        g.setColor(0x8040C0);
        g.fillArc(cw + 8, 46, cw - 16, 40, 30, 270);
        g.setColor(0x000000);
        g.drawArc(2 * cw + 8, 46, cw - 16, 40, 0, 360);
        g.setColor(0xC03030);
        g.fillTriangle(8, 130, cw - 8, 130, cw / 2, 94);
        for (int i = 0; i < 8; i++) {
            g.setColor(i * 30, 0, 255 - i * 30);
            g.drawLine(cw + 8, 94 + i * 5, 2 * cw - 8, 130 - i * 5);
        }
        g.setStrokeStyle(Graphics.DOTTED);
        g.setColor(0x000000);
        g.drawRect(2 * cw + 8, 94, cw - 16, 36);
        g.setStrokeStyle(Graphics.SOLID);
        // text anchors
        int y = 150;
        g.setColor(0xEEEEEE);
        g.fillRect(0, y - 4, w, 70);
        g.setColor(0xC0C0C0);
        g.drawLine(w / 2, y - 4, w / 2, y + 66);
        g.setColor(0x000000);
        g.setFont(Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_MEDIUM));
        g.drawString("LEFT", w / 2, y, Graphics.TOP | Graphics.LEFT);
        g.drawString("CENTER", w / 2, y + 20, Graphics.TOP | Graphics.HCENTER);
        g.drawString("RIGHT", w / 2, y + 40, Graphics.TOP | Graphics.RIGHT);
        g.setFont(Font.getFont(Font.FACE_PROPORTIONAL, Font.STYLE_BOLD | Font.STYLE_ITALIC, Font.SIZE_LARGE));
        g.setColor(0x2060C0);
        g.drawString("Bold italic", 8, 226, Graphics.TOP | Graphics.LEFT);
        g.setFont(Font.getFont(Font.FACE_MONOSPACE, Font.STYLE_UNDERLINED, Font.SIZE_SMALL));
        g.setColor(0x000000);
        g.drawString("monospace_underlined", 8, 252, Graphics.TOP | Graphics.LEFT);
    }

    private void images(Graphics g, int w) {
        // gradient via drawRGB with alpha
        int gw = w - 16, gh = 30;
        int[] rgb = new int[gw * gh];
        for (int y = 0; y < gh; y++)
            for (int x = 0; x < gw; x++)
                rgb[y * gw + x] = ((x * 255 / gw) << 24) | 0x2060C0;
        g.setColor(0xFFC040);
        g.fillRect(8, 8, gw / 2, gh);
        g.drawRGB(rgb, 0, gw, 8, 8, gw, gh, true);
        // arrow image drawn with all 8 transforms
        Image arrow = Image.createImage(16, 12);
        Graphics ag = arrow.getGraphics();
        ag.setColor(0xFFFFFF);
        ag.fillRect(0, 0, 16, 12);
        ag.setColor(0xD2551F);
        ag.fillRect(0, 4, 10, 4);
        ag.fillTriangle(9, 0, 15, 6, 9, 11);
        int[] t = { Sprite.TRANS_NONE, Sprite.TRANS_ROT90, Sprite.TRANS_ROT180, Sprite.TRANS_ROT270,
            Sprite.TRANS_MIRROR, Sprite.TRANS_MIRROR_ROT90, Sprite.TRANS_MIRROR_ROT180, Sprite.TRANS_MIRROR_ROT270 };
        String[] names = { "NONE", "ROT90", "ROT180", "ROT270", "MIR", "MIR90", "MIR180", "MIR270" };
        Font f = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_SMALL);
        g.setFont(f);
        int cw = (w - 16) / 4;
        for (int i = 0; i < 8; i++) {
            int cx = 8 + (i % 4) * cw + cw / 2, cy = 70 + (i / 4) * 50;
            g.setColor(0xDDDDDD);
            g.drawRect(cx - 12, cy - 12, 24, 24);
            g.drawRegion(arrow, 0, 0, 16, 12, t[i], cx, cy, Graphics.HCENTER | Graphics.VCENTER);
            g.setColor(0x333333);
            g.drawString(names[i], cx, cy + 14, Graphics.TOP | Graphics.HCENTER);
        }
        // clipping
        g.setClip(8, 180, 80, 40);
        g.setColor(0x20A060);
        g.fillArc(-10, 170, 140, 80, 0, 360);
        g.setClip(0, 0, w, getHeight());
        g.setColor(0x000000);
        g.drawRect(8, 180, 79, 39);
        g.drawString("clipped", 96, 192, Graphics.TOP | Graphics.LEFT);
    }
}
