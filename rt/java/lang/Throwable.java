package java.lang;

public class Throwable {
    private String detailMessage;
    private Throwable cause;

    public Throwable() { fillInStackTrace0(); }
    public Throwable(String message) { detailMessage = message; fillInStackTrace0(); }
    public Throwable(String message, Throwable cause) { detailMessage = message; this.cause = cause; fillInStackTrace0(); }
    public Throwable(Throwable cause) {
        this.cause = cause;
        detailMessage = cause == null ? null : cause.toString();
        fillInStackTrace0();
    }
    private native void fillInStackTrace0();
    public String getMessage() { return detailMessage; }
    public String getLocalizedMessage() { return getMessage(); }
    public Throwable getCause() { return cause; }
    public Throwable initCause(Throwable c) { cause = c; return this; }
    public String toString() {
        String m = getLocalizedMessage();
        String n = getClass().getName();
        return m != null ? n + ": " + m : n;
    }
    public void printStackTrace() { printStackTrace0(toString()); }
    private native void printStackTrace0(String header);
}
