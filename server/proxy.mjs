import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { WebSocketServer } from 'ws';

export const PREFIX = '/__j2me4w';
const MAX_HTTP_BODY = 10 * 1024 * 1024;
const CONNECT_TIMEOUT = 15000;

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

async function resolveTarget(host, allowPrivate, what = '') {
  const h = host.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true });
  if (!addrs.length) throw new Error(`cannot resolve ${host}`);
  if (!allowPrivate && addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error(`refusing to connect to private address ${host}${what} (set J2ME4W_ALLOW_PRIVATE=1 to allow)`);
  }
  return addrs[0].address;
}

function parseVia(via) {
  if (!via) return null;
  let u;
  try { u = new URL(via); } catch { throw new Error(`bad proxy URL: ${via}`); }
  const type = u.protocol.replace(':', '');
  if (!['socks5', 'socks5h', 'socks', 'http'].includes(type)) throw new Error(`unsupported proxy type ${u.protocol}`);
  const port = Number(u.port) || (type === 'http' ? 8080 : 1080);
  return {
    type: type === 'http' ? 'http' : 'socks5',
    remoteDns: type === 'socks5h' || type === 'socks',
    host: u.hostname,
    port,
    user: decodeURIComponent(u.username),
    pass: decodeURIComponent(u.password),
    label: `${type}://${u.hostname}:${port}`,
  };
}

function waitConnect(sock) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { sock.destroy(); reject(new Error('connect timeout')); }, CONNECT_TIMEOUT);
    sock.once('connect', () => { clearTimeout(t); resolve(); });
    sock.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function readBytes(sock, n) {
  return new Promise((resolve, reject) => {
    const tryRead = () => {
      const b = sock.read(n);
      if (b === null) return false;
      cleanup();
      resolve(b);
      return true;
    };
    const onReadable = () => { tryRead(); };
    const onErr = (e) => { cleanup(); reject(e); };
    const onEnd = () => { cleanup(); reject(new Error('proxy closed the connection')); };
    const cleanup = () => { sock.off('readable', onReadable); sock.off('error', onErr); sock.off('end', onEnd); };
    sock.on('error', onErr);
    sock.on('end', onEnd);
    sock.on('readable', onReadable);
    tryRead();
  });
}

async function socks5Handshake(sock, p, host, port) {
  const auth = p.user ? 2 : 0;
  sock.write(Buffer.from(auth ? [5, 2, 0, 2] : [5, 1, 0]));
  const [ver, method] = await readBytes(sock, 2);
  if (ver !== 5 || method === 0xff) throw new Error('SOCKS5 proxy refused the authentication methods');
  if (method === 2) {
    const u = Buffer.from(p.user), w = Buffer.from(p.pass);
    sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([w.length]), w]));
    const [, status] = await readBytes(sock, 2);
    if (status !== 0) throw new Error('SOCKS5 authentication failed');
  }
  let addr;
  if (net.isIPv4(host)) addr = Buffer.from([1, ...host.split('.').map(Number)]);
  else if (net.isIPv6(host)) throw new Error('IPv6 targets through SOCKS5 are not supported');
  else { const h = Buffer.from(host); addr = Buffer.concat([Buffer.from([3, h.length]), h]); }
  sock.write(Buffer.concat([Buffer.from([5, 1, 0]), addr, Buffer.from([port >> 8, port & 255])]));
  const head = await readBytes(sock, 4);
  if (head[1] !== 0) {
    const reasons = ['', 'general failure', 'not allowed by ruleset', 'network unreachable', 'host unreachable',
      'connection refused', 'TTL expired', 'command not supported', 'address type not supported'];
    throw new Error(`SOCKS5 proxy: ${reasons[head[1]] ?? 'error ' + head[1]}`);
  }
  const atyp = head[3];
  const rest = atyp === 1 ? 6 : atyp === 4 ? 18 : (await readBytes(sock, 1))[0] + 2;
  await readBytes(sock, rest);
}

async function httpConnect(sock, p, host, port) {
  const auth = p.user ? `Proxy-Authorization: Basic ${Buffer.from(`${p.user}:${p.pass}`).toString('base64')}\r\n` : '';
  sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
  let head = '';
  while (!head.includes('\r\n\r\n')) {
    head += (await readBytes(sock, 1)).toString('latin1');
    if (head.length > 8192) throw new Error('bad response from HTTP proxy');
  }
  const status = Number(head.split(' ')[1]);
  if (status !== 200) throw new Error(`HTTP proxy answered ${head.split('\r\n')[0]}`);
}

