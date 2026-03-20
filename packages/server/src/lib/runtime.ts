import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function getDefaultTempDir(): string {
  return join(tmpdir(), 'stepwise');
}
