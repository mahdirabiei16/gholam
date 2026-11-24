import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { serverConfig, isAiConfigured } from './server/config/env.js';
import { apiRouter } from './server/routes/api.js';
import { attachLiveWebSocketServer } from './server/live/liveBridge.js';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  attachLiveWebSocketServer(httpServer);

  app.use(express.json({ limit: '15mb' }));
  app.use('/api', apiRouter);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(serverConfig.port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${serverConfig.port}`);
    if (!isAiConfigured()) {
      console.warn('GEMINI_API_KEY is not configured.');
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