async function openTcp(host, port, via, opts) {
  const p = parseVia(via);
  if (!p) {
    const addr = await resolveTarget(host, opts.allowPrivate);
    const sock = net.connect({ host: addr, port });
    await waitConnect(sock);
    return sock;
  }
  const proxyAddr = await resolveTarget(p.host, opts.allowPrivateProxy || opts.allowPrivate, ' (proxy)');
  let target = host;
  if (!p.remoteDns || p.type === 'http' || net.isIP(host)) {
    target = await resolveTarget(host, opts.allowPrivate);
    if (p.type === 'http' && !net.isIP(host)) target = host;
  }
  const sock = net.connect({ host: proxyAddr, port: p.port });
  await waitConnect(sock);
  sock.setTimeout(CONNECT_TIMEOUT, () => sock.destroy(new Error('proxy handshake timeout')));
  try {
    if (p.type === 'socks5') await socks5Handshake(sock, p, target, port);
    else await httpConnect(sock, p, target, port);
  } catch (e) {
    sock.destroy();
    throw e;
  }
  sock.setTimeout(0);
  return sock;
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

async function requestVia(url, method, headers, body, via, opts, redirects = 5) {
  const target = new URL(url);
  const secure = target.protocol === 'https:';
  const port = Number(target.port) || (secure ? 443 : 80);
  let sock = await openTcp(target.hostname, port, via, opts);
  if (secure) {
    sock = tls.connect({ socket: sock, servername: net.isIP(target.hostname) ? undefined : target.hostname });
    await new Promise((resolve, reject) => { sock.once('secureConnect', resolve); sock.once('error', reject); });
  }
  const lib = secure ? https : http;
  const res = await new Promise((resolve, reject) => {
    const r = lib.request({
      host: target.hostname,
      port,
      path: target.pathname + target.search,
      method,
      headers: { ...headers, host: target.host, ...(body ? { 'content-length': body.length } : {}) },
      createConnection: () => sock,
      agent: false,
      timeout: 20000,
    }, resolve);
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (body) r.write(body);
    r.end();
  });
  const chunks = [];
  let size = 0;
  for await (const c of res) {
    size += c.length;
    if (size > MAX_HTTP_BODY) throw new Error('response too large');
    chunks.push(c);
  }
  sock.destroy();
  if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
    const next = new URL(res.headers.location, target).href;
    const m = res.statusCode === 303 ? 'GET' : method;
    return requestVia(next, m, headers, m === 'GET' ? null : body, via, opts, redirects - 1);
  }
  const hdrs = [];
  for (const [k, v] of Object.entries(res.headers)) hdrs.push([k, Array.isArray(v) ? v.join(', ') : String(v)]);
  return { status: res.statusCode, message: res.statusMessage ?? '', headers: hdrs, body: Buffer.concat(chunks) };
}

export function createProxy(options = {}) {
  const opts = {
    allowPrivate: options.allowPrivate ?? process.env.J2ME4W_ALLOW_PRIVATE === '1',
    allowPrivateProxy: options.allowPrivateProxy ?? process.env.J2ME4W_ALLOW_PRIVATE_PROXY === '1',
  };
  const log = options.log ?? ((m) => console.log(`[j2me4w-proxy] ${m}`));
  const wss = new WebSocketServer({ noServer: true });

  function bridge(ws, host, port, via) {
    let tcp = null;
    let closed = false;
    const label = `${host}:${port}${via ? ` via ${parseViaLabel(via)}` : ''}`;
    const fail = (msg) => {
      if (closed) return;
      closed = true;
      try { ws.close(4000, String(msg).slice(0, 120)); } catch {  }
      tcp?.destroy();
    };
    openTcp(host, port, via, opts).then((sock) => {
      if (closed) { sock.destroy(); return; }
      tcp = sock;
      tcp.setNoDelay(true);
      log(`tcp ${label} connected`);
      ws.send('OK');
      tcp.on('data', (d) => { if (ws.readyState === ws.OPEN) ws.send(d, { binary: true }); });
      tcp.on('error', (e) => fail(e.message));
      tcp.on('close', () => {
        if (closed) return;
        closed = true;
        log(`tcp ${label} closed`);
        try { ws.close(1000, 'closed'); } catch {  }
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
    handleUpgrade(req, socket, head) {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== `${PREFIX}/tcp`) return false;
      const host = u.searchParams.get('host') ?? '';
      const port = Number(u.searchParams.get('port'));
      const via = u.searchParams.get('via') ?? '';
      if (!host || !(port > 0 && port < 65536)) {
        socket.destroy();
        return true;
      }
      wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, host, port, via));
      return true;
    },

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
        const headers = {};
        for (const [k, v] of spec.headers ?? []) if (!DROP_REQUEST_HEADERS.has(String(k).toLowerCase())) headers[k] = v;
        const method = String(spec.method || 'GET').toUpperCase();
        const body = spec.body && method !== 'GET' && method !== 'HEAD' ? Buffer.from(spec.body, 'base64') : null;
        let out;
        if (spec.via) {
          out = await requestVia(target.href, method, headers, body, spec.via, opts);
        } else {
          await resolveTarget(target.hostname, opts.allowPrivate);
          const r = await fetch(target, { method, headers, body: body ?? undefined, redirect: 'follow', signal: AbortSignal.timeout(20000) });
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length > MAX_HTTP_BODY) throw new Error('response too large');
          out = { status: r.status, message: r.statusText, headers: [...r.headers], body: b };
        }
        log(`http ${method} ${target.href}${spec.via ? ` via ${parseViaLabel(spec.via)}` : ''} -> ${out.status}`);
        reply(200, { status: out.status, message: out.message, headers: out.headers, body: out.body.toString('base64') });
      })().catch((e) => reply(502, { error: String(e?.message ?? e) }));
      return true;
    },
  };
}

function parseViaLabel(via) {
  try { return parseVia(via).label; } catch { return 'invalid proxy'; }
}
