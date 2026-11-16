import http from 'node:http';
import net from 'node:net';
import { WebSocket } from 'ws';
import { createProxy } from '../server/proxy.mjs';

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const servers = [];
const track = (s) => { servers.push(s); return s; };

const echoPort = await listen(track(net.createServer((s) => s.on('data', (d) => s.write(Buffer.concat([Buffer.from('echo:'), d]))))));
let socksUsed = 0, connectUsed = 0;
const socksPort = await listen(track(net.createServer((c) => {
  c.once('data', () => {
    c.write(Buffer.from([5, 2]));
    c.once('data', (auth) => {
      const ul = auth[1], user = auth.subarray(2, 2 + ul).toString(), pass = auth.subarray(3 + ul).toString();
      const ok = user === 'u' && pass === 'p';
      c.write(Buffer.from([1, ok ? 0 : 1]));
      if (!ok) return c.end();
      c.once('data', (req) => {
        let host, i;
        if (req[3] === 1) { host = [...req.subarray(4, 8)].join('.'); i = 8; } else { const l = req[4]; host = req.subarray(5, 5 + l).toString(); i = 5 + l; }
        const up = net.connect(req.readUInt16BE(i), host, () => {
          socksUsed++;
          c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          c.pipe(up); up.pipe(c);
        });
      });
    });
  });
})));
const connectPort = await listen(track(http.createServer().on('connect', (req, c) => {
  const [h, p] = req.url.split(':');
  const up = net.connect(Number(p), h, () => { connectUsed++; c.write('HTTP/1.1 200 OK\r\n\r\n'); c.pipe(up); up.pipe(c); });
})));
const webPort = await listen(track(http.createServer((req, res) => { res.writeHead(200); res.end(`hello ${req.method} ${req.url}`); })));

const proxy = createProxy({ allowPrivate: true, log: () => {} });
const bridge = track(http.createServer((req, res) => { if (!proxy.handleHttp(req, res)) res.writeHead(404).end(); }));
bridge.on('upgrade', (req, s, h) => proxy.handleUpgrade(req, s, h));
const bport = await listen(bridge);

function tcp(via) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bport}/__j2me4w/tcp?host=127.0.0.1&port=${echoPort}${via ? '&via=' + encodeURIComponent(via) : ''}`);
    let ok = false;
    ws.on('message', (d) => {
      if (!ok) { ok = String(d) === 'OK'; ws.send(Buffer.from('hi'), { binary: true }); return; }
      resolve(String(d));
      ws.close();
    });
    ws.on('close', (code, reason) => { if (!ok) resolve(`closed ${code} ${reason}`); });
  });
}
const httpReq = async (body) => {
  const r = await fetch(`http://127.0.0.1:${bport}/__j2me4w/http`, { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  return j.error ? `error ${j.error}` : `${j.status} ${Buffer.from(j.body, 'base64')}`;
};

const socks = `socks5://u:p@127.0.0.1:${socksPort}`;
const checks = [
  ['tcp direct', await tcp(''), 'echo:hi'],
  ['tcp via socks5', await tcp(socks), 'echo:hi'],
  ['tcp via socks5, bad password', await tcp(`socks5://u:x@127.0.0.1:${socksPort}`), 'closed 4000 SOCKS5 authentication failed'],
  ['tcp via http connect', await tcp(`http://127.0.0.1:${connectPort}`), 'echo:hi'],
  ['http direct', await httpReq({ method: 'GET', url: `http://127.0.0.1:${webPort}/a`, headers: [] }), '200 hello GET /a'],
  ['http via socks5', await httpReq({ method: 'GET', url: `http://127.0.0.1:${webPort}/b?c=1`, headers: [], via: socks }), '200 hello GET /b?c=1'],
  ['http via http connect', await httpReq({ method: 'POST', url: `http://127.0.0.1:${webPort}/p`, headers: [], body: 'eA==', via: `http://127.0.0.1:${connectPort}` }), '200 hello POST /p'],
];
let failed = 0;
for (const [name, got, want] of checks) {
  if (got !== want) { failed++; console.log(`FAIL proxy: ${name}\n    expected: ${want}\n    actual:   ${got}`); }
}
if (socksUsed < 2 || connectUsed < 2) { failed++; console.log(`FAIL proxy: upstream proxies not used (socks ${socksUsed}, connect ${connectUsed})`); }
if (!failed) console.log(`ok   network bridge (${checks.length} checks)`);
for (const s of servers) { s.closeAllConnections?.(); s.close(); }
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 200).unref();
