package java.util;

public abstract class Calendar {
    public static final int ERA = 0, YEAR = 1, MONTH = 2, WEEK_OF_YEAR = 3, WEEK_OF_MONTH = 4, DATE = 5,
        DAY_OF_MONTH = 5, DAY_OF_YEAR = 6, DAY_OF_WEEK = 7, DAY_OF_WEEK_IN_MONTH = 8, AM_PM = 9, HOUR = 10,
        HOUR_OF_DAY = 11, MINUTE = 12, SECOND = 13, MILLISECOND = 14, ZONE_OFFSET = 15, DST_OFFSET = 16;
    public static final int SUNDAY = 1, MONDAY = 2, TUESDAY = 3, WEDNESDAY = 4, THURSDAY = 5, FRIDAY = 6, SATURDAY = 7;
    public static final int JANUARY = 0, FEBRUARY = 1, MARCH = 2, APRIL = 3, MAY = 4, JUNE = 5, JULY = 6, AUGUST = 7,
        SEPTEMBER = 8, OCTOBER = 9, NOVEMBER = 10, DECEMBER = 11;
    public static final int AM = 0, PM = 1;

    protected int[] fields = new int[17];
    protected boolean[] isSet = new boolean[17];
    protected long time;
    private TimeZone zone;

    protected Calendar() {
        zone = TimeZone.getDefault();
        setTimeInMillis(System.currentTimeMillis());
    }
    public static synchronized Calendar getInstance() { return new j2me4w.GregorianCalendar(); }
    public static synchronized Calendar getInstance(TimeZone zone) {
        Calendar c = new j2me4w.GregorianCalendar();
        c.setTimeZone(zone);
        return c;
    }
    public final Date getTime() { return new Date(getTimeInMillis()); }
    public final void setTime(Date date) { setTimeInMillis(date.getTime()); }
    protected long getTimeInMillis() { return time; }
    protected void setTimeInMillis(long millis) {
        time = millis;
        computeFields();
    }
    public final int get(int field) { return fields[field]; }
    public final void set(int field, int value) {
        fields[field] = value;
        isSet[field] = true;
        computeTime();
        computeFields();
    }
    public void setTimeZone(TimeZone value) { zone = value; computeFields(); }
    public TimeZone getTimeZone() { return zone; }
    protected abstract void computeFields();
    protected abstract void computeTime();
    public boolean equals(Object obj) { return obj instanceof Calendar && ((Calendar) obj).time == time; }
    public boolean before(Object when) { return when instanceof Calendar && time < ((Calendar) when).time; }
    public boolean after(Object when) { return when instanceof Calendar && time > ((Calendar) when).time; }
}
