// Production server: serves dist/ and the MIDlet network bridge on one port.
// Usage: npm run build && npm start   (PORT=8080, HOST=0.0.0.0 to listen on all interfaces)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxy } from '../server/proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jar': 'application/java-archive',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/ is missing: run "npm run build" first');
  process.exit(1);
}

// a loopback-bound server only serves this machine, so local upstream proxies are allowed
const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
const proxy = createProxy({ allowPrivateProxy: loopback || undefined });
const server = http.createServer((req, res) => {
  if (proxy.handleHttp(req, res)) return;
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
});
server.on('upgrade', (req, socket, head) => { if (!proxy.handleUpgrade(req, socket, head)) socket.destroy(); });
server.listen(port, host, () => console.log(`J2ME4W on http://${host}:${port}`));
