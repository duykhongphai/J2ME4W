package javax.microedition.rms;

import java.io.*;
import java.util.Hashtable;
import java.util.Vector;

public class RecordStore {
    public static final int AUTHMODE_PRIVATE = 0, AUTHMODE_ANY = 1;
    private static final Hashtable openStores = new Hashtable();

    private final String name;
    private int openCount;
    final Vector ids = new Vector();
    final Vector data = new Vector();
    private int nextId = 1;
    private int version;
    private long lastModified;
    private final Vector listeners = new Vector();

    private RecordStore(String name) { this.name = name; }

    public static synchronized RecordStore openRecordStore(String name, boolean createIfNecessary)
            throws RecordStoreException, RecordStoreFullException, RecordStoreNotFoundException {
        if (name == null || name.length() == 0 || name.length() > 32) throw new IllegalArgumentException();
        RecordStore rs = (RecordStore) openStores.get(name);
        if (rs == null) {
            rs = new RecordStore(name);
            byte[] saved = load0(name);
            if (saved != null) {
                rs.deserialize(saved);
            } else {
                if (!createIfNecessary) throw new RecordStoreNotFoundException(name);
                rs.lastModified = System.currentTimeMillis();
                rs.persist();
            }
            openStores.put(name, rs);
        }
        rs.openCount++;
        return rs;
    }
    public static RecordStore openRecordStore(String name, boolean createIfNecessary, int authmode, boolean writable)
            throws RecordStoreException {
        return openRecordStore(name, createIfNecessary);
    }
    public static RecordStore openRecordStore(String name, String vendorName, String suiteName) throws RecordStoreException {
        return openRecordStore(name, false);
    }
    public static synchronized void deleteRecordStore(String name) throws RecordStoreException, RecordStoreNotFoundException {
        if (openStores.get(name) != null) throw new RecordStoreException("Record store is open: " + name);
        if (!delete0(name)) throw new RecordStoreNotFoundException(name);
    }
    public static String[] listRecordStores() {
        String[] r = list0();
        return r == null || r.length == 0 ? null : r;
    }

    public void setMode(int authmode, boolean writable) throws RecordStoreException { checkOpen(); }
    public synchronized void closeRecordStore() throws RecordStoreNotOpenException, RecordStoreException {
        checkOpen();
        if (--openCount == 0) {
            synchronized (RecordStore.class) { openStores.remove(name); }
            listeners.removeAllElements();
        }
    }
    private void checkOpen() throws RecordStoreNotOpenException {
        if (openCount <= 0) throw new RecordStoreNotOpenException(name);
    }
    public String getName() throws RecordStoreNotOpenException { checkOpen(); return name; }
    public int getVersion() throws RecordStoreNotOpenException { checkOpen(); return version; }
    public int getNumRecords() throws RecordStoreNotOpenException { checkOpen(); return ids.size(); }
    public int getSize() throws RecordStoreNotOpenException {
        checkOpen();
        int s = 64;
        for (int i = 0; i < data.size(); i++) s += ((byte[]) data.elementAt(i)).length + 8;
        return s;
    }
    public int getSizeAvailable() throws RecordStoreNotOpenException { checkOpen(); return 1024 * 1024; }
    public long getLastModified() throws RecordStoreNotOpenException { checkOpen(); return lastModified; }
    public void addRecordListener(RecordListener l) { if (!listeners.contains(l)) listeners.addElement(l); }
    public void removeRecordListener(RecordListener l) { listeners.removeElement(l); }
    public int getNextRecordID() throws RecordStoreNotOpenException, RecordStoreException { checkOpen(); return nextId; }

    private int indexOf(int id) throws InvalidRecordIDException {
        for (int i = 0; i < ids.size(); i++) if (((Integer) ids.elementAt(i)).intValue() == id) return i;
        throw new InvalidRecordIDException("Invalid record id: " + id);
    }

