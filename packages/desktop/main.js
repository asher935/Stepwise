"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const promises_2 = require("node:timers/promises");
const node_child_process_1 = require("node:child_process");
const node_url_1 = require("node:url");
const electron_1 = require("electron");
const DESKTOP_BACKEND_PORT = Number(process.env['STEPWISE_DESKTOP_PORT'] ?? '43123');
let mainWindow = null;
let backendProcess = null;
let isQuitting = false;
let isStoppingBackend = false;
function getBackendOrigin() {
    return process.env['STEPWISE_BACKEND_URL'] ?? `http://127.0.0.1:${DESKTOP_BACKEND_PORT}`;
}
function getRendererUrl() {
    return process.env['STEPWISE_RENDERER_URL'] ?? getBackendOrigin();
}
function getBundlePath(...segments) {
    const basePath = (0, node_path_1.join)(electron_1.app.getAppPath(), '.bundle');
    return (0, node_path_1.join)(basePath, ...segments);
}
async function getBundledBrowserPath() {
    if (process.env['CHROME_BIN']) {
        return process.env['CHROME_BIN'];
    }
    const browsersPath = (0, node_path_1.join)(electron_1.app.getPath('userData'), 'ms-playwright');
    const registryModuleUrl = (0, node_url_1.pathToFileURL)(getBundlePath('node_modules', 'playwright-core', 'lib', 'server', 'registry', 'index.js')).href;
    const cliPath = getBundlePath('node_modules', 'playwright-core', 'cli.js');
    const resolveScript = [
        `import { registry } from ${JSON.stringify(registryModuleUrl)};`,
        `const executable = registry.findExecutable('chromium');`,
        `if (!executable) throw new Error('Chromium executable is unavailable');`,
        `const executablePath = executable.executablePath('javascript');`,
        `if (!executablePath) throw new Error('Chromium browser is not installed');`,
        `console.log(executablePath);`,
    ].join('\n');
    try {
        const resolvedPath = await runBundledCommand(['--eval', resolveScript], {
            PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        });
        return resolvedPath.trim().split('\n').pop() ?? '';
    }
    catch {
        await runBundledCommand([cliPath, 'install', 'chromium'], {
            PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        });
        const installedPath = await runBundledCommand(['--eval', resolveScript], {
            PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        });
        return installedPath.trim().split('\n').pop() ?? '';
    }
}
async function runBundledCommand(args, extraEnv) {
    const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun';
    const bunBinary = getBundlePath('bin', bunBinaryName);
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(bunBinary, args, {
            cwd: getBundlePath(),
            env: {
                ...process.env,
                ...extraEnv,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.once('error', (error) => {
            reject(error);
        });
        child.once('exit', (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(stderr.trim() || stdout.trim() || `Bundled command failed with code ${code ?? -1}`));
        });
    });
}
async function waitForBackend() {
    const healthUrl = `${getBackendOrigin()}/api/health`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(healthUrl);
            if (response.ok) {
                return;
            }
        }
        catch {
            await (0, promises_2.setTimeout)(500);
            continue;
        }
        await (0, promises_2.setTimeout)(500);
    }
    throw new Error(`Backend did not become healthy at ${healthUrl}`);
}
async function startBundledBackend() {
    if (process.env['STEPWISE_BACKEND_URL']) {
        return;
    }
    const dataDir = electron_1.app.getPath('userData');
    const tempDir = (0, node_path_1.join)(dataDir, 'temp');
    const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun';
    const bunBinary = getBundlePath('bin', bunBinaryName);
    const serverEntry = getBundlePath('server', 'index.js');
    const browserPath = await getBundledBrowserPath();
    await (0, promises_1.mkdir)(tempDir, { recursive: true });
    backendProcess = (0, node_child_process_1.spawn)(bunBinary, [serverEntry], {
        cwd: getBundlePath(),
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: String(DESKTOP_BACKEND_PORT),
            TEMP_DIR: tempDir,
            CHROME_BIN: browserPath,
        },
        stdio: 'pipe',
    });
    backendProcess.stdout.on('data', (chunk) => {
        process.stdout.write(chunk.toString());
    });
    backendProcess.stderr.on('data', (chunk) => {
        process.stderr.write(chunk.toString());
    });
    backendProcess.once('exit', (code) => {
        backendProcess = null;
        if (!isQuitting) {
            console.error(`[Desktop] Backend exited early with code ${code ?? -1}`);
            electron_1.app.quit();
        }
    });
    await waitForBackend();
}
async function stopBundledBackend() {
    if (!backendProcess) {
        return;
    }
    const processToStop = backendProcess;
    backendProcess = null;
    processToStop.kill('SIGTERM');
    await Promise.race([
        new Promise((resolve) => {
            processToStop.once('exit', () => {
                resolve();
            });
        }),
        (0, promises_2.setTimeout)(5000).then(() => {
            processToStop.kill('SIGKILL');
        }),
    ]);
}
async function createMainWindow() {
    await startBundledBackend();
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1100,
        minHeight: 760,
        show: false,
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    await mainWindow.loadURL(getRendererUrl());
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.on('before-quit', () => {
    isQuitting = true;
});
electron_1.app.whenReady().then(async () => {
    await createMainWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            void createMainWindow();
        }
    });
}).catch((error) => {
    console.error('[Desktop] Failed to start app:', error);
    electron_1.app.quit();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('will-quit', (event) => {
    if (isStoppingBackend) {
        return;
    }
    event.preventDefault();
    isStoppingBackend = true;
    void stopBundledBackend().finally(() => {
        electron_1.app.exit();
    });
});
//# sourceMappingURL=main.js.map