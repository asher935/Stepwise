import { env } from './lib/env.js';
import { sessionManager } from './services/SessionManager.js';
import { createStepwiseApp, type StepwiseApp, type StepwiseAppOptions } from './app.js';
import { notifySessionEnded, notifySessionExpiring, notifySessionStarted, notifySessionState } from './ws/handler.js';

export interface StartStepwiseServerOptions extends StepwiseAppOptions {
  port?: number;
}

let listenersRegistered = false;

function registerSessionListeners(): void {
  if (listenersRegistered) {
    return;
  }

  sessionManager.on('session:started', (sessionId) => {
    void notifySessionStarted(sessionId).catch((error: unknown) => {
      console.error('[Server] Failed to notify started session:', error);
    });
  });

  sessionManager.on('session:ended', (sessionId, data) => {
    const reason = (
      typeof data === 'object' &&
      data !== null &&
      'reason' in data &&
      (data.reason === 'user' || data.reason === 'timeout' || data.reason === 'error')
    )
      ? data.reason
      : 'error';

    void notifySessionEnded(sessionId, reason).catch((error: unknown) => {
      console.error('[Server] Failed to notify ended session:', error);
    });
  });

  sessionManager.on('session:expiring', (sessionId, data) => {
    const remainingMs = (
      typeof data === 'object' &&
      data !== null &&
      'remainingMs' in data &&
      typeof data.remainingMs === 'number'
    )
      ? data.remainingMs
      : 0;

    if (remainingMs <= 0) {
      return;
    }

    notifySessionExpiring(sessionId, remainingMs);
  });

  sessionManager.on('session:updated', (sessionId) => {
    notifySessionState(sessionId);
  });

  listenersRegistered = true;
}

export async function shutdownStepwiseServer(): Promise<void> {
  console.warn('[Server] Shutting down...');
  await sessionManager.shutdown();
  console.warn('[Server] Shutdown complete');
}

export function startStepwiseServer(options: StartStepwiseServerOptions = {}): StepwiseApp {
  registerSessionListeners();
  const app = createStepwiseApp(options);
  const port = options.port ?? env.PORT;

  app.listen(port);

  return app;
}
