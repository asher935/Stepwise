import { contextBridge } from 'electron';

import type { RuntimeConfig } from '@stepwise/shared';

const backendOrigin = process.env['STEPWISE_BACKEND_URL'] ?? 'http://127.0.0.1:43123';

const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: `${backendOrigin}/api`,
  wsBaseUrl: `${backendOrigin.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`,
  isDesktop: true,
};

contextBridge.exposeInMainWorld('__STEPWISE_RUNTIME_CONFIG__', runtimeConfig);
