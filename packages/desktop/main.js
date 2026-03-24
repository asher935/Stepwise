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
let loadingWindow = null;
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
function getFileFilters(filename) {
    const extension = (0, node_path_1.extname)(filename).toLowerCase();
    switch (extension) {
        case '.pdf':
            return [{ name: 'PDF Document', extensions: ['pdf'] }];
        case '.docx':
            return [{ name: 'Word Document', extensions: ['docx'] }];
        case '.zip':
            return [{ name: 'ZIP Archive', extensions: ['zip'] }];
        case '.stepwise':
            return [{ name: 'Stepwise Export', extensions: ['stepwise'] }];
        default:
            return [{ name: 'All Files', extensions: ['*'] }];
    }
}
async function saveFileFromRenderer(options) {
    const targetWindow = electron_1.BrowserWindow.getFocusedWindow() ?? mainWindow;
    const defaultDirectory = electron_1.app.getPath('downloads');
    const defaultPath = (0, node_path_1.join)(defaultDirectory, (0, node_path_1.basename)(options.filename));
    const dialogOptions = {
        defaultPath,
        filters: getFileFilters(options.filename),
    };
    const dialogResult = targetWindow
        ? await electron_1.dialog.showSaveDialog(targetWindow, dialogOptions)
        : await electron_1.dialog.showSaveDialog(dialogOptions);
    if (dialogResult.canceled || !dialogResult.filePath) {
        return { canceled: true };
    }
    await (0, promises_1.writeFile)(dialogResult.filePath, Buffer.from(options.data));
    return {
        canceled: false,
        path: dialogResult.filePath,
    };
}
function createLoadingWindow() {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        return;
    }
    loadingWindow = new electron_1.BrowserWindow({
        width: 520,
        height: 320,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        center: true,
        show: false,
        title: 'Stepwise',
        backgroundColor: '#f3efe6',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Stepwise</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #f3efe6;
          --panel: rgba(255, 252, 246, 0.82);
          --text: #1e1a17;
          --muted: #6d6258;
          --accent: #d4683c;
          --accent-soft: rgba(212, 104, 60, 0.16);
          --border: rgba(30, 26, 23, 0.08);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          font-family: "Avenir Next", "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at top left, rgba(212, 104, 60, 0.16), transparent 34%),
            radial-gradient(circle at bottom right, rgba(35, 80, 126, 0.14), transparent 30%),
            var(--bg);
          color: var(--text);
        }

        .shell {
          width: 100%;
          height: 100%;
          padding: 28px;
          display: flex;
          align-items: stretch;
        }

        .panel {
          width: 100%;
          border-radius: 24px;
          padding: 28px 26px;
          background: var(--panel);
          border: 1px solid var(--border);
          box-shadow: 0 18px 45px rgba(79, 61, 44, 0.12);
          display: flex;
          flex-direction: column;
          gap: 18px;
          justify-content: center;
        }

        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .title {
          margin: 0;
          font-size: 36px;
          line-height: 1;
          font-weight: 700;
        }

        .status {
          margin: 0;
          min-height: 52px;
          font-size: 15px;
          line-height: 1.5;
          color: var(--muted);
        }

        .meter {
          position: relative;
          overflow: hidden;
          height: 10px;
          border-radius: 999px;
          background: rgba(30, 26, 23, 0.08);
        }

        .meter::before {
          content: "";
          position: absolute;
          inset: 0;
          width: 42%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--accent), #f2a65a);
          animation: sweep 1.4s ease-in-out infinite;
        }

        .hint {
          font-size: 13px;
          color: var(--muted);
        }

        @keyframes sweep {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="panel">
          <div class="eyebrow">Desktop Runtime</div>
          <h1 class="title">Stepwise</h1>
          <p class="status" id="status">Preparing application startup...</p>
          <div class="meter" aria-hidden="true"></div>
          <div class="hint">The first launch may take longer while the browser runtime is prepared.</div>
        </div>
      </div>
      <script>
        window.setStatus = (value) => {
          const target = document.getElementById('status');
          if (target) target.textContent = value;
        };
      </script>
    </body>
  </html>`;
    void loadingWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    loadingWindow.once('ready-to-show', () => {
        loadingWindow?.show();
    });
    loadingWindow.on('closed', () => {
        loadingWindow = null;
    });
}
function updateLoadingStatus(status) {
    if (!loadingWindow || loadingWindow.isDestroyed()) {
        return;
    }
    void loadingWindow.webContents.executeJavaScript(`window.setStatus(${JSON.stringify(status)});`);
}
function closeLoadingWindow() {
    if (!loadingWindow || loadingWindow.isDestroyed()) {
        return;
    }
    loadingWindow.close();
    loadingWindow = null;
}
async function getBundledBrowserPath() {
    if (process.env['CHROME_BIN']) {
        updateLoadingStatus('Using configured browser runtime...');
        return process.env['CHROME_BIN'];
    }
    const registryModuleUrl = (0, node_url_1.pathToFileURL)(getBundlePath('node_modules', 'playwright-core', 'lib', 'server', 'registry', 'index.js')).href;
    const cliPath = getBundlePath('node_modules', 'playwright-core', 'cli.js');
    const resolveScript = [
        `import { registry } from ${JSON.stringify(registryModuleUrl)};`,
        `const executable = registry.findExecutable('chromium');`,
        `if (!executable) throw new Error('Chromium executable is unavailable');`,
        `const executablePath = executable.executablePathOrDie('javascript');`,
        `console.log(executablePath);`,
    ].join('\n');
    try {
        updateLoadingStatus('Checking local browser runtime...');
        const resolvedPath = await runBundledCommand(['--eval', resolveScript], {});
        return resolvedPath.trim().split('\n').pop() ?? '';
    }
    catch {
        updateLoadingStatus('Installing browser runtime for first launch...');
        await runBundledCommand([cliPath, 'install', 'chromium'], {}, (message) => {
            updateLoadingStatus(`Installing browser runtime...\n${message}`);
        });
        updateLoadingStatus('Finishing browser setup...');
        const installedPath = await runBundledCommand(['--eval', resolveScript], {});
        return installedPath.trim().split('\n').pop() ?? '';
    }
}
async function runBundledCommand(args, extraEnv, onOutput) {
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
        let lastLine = '';
        const pushChunk = (chunk, target) => {
            const text = chunk.toString();
            if (target === 'stdout') {
                stdout += text;
            }
            else {
                stderr += text;
            }
            const lines = text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            const nextLine = lines.at(-1);
            if (nextLine && nextLine !== lastLine) {
                lastLine = nextLine;
                onOutput?.(nextLine);
            }
        };
        child.stdout.on('data', (chunk) => {
            pushChunk(chunk, 'stdout');
        });
        child.stderr.on('data', (chunk) => {
            pushChunk(chunk, 'stderr');
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
    updateLoadingStatus('Preparing browser runtime...');
    const browserPath = await getBundledBrowserPath();
    await (0, promises_1.mkdir)(tempDir, { recursive: true });
    updateLoadingStatus('Starting local backend...');
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
    updateLoadingStatus('Waiting for backend health check...');
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
    createLoadingWindow();
    await startBundledBackend();
    updateLoadingStatus('Opening application...');
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
        closeLoadingWindow();
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.on('before-quit', () => {
    isQuitting = true;
});
electron_1.ipcMain.handle('desktop:save-file', (_event, options) => {
    return saveFileFromRenderer(options);
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