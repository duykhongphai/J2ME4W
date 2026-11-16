package java.io;

public class PrintStream extends OutputStream {
    private OutputStream out;
    private boolean error;
    public PrintStream(OutputStream out) { this.out = out; }
    public void write(int b) { try { out.write(b); } catch (IOException e) { error = true; } }
    public void write(byte[] b, int off, int len) { try { out.write(b, off, len); } catch (IOException e) { error = true; } }
    public void flush() { try { out.flush(); } catch (IOException e) { error = true; } }
    public void close() { try { out.close(); } catch (IOException e) { error = true; } }
    public boolean checkError() { flush(); return error; }
    protected void setError() { error = true; }
    private void writeString(String s) { byte[] b = s.getBytes(); write(b, 0, b.length); }
    public void print(String s) { writeString(s == null ? "null" : s); }
    public void print(Object o) { writeString(String.valueOf(o)); }
    public void print(char[] s) { writeString(new String(s)); }
    public void print(boolean b) { writeString(String.valueOf(b)); }
    public void print(char c) { writeString(String.valueOf(c)); }
    public void print(int i) { writeString(String.valueOf(i)); }
    public void print(long l) { writeString(String.valueOf(l)); }
    public void print(float f) { writeString(String.valueOf(f)); }
    public void print(double d) { writeString(String.valueOf(d)); }
    public void println() { writeString("\n"); flush(); }
    public void println(String s) { print(s); println(); }
    public void println(Object o) { print(o); println(); }
    public void println(char[] s) { print(s); println(); }
    public void println(boolean b) { print(b); println(); }
    public void println(char c) { print(c); println(); }
    public void println(int i) { print(i); println(); }
    public void println(long l) { print(l); println(); }
    public void println(float f) { print(f); println(); }
    public void println(double d) { print(d); println(); }
}
