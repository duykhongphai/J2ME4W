package java.lang;

public final class String {
    public String() { init0(""); }
    public String(String s) { init0(s.toString()); }
    public String(char[] value) { this(value, 0, value.length); }
    public String(char[] value, int offset, int count) { initChars0(value, offset, count); }
    public String(byte[] bytes) { this(bytes, 0, bytes.length); }
    public String(byte[] bytes, int off, int len) { initBytes0(bytes, off, len, null); }
    public String(byte[] bytes, String enc) throws java.io.UnsupportedEncodingException { this(bytes, 0, bytes.length, enc); }
    public String(byte[] bytes, int off, int len, String enc) throws java.io.UnsupportedEncodingException {
        if (enc == null) throw new NullPointerException();
        if (!initBytes0(bytes, off, len, enc)) throw new java.io.UnsupportedEncodingException(enc);
    }
    public String(StringBuffer sb) { init0(sb.toString()); }
    public String(StringBuilder sb) { init0(sb.toString()); }

    private native void init0(String s);
    private native void initChars0(char[] v, int off, int count);
    private native boolean initBytes0(byte[] b, int off, int len, String enc);

    public native int length();
    public boolean isEmpty() { return length() == 0; }
    public native char charAt(int index);
    public native void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin);
    public byte[] getBytes() { return getBytes0(null); }
    public byte[] getBytes(String enc) throws java.io.UnsupportedEncodingException {
        if (enc == null) throw new NullPointerException();
        byte[] b = getBytes0(enc);
        if (b == null) throw new java.io.UnsupportedEncodingException(enc);
        return b;
    }
    private native byte[] getBytes0(String enc);
    public native boolean equals(Object o);
    public native boolean equalsIgnoreCase(String s);
    public native int compareTo(String s);
    public boolean regionMatches(int toffset, String other, int ooffset, int len) {
        return regionMatches(false, toffset, other, ooffset, len);
    }
    public native boolean regionMatches(boolean ignoreCase, int toffset, String other, int ooffset, int len);
    public boolean startsWith(String prefix) { return startsWith(prefix, 0); }
    public native boolean startsWith(String prefix, int toffset);
    public native boolean endsWith(String suffix);
    public native int hashCode();
    public native int indexOf(int ch);
    public native int indexOf(int ch, int from);
    public native int indexOf(String s);
    public native int indexOf(String s, int from);
    public native int lastIndexOf(int ch);
    public native int lastIndexOf(int ch, int from);
    public native int lastIndexOf(String s);
    public native int lastIndexOf(String s, int from);
    public boolean contains(String s) { return indexOf(s) >= 0; }
    public native String substring(int begin);
    public native String substring(int begin, int end);
    public native String concat(String s);
    public native String replace(char oldChar, char newChar);
    public native String toLowerCase();
    public native String toUpperCase();
    public native String trim();
    public String toString() { return this; }
    public native char[] toCharArray();
    public native String intern();

    public static String valueOf(Object obj) { return obj == null ? "null" : obj.toString(); }
    public static String valueOf(char[] data) { return new String(data); }
    public static String valueOf(char[] data, int offset, int count) { return new String(data, offset, count); }
    public static String valueOf(boolean b) { return b ? "true" : "false"; }
    public static native String valueOf(char c);
    public static String valueOf(int i) { return Integer.toString(i); }
    public static String valueOf(long l) { return Long.toString(l); }
    public static String valueOf(float f) { return Float.toString(f); }
    public static String valueOf(double d) { return Double.toString(d); }
}
