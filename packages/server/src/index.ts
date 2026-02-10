import { join } from 'node:path';

import { cors } from '@elysiajs/cors';
import type { ServerWebSocket } from 'bun';
import { Elysia, file } from 'elysia';

import { env } from './lib/env.js';
import { exportRoutes } from './routes/export.js';
import { importRoutes } from './routes/import.js';
import { sessionRoutes } from './routes/session.js';
import { sessionManager } from './services/SessionManager.js';
import type { WSConnection } from './types/session.js';
import { handleClose, handleMessage, handleOpen, notifySessionStarted } from './ws/handler.js';

// Server startup information logged via console.warn for development tracking
console.warn(`[Server] Starting Stepwise server...`);
console.warn(`[Server] Environment: ${env.NODE_ENV}`);
console.warn(`[Server] Max sessions: ${env.MAX_SESSIONS}`);

const clientDistPath = join(import.meta.dir, '..', '..', 'client', 'dist');
if (env.NODE_ENV === 'production') {
  console.warn(`[Server] Static files path: ${clientDistPath}`);
}

const app = new Elysia()
  .use(cors({
    origin: env.NODE_ENV === 'development',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))
  
  .get('/api/health', () => ({
    status: 'ok',
    timestamp: Date.now(),
    sessions: sessionManager.getActiveSessionCount(),
    maxSessions: env.MAX_SESSIONS,
  }))
  
  .use(sessionRoutes)
  .use(exportRoutes)
  .use(importRoutes)
  
  .ws('/ws', {
    open(ws) {
      const elysiaWs = ws as unknown as ServerWebSocket<WSConnection> & {
        data: WSConnection & { query?: { sessionId?: string; token?: string } };
      };

      const sessionId = elysiaWs.data.query?.sessionId;
      const token = elysiaWs.data.query?.token;

      if (!sessionId || !token) {
        elysiaWs.close(1008, 'Missing sessionId or token');
        return;
      }

      elysiaWs.data = {
        sessionId,
        token,
        lastPingAt: Date.now(),
      };

      void handleOpen(elysiaWs);
    },
    message(ws, message) {
      const elysiaWs = ws as unknown as ServerWebSocket<WSConnection>;
      void handleMessage(elysiaWs, message);
    },
    close(ws) {
      const elysiaWs = ws as unknown as ServerWebSocket<WSConnection>;
      void handleClose(elysiaWs);
    },
  });

if (env.NODE_ENV === 'production') {
  app
    .get('/assets/*', ({ params }) => {
      const assetPath = params['*'];
      return file(join(clientDistPath, 'assets', assetPath));
    })
    .get('/*', () => file(join(clientDistPath, 'index.html')));
}

app.onError(({ error, code }) => {
  console.error(`[Server] Error (${code}):`, error);
  const message = 'message' in error ? error.message : 'An internal error occurred';
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'development' 
        ? message
        : 'An internal error occurred',
    },
  };
});

sessionManager.on('session:started', (sessionId) => {
  void notifySessionStarted(sessionId);
});

async function shutdown(): Promise<void> {
  console.warn('[Server] Shutting down...');
  await sessionManager.shutdown();
  console.warn('[Server] Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

app.listen(env.PORT);

console.warn(`[Server] Stepwise server running on http://localhost:${env.PORT}`);
console.warn(`[Server] WebSocket endpoint: ws://localhost:${env.PORT}/ws`);
console.warn(`[Server] Health check: http://localhost:${env.PORT}/api/health`);

export type App = typeof app;
