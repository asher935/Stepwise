import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopBridge, DesktopSaveFileOptions, RuntimeConfig } from '@stepwise/shared';

const backendOrigin = process.env['STEPWISE_BACKEND_URL'] ?? 'http://127.0.0.1:43123';

const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: `${backendOrigin}/api`,
  wsBaseUrl: `${backendOrigin.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`,
  isDesktop: true,
};

contextBridge.exposeInMainWorld('__STEPWISE_RUNTIME_CONFIG__', runtimeConfig);

const desktopBridge: DesktopBridge = {
  saveFile(options: DesktopSaveFileOptions) {
    return ipcRenderer.invoke('desktop:save-file', options);
  },
};

contextBridge.exposeInMainWorld('__STEPWISE_DESKTOP_API__', desktopBridge);
