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

// Elysia's ws callbacks receive a fresh context object each time where
// ws.data is the Elysia route ctx (request/query/route/...), not the
// { sessionId, token, ... } shape declared by WSConnection. The query
// params do stay available on ws.data.query across callbacks, so copy
// them onto the flat fields downstream code expects.
function hydrateWsConnection(
  ws: ServerWebSocket<WSConnection> & {
    data: Partial<WSConnection> & { query?: { sessionId?: string; token?: string } };
  }
): boolean {
  const existingSessionId = ws.data.sessionId;
  const existingToken = ws.data.token;
  const sessionId = existingSessionId ?? ws.data.query?.sessionId;
  const token = existingToken ?? ws.data.query?.token;
  if (!sessionId || !token) return false;
  ws.data.sessionId = sessionId;
  ws.data.token = token;
  if (ws.data.lastPingAt === undefined) {
    ws.data.lastPingAt = Date.now();
  }
  return true;
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

        // Elysia provides a fresh context object per callback, so sessionId/token
        // must be read from query each time. Populate the flat fields in-place so
        // downstream code (ws.data.sessionId) keeps working without touching query.
        if (!hydrateWsConnection(elysiaWs)) {
          elysiaWs.close(1008, 'Missing sessionId or token');
          return;
        }

        void handleOpen(elysiaWs).catch((error: unknown) => {
          console.error('[WS] Open handler failed:', error);
        });
      },
      message(ws, message) {
        const elysiaWs = ws as unknown as ServerWebSocket<WSConnection>;
        if (!hydrateWsConnection(elysiaWs)) return;
        void handleMessage(elysiaWs, message).catch((error: unknown) => {
          console.error('[WS] Message handler failed:', error);
        });
      },
      close(ws) {
        const elysiaWs = ws as unknown as ServerWebSocket<WSConnection>;
        hydrateWsConnection(elysiaWs);
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
