import { existsSync } from 'node:fs';
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
import { handleClose, handleMessage, handleOpen } from './ws/handler.js';

export interface StepwiseAppOptions {
  clientDistPath?: string;
  serveClient?: boolean;
}

export function getDefaultClientDistPath(): string {
  const configuredPath = process.env['STEPWISE_CLIENT_DIST'];
  if (configuredPath) {
    return configuredPath;
  }

  const candidatePaths = [
    join(import.meta.dir, '..', '..', 'client', 'dist'),
    join(import.meta.dir, '..', 'client', 'dist'),
  ] as const;

  const resolvedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));
  return resolvedPath ?? candidatePaths[0];
}

export function createStepwiseApp(options: StepwiseAppOptions = {}) {
  const clientDistPath = options.clientDistPath ?? getDefaultClientDistPath();
  const serveClient = options.serveClient ?? env.NODE_ENV === 'production';

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

        void handleOpen(elysiaWs).catch((error: unknown) => {
          console.error('[WS] Open handler failed:', error);
        });
      },
      message(ws, message) {
        const elysiaWs = ws as unknown as ServerWebSocket<WSConnection>;
        void handleMessage(elysiaWs, message).catch((error: unknown) => {
          console.error('[WS] Message handler failed:', error);
        });
      },
      close(ws) {
        const elysiaWs = ws as unknown as ServerWebSocket<WSConnection>;
        void handleClose(elysiaWs).catch((error: unknown) => {
          console.error('[WS] Close handler failed:', error);
        });
      },
    });

  if (serveClient) {
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

  return app;
}

export type StepwiseApp = ReturnType<typeof createStepwiseApp>;
