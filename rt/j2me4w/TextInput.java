package j2me4w;

public final class TextInput {
    private TextInput() {}

    /** Asks the user for text; blocks the calling thread. Returns null when cancelled. */
    public static native String edit(String title, String text, int maxSize, int constraints);

    /**
     * Asks the user for text, offering the screen's commands as extra buttons; blocks the calling thread.
     * The edited text is stored in result[0]. Returns -2 when cancelled, -1 when confirmed without a
     * command, or the index of the command the user picked.
     */
    public static native int edit2(String title, String text, int maxSize, int constraints, String[] commands, String[] result);
}
