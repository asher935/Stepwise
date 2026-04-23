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
    void notifySessionEnded(sessionId, data.reason).catch((error: unknown) => {
      console.error('[Server] Failed to notify ended session:', error);
    });
  });

  sessionManager.on('session:expiring', (sessionId, data) => {
    if (data.remainingMs <= 0) {
      return;
    }

    notifySessionExpiring(sessionId, data.remainingMs);
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
