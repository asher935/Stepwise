function shouldIgnore(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  if (
    normalized === '' ||
    normalized === '.' ||
    normalized === '/' ||
    normalized === '/package.json' ||
    normalized.endsWith('/package.json') ||
    normalized === '/main.js' ||
    normalized.endsWith('/main.js') ||
    normalized === '/preload.js' ||
    normalized.endsWith('/preload.js') ||
    normalized === '/forge.config.cjs' ||
    normalized.endsWith('/forge.config.cjs') ||
    normalized === '/.bundle' ||
    normalized.endsWith('/.bundle') ||
    normalized.startsWith('/.bundle/') ||
    normalized.includes('/.bundle/')
  ) {
    return false;
  }

  return true;
}

module.exports = {
  packagerConfig: {
    asar: false,
    extraResource: ['.bundle'],
    ignore: shouldIgnore,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Stepwise',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
  ],
};
