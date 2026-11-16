package javax.microedition.io;

import java.io.*;

public class Connector {
    public static final int READ = 1, WRITE = 2, READ_WRITE = 3;
    private Connector() {}

    public static Connection open(String name) throws IOException { return open(name, READ_WRITE, false); }
    public static Connection open(String name, int mode) throws IOException { return open(name, mode, false); }

    public static Connection open(String name, int mode, boolean timeouts) throws IOException {
        if (name == null) throw new IllegalArgumentException("null URL");
        if (mode < READ || mode > READ_WRITE) throw new IllegalArgumentException("mode");
        String lower = name.toLowerCase();
        if (lower.startsWith("socket://")) {
            String rest = name.substring(9);
            int semi = rest.indexOf(';');
            if (semi >= 0) rest = rest.substring(0, semi);
            int colon = rest.lastIndexOf(':');
            if (colon <= 0) throw new ConnectionNotFoundException("Server sockets are not supported: " + name);
            int port;
            try {
                port = Integer.parseInt(rest.substring(colon + 1));
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("Bad port: " + name);
            }
            return new j2me4w.net.SocketConnectionImpl(rest.substring(0, colon), port);
        }
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            return new j2me4w.net.HttpConnectionImpl(name, mode);
        }
        throw new ConnectionNotFoundException("Unsupported protocol: " + name);
    }

    public static DataInputStream openDataInputStream(String name) throws IOException { return new DataInputStream(openInputStream(name)); }
    public static DataOutputStream openDataOutputStream(String name) throws IOException { return new DataOutputStream(openOutputStream(name)); }
    public static InputStream openInputStream(String name) throws IOException { return ((InputConnection) open(name, READ)).openInputStream(); }
    public static OutputStream openOutputStream(String name) throws IOException { return ((OutputConnection) open(name, WRITE)).openOutputStream(); }
}
