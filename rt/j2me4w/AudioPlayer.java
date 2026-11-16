package j2me4w;

import java.util.Vector;
import javax.microedition.media.*;
import javax.microedition.media.control.*;

public final class AudioPlayer implements Player, VolumeControl, ToneControl {
    private static int counter;
    private final int handle;
    private final String type;
    private int state = UNREALIZED;
    private int loopCount = 1;
    private int level = 100;
    private boolean muted;
    private final Vector listeners = new Vector();

    public AudioPlayer(byte[] data, String type) {
        this.type = type;
        this.handle = ++counter;
        create0(handle, data, type);
    }
    public void realize() throws MediaException { check(); if (state < REALIZED) state = REALIZED; }
    public void prefetch() throws MediaException { realize(); if (state < PREFETCHED) state = PREFETCHED; }
    public void start() throws MediaException {
        prefetch();
        if (state == STARTED) return;
        state = STARTED;
        start0(handle, loopCount);
        fire(PlayerListener.STARTED, new Long(getMediaTime()));
    }
    public void stop() throws MediaException {
        check();
        if (state != STARTED) return;
        stop0(handle);
        state = PREFETCHED;
        fire(PlayerListener.STOPPED, new Long(getMediaTime()));
    }
    public void deallocate() {
        check();
        if (state == STARTED) { try { stop(); } catch (MediaException e) {} }
        if (state > REALIZED) state = REALIZED;
    }
    public void close() {
        if (state == CLOSED) return;
        stop0(handle);
        close0(handle);
        state = CLOSED;
        fire(PlayerListener.CLOSED, null);
    }
    private void check() { if (state == CLOSED) throw new IllegalStateException("Player is closed"); }
    public void setTimeBase(TimeBase master) throws MediaException { if (master != null) throw new MediaException(); }
    public TimeBase getTimeBase() { return Manager.getSystemTimeBase(); }
    public long setMediaTime(long now) throws MediaException { check(); if (now < 0) now = 0; setTime0(handle, now); return now; }
    public long getMediaTime() { return state == CLOSED ? TIME_UNKNOWN : time0(handle); }
    public int getState() { return state; }
    public long getDuration() { return duration0(handle); }
    public String getContentType() { return type; }
    public void setLoopCount(int count) {
        check();
        if (count == 0 || state == STARTED) throw new IllegalArgumentException();
        loopCount = count;
    }
    public void addPlayerListener(PlayerListener l) { check(); if (l != null && !listeners.contains(l)) listeners.addElement(l); }
    public void removePlayerListener(PlayerListener l) { listeners.removeElement(l); }
    public Control[] getControls() { return new Control[] { this }; }
    public Control getControl(String controlType) {
        if (controlType.endsWith("VolumeControl") || controlType.endsWith("ToneControl")) return this;
        return null;
    }
    public void setMute(boolean mute) { muted = mute; volume0(handle, muted ? 0 : level); }
    public boolean isMuted() { return muted; }
    public int setLevel(int l) {
        if (l < 0) l = 0;
        if (l > 100) l = 100;
        level = l;
        if (!muted) volume0(handle, level);
        return level;
    }
    public int getLevel() { return level; }
    public void setSequence(byte[] sequence) { toneSequence0(handle, sequence); }

    private void fire(String event, Object data) {
        for (int i = 0; i < listeners.size(); i++) {
            try { ((PlayerListener) listeners.elementAt(i)).playerUpdate(this, event, data); }
            catch (Throwable t) { t.printStackTrace(); }
        }
    }

    public static void endOfMedia(int handle) {}
    void ended() {
        if (state != STARTED) return;
        state = PREFETCHED;
        fire(PlayerListener.END_OF_MEDIA, new Long(getMediaTime()));
    }
    static {
        Thread t = new Thread() {
            public void run() {
                while (true) {
                    AudioPlayer p = waitEnded0();
                    if (p != null) p.ended();
                }
            }
        };
        t.start();
    }

    private native void create0(int handle, byte[] data, String type);
    private static native void start0(int handle, int loops);
    private static native void stop0(int handle);
    private static native void close0(int handle);
    private static native void setTime0(int handle, long micros);
    private static native long time0(int handle);
    private static native long duration0(int handle);
    private static native void volume0(int handle, int level);
    private static native void toneSequence0(int handle, byte[] seq);
    private static native AudioPlayer waitEnded0();
}
