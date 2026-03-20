import { cp, chmod, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, '..');
const repoRoot = join(desktopDir, '..', '..');
const bundleDir = join(desktopDir, '.bundle');
const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun';

async function copyDirectory(source, target) {
  await cp(source, target, { recursive: true, force: true, dereference: true });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function getBrowserRoot(executablePath) {
  let currentPath = dirname(executablePath);

  while (currentPath !== dirname(currentPath)) {
    if (basename(currentPath).startsWith('chromium-')) {
      return currentPath;
    }

    currentPath = dirname(currentPath);
  }

  throw new Error(`Unable to resolve Playwright browser directory from ${executablePath}`);
}

await rm(bundleDir, { recursive: true, force: true });
await mkdir(join(bundleDir, 'bin'), { recursive: true });
await mkdir(join(bundleDir, 'server'), { recursive: true });
await mkdir(join(bundleDir, 'client'), { recursive: true });
await mkdir(join(bundleDir, 'node_modules'), { recursive: true });

const serverDist = join(repoRoot, 'packages', 'server', 'dist', 'index.js');
const clientDist = join(repoRoot, 'packages', 'client', 'dist');
const sharedNodeModulesDir = join(repoRoot, 'node_modules', '.bun', 'node_modules');
const playwrightCoreDir = join(sharedNodeModulesDir, 'playwright-core');
const sharpImageDir = join(sharedNodeModulesDir, '@img');
const browserExecutablePath = chromium.executablePath();
const browserRoot = getBrowserRoot(browserExecutablePath);
const browserRelativeExecutablePath = relative(browserRoot, browserExecutablePath);
const browserDirName = basename(browserRoot);

await copyFile(process.execPath, join(bundleDir, 'bin', bunBinaryName));
if (process.platform !== 'win32') {
  await chmod(join(bundleDir, 'bin', bunBinaryName), 0o755);
}

await copyFile(serverDist, join(bundleDir, 'server', 'index.js'));
await copyDirectory(clientDist, join(bundleDir, 'client', 'dist'));
await copyDirectory(playwrightCoreDir, join(bundleDir, 'node_modules', 'playwright-core'));

if (!browserDirName) {
  throw new Error('Unable to determine Playwright browser directory name');
}

await copyDirectory(browserRoot, join(bundleDir, 'ms-playwright', browserDirName));
await writeFile(
  join(bundleDir, 'browser.json'),
  JSON.stringify({
    executablePath: join('ms-playwright', browserDirName, browserRelativeExecutablePath),
  })
);

if (await exists(sharpImageDir)) {
  await copyDirectory(sharpImageDir, join(bundleDir, 'node_modules', '@img'));
}
