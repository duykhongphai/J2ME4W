package j2me4w.net;

/** Native networking primitives, implemented by the host (WebSocket proxy in browsers). */
final class Net {
    private Net() {}
    /** Connects; blocks until connected. Returns a handle or throws IOException. */
    static native int open0(String host, int port) throws java.io.IOException;
    /** Blocks until at least one byte is available; returns the count, or -1 at end of stream. */
    static native int read0(int handle, byte[] b, int off, int len) throws java.io.IOException;
    static native int available0(int handle);
    static native void write0(int handle, byte[] b, int off, int len) throws java.io.IOException;
    static native void close0(int handle);
    /** Performs an HTTP request; blocks until the full response arrived. headers = {k0, v0, k1, v1, ...}. */
    static native HttpResponse http0(String method, String url, String[] headers, byte[] body) throws java.io.IOException;
}
