package javax.microedition.midlet;

public abstract class MIDlet {
    protected MIDlet() {}
    protected abstract void startApp() throws MIDletStateChangeException;
    protected abstract void pauseApp();
    protected abstract void destroyApp(boolean unconditional) throws MIDletStateChangeException;
    public final void notifyDestroyed() { exit0(); }
    public final void notifyPaused() {}
    public final void resumeRequest() {}
    public final String getAppProperty(String key) { return getAppProperty0(key); }
    public final boolean platformRequest(String url) throws javax.microedition.io.ConnectionNotFoundException {
        platformRequest0(url);
        return false;
    }
    public final int checkPermission(String permission) { return 1; }
    private static native void exit0();
    private static native String getAppProperty0(String key);
    private static native void platformRequest0(String url);
}
