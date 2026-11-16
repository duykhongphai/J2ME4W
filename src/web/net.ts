import type { HttpRequest, HttpResult, NetHost, NetSocket, NetSocketEvents } from '../midp/platform';

export const DEFAULT_PROXY = '/__j2me4w';

function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class ProxyNetHost implements NetHost {
  constructor(private base: () => string, private log: (msg: string) => void = () => {}, private via: () => string = () => '') {}

  private url(path: string, ws: boolean): string {
    const u = new URL((this.base() || DEFAULT_PROXY).replace(/\/$/, '') + path, document.baseURI);
    if (ws) u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.href;
  }

  connect(host: string, port: number, ev: NetSocketEvents): Promise<NetSocket> {
    return new Promise((resolve, reject) => {
      const target = `${host}:${port}`;
      let ws: WebSocket;
      try {
        const via = this.via().trim();
        ws = new WebSocket(this.url(`/tcp?host=${encodeURIComponent(host)}&port=${port}${via ? `&via=${encodeURIComponent(via)}` : ''}`, true));
      } catch (e) {
        reject(e);
        return;
      }
      ws.binaryType = 'arraybuffer';
      let open = false;
      ws.onmessage = (e) => {
        if (!open) {
          if (e.data === 'OK') {
            open = true;
            this.log(`[net] connected to ${target}`);
            resolve({
              send: (d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d); },
              close: () => ws.close(1000),
            });
          }
          return;
        }
        if (e.data instanceof ArrayBuffer) ev.onData(new Uint8Array(e.data));
      };
      ws.onclose = (e) => {
        if (!open) {
          reject(new Error(e.reason || 'network proxy unreachable (run "npm run dev" or "npm start")'));
          return;
        }
        this.log(`[net] ${target} closed${e.code !== 1000 && e.reason ? ': ' + e.reason : ''}`);
        ev.onClose(e.code === 1000 || e.code === 1005 ? undefined : e.reason || 'connection lost');
      };
    });
  }

  async http(req: HttpRequest): Promise<HttpResult> {
    let res: Response;
    try {
      res = await fetch(this.url('/http', false), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method: req.method, url: req.url, headers: req.headers, body: req.body ? toBase64(req.body) : null,
          via: this.via().trim() || undefined,
        }),
      });
    } catch {
      throw new Error('network proxy unreachable');
    }
    let data: any;
    try { data = await res.json(); } catch { throw new Error(`network proxy error ${res.status}`); }
    if (!res.ok) throw new Error(data?.error ?? `network proxy error ${res.status}`);
    this.log(`[net] ${req.method} ${req.url} -> ${data.status}`);
    return { status: data.status, message: data.message ?? '', headers: data.headers ?? [], body: fromBase64(data.body ?? '') };
  }
}
