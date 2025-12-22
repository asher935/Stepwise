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

console.log(`[Server] Starting Stepwise server...`);
console.log(`[Server] Environment: ${env.NODE_ENV}`);
console.log(`[Server] Max sessions: ${env.MAX_SESSIONS}`);

const clientDistPath = join(import.meta.dir, '..', '..', 'client', 'dist');
if (env.NODE_ENV === 'production') {
  console.log(`[Server] Static files path: ${clientDistPath}`);
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
      const raw = (ws as { raw?: ServerWebSocket<WSConnection> }).raw ?? (ws as unknown as ServerWebSocket<WSConnection>);
      const query = raw.data.query as { sessionId: string; token: string };
      raw.data.sessionId = query.sessionId;
      raw.data.token = query.token;
      raw.data.lastPingAt = Date.now();
      handleOpen(raw);
    },
    message(ws, message) {
      const raw = (ws as { raw?: ServerWebSocket<WSConnection> }).raw ?? (ws as unknown as ServerWebSocket<WSConnection>);
      handleMessage(raw, message);
    },
    close(ws) {
      const raw = (ws as { raw?: ServerWebSocket<WSConnection> }).raw ?? (ws as unknown as ServerWebSocket<WSConnection>);
      handleClose(raw);
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
  notifySessionStarted(sessionId);
});

async function shutdown(): Promise<void> {
  console.log('[Server] Shutting down...');
  await sessionManager.shutdown();
  console.log('[Server] Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(env.PORT);

console.log(`[Server] Stepwise server running on http://localhost:${env.PORT}`);
console.log(`[Server] WebSocket endpoint: ws://localhost:${env.PORT}/ws`);
console.log(`[Server] Health check: http://localhost:${env.PORT}/api/health`);

export type App = typeof app;
