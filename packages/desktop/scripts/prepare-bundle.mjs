import { cp, chmod, copyFile, mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, '..');
const repoRoot = join(desktopDir, '..', '..');
const bundleDir = join(desktopDir, '.bundle');
const bunBinaryName = process.platform === 'win32' ? 'bun.exe' : 'bun';

async function generateIconFromSvg() {
  const svgPath = join(repoRoot, 'packages', 'shared', 'stepwise-logo.svg');
  const iconPath = join(desktopDir, 'icon.png');

  if (await exists(iconPath)) {
    return;
  }

  const svgContent = await readFile(svgPath, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0">${svgContent}</body></html>`);
  const svgElement = await page.locator('svg').first();
  const screenshot = await svgElement.screenshot({ type: 'png' });
  await writeFile(iconPath, screenshot);
  await browser.close();
  console.log('Generated icon.png from stepwise-logo.svg');
}

async function copyIconToBundle() {
  const iconPath = join(desktopDir, 'icon.png');
  if (await exists(iconPath)) {
    await cp(iconPath, join(bundleDir, 'icon.png'), { force: true });
  }
}

async function copyDirectory(source, target) {
  await cp(source, target, { recursive: true, force: true, dereference: true });
}

function getPackageDir(rootDir, packageName) {
  return join(rootDir, ...packageName.split('/'));
}

async function copyPackageDependencyTree(rootDir, targetRootDir, packageName, visited = new Set()) {
  if (visited.has(packageName)) {
    return;
  }

  const packageDir = getPackageDir(rootDir, packageName);
  if (!(await exists(packageDir))) {
    return;
  }

  visited.add(packageName);

  const targetDir = getPackageDir(targetRootDir, packageName);
  await copyDirectory(packageDir, targetDir);

  const packageJson = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  };

  for (const dependencyName of Object.keys(dependencies)) {
    await copyPackageDependencyTree(rootDir, targetRootDir, dependencyName, visited);
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

await rm(bundleDir, { recursive: true, force: true });
await mkdir(join(bundleDir, 'bin'), { recursive: true });
await mkdir(join(bundleDir, 'server'), { recursive: true });
await mkdir(join(bundleDir, 'client'), { recursive: true });
await mkdir(join(bundleDir, 'node_modules'), { recursive: true });

await generateIconFromSvg();

const serverDist = join(repoRoot, 'packages', 'server', 'dist', 'index.js');
const clientDist = join(repoRoot, 'packages', 'client', 'dist');
const sharedNodeModulesDir = join(repoRoot, 'node_modules', '.bun', 'node_modules');
const sharpImageDir = join(sharedNodeModulesDir, '@img');
const bundledDependencies = ['playwright-core', 'archiver', 'docx', 'sharp'];

await copyFile(process.execPath, join(bundleDir, 'bin', bunBinaryName));
if (process.platform !== 'win32') {
  await chmod(join(bundleDir, 'bin', bunBinaryName), 0o755);
}

await copyFile(serverDist, join(bundleDir, 'server', 'index.js'));
await copyDirectory(clientDist, join(bundleDir, 'client', 'dist'));

const copiedDependencies = new Set();
for (const dependencyName of bundledDependencies) {
  await copyPackageDependencyTree(
    sharedNodeModulesDir,
    join(bundleDir, 'node_modules'),
    dependencyName,
    copiedDependencies
  );
}

if (await exists(sharpImageDir)) {
  await copyDirectory(sharpImageDir, join(bundleDir, 'node_modules', '@img'));
}

await copyIconToBundle();
