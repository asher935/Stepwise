/**
 * Shared constants for the Stepwise application
 * Contains all application-wide constants organized by category
 */

// ================================
// Session Limits
// ================================

/** Maximum number of concurrent sessions allowed */
export const MAX_SESSIONS = 10 as const;

/** Maximum number of steps allowed per session */
export const MAX_STEPS_PER_SESSION = 1000 as const;

/** Idle timeout in milliseconds (30 minutes) */
export const IDLE_TIMEOUT = 30 * 60 * 1000;

/** Session cleanup interval in milliseconds (5 minutes) */
export const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000;

/** Maximum session duration in milliseconds (24 hours) */
export const MAX_SESSION_DURATION = 24 * 60 * 60 * 1000;

// ================================
// Browser Settings
// ================================

/** Default browser viewport dimensions */
export const DEFAULT_VIEWPORT = {
  width: 1920,
  height: 1080,
} as const;

/** Minimum viewport width */
export const MIN_VIEWPORT_WIDTH = 320 as const;

/** Minimum viewport height */
export const MIN_VIEWPORT_HEIGHT = 240 as const;

/** Maximum viewport width */
export const MAX_VIEWPORT_WIDTH = 3840 as const;

/** Maximum viewport height */
export const MAX_VIEWPORT_HEIGHT = 2160 as const;

/** Screencast quality settings */
export const SCREENCAST_QUALITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ULTRA: 'ultra',
} as const;

/** Default screencast quality */
export const DEFAULT_SCREENCAST_QUALITY = SCREENCAST_QUALITY.MEDIUM;

/** Maximum frames per second for screencasting */
export const MAX_FPS = 60 as const;

/** Default frames per second for screencasting */
export const DEFAULT_FPS = 30 as const;

/** Minimum frames per second for screencasting */
export const MIN_FPS = 1 as const;

/** Browser launch options */
export const BROWSER_LAUNCH_OPTIONS = {
  headless: false,
  devtools: true,
  slowMo: 0,
} as const;

// ================================
// Export Formats
// ================================

/** Supported export formats */
export const EXPORT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx',
  MARKDOWN: 'markdown',
  HTML: 'html',
  JSON: 'json',
  PNG: 'png',
  JPEG: 'jpeg',
} as const;

/** Export format display names */
export const EXPORT_FORMAT_NAMES = {
  [EXPORT_FORMATS.PDF]: 'PDF Document',
  [EXPORT_FORMATS.DOCX]: 'Microsoft Word',
  [EXPORT_FORMATS.MARKDOWN]: 'Markdown',
  [EXPORT_FORMATS.HTML]: 'HTML Page',
  [EXPORT_FORMATS.JSON]: 'JSON Data',
  [EXPORT_FORMATS.PNG]: 'PNG Image',
  [EXPORT_FORMATS.JPEG]: 'JPEG Image',
} as const;

/** Export format MIME types */
export const EXPORT_FORMAT_MIME_TYPES = {
  [EXPORT_FORMATS.PDF]: 'application/pdf',
  [EXPORT_FORMATS.DOCX]: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  [EXPORT_FORMATS.MARKDOWN]: 'text/markdown',
  [EXPORT_FORMATS.HTML]: 'text/html',
  [EXPORT_FORMATS.JSON]: 'application/json',
  [EXPORT_FORMATS.PNG]: 'image/png',
  [EXPORT_FORMATS.JPEG]: 'image/jpeg',
} as const;

// ================================
// WebSocket Message Types
// ================================

/** WebSocket message types */
export const WS_MESSAGE_TYPES = {
  // Connection management
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',

  // Session management
  SESSION_CREATE: 'session_create',
  SESSION_JOIN: 'session_join',
  SESSION_LEAVE: 'session_leave',
  SESSION_UPDATE: 'session_update',
  SESSION_DELETE: 'session_delete',

  // Step management
  STEP_CREATE: 'step_create',
  STEP_UPDATE: 'step_update',
  STEP_DELETE: 'step_delete',
  STEP_REORDER: 'step_reorder',

  // Browser actions
  BROWSER_NAVIGATE: 'browser_navigate',
  BROWSER_CLICK: 'browser_click',
  BROWSER_TYPE: 'browser_type',
  BROWSER_SCREENSHOT: 'browser_screenshot',
  BROWSER_CONSOLE: 'browser_console',

  // Real-time updates
  SCREENCAST_START: 'screencast_start',
  SCREENCAST_STOP: 'screencast_stop',
  SCREENCAST_FRAME: 'screencast_frame',

  // Collaboration
  CURSOR_MOVE: 'cursor_move',
  USER_JOIN: 'user_join',
  USER_LEAVE: 'user_leave',
} as const;

