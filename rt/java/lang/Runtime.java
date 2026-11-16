package java.lang;

public class Runtime {
    private static final Runtime instance = new Runtime();
    private Runtime() {}
    public static Runtime getRuntime() { return instance; }
    public native void exit(int status);
    public long freeMemory() { return 4L * 1024 * 1024; }
    public long totalMemory() { return 8L * 1024 * 1024; }
    public void gc() {}
}
