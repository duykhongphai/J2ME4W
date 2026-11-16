package java.io;

public class DataInputStream extends InputStream implements DataInput {
    protected InputStream in;
    public DataInputStream(InputStream in) { this.in = in; }
    public int read() throws IOException { return in.read(); }
    public final int read(byte[] b) throws IOException { return in.read(b, 0, b.length); }
    public final int read(byte[] b, int off, int len) throws IOException { return in.read(b, off, len); }
    public final void readFully(byte[] b) throws IOException { readFully(b, 0, b.length); }
    public final void readFully(byte[] b, int off, int len) throws IOException {
        if (len < 0) throw new IndexOutOfBoundsException();
        int n = 0;
        while (n < len) {
            int c = in.read(b, off + n, len - n);
            if (c < 0) throw new EOFException();
            n += c;
        }
    }
    public final int skipBytes(int n) throws IOException {
        int total = 0;
        int cur;
        while (total < n && (cur = (int) in.skip(n - total)) > 0) total += cur;
        return total;
    }
    private int r() throws IOException {
        int c = in.read();
        if (c < 0) throw new EOFException();
        return c;
    }
    public final boolean readBoolean() throws IOException { return r() != 0; }
    public final byte readByte() throws IOException { return (byte) r(); }
    public final int readUnsignedByte() throws IOException { return r(); }
    public final short readShort() throws IOException { int a = r(), b = r(); return (short) ((a << 8) | b); }
    public final int readUnsignedShort() throws IOException { int a = r(), b = r(); return (a << 8) | b; }
    public final char readChar() throws IOException { int a = r(), b = r(); return (char) ((a << 8) | b); }
    public final int readInt() throws IOException {
        int a = r(), b = r(), c = r(), d = r();
        return (a << 24) | (b << 16) | (c << 8) | d;
    }
    public final long readLong() throws IOException { return ((long) readInt() << 32) | (readInt() & 0xFFFFFFFFL); }
    public final float readFloat() throws IOException { return Float.intBitsToFloat(readInt()); }
    public final double readDouble() throws IOException { return Double.longBitsToDouble(readLong()); }
    public final String readUTF() throws IOException { return readUTF(this); }
    public static final String readUTF(DataInput in) throws IOException {
        int utflen = in.readUnsignedShort();
        byte[] b = new byte[utflen];
        in.readFully(b, 0, utflen);
        char[] out = new char[utflen];
        int count = 0, n = 0;
        while (count < utflen) {
            int c = b[count] & 0xff;
            if (c < 0x80) { count++; out[n++] = (char) c; }
            else if ((c >> 5) == 6) {
                if (count + 2 > utflen) throw new UTFDataFormatException();
                int c2 = b[count + 1];
                if ((c2 & 0xC0) != 0x80) throw new UTFDataFormatException();
                out[n++] = (char) (((c & 0x1F) << 6) | (c2 & 0x3F));
                count += 2;
            } else if ((c >> 4) == 14) {
                if (count + 3 > utflen) throw new UTFDataFormatException();
                int c2 = b[count + 1], c3 = b[count + 2];
                if (((c2 & 0xC0) != 0x80) || ((c3 & 0xC0) != 0x80)) throw new UTFDataFormatException();
                out[n++] = (char) (((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F));
                count += 3;
            } else throw new UTFDataFormatException();
        }
        return new String(out, 0, n);
    }
    public long skip(long n) throws IOException { return in.skip(n); }
    public int available() throws IOException { return in.available(); }
    public void close() throws IOException { in.close(); }
    public synchronized void mark(int readlimit) { in.mark(readlimit); }
    public synchronized void reset() throws IOException { in.reset(); }
    public boolean markSupported() { return in.markSupported(); }
}
