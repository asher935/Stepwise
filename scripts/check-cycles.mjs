const checks = [
  {
    name: 'client',
    tsConfig: 'packages/client/tsconfig.json',
    entries: ['packages/client/src'],
  },
  {
    name: 'server/shared/desktop',
    tsConfig: 'tsconfig.json',
    entries: ['packages/server/src', 'packages/shared/src', 'packages/desktop/src'],
  },
];

const commonArgs = [
  'madge',
  '--circular',
  '--extensions',
  'ts,tsx',
  '--exclude',
  '(^|/).+\\.test\\.(ts|tsx)$',
];

for (const check of checks) {
  console.log(`[check:cycles] Auditing ${check.name}`);

  const process = Bun.spawn([
    'bunx',
    ...commonArgs,
    '--ts-config',
    check.tsConfig,
    ...check.entries,
  ], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await process.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
