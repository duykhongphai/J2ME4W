package java.io;

public class InputStreamReader extends Reader {
    private InputStream in;
    private boolean utf8;
    private int pending = -1;
    public InputStreamReader(InputStream is) { this.in = is; this.utf8 = true; }
    public InputStreamReader(InputStream is, String enc) throws UnsupportedEncodingException {
        this.in = is;
        String e = enc.toUpperCase();
        if (e.equals("UTF-8") || e.equals("UTF8")) utf8 = true;
        else if (e.equals("ISO-8859-1") || e.equals("ISO8859_1") || e.equals("US-ASCII") || e.equals("ASCII")) utf8 = false;
        else throw new UnsupportedEncodingException(enc);
    }
    public int read() throws IOException {
        int b = in.read();
        if (b < 0) return -1;
        if (!utf8 || b < 0x80) return b;
        if ((b & 0xE0) == 0xC0) { int b2 = in.read(); return ((b & 0x1F) << 6) | (b2 & 0x3F); }
        if ((b & 0xF0) == 0xE0) { int b2 = in.read(), b3 = in.read(); return ((b & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F); }
        return 0xFFFD;
    }
    public int read(char[] cbuf, int off, int len) throws IOException {
        int n = 0;
        while (n < len) {
            int c = read();
            if (c < 0) return n == 0 ? -1 : n;
            cbuf[off + n++] = (char) c;
        }
        return n;
    }
    public boolean ready() throws IOException { return in.available() > 0; }
    public void close() throws IOException { in.close(); }
}
