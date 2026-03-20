import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const desktopDir = join(scriptDir, '..');
const makeDir = join(desktopDir, 'out', 'make');
const outputDir = join(desktopDir, 'release-assets');
const platform = process.env['STEPWISE_RELEASE_PLATFORM'];
const arch = process.env['STEPWISE_RELEASE_ARCH'];

if (!platform || !arch) {
  throw new Error('STEPWISE_RELEASE_PLATFORM and STEPWISE_RELEASE_ARCH are required');
}

const allowedExtensions = new Set(['.dmg', '.zip', '.exe', '.nupkg', '.deb']);
const allowedNames = new Set(['RELEASES']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) {
          return [];
        }

        return walk(fullPath);
      }

      return [fullPath];
    })
  );

  return files.flat();
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const files = await walk(makeDir);

for (const file of files) {
  const name = basename(file);
  const extension = extname(name);

  if (name.startsWith('@')) {
    continue;
  }

  if (!allowedExtensions.has(extension) && !allowedNames.has(name)) {
    continue;
  }

  let targetName;

  if (allowedNames.has(name)) {
    targetName = `stepwise-${platform}-${arch}-${name}`;
  } else if (extension === '.exe') {
    targetName = `stepwise-${platform}-${arch}-setup.exe`;
  } else {
    targetName = `stepwise-${platform}-${arch}${extension}`;
  }

  await cp(file, join(outputDir, targetName), { force: true });
}
