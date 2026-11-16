package java.io;

public class OutputStreamWriter extends Writer {
    private OutputStream out;
    private String enc;
    public OutputStreamWriter(OutputStream os) { this.out = os; this.enc = "UTF-8"; }
    public OutputStreamWriter(OutputStream os, String enc) throws UnsupportedEncodingException {
        this.out = os;
        this.enc = enc;
        "x".getBytes(enc);
    }
    public void write(char[] cbuf, int off, int len) throws IOException { out.write(new String(cbuf, off, len).getBytes(enc)); }
    public void flush() throws IOException { out.flush(); }
    public void close() throws IOException { out.close(); }
}
