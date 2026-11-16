package j2me4w.net;

import java.io.*;
import java.util.Vector;
import javax.microedition.io.HttpsConnection;

public final class HttpConnectionImpl implements HttpsConnection {
    private static final int SETUP = 0, CONNECTED = 1, CLOSED = 2;

    private final String url;
    private String method = GET;
    private final Vector reqKeys = new Vector();
    private final Vector reqValues = new Vector();
    private ByteArrayOutputStream body;
    private HttpResponse resp;
    private int state = SETUP;

    private final String protocol, host, file, query, ref;
    private final int port;

    public HttpConnectionImpl(String url, int mode) {
        this.url = url;
        int p = url.indexOf("://");
        protocol = url.substring(0, p).toLowerCase();
        String rest = url.substring(p + 3);
        int hashAt = rest.indexOf('#');
        ref = hashAt >= 0 ? rest.substring(hashAt + 1) : null;
        if (hashAt >= 0) rest = rest.substring(0, hashAt);
        int qAt = rest.indexOf('?');
        query = qAt >= 0 ? rest.substring(qAt + 1) : null;
        if (qAt >= 0) rest = rest.substring(0, qAt);
        int slash = rest.indexOf('/');
        String hostPort = slash >= 0 ? rest.substring(0, slash) : rest;
        file = slash >= 0 ? rest.substring(slash) : "/";
        int colon = hostPort.lastIndexOf(':');
        int prt = protocol.equals("https") ? 443 : 80;
        if (colon > 0 && hostPort.indexOf(']') < colon) {
            try { prt = Integer.parseInt(hostPort.substring(colon + 1)); } catch (NumberFormatException e) {}
            hostPort = hostPort.substring(0, colon);
        }
        host = hostPort;
        port = prt;
    }

    private void ensureSetup() throws IOException {
        if (state != SETUP) throw new IOException("Already connected");
    }

    private void connect() throws IOException {
        if (state == CLOSED) throw new IOException("Connection closed");
        if (resp != null) return;
        String[] h = new String[reqKeys.size() * 2];
        for (int i = 0; i < reqKeys.size(); i++) {
            h[2 * i] = (String) reqKeys.elementAt(i);
            h[2 * i + 1] = (String) reqValues.elementAt(i);
        }
        byte[] b = body == null ? null : body.toByteArray();
        resp = Net.http0(method, url, h, b);
        state = CONNECTED;
    }

    public String getURL() { return url; }
    public String getProtocol() { return protocol; }
    public String getHost() { return host; }
    public String getFile() { return file; }
    public String getRef() { return ref; }
    public String getQuery() { return query; }
    public int getPort() { return port; }
    public String getRequestMethod() { return method; }
    public void setRequestMethod(String m) throws IOException {
        ensureSetup();
        if (!m.equals(GET) && !m.equals(POST) && !m.equals(HEAD)) throw new IOException("Unsupported method " + m);
        method = m;
    }
    public String getRequestProperty(String key) {
        for (int i = 0; i < reqKeys.size(); i++)
            if (((String) reqKeys.elementAt(i)).equalsIgnoreCase(key)) return (String) reqValues.elementAt(i);
        return null;
    }
    public void setRequestProperty(String key, String value) throws IOException {
        ensureSetup();
        for (int i = 0; i < reqKeys.size(); i++) {
            if (((String) reqKeys.elementAt(i)).equalsIgnoreCase(key)) { reqValues.setElementAt(value, i); return; }
        }
        reqKeys.addElement(key);
        reqValues.addElement(value);
    }

    public int getResponseCode() throws IOException { connect(); return resp.status; }
    public String getResponseMessage() throws IOException { connect(); return resp.message; }
    public String getHeaderField(String name) throws IOException {
        connect();
        String n = name.toLowerCase();
        for (int i = 0; i + 1 < resp.headers.length; i += 2) if (resp.headers[i].equals(n)) return resp.headers[i + 1];
        return null;
    }
    public String getHeaderField(int n) throws IOException {
        connect();
        return 2 * n + 1 < resp.headers.length && n >= 0 ? resp.headers[2 * n + 1] : null;
    }
    public String getHeaderFieldKey(int n) throws IOException {
        connect();
        return 2 * n < resp.headers.length && n >= 0 ? resp.headers[2 * n] : null;
    }
    public int getHeaderFieldInt(String name, int def) throws IOException {
        String v = getHeaderField(name);
        if (v == null) return def;
        try { return Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return def; }
    }
    public long getHeaderFieldDate(String name, long def) throws IOException { return getHeaderField(name) == null ? def : 0; }
    public long getExpiration() throws IOException { return getHeaderFieldDate("expires", 0); }
    public long getDate() throws IOException { return getHeaderFieldDate("date", 0); }
    public long getLastModified() throws IOException { return getHeaderFieldDate("last-modified", 0); }
    public String getType() {
        try { return getHeaderField("content-type"); } catch (IOException e) { return null; }
    }
    public String getEncoding() {
        try { return getHeaderField("content-encoding"); } catch (IOException e) { return null; }
    }
    public long getLength() {
        try {
            connect();
            return resp.body.length;
        } catch (IOException e) {
            return -1;
        }
    }

    public InputStream openInputStream() throws IOException {
        connect();
        return new ByteArrayInputStream(resp.body);
    }
    public DataInputStream openDataInputStream() throws IOException { return new DataInputStream(openInputStream()); }
    public OutputStream openOutputStream() throws IOException {
        ensureSetup();
        if (body == null) body = new ByteArrayOutputStream();
        if (method.equals(GET)) method = POST;
        return body;
    }
    public DataOutputStream openDataOutputStream() throws IOException { return new DataOutputStream(openOutputStream()); }

    public void close() { state = CLOSED; }
}