/** WebSocket message categories */
export const WS_MESSAGE_CATEGORIES = {
  CONNECTION: ['connect', 'disconnect', 'heartbeat', 'error'] as const,
  SESSION: ['session_create', 'session_join', 'session_leave', 'session_update', 'session_delete'] as const,
  STEP: ['step_create', 'step_update', 'step_delete', 'step_reorder'] as const,
  BROWSER: ['browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot', 'browser_console'] as const,
  SCREENCAST: ['screencast_start', 'screencast_stop', 'screencast_frame'] as const,
  COLLABORATION: ['cursor_move', 'user_join', 'user_leave'] as const,
} as const;

// ================================
// Step Types
// ================================

/** Available step types */
export const STEP_TYPES = {
  NAVIGATION: 'navigation',
  CLICK: 'click',
  TYPE: 'type',
  WAIT: 'wait',
  SCREENSHOT: 'screenshot',
  EXTRACT: 'extract',
  VALIDATE: 'validate',
  CONDITION: 'condition',
  LOOP: 'loop',
  CUSTOM: 'custom',
} as const;

/** Step type display names */
export const STEP_TYPE_NAMES = {
  [STEP_TYPES.NAVIGATION]: 'Navigate to URL',
  [STEP_TYPES.CLICK]: 'Click Element',
  [STEP_TYPES.TYPE]: 'Type Text',
  [STEP_TYPES.WAIT]: 'Wait',
  [STEP_TYPES.SCREENSHOT]: 'Take Screenshot',
  [STEP_TYPES.EXTRACT]: 'Extract Data',
  [STEP_TYPES.VALIDATE]: 'Validate',
  [STEP_TYPES.CONDITION]: 'Conditional',
  [STEP_TYPES.LOOP]: 'Loop',
  [STEP_TYPES.CUSTOM]: 'Custom Action',
} as const;

/** Step type icons */
export const STEP_TYPE_ICONS = {
  [STEP_TYPES.NAVIGATION]: '🌐',
  [STEP_TYPES.CLICK]: '👆',
  [STEP_TYPES.TYPE]: '⌨️',
  [STEP_TYPES.WAIT]: '⏳',
  [STEP_TYPES.SCREENSHOT]: '📸',
  [STEP_TYPES.EXTRACT]: '📊',
  [STEP_TYPES.VALIDATE]: '✅',
  [STEP_TYPES.CONDITION]: '🔀',
  [STEP_TYPES.LOOP]: '🔁',
  [STEP_TYPES.CUSTOM]: '⚙️',
} as const;

/** Step categories */
export const STEP_CATEGORIES = {
  ACTIONS: ['navigation', 'click', 'type', 'custom'] as const,
  CONTROL_FLOW: ['wait', 'condition', 'loop'] as const,
  DATA: ['screenshot', 'extract', 'validate'] as const,
} as const;

// ================================
// UI Constants
// ================================

/** Color palette */
export const COLORS = {
  // Primary colors
  PRIMARY: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    900: '#1e3a8a',
  },

  // Secondary colors
  SECONDARY: {
    50: '#f8fafc',
    100: '#f1f5f9',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    900: '#0f172a',
  },

  // Success colors
  SUCCESS: {
    50: '#f0fdf4',
    100: '#dcfce7',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },

  // Warning colors
  WARNING: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#eab308',
    600: '#ca8a04',
    700: '#a16207',
  },

  // Error colors
  ERROR: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
} as const;

