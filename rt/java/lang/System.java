package java.lang;

import java.io.PrintStream;

public final class System {
    private System() {}
    public static final PrintStream out = new PrintStream(new j2me4w.ConsoleOutputStream(false));
    public static final PrintStream err = new PrintStream(new j2me4w.ConsoleOutputStream(true));
    public static native long currentTimeMillis();
    public static native long nanoTime();
    public static native void arraycopy(Object src, int srcPos, Object dst, int dstPos, int length);
    public static native int identityHashCode(Object o);
    public static native String getProperty(String key);
    public static void exit(int status) { Runtime.getRuntime().exit(status); }
    public static void gc() {}
}
