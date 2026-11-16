package java.lang;

public final class Character {
    public static final int MIN_RADIX = 2;
    public static final int MAX_RADIX = 36;
    public static final char MIN_VALUE = '\u0000';
    public static final char MAX_VALUE = '\uffff';
    private final char value;
    public Character(char value) { this.value = value; }
    public char charValue() { return value; }
    public static Character valueOf(char c) { return new Character(c); }
    public int hashCode() { return value; }
    public boolean equals(Object o) { return o instanceof Character && ((Character) o).value == value; }
    public String toString() { return String.valueOf(value); }
    public static native boolean isLowerCase(char ch);
    public static native boolean isUpperCase(char ch);
    public static boolean isDigit(char ch) { return ch >= '0' && ch <= '9'; }
    public static native boolean isLetter(char ch);
    public static boolean isLetterOrDigit(char ch) { return isDigit(ch) || isLetter(ch); }
    public static boolean isSpaceChar(char ch) { return ch == ' ' || ch == '\u00a0' || ch == '\u2028' || ch == '\u2029'; }
    public static boolean isWhitespace(char ch) { return (ch >= '\t' && ch <= '\r') || (ch >= '\u001c' && ch <= ' '); }
    public static native char toLowerCase(char ch);
    public static native char toUpperCase(char ch);
    public static int digit(char ch, int radix) {
        int v;
        if (ch >= '0' && ch <= '9') v = ch - '0';
        else if (ch >= 'a' && ch <= 'z') v = ch - 'a' + 10;
        else if (ch >= 'A' && ch <= 'Z') v = ch - 'A' + 10;
        else return -1;
        return v < radix ? v : -1;
    }
    public static char forDigit(int digit, int radix) {
        if (digit < 0 || digit >= radix || radix < MIN_RADIX || radix > MAX_RADIX) return '\0';
        return digit < 10 ? (char) ('0' + digit) : (char) ('a' + digit - 10);
    }
}
