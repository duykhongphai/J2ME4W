package java.lang;

public final class Integer extends Number {
    public static final int MIN_VALUE = 0x80000000;
    public static final int MAX_VALUE = 0x7fffffff;
    
    private final int value;
    public Integer(int value) { this.value = value; }
    public static Integer valueOf(int v) { return new Integer(v); }
    public int intValue() { return (int) value; }
    public long longValue() { return (long) value; }
    public float floatValue() { return (float) value; }
    public double doubleValue() { return (double) value; }
    public int hashCode() { return value; }
    
    public static Integer valueOf(String s) throws NumberFormatException { return new Integer(parseInt(s, 10)); }
    public static Integer valueOf(String s, int radix) throws NumberFormatException { return new Integer(parseInt(s, radix)); }
    public static int parseInt(String s) throws NumberFormatException { return parseInt(s, 10); }
    public static native int parseInt(String s, int radix) throws NumberFormatException;
    public static native String toString(int i, int radix);
    public static String toString(int i) { return toString(i, 10); }
    public static native String toHexString(int i);
    public static native String toOctalString(int i);
    public static native String toBinaryString(int i);
    public String toString() { return toString(value, 10); }
    public boolean equals(Object o) { return o instanceof Integer && ((Integer) o).value == value; }
}
