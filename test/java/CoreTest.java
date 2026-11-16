import java.io.*;
import java.util.*;

/**
 * Exercises the VM core. Compiled twice: against the j2me4w runtime (run in our VM) and against the
 * host JDK (run on a real JVM); the outputs must be identical.
 */
public class CoreTest {
    static int staticCounter = init("static init");
    static final String CONST = "constant";
    static long bigLong = 0x123456789ABCDEFL;

    static int init(String s) { System.out.println(s); return 42; }

    interface Shape { int area(); String name(); }
    static abstract class Base implements Shape {
        public String name() { return getClass().getName().substring(getClass().getName().lastIndexOf('$') + 1); }
        public String toString() { return name() + "(" + area() + ")"; }
    }
    static class Rect extends Base {
        final int w, h;
        Rect(int w, int h) { this.w = w; this.h = h; }
        public int area() { return w * h; }
    }
    static class Square extends Rect {
        Square(int s) { super(s, s); }
        public String name() { return "Square:" + super.name(); }
    }

    static class Lazy { static { System.out.println("Lazy.<clinit>"); } static int v = 7; }

    class Inner { int get() { return staticCounter + 1; } }

    static int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }

    static void ints() {
        int a = Integer.MAX_VALUE;
        System.out.println("overflow " + (a + 1));
        System.out.println("div " + (-7 / 2) + " " + (-7 % 2) + " " + (7 / -2) + " " + (Integer.MIN_VALUE / -1));
        System.out.println("shifts " + (-16 >> 2) + " " + (-16 >>> 28) + " " + (1 << 33) + " " + (5 & 3) + " " + (5 | 3) + " " + (5 ^ 3));
        System.out.println("casts " + (byte) 200 + " " + (short) 70000 + " " + (int) (char) -1 + " " + (char) 65);
        System.out.println("fib " + fib(20));
        try { System.out.println(1 / (a - a)); } catch (ArithmeticException e) { System.out.println("caught " + e.getMessage()); }
        System.out.println("hex " + Integer.toHexString(-1) + " " + Integer.toString(255, 2) + " " + Integer.parseInt("-123") + " " + Integer.parseInt("ff", 16));
        try { Integer.parseInt("12x"); } catch (NumberFormatException e) { System.out.println("NFE " + e.getMessage()); }
    }

    static void longs() {
        long x = bigLong;
        System.out.println("long " + x + " " + (x * 31) + " " + (x >> 7) + " " + (x >>> 60) + " " + (-x >>> 60) + " " + (x << 20));
        System.out.println("long div " + (x / 1000) + " " + (x % 1000) + " " + (-x / 7) + " " + (Long.MIN_VALUE / -1));
        System.out.println("long cmp " + (x > 5L) + " " + (x == bigLong) + " " + Long.toString(-255L, 16) + " " + Long.parseLong("-9223372036854775808"));
        long sum = 0;
        for (int i = 0; i < 100; i++) sum += (long) i * i * i * 1000003L;
        System.out.println("sum " + sum);
        System.out.println("l2i " + (int) x + " i2l " + (long) -5 + " hash " + new Long(x).hashCode());
    }

    static void floats() {
        float f = 1.1f;
        double d = 1.1;
        System.out.println("float " + f + " " + (f * 3) + " " + (f / 3) + " " + (double) f + " " + d * 3);
        System.out.println("fmt " + 100.0 + " " + 1e7 + " " + 1.0e-4 + " " + 123456.789 + " " + 0.001f + " " + 1.0f / 3);
        System.out.println("conv " + (int) 3.99 + " " + (int) -3.99 + " " + (int) Float.NaN + " " + (int) 1e20 + " " + (long) -1e30 + " " + Math.round(2.5) + " " + Math.round(-2.5f));
        System.out.println("nan " + (0.0 / 0.0) + " " + (1 / 0.0) + " " + (Float.NaN > 1) + " " + (Float.NaN == Float.NaN));
        System.out.println("bits " + Float.floatToIntBits(1.5f) + " " + Double.doubleToLongBits(-2.25) + " " + Float.intBitsToFloat(0x40490fdb));
        System.out.println("math " + Math.sqrt(2) + " " + Math.abs(-5) + " " + Math.max(3, 9) + " " + Math.floor(-1.5) + " " + Math.ceil(1.2));
        System.out.println("parse " + Float.parseFloat("3.25") + " " + Double.parseDouble("-1e3") + " " + Float.parseFloat("2f"));
    }

    static void strings() {
        String s = "Hello, World";
        System.out.println(s.length() + " " + s.charAt(4) + " " + s.indexOf('o') + " " + s.lastIndexOf("o") + " " + s.indexOf("World"));
        System.out.println(s.substring(7) + "|" + s.substring(0, 5) + "|" + s.toUpperCase() + "|" + s.toLowerCase() + "|" + "  trim  ".trim() + "|");
        System.out.println(s.replace('l', 'L') + " " + s.startsWith("Hell") + " " + s.endsWith("d") + " " + s.equals("Hello, World") + " " + s.equalsIgnoreCase("HELLO, world"));
        System.out.println("cmp " + "abc".compareTo("abd") + " " + "b".compareTo("a") + " " + "ab".compareTo("abc") + " hash " + s.hashCode());
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < 5; i++) sb.append(i).append(',');
        sb.setLength(sb.length() - 1);
        sb.insert(0, "[").append(']').reverse();
        System.out.println(sb.toString() + " " + sb.length());
        sb.deleteCharAt(0).delete(0, 2).setCharAt(0, 'X');
        System.out.println(sb);
        char[] cs = s.toCharArray();
        System.out.println(new String(cs, 7, 5) + " " + String.valueOf(cs.length) + " " + String.valueOf(true) + " " + (s == s.intern()));
        byte[] utf = "héllo ✓".getBytes();
        System.out.println("utf8 " + utf.length + " " + new String(utf));
        String concat = "a" + 1 + 'b' + 2L + 3.5f + true + null;
        System.out.println(concat);
        System.out.println("v".concat("w") + String.valueOf((Object) null) + "x".equals(null));
    }

    static void arrays() {
        int[] a = { 5, 3, 9, 1, 7 };
        for (int i = 0; i < a.length; i++) for (int j = i + 1; j < a.length; j++) if (a[j] < a[i]) { int t = a[i]; a[i] = a[j]; a[j] = t; }
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < a.length; i++) sb.append(a[i]).append(' ');
        System.out.println("sorted " + sb);
        int[][] grid = new int[3][4];
        grid[2][3] = 9;
        long[][][] cube = new long[2][2][2];
        cube[1][1][1] = 77L;
        System.out.println("multi " + grid.length + " " + grid[0].length + " " + grid[2][3] + " " + cube[1][1][1]);
        String[] names = new String[] { "x", "y" };
        Object[] objs = names;
        try { objs[0] = new Integer(1); } catch (ArrayStoreException e) { System.out.println("ArrayStoreException"); }
        try { a[5] = 1; } catch (ArrayIndexOutOfBoundsException e) { System.out.println("AIOOBE"); }
        int[] copy = new int[7];
        System.arraycopy(a, 0, copy, 2, 5);
        System.arraycopy(copy, 2, copy, 0, 5);
        System.out.println("copy " + copy[0] + copy[1] + copy[2] + copy[3] + copy[4] + copy[5] + copy[6]);
        int[] cl = (int[]) a.clone();
        cl[0] = 100;
        System.out.println("clone " + a[0] + " " + cl[0] + " " + (a instanceof Object) + " " + (objs instanceof String[]));
        char[] chars = new char[3];
        chars[0] = 'a'; chars[1] = (char) 0x1234; chars[2] = 'c';
        boolean[] bools = new boolean[2];
        bools[1] = true;
        byte[] bytes = { (byte) 255, 127 };
        short[] shorts = { (short) 40000 };
        System.out.println("prims " + (int) chars[1] + " " + bools[0] + bools[1] + " " + bytes[0] + " " + shorts[0]);
    }

    static void objects() {
        Shape[] shapes = { new Rect(2, 3), new Square(4) };
        for (int i = 0; i < shapes.length; i++) System.out.println(shapes[i]);
        Object o = shapes[1];
        System.out.println((o instanceof Rect) + " " + (o instanceof Shape) + " " + (o instanceof String));
        try { String bad = (String) o; System.out.println(bad); } catch (ClassCastException e) { System.out.println("CCE"); }
        System.out.println("lazy before");
        System.out.println("lazy " + Lazy.v);
        System.out.println("inner " + new CoreTest().new Inner().get());
        Runnable r = new Runnable() { public void run() { System.out.println("anon run " + CONST); } };
        r.run();
        Integer i1 = new Integer(5);
        System.out.println(i1.equals(new Integer(5)) + " " + i1.hashCode() + " " + new Boolean(true) + " " + new Character('z'));
    }

    static int depth = 0;
    static void recurse() { depth++; recurse(); }

    static String tryFinally() {
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < 3; i++) {
            try {
                if (i == 1) continue;
                if (i == 2) throw new IllegalStateException("boom" + i);
                sb.append("t").append(i);
            } catch (IllegalStateException e) {
                sb.append("c:").append(e.getMessage());
            } finally {
                sb.append("f").append(i);
            }
        }
        return sb.toString();
    }

    static void exceptions() {
        System.out.println(tryFinally());
        try { Object o = null; o.hashCode(); } catch (NullPointerException e) { System.out.println("NPE caught"); }
        try { recurse(); } catch (StackOverflowError e) { System.out.println("SOE caught " + (depth > 100)); }
        try { throw new IOException("io"); } catch (Exception e) { System.out.println(e.toString()); }
        try {
            try { throw new RuntimeException("inner"); } finally { System.out.println("inner finally"); }
        } catch (RuntimeException e) { System.out.println("outer " + e.getMessage()); }
        try { Class.forName("does.not.Exist"); } catch (ClassNotFoundException e) { System.out.println("CNFE " + e.getMessage()); }
        try {
            Object o = Class.forName("CoreTest$Rect").getName();
            System.out.println("forName " + o);
        } catch (Exception e) { System.out.println("unexpected " + e); }
    }

    static int switches(int k) {
        switch (k) {
            case 1: return 10;
            case 2: return 20;
            case 3: case 4: return 34;
            case 100: return 1000;
            case -5: return -50;
            default: return -1;
        }
    }

    static int lookup(int k) {
        switch (k) {
            case 1000: return 1;
            case -2000: return 2;
            case 30000: return 3;
            default: return 0;
        }
    }

    static void collections() {
        Vector v = new Vector();
        for (int i = 0; i < 20; i++) v.addElement(new Integer(i * i));
        v.removeElementAt(0);
        v.insertElementAt("first", 0);
        System.out.println("vector " + v.size() + " " + v.elementAt(0) + " " + v.lastElement() + " " + v.indexOf(new Integer(16)) + " " + v.contains("first"));
        Hashtable h = new Hashtable();
        for (int i = 0; i < 50; i++) h.put("k" + i, new Integer(i));
        h.remove("k10");
        int total = 0;
        for (Enumeration e = h.elements(); e.hasMoreElements(); ) total += ((Integer) e.nextElement()).intValue();
        System.out.println("hashtable " + h.size() + " " + h.get("k49") + " " + h.get("k10") + " " + h.containsKey("k3") + " " + total);
        Stack st = new Stack();
        st.push("a"); st.push("b");
        System.out.println("stack " + st.pop() + st.peek() + st.size() + st.empty());
        Random rnd = new Random(12345);
        System.out.println("random " + rnd.nextInt() + " " + rnd.nextInt(100) + " " + rnd.nextLong() + " " + rnd.nextBoolean());
    }

    static void io() throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(bos);
        out.writeInt(-123456);
        out.writeLong(0x1122334455667788L);
        out.writeUTF("Xin chào ✓");
        out.writeFloat(2.5f);
        out.writeDouble(Math.PI);
        out.writeBoolean(true);
        out.writeShort(-2);
        out.writeChar('Z');
        byte[] data = bos.toByteArray();
        System.out.println("bytes " + data.length);
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(data));
        System.out.println(in.readInt() + " " + in.readLong() + " " + in.readUTF() + " " + in.readFloat() + " " + in.readDouble() + " " + in.readBoolean() + " " + in.readShort() + " " + in.readChar());
        try { in.readByte(); } catch (EOFException e) { System.out.println("EOF"); }
    }

    static final Object lock = new Object();
    static int shared = 0;
    static int produced = 0;

    static void threads() throws InterruptedException {
        Thread[] ts = new Thread[4];
        for (int i = 0; i < ts.length; i++) {
            ts[i] = new Thread() {
                public void run() {
                    for (int k = 0; k < 2000; k++) synchronized (lock) { shared++; }
                }
            };
            ts[i].start();
        }
        for (int i = 0; i < ts.length; i++) ts[i].join();
        System.out.println("shared " + shared);

        final Vector queue = new Vector();
        Thread consumer = new Thread(new Runnable() {
            public void run() {
                int got = 0;
                synchronized (queue) {
                    while (got < 5) {
                        while (queue.isEmpty()) {
                            try { queue.wait(); } catch (InterruptedException e) { return; }
                        }
                        got++;
                        queue.removeElementAt(0);
                    }
                }
                System.out.println("consumer got " + got);
            }
        });
        consumer.start();
        for (int i = 0; i < 5; i++) {
            synchronized (queue) { queue.addElement(new Integer(i)); queue.notifyAll(); }
            Thread.sleep(5);
        }
        consumer.join();

        Thread sleeper = new Thread() {
            public void run() {
                try { Thread.sleep(10000); System.out.println("not interrupted"); }
                catch (InterruptedException e) { System.out.println("interrupted"); }
            }
        };
        sleeper.start();
        Thread.sleep(20);
        sleeper.interrupt();
        sleeper.join();
        System.out.println("alive " + sleeper.isAlive());

        long t0 = System.currentTimeMillis();
        synchronized (lock) { lock.wait(30); }
        System.out.println("waited " + (System.currentTimeMillis() - t0 >= 25));
    }

    public static void main(String[] args) throws Exception {
        System.out.println("start " + staticCounter + " " + CONST);
        ints();
        longs();
        floats();
        strings();
        arrays();
        objects();
        exceptions();
        System.out.println("switch " + switches(1) + switches(3) + switches(4) + switches(100) + switches(-5) + switches(7) + " " + lookup(1000) + lookup(-2000) + lookup(30000) + lookup(5));
        collections();
        io();
        threads();
        System.out.println("done");
    }
}
