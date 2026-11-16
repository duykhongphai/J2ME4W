package java.lang;

public final class Long extends Number {
    public static final long MIN_VALUE = 0x8000000000000000L;
    public static final long MAX_VALUE = 0x7fffffffffffffffL;
    
    private final long value;
    public Long(long value) { this.value = value; }
    public static Long valueOf(long v) { return new Long(v); }
    public int intValue() { return (int) value; }
    public long longValue() { return (long) value; }
    public float floatValue() { return (float) value; }
    public double doubleValue() { return (double) value; }
    public int hashCode() { return (int) (value ^ (value >>> 32)); }
    
    public static long parseLong(String s) throws NumberFormatException { return parseLong(s, 10); }
    public static native long parseLong(String s, int radix) throws NumberFormatException;
    public static Long valueOf(String s) throws NumberFormatException { return new Long(parseLong(s, 10)); }
    public static native String toString(long l, int radix);
    public static String toString(long l) { return toString(l, 10); }
    public static native String toHexString(long l);
    public String toString() { return toString(value, 10); }
    public boolean equals(Object o) { return o instanceof Long && ((Long) o).value == value; }
}
