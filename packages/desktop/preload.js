"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const backendOrigin = process.env['STEPWISE_BACKEND_URL'] ?? 'http://127.0.0.1:43123';
const runtimeConfig = {
    apiBaseUrl: `${backendOrigin}/api`,
    wsBaseUrl: `${backendOrigin.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`,
    isDesktop: true,
};
electron_1.contextBridge.exposeInMainWorld('__STEPWISE_RUNTIME_CONFIG__', runtimeConfig);
const desktopBridge = {
    saveFile(options) {
        return electron_1.ipcRenderer.invoke('desktop:save-file', options);
    },
};
electron_1.contextBridge.exposeInMainWorld('__STEPWISE_DESKTOP_API__', desktopBridge);
//# sourceMappingURL=preload.js.map