package java.util;

public class Hashtable {
    private static class Entry {
        int hash; Object key; Object value; Entry next;
        Entry(int h, Object k, Object v, Entry n) { hash = h; key = k; value = v; next = n; }
    }
    private Entry[] table;
    private int count;
    private int threshold;

    public Hashtable(int initialCapacity) {
        if (initialCapacity < 0) throw new IllegalArgumentException();
        if (initialCapacity == 0) initialCapacity = 1;
        table = new Entry[initialCapacity];
        threshold = (initialCapacity * 3) / 4;
    }
    public Hashtable() { this(11); }
    public int size() { return count; }
    public boolean isEmpty() { return count == 0; }
    public synchronized Enumeration keys() { return enumerate(true); }
    public synchronized Enumeration elements() { return enumerate(false); }
    private Enumeration enumerate(final boolean keys) {
        final Object[] snap = new Object[count];
        int n = 0;
        for (int i = table.length - 1; i >= 0; i--)
            for (Entry e = table[i]; e != null; e = e.next) snap[n++] = keys ? e.key : e.value;
        return new Enumeration() {
            int i = 0;
            public boolean hasMoreElements() { return i < snap.length; }
            public Object nextElement() {
                if (i >= snap.length) throw new NoSuchElementException("Hashtable Enumerator");
                return snap[i++];
            }
        };
    }
    public synchronized boolean contains(Object value) {
        if (value == null) throw new NullPointerException();
        for (int i = table.length - 1; i >= 0; i--)
            for (Entry e = table[i]; e != null; e = e.next) if (e.value.equals(value)) return true;
        return false;
    }
    public boolean containsValue(Object value) { return contains(value); }
    public synchronized boolean containsKey(Object key) { return find(key) != null; }
    private Entry find(Object key) {
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index]; e != null; e = e.next)
            if (e.hash == hash && e.key.equals(key)) return e;
        return null;
    }
    public synchronized Object get(Object key) {
        Entry e = find(key);
        return e == null ? null : e.value;
    }
    protected void rehash() {
        Entry[] old = table;
        int newCap = old.length * 2 + 1;
        Entry[] nt = new Entry[newCap];
        threshold = (newCap * 3) / 4;
        table = nt;
        for (int i = old.length - 1; i >= 0; i--) {
            for (Entry e = old[i]; e != null; ) {
                Entry next = e.next;
                int index = (e.hash & 0x7FFFFFFF) % newCap;
                e.next = nt[index];
                nt[index] = e;
                e = next;
            }
        }
    }
    public synchronized Object put(Object key, Object value) {
        if (value == null) throw new NullPointerException();
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index]; e != null; e = e.next) {
            if (e.hash == hash && e.key.equals(key)) {
                Object old = e.value;
                e.value = value;
                return old;
            }
        }
        if (count >= threshold) {
            rehash();
            index = (hash & 0x7FFFFFFF) % table.length;
        }
        table[index] = new Entry(hash, key, value, table[index]);
        count++;
        return null;
    }
    public synchronized Object remove(Object key) {
        int hash = key.hashCode();
        int index = (hash & 0x7FFFFFFF) % table.length;
        for (Entry e = table[index], prev = null; e != null; prev = e, e = e.next) {
            if (e.hash == hash && e.key.equals(key)) {
                if (prev != null) prev.next = e.next; else table[index] = e.next;
                count--;
                return e.value;
            }
        }
        return null;
    }
    public synchronized void clear() {
        for (int i = table.length; --i >= 0; ) table[i] = null;
        count = 0;
    }
    public synchronized String toString() {
        StringBuffer sb = new StringBuffer("{");
        boolean first = true;
        for (int i = table.length - 1; i >= 0; i--) {
            for (Entry e = table[i]; e != null; e = e.next) {
                if (!first) sb.append(", ");
                first = false;
                sb.append(String.valueOf(e.key)).append("=").append(String.valueOf(e.value));
            }
        }
        return sb.append("}").toString();
    }
}
