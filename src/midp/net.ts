import type { JArray, JObject, JThread } from '../vm/model';
import { SUSPEND, type VM } from '../vm/vm';
import type { NetSocket, Platform } from './platform';

interface Sock {
  conn: NetSocket | null;
  chunks: Uint8Array[];
  queued: number;
  eof: boolean;
  error: string | null;
  closed: boolean;
  reader: { t: JThread; arr: JArray; off: number; len: number } | null;
}

export function registerNetNatives(vm: VM, p: Platform): void {
  const socks = new Map<number, Sock>();
  let nextHandle = 1;
  const IOE = 'java/io/IOException';

  const take = (s: Sock, dst: Int8Array, off: number, len: number): number => {
    let n = 0;
    while (n < len && s.chunks.length) {
      const c = s.chunks[0];
      const k = Math.min(len - n, c.length);
      dst.set(new Int8Array(c.buffer, c.byteOffset, k), off + n);
      n += k;
      if (k === c.length) s.chunks.shift();
      else s.chunks[0] = c.subarray(k);
    }
    s.queued -= n;
    return n;
  };

  const service = (s: Sock) => {
    const r = s.reader;
    if (!r) return;
    if (s.queued > 0) {
      s.reader = null;
      vm.resume(r.t, take(s, r.arr.a as Int8Array, r.off, r.len));
    } else if (s.error) {
      s.reader = null;
      vm.resumeThrow(r.t, IOE, s.error);
    } else if (s.eof || s.closed) {
      s.reader = null;
      vm.resume(r.t, -1);
    }
  };

  const get = (h: number): Sock => {
    const s = socks.get(h);
    if (!s) vm.throwNew(IOE, 'Invalid socket');
    return s;
  };

  vm.registerNatives('j2me4w/net/Net', {
    'open0(Ljava/lang/String;I)I': (t, [host, port]) => {
      const net = p.host.net;
      const h = vm.jstr(host) ?? '';
      if (!net) vm.throwNew('javax/microedition/io/ConnectionNotFoundException', 'Networking is not available');
      const handle = nextHandle++;
      const s: Sock = { conn: null, chunks: [], queued: 0, eof: false, error: null, closed: false, reader: null };
      socks.set(handle, s);
      net.connect(h, port, {
        onData: (d) => {
          if (s.closed) return;
          s.chunks.push(d);
          s.queued += d.length;
          service(s);
        },
        onClose: (err) => {
          s.eof = true;
          if (err) s.error = err;
          service(s);
        },
      }).then(
        (conn) => {
          if (s.closed) { conn.close(); return; }
          s.conn = conn;
          vm.resume(t, handle);
        },
        (e) => {
          socks.delete(handle);
          vm.resumeThrow(t, IOE, `Cannot connect to ${h}:${port}: ${e instanceof Error ? e.message : String(e)}`);
        },
      );
      return SUSPEND;
    },
    'read0(I[BII)I': (t, [h, arr, off, len]) => {
      const s = get(h);
      if (s.queued > 0) return take(s, arr.a as Int8Array, off, len);
      if (s.error) vm.throwNew(IOE, s.error);
      if (s.eof || s.closed) return -1;
      s.reader = { t, arr, off, len };
      return SUSPEND;
    },
    'available0(I)I': (_t, [h]) => socks.get(h)?.queued ?? 0,
    'write0(I[BII)V': (_t, [h, arr, off, len]) => {
      const s = get(h);
      if (s.closed || !s.conn) vm.throwNew(IOE, 'Connection closed');
      if (s.error) vm.throwNew(IOE, s.error);
      const a = arr.a as Int8Array;
      s.conn.send(new Uint8Array(a.buffer, a.byteOffset + off, len).slice());
    },
    'close0(I)V': (_t, [h]) => {
      const s = socks.get(h);
      if (!s) return;
      s.closed = true;
      s.conn?.close();
      socks.delete(h);
      service(s);
    },
    'http0(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;[B)Lj2me4w/net/HttpResponse;':
      (t, [method, url, headers, body]) => {
        const net = p.host.net;
        if (!net) vm.throwNew('javax/microedition/io/ConnectionNotFoundException', 'Networking is not available');
        const hs = (headers.a as (JObject | null)[]).map((o) => vm.jstr(o) ?? '');
        const pairs: [string, string][] = [];
        for (let i = 0; i + 1 < hs.length; i += 2) pairs.push([hs[i], hs[i + 1]]);
        let b: Uint8Array | null = null;
        if (body) {
          const a = body.a as Int8Array;
          b = new Uint8Array(a.buffer, a.byteOffset, a.length).slice();
        }
        const u = vm.jstr(url) ?? '';
        net.http({ method: vm.jstr(method) ?? 'GET', url: u, headers: pairs, body: b }).then(
          (r) => {
            const o = vm.newObjectByName('j2me4w/net/HttpResponse');
            vm.setField(o, 'status', r.status);
            vm.setField(o, 'message', vm.str(r.message));
            const flat: string[] = [];
            for (const [k, v] of r.headers) flat.push(k.toLowerCase(), v);
            vm.setField(o, 'headers', vm.strArray(flat));
            vm.setField(o, 'body', vm.byteArray(r.body));
            vm.resume(t, o);
          },
          (e) => vm.resumeThrow(t, IOE, `HTTP request to ${u} failed: ${e instanceof Error ? e.message : String(e)}`),
        );
        return SUSPEND;
      },
  });
}
