package java.lang;

public final class Byte extends Number {
    public static final byte MIN_VALUE = -128;
    public static final byte MAX_VALUE = 127;
    
    private final byte value;
    public Byte(byte value) { this.value = value; }
    public static Byte valueOf(byte v) { return new Byte(v); }
    public int intValue() { return (int) value; }
    public long longValue() { return (long) value; }
    public float floatValue() { return (float) value; }
    public double doubleValue() { return (double) value; }
    public int hashCode() { return value; }
    
    public static byte parseByte(String s) throws NumberFormatException { return parseByte(s, 10); }
    public static byte parseByte(String s, int radix) throws NumberFormatException {
        int i = Integer.parseInt(s, radix);
        if (i < MIN_VALUE || i > MAX_VALUE) throw new NumberFormatException(s);
        return (byte) i;
    }
    public byte byteValue() { return value; }
    public String toString() { return Integer.toString(value); }
    public boolean equals(Object o) { return o instanceof Byte && ((Byte) o).value == value; }
}