/** Size constants */
export const SIZES = {
  // Spacing
  SPACING: {
    XS: '0.25rem',
    SM: '0.5rem',
    MD: '1rem',
    LG: '1.5rem',
    XL: '2rem',
    XXL: '3rem',
  },

  // Border radius
  BORDER_RADIUS: {
    NONE: '0',
    SM: '0.125rem',
    MD: '0.375rem',
    LG: '0.5rem',
    XL: '0.75rem',
    FULL: '9999px',
  },

  // Font sizes
  FONT_SIZES: {
    XS: '0.75rem',
    SM: '0.875rem',
    MD: '1rem',
    LG: '1.125rem',
    XL: '1.25rem',
    '2XL': '1.5rem',
    '3XL': '1.875rem',
    '4XL': '2.25rem',
  },

  // Breakpoints
  BREAKPOINTS: {
    SM: '640px',
    MD: '768px',
    LG: '1024px',
    XL: '1280px',
    '2XL': '1536px',
  },
} as const;

/** Animation durations */
export const ANIMATIONS = {
  DURATIONS: {
    FAST: '150ms',
    NORMAL: '300ms',
    SLOW: '500ms',
  },

  EASING: {
    EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
    EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
    EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

/** Z-index levels */
export const Z_INDEX = {
  BASE: 0,
  DROPDOWN: 1000,
  STICKY: 1020,
  FIXED: 1030,
  MODAL_BACKDROP: 1040,
  MODAL: 1050,
  POPOVER: 1060,
  TOOLTIP: 1070,
  TOAST: 1080,
} as const;

// ================================
// File Extensions
// ================================

/** Supported file extensions by category */
export const FILE_EXTENSIONS = {
  // Images
  IMAGES: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'] as const,

  // Documents
  DOCUMENTS: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'] as const,

  // Spreadsheets
  SPREADSHEETS: ['.xls', '.xlsx', '.csv', '.ods'] as const,

  // Presentations
  PRESENTATIONS: ['.ppt', '.pptx', '.odp'] as const,

  // Archives
  ARCHIVES: ['.zip', '.rar', '.7z', '.tar', '.gz'] as const,

  // Code
  CODE: ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml', '.yml'] as const,

  // Video
  VIDEO: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'] as const,

  // Audio
  AUDIO: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma'] as const,
} as const;

/** Maximum file sizes (in bytes) */
export const MAX_FILE_SIZES = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  DOCUMENT: 50 * 1024 * 1024, // 50MB
  VIDEO: 500 * 1024 * 1024, // 500MB
  AUDIO: 100 * 1024 * 1024, // 100MB
  ARCHIVE: 100 * 1024 * 1024, // 100MB
  CODE: 1 * 1024 * 1024, // 1MB
} as const;

// ================================
// API Constants
// ================================

/** HTTP status codes */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/** API rate limits */
export const RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 60,
  REQUESTS_PER_HOUR: 1000,
  REQUESTS_PER_DAY: 10000,
} as const;

/** API timeout durations (in milliseconds) */
export const API_TIMEOUTS = {
  DEFAULT: 30000,
  LONG_RUNNING: 300000,
  SHORT: 5000,
} as const;

// ================================
// Validation Constants
// ================================

/** Field validation limits */
export const VALIDATION = {
  // Text input limits
  MAX_TITLE_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_URL_LENGTH: 2048,
  MAX_TEXT_INPUT_LENGTH: 10000,

  // Name patterns
  SESSION_NAME_PATTERN: /^[a-zA-Z0-9\s_-]{1,100}$/,
  STEP_NAME_PATTERN: /^[a-zA-Z0-9\s_-]{1,100}$/,

  // Email pattern
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // URL pattern
  URL_PATTERN: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
} as const;

// ================================
// Date/Time Constants
// ================================

/** Date/time formats */
export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DATE_ONLY: 'YYYY-MM-DD',
  TIME_ONLY: 'HH:mm:ss',
  DISPLAY: 'MMM DD, YYYY',
  DISPLAY_WITH_TIME: 'MMM DD, YYYY HH:mm',
} as const;

/** Time units in milliseconds */
export const TIME_UNITS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const;

// ================================
// Environment Constants
// ================================

/** Environment names */
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

/** Feature flags */
export const FEATURES = {
  ENABLE_COLLABORATION: true,
  ENABLE_EXPORTS: true,
  ENABLE_SCREENCAST: true,
  ENABLE_ANALYTICS: false,
  ENABLE_DEBUG_MODE: false,
} as const;