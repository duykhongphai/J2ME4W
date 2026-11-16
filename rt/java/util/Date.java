package java.util;

public class Date {
    private long millis;
    public Date() { this(System.currentTimeMillis()); }
    public Date(long date) { millis = date; }
    public long getTime() { return millis; }
    public void setTime(long time) { millis = time; }
    public boolean equals(Object obj) { return obj instanceof Date && ((Date) obj).millis == millis; }
    public int hashCode() { return (int) millis ^ (int) (millis >> 32); }
    public String toString() { return toString0(millis); }
    private static native String toString0(long millis);
}
