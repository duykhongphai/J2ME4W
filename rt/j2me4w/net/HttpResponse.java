package j2me4w.net;

/** Filled in natively by Net.http0. */
final class HttpResponse {
    int status;
    String message;
    /** {k0, v0, k1, v1, ...}, keys in lower case. */
    String[] headers;
    byte[] body;
}
