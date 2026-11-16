package javax.microedition.lcdui;

import java.util.Calendar;
import java.util.Date;
import java.util.TimeZone;

public class DateField extends Item {
    public static final int DATE = 1, TIME = 2, DATE_TIME = 3;
    private Date date;
    private int mode;
    public DateField(String label, int mode) { this(label, mode, null); }
    public DateField(String label, int mode, TimeZone timeZone) { super(label); this.mode = mode; }
    public Date getDate() { return date; }
    public void setDate(Date date) { this.date = date; repaint(); }
    public int getInputMode() { return mode; }
    public void setInputMode(int mode) { this.mode = mode; repaint(); }
    int contentHeight(int w) { return Screen.textFont().getHeight() + 2; }
    void paintContent(Graphics g, int x, int y, int w, boolean focused) {
        g.setColor(Screen.FG);
        if (date == null) { g.drawString("<date>", x, y, Graphics.TOP | Graphics.LEFT); return; }
        Calendar c = Calendar.getInstance();
        c.setTime(date);
        String s = "";
        if ((mode & DATE) != 0) s += c.get(Calendar.DAY_OF_MONTH) + "/" + (c.get(Calendar.MONTH) + 1) + "/" + c.get(Calendar.YEAR) + " ";
        if ((mode & TIME) != 0) {
            int m = c.get(Calendar.MINUTE);
            s += c.get(Calendar.HOUR_OF_DAY) + ":" + (m < 10 ? "0" : "") + m;
        }
        g.drawString(s, x, y, Graphics.TOP | Graphics.LEFT);
    }
}
