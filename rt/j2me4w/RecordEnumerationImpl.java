package j2me4w;

import javax.microedition.rms.*;

public final class RecordEnumerationImpl implements RecordEnumeration, RecordListener {
    private final RecordStore rs;
    private final RecordFilter filter;
    private final RecordComparator comparator;
    private boolean keepUpdated;
    private int[] ids;
    private int pos;
    private boolean destroyed;

    public RecordEnumerationImpl(RecordStore rs, RecordFilter f, RecordComparator c, boolean keep) {
        this.rs = rs;
        this.filter = f;
        this.comparator = c;
        rebuild();
        keepUpdated(keep);
    }

    public void rebuild() {
        checkDestroyed();
        int[] all = rs.idsSnapshot0();
        int[] sel = new int[all.length];
        byte[][] recs = new byte[all.length][];
        int n = 0;
        for (int i = 0; i < all.length; i++) {
            byte[] r;
            try { r = rs.getRecord(all[i]); } catch (Exception e) { continue; }
            if (filter == null || filter.matches(r)) { sel[n] = all[i]; recs[n] = r; n++; }
        }
        if (comparator != null) {
            for (int i = 1; i < n; i++) {
                int id = sel[i];
                byte[] r = recs[i];
                int j = i - 1;
                while (j >= 0 && comparator.compare(recs[j], r) == RecordComparator.FOLLOWS) {
                    sel[j + 1] = sel[j];
                    recs[j + 1] = recs[j];
                    j--;
                }
                sel[j + 1] = id;
                recs[j + 1] = r;
            }
        }
        ids = new int[n];
        System.arraycopy(sel, 0, ids, 0, n);
        pos = 0;
    }
    private void checkDestroyed() { if (destroyed) throw new IllegalStateException(); }
    public int numRecords() { checkDestroyed(); return ids.length; }
    public byte[] nextRecord() throws InvalidRecordIDException, RecordStoreNotOpenException, RecordStoreException {
        return rs.getRecord(nextRecordId());
    }
    public int nextRecordId() throws InvalidRecordIDException {
        checkDestroyed();
        if (pos >= ids.length) throw new InvalidRecordIDException();
        return ids[pos++];
    }
    public byte[] previousRecord() throws InvalidRecordIDException, RecordStoreNotOpenException, RecordStoreException {
        return rs.getRecord(previousRecordId());
    }
    public int previousRecordId() throws InvalidRecordIDException {
        checkDestroyed();
        if (pos <= 0) throw new InvalidRecordIDException();
        return ids[--pos];
    }
    public boolean hasNextElement() { checkDestroyed(); return pos < ids.length; }
    public boolean hasPreviousElement() { checkDestroyed(); return pos > 0; }
    public void reset() { checkDestroyed(); pos = 0; }
    public void keepUpdated(boolean k) {
        checkDestroyed();
        if (k && !keepUpdated) rs.addRecordListener(this);
        if (!k && keepUpdated) rs.removeRecordListener(this);
        keepUpdated = k;
    }
    public boolean isKeptUpdated() { return keepUpdated; }
    public void destroy() { keepUpdated(false); destroyed = true; }
    public void recordAdded(RecordStore s, int id) { rebuild(); }
    public void recordChanged(RecordStore s, int id) { rebuild(); }
    public void recordDeleted(RecordStore s, int id) { rebuild(); }
}