    public int addRecord(byte[] d, int offset, int numBytes) throws RecordStoreNotOpenException, RecordStoreException, RecordStoreFullException {
        int id;
        synchronized (this) {
            checkOpen();
            byte[] copy = new byte[numBytes];
            if (numBytes > 0) System.arraycopy(d, offset, copy, 0, numBytes);
            id = nextId++;
            ids.addElement(new Integer(id));
            data.addElement(copy);
            changed();
        }
        for (int i = 0; i < listeners.size(); i++) ((RecordListener) listeners.elementAt(i)).recordAdded(this, id);
        return id;
    }
    public void deleteRecord(int recordId) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        synchronized (this) {
            checkOpen();
            int i = indexOf(recordId);
            ids.removeElementAt(i);
            data.removeElementAt(i);
            changed();
        }
        for (int i = 0; i < listeners.size(); i++) ((RecordListener) listeners.elementAt(i)).recordDeleted(this, recordId);
    }
    public synchronized int getRecordSize(int recordId) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        return ((byte[]) data.elementAt(indexOf(recordId))).length;
    }
    public synchronized int getRecord(int recordId, byte[] buffer, int offset) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        byte[] d = (byte[]) data.elementAt(indexOf(recordId));
        System.arraycopy(d, 0, buffer, offset, d.length);
        return d.length;
    }
    public synchronized byte[] getRecord(int recordId) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException {
        checkOpen();
        byte[] d = (byte[]) data.elementAt(indexOf(recordId));
        if (d.length == 0) return null;
        byte[] r = new byte[d.length];
        System.arraycopy(d, 0, r, 0, d.length);
        return r;
    }
    public void setRecord(int recordId, byte[] newData, int offset, int numBytes) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException, RecordStoreFullException {
        synchronized (this) {
            checkOpen();
            int i = indexOf(recordId);
            byte[] copy = new byte[numBytes];
            if (numBytes > 0) System.arraycopy(newData, offset, copy, 0, numBytes);
            data.setElementAt(copy, i);
            changed();
        }
        for (int i = 0; i < listeners.size(); i++) ((RecordListener) listeners.elementAt(i)).recordChanged(this, recordId);
    }
    public RecordEnumeration enumerateRecords(RecordFilter filter, RecordComparator comparator, boolean keepUpdated) throws RecordStoreNotOpenException {
        checkOpen();
        return new j2me4w.RecordEnumerationImpl(this, filter, comparator, keepUpdated);
    }

    public synchronized int[] idsSnapshot0() {
        int[] r = new int[ids.size()];
        for (int i = 0; i < r.length; i++) r[i] = ((Integer) ids.elementAt(i)).intValue();
        return r;
    }

    private void changed() throws RecordStoreException {
        version++;
        lastModified = System.currentTimeMillis();
        persist();
    }

    private void persist() throws RecordStoreException {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bos);
            out.writeInt(0x524D5331);
            out.writeInt(nextId);
            out.writeInt(version);
            out.writeLong(lastModified);
            out.writeInt(ids.size());
            for (int i = 0; i < ids.size(); i++) {
                byte[] d = (byte[]) data.elementAt(i);
                out.writeInt(((Integer) ids.elementAt(i)).intValue());
                out.writeInt(d.length);
                out.write(d);
            }
            if (!save0(name, bos.toByteArray())) throw new RecordStoreFullException();
        } catch (IOException e) {
            throw new RecordStoreException(e.toString());
        }
    }

    private void deserialize(byte[] b) throws RecordStoreException {
        try {
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(b));
            if (in.readInt() != 0x524D5331) throw new RecordStoreException("corrupt store");
            nextId = in.readInt();
            version = in.readInt();
            lastModified = in.readLong();
            int n = in.readInt();
            for (int i = 0; i < n; i++) {
                int id = in.readInt();
                byte[] d = new byte[in.readInt()];
                in.readFully(d);
                ids.addElement(new Integer(id));
                data.addElement(d);
            }
        } catch (IOException e) {
            throw new RecordStoreException(e.toString());
        }
    }

    private static native byte[] load0(String name);
    private static native boolean save0(String name, byte[] data);
    private static native boolean delete0(String name);
    private static native String[] list0();
}
