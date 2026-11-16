package java.util;

public class Timer {
    private final Vector queue = new Vector();
    private boolean cancelled;
    private final Thread thread;

    public Timer() {
        thread = new Thread() {
            public void run() { mainLoop(); }
        };
        thread.start();
    }

    private void mainLoop() {
        while (true) {
            TimerTask task;
            boolean fire;
            synchronized (queue) {
                while (queue.isEmpty() && !cancelled) {
                    try { queue.wait(); } catch (InterruptedException e) {}
                }
                if (cancelled) return;
                task = (TimerTask) queue.elementAt(0);
                long now = System.currentTimeMillis();
                long exec;
                synchronized (task.lock) {
                    if (task.state == TimerTask.CANCELLED) { queue.removeElementAt(0); continue; }
                    exec = task.nextExecutionTime;
                    fire = exec <= now;
                    if (fire) {
                        queue.removeElementAt(0);
                        if (task.period == 0) {
                            task.state = TimerTask.EXECUTED;
                        } else {
                            task.nextExecutionTime = task.fixedRate ? exec + task.period : now + task.period;
                            insert(task);
                        }
                    }
                }
                if (!fire) {
                    try { queue.wait(exec - now); } catch (InterruptedException e) {}
                }
            }
            if (fire) {
                try { task.run(); } catch (Throwable t) { t.printStackTrace(); }
            }
        }
    }

    private void insert(TimerTask task) {
        int i = 0;
        int n = queue.size();
        while (i < n && ((TimerTask) queue.elementAt(i)).nextExecutionTime <= task.nextExecutionTime) i++;
        queue.insertElementAt(task, i);
    }

    private void sched(TimerTask task, long time, long period, boolean fixedRate) {
        if (time < 0) throw new IllegalArgumentException("Illegal execution time.");
        synchronized (queue) {
            if (cancelled) throw new IllegalStateException("Timer already cancelled.");
            synchronized (task.lock) {
                if (task.state != TimerTask.VIRGIN) throw new IllegalStateException("Task already scheduled or cancelled");
                task.nextExecutionTime = time;
                task.period = period;
                task.fixedRate = fixedRate;
                task.state = TimerTask.SCHEDULED;
            }
            insert(task);
            queue.notify();
        }
    }

    public void schedule(TimerTask task, long delay) {
        if (delay < 0) throw new IllegalArgumentException("Negative delay.");
        sched(task, System.currentTimeMillis() + delay, 0, false);
    }
    public void schedule(TimerTask task, Date time) { sched(task, time.getTime(), 0, false); }
    public void schedule(TimerTask task, long delay, long period) {
        if (delay < 0) throw new IllegalArgumentException("Negative delay.");
        if (period <= 0) throw new IllegalArgumentException("Non-positive period.");
        sched(task, System.currentTimeMillis() + delay, period, false);
    }
    public void schedule(TimerTask task, Date firstTime, long period) {
        if (period <= 0) throw new IllegalArgumentException("Non-positive period.");
        sched(task, firstTime.getTime(), period, false);
    }
    public void scheduleAtFixedRate(TimerTask task, long delay, long period) {
        if (delay < 0) throw new IllegalArgumentException("Negative delay.");
        if (period <= 0) throw new IllegalArgumentException("Non-positive period.");
        sched(task, System.currentTimeMillis() + delay, period, true);
    }
    public void scheduleAtFixedRate(TimerTask task, Date firstTime, long period) {
        if (period <= 0) throw new IllegalArgumentException("Non-positive period.");
        sched(task, firstTime.getTime(), period, true);
    }
    public void cancel() {
        synchronized (queue) {
            cancelled = true;
            queue.removeAllElements();
            queue.notify();
        }
    }
}
