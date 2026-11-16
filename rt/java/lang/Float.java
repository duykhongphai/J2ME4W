package java.lang;

public final class Float extends Number {
    public static final float POSITIVE_INFINITY = 1.0f / 0.0f;
    public static final float NEGATIVE_INFINITY = -1.0f / 0.0f;
    public static final float NaN = 0.0f / 0.0f;
    public static final float MAX_VALUE = 3.4028235e+38f;
    public static final float MIN_VALUE = 1.4e-45f;
    
    private final float value;
    public Float(float value) { this.value = value; }
    public static Float valueOf(float v) { return new Float(v); }
    public int intValue() { return (int) value; }
    public long longValue() { return (long) value; }
    public float floatValue() { return (float) value; }
    public double doubleValue() { return (double) value; }
    public int hashCode() { return floatToIntBits(value); }
    
    public Float(double value) { this.value = (float) value; }
    public static Float valueOf(String s) throws NumberFormatException { return new Float(parseFloat(s)); }
    public static native float parseFloat(String s) throws NumberFormatException;
    public static native String toString(float f);
    public static native int floatToIntBits(float f);
    public static native float intBitsToFloat(int bits);
    public static boolean isNaN(float v) { return v != v; }
    public static boolean isInfinite(float v) { return v == POSITIVE_INFINITY || v == NEGATIVE_INFINITY; }
    public boolean isNaN() { return isNaN(value); }
    public boolean isInfinite() { return isInfinite(value); }
    public String toString() { return toString(value); }
    public boolean equals(Object o) { return o instanceof Float && floatToIntBits(((Float) o).value) == floatToIntBits(value); }
}
