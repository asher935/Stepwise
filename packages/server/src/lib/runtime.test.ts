import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { getDefaultTempDir } from './runtime.js';

describe('getDefaultTempDir', () => {
  it('uses an app-specific directory under the system temp directory', () => {
    expect(getDefaultTempDir()).toBe(join(tmpdir(), 'stepwise'));
  });
});
