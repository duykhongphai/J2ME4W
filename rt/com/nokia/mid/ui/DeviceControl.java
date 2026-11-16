package com.nokia.mid.ui;

public class DeviceControl {
    private DeviceControl() {}
    public static void setLights(int num, int level) {}
    public static void flashLights(long duration) {}
    public static void startVibra(int freq, long duration) { vibrate0((int) duration); }
    public static void stopVibra() {}
    private static native void vibrate0(int ms);
}
