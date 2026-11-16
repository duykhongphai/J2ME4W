package j2me4w;

import java.util.Calendar;

public final class GregorianCalendar extends Calendar {
    public GregorianCalendar() { super(); }
    protected void computeFields() {
        TimeZone0.fields(time, getTimeZone() == null ? 0 : getTimeZone().getRawOffset(), fields);
    }
    protected void computeTime() {
        time = TimeZone0.time(fields, getTimeZone() == null ? 0 : getTimeZone().getRawOffset());
    }
}

final class TimeZone0 {
    static native void fields(long time, int offset, int[] fields);
    static native long time(int[] fields, int offset);
}
