package java.lang;

public class AssertionError extends Error {
    public AssertionError() { super(); }
    public AssertionError(String message) { super(message); }
    public AssertionError(Object detail) { super(String.valueOf(detail)); }
}
