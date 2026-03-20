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
    executableName: 'stepwise-desktop',
    ignore: shouldIgnore,
    icon: './icon.icns',
    name: 'stepwise-desktop',
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Stepwise',
        authors: 'Asher Leong',
        description: 'Desktop recorder and replay tool for browser workflows.',
        setupExe: 'Stepwise Setup.exe',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          name: 'stepwise-desktop',
          productName: 'Stepwise',
          bin: 'stepwise-desktop',
          maintainer: 'Asher Leong',
          homepage: 'https://github.com/asher935/stepwise',
          categories: ['Utility', 'Development'],
          icon: './icon.png',
        },
      },
    },
  ],
};
