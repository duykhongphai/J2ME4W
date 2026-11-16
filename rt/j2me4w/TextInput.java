package j2me4w;

public final class TextInput {
    private TextInput() {}
    /** Asks the user for text; blocks the calling thread. Returns null when cancelled. */
    public static native String edit(String title, String text, int maxSize, int constraints);
}
