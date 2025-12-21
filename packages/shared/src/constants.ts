/** Default configuration values */
export const DEFAULTS = {
  PORT: 3000,
  MAX_SESSIONS: 5,
  IDLE_TIMEOUT_MS: 1800000, // 30 minutes
  MAX_STEPS_PER_SESSION: 200,
  BROWSER_VIEWPORT_WIDTH: 1280,
  BROWSER_VIEWPORT_HEIGHT: 800,
  SCREENCAST_QUALITY: 80,
  SCREENCAST_MAX_FPS: 15,
  SESSION_TOKEN_BYTES: 32,
} as const;

/** API endpoints */
export const API = {
  SESSIONS: '/api/sessions',
  STEPS: '/api/steps',
  EXPORT: '/api/export',
  IMPORT: '/api/import',
  HEALTH: '/api/health',
} as const;

/** WebSocket close codes */
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  SESSION_ENDED: 4000,
  SESSION_NOT_FOUND: 4001,
  UNAUTHORIZED: 4002,
  RATE_LIMITED: 4003,
} as const;

/** Error codes */
export const ERROR_CODES = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_LIMIT_REACHED: 'SESSION_LIMIT_REACHED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  STEP_NOT_FOUND: 'STEP_NOT_FOUND',
  STEP_LIMIT_REACHED: 'STEP_LIMIT_REACHED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  IMPORT_FAILED: 'IMPORT_FAILED',
  IMPORT_INVALID: 'IMPORT_INVALID',
  IMPORT_DECRYPT_FAILED: 'IMPORT_DECRYPT_FAILED',
  BROWSER_LAUNCH_FAILED: 'BROWSER_LAUNCH_FAILED',
} as const;

/** MIME types for export */
export const MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ZIP: 'application/zip',
  JSON: 'application/json',
  MARKDOWN: 'text/markdown',
  HTML: 'text/html',
} as const;