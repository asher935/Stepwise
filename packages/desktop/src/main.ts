import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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
  if (process.env['CHROME_BIN']) {
    return process.env['CHROME_BIN'];
  }

  const browsersPath = join(app.getPath('userData'), 'ms-playwright');
  const registryModuleUrl = pathToFileURL(
    getBundlePath('node_modules', 'playwright-core', 'lib', 'server', 'registry', 'index.js')
  ).href;
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
  } catch {
    await runBundledCommand([cliPath, 'install', 'chromium'], {
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    });
    const installedPath = await runBundledCommand(['--eval', resolveScript], {
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    });
    return installedPath.trim().split('\n').pop() ?? '';
  }
}

async function runBundledCommand(args: string[], extraEnv: Record<string, string>): Promise<string> {
  const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const bunBinary = getBundlePath('bin', bunBinaryName);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(bunBinary, args, {
      cwd: getBundlePath(),
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
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
