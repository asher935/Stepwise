import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { app, BrowserWindow } from 'electron';

const DESKTOP_BACKEND_PORT = Number(process.env['STEPWISE_DESKTOP_PORT'] ?? '43123');

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcessWithoutNullStreams | null = null;
let isQuitting = false;
let isStoppingBackend = false;

function getBackendOrigin(): string {
  return process.env['STEPWISE_BACKEND_URL'] ?? `http://127.0.0.1:${DESKTOP_BACKEND_PORT}`;
}

function getRendererUrl(): string {
  return process.env['STEPWISE_RENDERER_URL'] ?? getBackendOrigin();
}

function getBundlePath(...segments: string[]): string {
  const basePath = join(app.getAppPath(), '.bundle');

  return join(basePath, ...segments);
}

async function getBundledBrowserPath(): Promise<string> {
  const metadataPath = getBundlePath('browser.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
    executablePath: string;
  };

  return getBundlePath(metadata.executablePath);
}

async function waitForBackend(): Promise<void> {
  const healthUrl = `${getBackendOrigin()}/api/health`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(500);
      continue;
    }

    await delay(500);
  }

  throw new Error(`Backend did not become healthy at ${healthUrl}`);
}

async function startBundledBackend(): Promise<void> {
  if (process.env['STEPWISE_BACKEND_URL']) {
    return;
  }

  const dataDir = app.getPath('userData');
  const tempDir = join(dataDir, 'temp');
  const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const bunBinary = getBundlePath('bin', bunBinaryName);
  const serverEntry = getBundlePath('server', 'index.js');
  const browserPath = await getBundledBrowserPath();

  await mkdir(tempDir, { recursive: true });

  backendProcess = spawn(bunBinary, [serverEntry], {
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

  backendProcess.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk.toString());
  });

  backendProcess.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk.toString());
  });

  backendProcess.once('exit', (code) => {
    backendProcess = null;
    if (!isQuitting) {
      console.error(`[Desktop] Backend exited early with code ${code ?? -1}`);
      app.quit();
    }
  });

  await waitForBackend();
}

async function stopBundledBackend(): Promise<void> {
  if (!backendProcess) {
    return;
  }

  const processToStop = backendProcess;
  backendProcess = null;

  processToStop.kill('SIGTERM');

  await Promise.race([
    new Promise<void>((resolve) => {
      processToStop.once('exit', () => {
        resolve();
      });
    }),
    delay(5000).then(() => {
      processToStop.kill('SIGKILL');
    }),
  ]);
}

async function createMainWindow(): Promise<void> {
  await startBundledBackend();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
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

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}).catch((error: unknown) => {
  console.error('[Desktop] Failed to start app:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', (event) => {
  if (isStoppingBackend) {
    return;
  }

  event.preventDefault();
  isStoppingBackend = true;
  void stopBundledBackend().finally(() => {
    app.exit();
  });
});
