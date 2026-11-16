package j2me4w;

public final class SimpleTimeZone extends java.util.TimeZone {
    private final String id;
    private final int offset;
    public SimpleTimeZone(String id, int offset) { this.id = id; this.offset = offset; }
    public int getOffset(int era, int year, int month, int day, int dayOfWeek, int millis) { return offset; }
    public int getRawOffset() { return offset; }
    public boolean useDaylightTime() { return false; }
    public String getID() { return id; }
}
