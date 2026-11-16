package j2me4w.net;

import java.io.*;
import javax.microedition.io.SocketConnection;

public final class SocketConnectionImpl implements SocketConnection {
    private final String host;
    private final int port;
    private final int handle;
    private boolean closed;
    private final int[] options = new int[5];
    private InputStream in;
    private OutputStream out;

    public SocketConnectionImpl(String host, int port) throws IOException {
        this.host = host;
        this.port = port;
        this.handle = Net.open0(host, port);
    }

    private void check() throws IOException {
        if (closed) throw new IOException("Connection closed");
    }

    public synchronized InputStream openInputStream() throws IOException {
        check();
        if (in == null) {
            in = new InputStream() {
                private boolean eof;
                public int read() throws IOException {
                    byte[] b = new byte[1];
                    int n = read(b, 0, 1);
                    return n <= 0 ? -1 : b[0] & 0xFF;
                }
                public int read(byte[] b, int off, int len) throws IOException {
                    if (b == null) throw new NullPointerException();
                    if (off < 0 || len < 0 || off + len > b.length) throw new IndexOutOfBoundsException();
                    if (len == 0) return 0;
                    if (eof) return -1;
                    int n = Net.read0(handle, b, off, len);
                    if (n < 0) eof = true;
                    return n;
                }
                public int available() { return closed ? 0 : Net.available0(handle); }
                public void close() {}
            };
        }
        return in;
    }

    public DataInputStream openDataInputStream() throws IOException { return new DataInputStream(openInputStream()); }

    public synchronized OutputStream openOutputStream() throws IOException {
        check();
        if (out == null) {
            out = new OutputStream() {
                public void write(int b) throws IOException { write(new byte[] { (byte) b }, 0, 1); }
                public void write(byte[] b, int off, int len) throws IOException {
                    if (b == null) throw new NullPointerException();
                    if (off < 0 || len < 0 || off + len > b.length) throw new IndexOutOfBoundsException();
                    if (closed) throw new IOException("Connection closed");
                    if (len > 0) Net.write0(handle, b, off, len);
                }
                public void flush() {}
                public void close() {}
            };
        }
        return out;
    }

    public DataOutputStream openDataOutputStream() throws IOException { return new DataOutputStream(openOutputStream()); }

    public synchronized void close() {
        if (!closed) {
            closed = true;
            Net.close0(handle);
        }
    }

    public void setSocketOption(byte option, int value) throws IOException {
        if (option < 0 || option > 4) throw new IllegalArgumentException();
        check();
        options[option] = value;
    }
    public int getSocketOption(byte option) throws IOException {
        if (option < 0 || option > 4) throw new IllegalArgumentException();
        check();
        return options[option];
    }
    public String getLocalAddress() throws IOException { check(); return "127.0.0.1"; }
    public int getLocalPort() throws IOException { check(); return 0; }
    public String getAddress() throws IOException { check(); return host; }
    public int getPort() throws IOException { check(); return port; }
}
