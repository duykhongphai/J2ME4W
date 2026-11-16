package java.lang;

public final class StringBuilder {
    public StringBuilder() {}
    public StringBuilder(int capacity) { if (capacity < 0) throw new NegativeArraySizeException(); }
    public StringBuilder(String s) { append(s.toString()); }
    public native int length();
    public int capacity() { return length() + 16; }
    public void ensureCapacity(int c) {}
    public native char charAt(int index);
    public native void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin);
    public native void setCharAt(int index, char ch);
    public native void setLength(int len);
    public native StringBuilder append(String s);
    public StringBuilder append(Object o) { return append(String.valueOf(o)); }
    public StringBuilder append(StringBuffer sb) { return append(String.valueOf(sb)); }
    public StringBuilder append(char[] str) { return append(new String(str)); }
    public StringBuilder append(char[] str, int offset, int len) { return append(new String(str, offset, len)); }
    public StringBuilder append(boolean b) { return append(b ? "true" : "false"); }
    public native StringBuilder append(char c);
    public native StringBuilder append(int i);
    public StringBuilder append(long l) { return append(Long.toString(l)); }
    public StringBuilder append(float f) { return append(Float.toString(f)); }
    public StringBuilder append(double d) { return append(Double.toString(d)); }
    public native StringBuilder delete(int start, int end);
    public native StringBuilder deleteCharAt(int index);
    public native StringBuilder replace(int start, int end, String str);
    public native StringBuilder insert(int offset, String s);
    public StringBuilder insert(int offset, Object o) { return insert(offset, String.valueOf(o)); }
    public StringBuilder insert(int offset, char[] str) { return insert(offset, new String(str)); }
    public StringBuilder insert(int offset, boolean b) { return insert(offset, String.valueOf(b)); }
    public StringBuilder insert(int offset, char c) { return insert(offset, String.valueOf(c)); }
    public StringBuilder insert(int offset, int i) { return insert(offset, String.valueOf(i)); }
    public StringBuilder insert(int offset, long l) { return insert(offset, String.valueOf(l)); }
    public StringBuilder insert(int offset, float f) { return insert(offset, String.valueOf(f)); }
    public StringBuilder insert(int offset, double d) { return insert(offset, String.valueOf(d)); }
    public native int indexOf(String s);
    public native int indexOf(String s, int from);
    public native int lastIndexOf(String s);
    public native String substring(int start);
    public native String substring(int start, int end);
    public native StringBuilder reverse();
    public native String toString();
}
