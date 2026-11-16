package j2me4w.net;

final class Net {
    private Net() {}
    static native int open0(String host, int port) throws java.io.IOException;
    static native int read0(int handle, byte[] b, int off, int len) throws java.io.IOException;
    static native int available0(int handle);
    static native void write0(int handle, byte[] b, int off, int len) throws java.io.IOException;
    static native void close0(int handle);
    static native HttpResponse http0(String method, String url, String[] headers, byte[] body) throws java.io.IOException;
}
