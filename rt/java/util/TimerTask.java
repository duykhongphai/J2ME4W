package java.util;

public abstract class TimerTask implements Runnable {
    static final int VIRGIN = 0, SCHEDULED = 1, EXECUTED = 2, CANCELLED = 3;
    final Object lock = new Object();
    int state = VIRGIN;
    long nextExecutionTime;
    long period = 0;
    boolean fixedRate;
    protected TimerTask() {}
    public abstract void run();
    public boolean cancel() {
        synchronized (lock) {
            boolean result = (state == SCHEDULED);
            state = CANCELLED;
            return result;
        }
    }
    public long scheduledExecutionTime() {
        synchronized (lock) { return period < 0 ? nextExecutionTime + period : nextExecutionTime - period; }
    }
}
