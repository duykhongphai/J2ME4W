import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error plain JS module shared with scripts/serve.mjs
import { createProxy } from './server/proxy.mjs';

function networkBridge(): Plugin {
  const attach = (server: { httpServer: any; middlewares: any }) => {
    const proxy = createProxy({ allowPrivateProxy: true });
    server.httpServer?.on('upgrade', (req: any, socket: any, head: any) => proxy.handleUpgrade(req, socket, head));
    server.middlewares.use((req: any, res: any, next: () => void) => { if (!proxy.handleHttp(req, res)) next(); });
  };
  return { name: 'j2me4w-network-bridge', configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig({
  base: './',
  plugins: [networkBridge()],
  build: { target: 'es2022', outDir: 'dist' },
  server: { port: 5173 },
});
