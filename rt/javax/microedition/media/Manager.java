package javax.microedition.media;

import java.io.IOException;
import java.io.InputStream;

public final class Manager {
    public static final String TONE_DEVICE_LOCATOR = "device://tone";
    public static final String MIDI_DEVICE_LOCATOR = "device://midi";
    private Manager() {}
    public static String[] getSupportedContentTypes(String protocol) {
        return new String[] { "audio/x-wav", "audio/wav", "audio/midi", "audio/mid", "audio/x-midi", "audio/mpeg", "audio/amr", "audio/x-tone-seq" };
    }
    public static String[] getSupportedProtocols(String contentType) { return new String[] { "device", "resource" }; }
    public static Player createPlayer(String locator) throws IOException, MediaException {
        if (locator == null) throw new IllegalArgumentException();
        if (locator.startsWith("device://")) return new j2me4w.AudioPlayer(null, locator.equals(MIDI_DEVICE_LOCATOR) ? "audio/midi" : "audio/x-tone-seq");
        if (locator.startsWith("resource:")) {
            String p = locator.substring(9);
            if (p.startsWith("/")) p = p.substring(1);
            byte[] d = j2me4w.Resources.get(p);
            if (d == null) throw new IOException(locator);
            return new j2me4w.AudioPlayer(d, guess(p));
        }
        throw new MediaException("Unsupported locator: " + locator);
    }
    public static Player createPlayer(InputStream stream, String type) throws IOException, MediaException {
        if (stream == null) throw new IllegalArgumentException();
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = stream.read(buf, 0, buf.length)) > 0) bos.write(buf, 0, n);
        return new j2me4w.AudioPlayer(bos.toByteArray(), type);
    }
    private static String guess(String p) {
        String l = p.toLowerCase();
        if (l.endsWith(".mid") || l.endsWith(".midi")) return "audio/midi";
        if (l.endsWith(".wav")) return "audio/x-wav";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        if (l.endsWith(".amr")) return "audio/amr";
        return "application/octet-stream";
    }
    public static void playTone(int note, int duration, int volume) throws MediaException {
        if (duration <= 0 || note < 0 || note > 127) throw new IllegalArgumentException();
        playTone0(note, duration, volume);
    }
    private static native void playTone0(int note, int duration, int volume);
    public static TimeBase getSystemTimeBase() {
        return new TimeBase() { public long getTime() { return System.currentTimeMillis() * 1000; } };
    }
}
