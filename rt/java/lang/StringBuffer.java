package java.lang;

public final class StringBuffer {
    public StringBuffer() {}
    public StringBuffer(int capacity) { if (capacity < 0) throw new NegativeArraySizeException(); }
    public StringBuffer(String s) { append(s.toString()); }
    public native int length();
    public int capacity() { return length() + 16; }
    public void ensureCapacity(int c) {}
    public native char charAt(int index);
    public native void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin);
    public native void setCharAt(int index, char ch);
    public native void setLength(int len);
    public native StringBuffer append(String s);
    public StringBuffer append(Object o) { return append(String.valueOf(o)); }
    public StringBuffer append(StringBuffer sb) { return append(String.valueOf(sb)); }
    public StringBuffer append(char[] str) { return append(new String(str)); }
    public StringBuffer append(char[] str, int offset, int len) { return append(new String(str, offset, len)); }
    public StringBuffer append(boolean b) { return append(b ? "true" : "false"); }
    public native StringBuffer append(char c);
    public native StringBuffer append(int i);
    public StringBuffer append(long l) { return append(Long.toString(l)); }
    public StringBuffer append(float f) { return append(Float.toString(f)); }
    public StringBuffer append(double d) { return append(Double.toString(d)); }
    public native StringBuffer delete(int start, int end);
    public native StringBuffer deleteCharAt(int index);
    public native StringBuffer replace(int start, int end, String str);
    public native StringBuffer insert(int offset, String s);
    public StringBuffer insert(int offset, Object o) { return insert(offset, String.valueOf(o)); }
    public StringBuffer insert(int offset, char[] str) { return insert(offset, new String(str)); }
    public StringBuffer insert(int offset, boolean b) { return insert(offset, String.valueOf(b)); }
    public StringBuffer insert(int offset, char c) { return insert(offset, String.valueOf(c)); }
    public StringBuffer insert(int offset, int i) { return insert(offset, String.valueOf(i)); }
    public StringBuffer insert(int offset, long l) { return insert(offset, String.valueOf(l)); }
    public StringBuffer insert(int offset, float f) { return insert(offset, String.valueOf(f)); }
    public StringBuffer insert(int offset, double d) { return insert(offset, String.valueOf(d)); }
    public native int indexOf(String s);
    public native int indexOf(String s, int from);
    public native int lastIndexOf(String s);
    public native String substring(int start);
    public native String substring(int start, int end);
    public native StringBuffer reverse();
    public native String toString();
}
