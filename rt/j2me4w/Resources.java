package j2me4w;

public final class Resources {
    private Resources() {}
    /** Returns the bytes of a JAR resource (path without leading slash) or null. */
    public static native byte[] get(String path);
}
