import net from 'node:net';
import type { HttpRequest, HttpResult, NetHost, NetSocket, NetSocketEvents } from '../src/midp/platform';

export class NodeNetHost implements NetHost {
  constructor(private log: (msg: string) => void = () => {}) {}

  connect(host: string, port: number, ev: NetSocketEvents): Promise<NetSocket> {
    return new Promise((resolve, reject) => {
      const s = net.connect({ host, port });
      s.setNoDelay(true);
      let open = false;
      const timer = setTimeout(() => { if (!open) s.destroy(new Error('connect timeout')); }, 15000);
      s.on('connect', () => {
        open = true;
        clearTimeout(timer);
        this.log(`[net] connected to ${host}:${port}`);
        resolve({ send: (d) => s.write(d), close: () => s.end() });
      });
      s.on('data', (d) => ev.onData(new Uint8Array(d)));
      s.on('error', (e) => { if (!open) reject(e); else ev.onClose(e.message); });
      s.on('close', () => { if (open) { this.log(`[net] ${host}:${port} closed`); ev.onClose(); } });
    });
  }

  async http(req: HttpRequest): Promise<HttpResult> {
    const r = await fetch(req.url, {
      method: req.method,
      headers: Object.fromEntries(req.headers.filter(([k]) => !/^(host|content-length|connection)$/i.test(k))),
      body: req.body && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.from(req.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const body = new Uint8Array(await r.arrayBuffer());
    this.log(`[net] ${req.method} ${req.url} -> ${r.status}`);
    return { status: r.status, message: r.statusText, headers: [...r.headers], body };
  }
}
