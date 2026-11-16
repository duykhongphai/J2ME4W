package java.util;

public abstract class TimeZone {
    private static TimeZone defaultZone;
    public TimeZone() {}
    public abstract int getOffset(int era, int year, int month, int day, int dayOfWeek, int millis);
    public abstract int getRawOffset();
    public abstract boolean useDaylightTime();
    public String getID() { return null; }
    public static synchronized TimeZone getTimeZone(String id) {
        if (id == null) throw new NullPointerException();
        if (id.equals("GMT") || id.equals("UTC")) return new j2me4w.SimpleTimeZone("GMT", 0);
        return getDefault();
    }
    public static synchronized TimeZone getDefault() {
        if (defaultZone == null) defaultZone = new j2me4w.SimpleTimeZone("Local", defaultOffset0());
        return defaultZone;
    }
    private static native int defaultOffset0();
    public static String[] getAvailableIDs() { return new String[] { "GMT", "UTC" }; }
}
