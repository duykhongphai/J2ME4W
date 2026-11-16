// Network bridge for MIDlets running in the browser.
//   WS   /__j2me4w/tcp?host=H&port=P   raw TCP over a WebSocket (binary frames; "OK" text frame once connected)
//   POST /__j2me4w/http                JSON {method, url, headers:[[k,v]], body:base64|null}
//                                      -> JSON {status, message, headers:[[k,v]], body:base64}
// Private/loopback targets are refused unless J2ME4W_ALLOW_PRIVATE=1, so the proxy cannot be used
// to reach the machine's own network.
import dns from 'node:dns/promises';
import net from 'node:net';
import { WebSocketServer } from 'ws';

export const PREFIX = '/__j2me4w';
const MAX_HTTP_BODY = 10 * 1024 * 1024;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168);
  }
  const l = ip.toLowerCase();
  if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
  return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

/** Resolves `host` and returns an address that is allowed to be contacted. */
async function resolveTarget(host, allowPrivate) {
  const h = host.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true });
  if (!addrs.length) throw new Error(`cannot resolve ${host}`);
  if (!allowPrivate && addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error(`refusing to connect to private address ${host} (set J2ME4W_ALLOW_PRIVATE=1 to allow)`);
  }
  return addrs[0].address;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const DROP_REQUEST_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade']);

export function createProxy(opts = {}) {
  const allowPrivate = opts.allowPrivate ?? process.env.J2ME4W_ALLOW_PRIVATE === '1';
  const log = opts.log ?? ((m) => console.log(`[j2me4w-proxy] ${m}`));
  const wss = new WebSocketServer({ noServer: true });

  function bridge(ws, host, port) {
    let tcp = null;
    let closed = false;
    const fail = (msg) => {
      if (closed) return;
      closed = true;
      try { ws.close(4000, String(msg).slice(0, 120)); } catch { /* ignore */ }
      tcp?.destroy();
    };
    resolveTarget(host, allowPrivate).then((addr) => {
      if (closed) return;
      tcp = net.connect({ host: addr, port });
      tcp.setNoDelay(true);
      tcp.setTimeout(15000, () => { if (!tcp.connecting) return; fail('connect timeout'); });
      tcp.on('connect', () => {
        tcp.setTimeout(0);
        log(`tcp ${host}:${port} connected`);
        ws.send('OK');
      });
      tcp.on('data', (d) => { if (ws.readyState === ws.OPEN) ws.send(d, { binary: true }); });
      tcp.on('error', (e) => fail(e.message));
      tcp.on('close', () => {
        if (closed) return;
        closed = true;
        log(`tcp ${host}:${port} closed`);
        try { ws.close(1000, 'closed'); } catch { /* ignore */ }
      });
    }, (e) => fail(e.message));
    ws.on('message', (data, isBinary) => {
      if (!tcp || closed) return;
      tcp.write(isBinary ? data : Buffer.from(String(data)));
    });
    ws.on('close', () => { closed = true; tcp?.end(); });
    ws.on('error', () => { closed = true; tcp?.destroy(); });
  }

  return {
    /** Returns true if the upgrade request was for the proxy. */
    handleUpgrade(req, socket, head) {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== `${PREFIX}/tcp`) return false;
      const host = u.searchParams.get('host') ?? '';
      const port = Number(u.searchParams.get('port'));
      if (!host || !(port > 0 && port < 65536)) {
        socket.destroy();
        return true;
      }
      wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, host, port));
      return true;
    },

    /** Returns true if the request was handled. */
    handleHttp(req, res) {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== `${PREFIX}/http`) return false;
      const reply = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(obj));
      };
      if (req.method !== 'POST') { reply(405, { error: 'POST only' }); return true; }
      (async () => {
        const spec = JSON.parse((await readBody(req, MAX_HTTP_BODY * 2)).toString('utf8'));
        const target = new URL(spec.url);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('unsupported protocol');
        await resolveTarget(target.hostname, allowPrivate);
        const headers = {};
        for (const [k, v] of spec.headers ?? []) if (!DROP_REQUEST_HEADERS.has(String(k).toLowerCase())) headers[k] = v;
        const method = String(spec.method || 'GET').toUpperCase();
        const r = await fetch(target, {
          method,
          headers,
          body: spec.body && method !== 'GET' && method !== 'HEAD' ? Buffer.from(spec.body, 'base64') : undefined,
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        });
        const body = Buffer.from(await r.arrayBuffer());
        if (body.length > MAX_HTTP_BODY) throw new Error('response too large');
        log(`http ${method} ${target.href} -> ${r.status}`);
        reply(200, { status: r.status, message: r.statusText, headers: [...r.headers], body: body.toString('base64') });
      })().catch((e) => reply(502, { error: String(e?.message ?? e) }));
      return true;
    },
  };
}
