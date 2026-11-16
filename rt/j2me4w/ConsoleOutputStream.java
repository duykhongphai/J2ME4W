package j2me4w;

import java.io.OutputStream;

public final class ConsoleOutputStream extends OutputStream {
    private final boolean err;
    public ConsoleOutputStream(boolean err) { this.err = err; }
    public void write(int b) { write0(err, b); }
    public void write(byte[] b, int off, int len) { writeArray0(err, b, off, len); }
    private static native void write0(boolean err, int b);
    private static native void writeArray0(boolean err, byte[] b, int off, int len);
}
