package j2me4w;

public final class TextInput {
    private TextInput() {}

    public static native String edit(String title, String text, int maxSize, int constraints);

    public static native int edit2(String title, String text, int maxSize, int constraints, String[] commands, String[] result);
}
