package java.lang;

import java.io.InputStream;

public final class Class {
    private Class() {}

    public static Class forName(String className) throws ClassNotFoundException {
        if (className == null) throw new NullPointerException();
        Class c = forName0(className);
        c.initialize0();
        return c;
    }
    private static native Class forName0(String name) throws ClassNotFoundException;
    private native void initialize0();
    public native Object newInstance() throws InstantiationException, IllegalAccessException;
    public native boolean isInstance(Object obj);
    public native boolean isAssignableFrom(Class cls);
    public native boolean isInterface();
    public native boolean isArray();
    public native String getName();

    public InputStream getResourceAsStream(String name) {
        if (name == null) throw new NullPointerException();
        if (!name.startsWith("/")) {
            String cn = getName();
            int i = cn.lastIndexOf('.');
            if (i >= 0) name = cn.substring(0, i).replace('.', '/') + "/" + name;
        } else {
            name = name.substring(1);
        }
        byte[] data = getResource0(name);
        if (data == null) return null;
        return new java.io.ByteArrayInputStream(data);
    }
    private static native byte[] getResource0(String name);

    public String toString() { return (isInterface() ? "interface " : "class ") + getName(); }
}
