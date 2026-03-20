import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, '..');

await copyFile(join(desktopDir, 'dist', 'main.js'), join(desktopDir, 'main.js'));
await copyFile(join(desktopDir, 'dist', 'preload.js'), join(desktopDir, 'preload.js'));
