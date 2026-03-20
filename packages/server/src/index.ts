import { env } from './lib/env.js';
import { getDefaultClientDistPath } from './app.js';
import { shutdownStepwiseServer, startStepwiseServer } from './server.js';

console.warn(`[Server] Starting Stepwise server...`);
console.warn(`[Server] Environment: ${env.NODE_ENV}`);
console.warn(`[Server] Max sessions: ${env.MAX_SESSIONS}`);

const clientDistPath = getDefaultClientDistPath();
if (env.NODE_ENV === 'production') {
  console.warn(`[Server] Static files path: ${clientDistPath}`);
}

export const app = startStepwiseServer({
  clientDistPath,
  serveClient: env.NODE_ENV === 'production',
});

async function shutdown(): Promise<void> {
  await shutdownStepwiseServer();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

console.warn(`[Server] Stepwise server running on http://localhost:${env.PORT}`);
console.warn(`[Server] WebSocket endpoint: ws://localhost:${env.PORT}/ws`);
console.warn(`[Server] Health check: http://localhost:${env.PORT}/api/health`);

export type App = typeof app;
