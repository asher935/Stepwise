import { DEFAULTS } from '@stepwise/shared';

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  PORT: getEnvNumber('PORT', DEFAULTS.PORT),
  MAX_SESSIONS: getEnvNumber('MAX_SESSIONS', DEFAULTS.MAX_SESSIONS),
  IDLE_TIMEOUT_MS: getEnvNumber('IDLE_TIMEOUT_MS', DEFAULTS.IDLE_TIMEOUT_MS),
  MAX_STEPS_PER_SESSION: getEnvNumber('MAX_STEPS_PER_SESSION', DEFAULTS.MAX_STEPS_PER_SESSION),
  BROWSER_VIEWPORT_WIDTH: getEnvNumber('BROWSER_VIEWPORT_WIDTH', DEFAULTS.BROWSER_VIEWPORT_WIDTH),
  BROWSER_VIEWPORT_HEIGHT: getEnvNumber('BROWSER_VIEWPORT_HEIGHT', DEFAULTS.BROWSER_VIEWPORT_HEIGHT),
  SCREENCAST_QUALITY: getEnvNumber('SCREENCAST_QUALITY', DEFAULTS.SCREENCAST_QUALITY),
  SCREENCAST_MAX_FPS: getEnvNumber('SCREENCAST_MAX_FPS', DEFAULTS.SCREENCAST_MAX_FPS),
  SESSION_TOKEN_BYTES: getEnvNumber('SESSION_TOKEN_BYTES', DEFAULTS.SESSION_TOKEN_BYTES),
  NODE_ENV: getEnvString('NODE_ENV', 'development'),
  TEMP_DIR: getEnvString('TEMP_DIR', '/tmp/stepwise'),
} as const;

export type Env = typeof env;
