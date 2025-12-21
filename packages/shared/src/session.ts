/**
 * Session state type definitions for the Stepwise browser recording application
 *
 * This file contains comprehensive TypeScript interfaces and types for managing
 * recording sessions, including their state, settings, statistics, and lifecycle.
 */

/**
 * Represents the current status of a recording session
 */
export enum SessionStatus {
  /** Session is idle and ready to start recording */
  IDLE = 'idle',
  /** Session is actively recording user interactions */
  RECORDING = 'recording',
  /** Session is temporarily paused */
  PAUSED = 'paused',
  /** Session has completed recording */
  COMPLETED = 'completed',
  /** Session encountered an error */
  ERROR = 'error'
}

/**
 * Interface defining browser viewport settings for a session
 */
export interface ViewportSettings {
  /** Width of the browser viewport in pixels */
  width: number;
  /** Height of the browser viewport in pixels */
  height: number;
  /** Device pixel ratio for high-DPI displays */
  deviceScaleFactor?: number;
  /** Whether to emulate mobile viewport */
  isMobile?: boolean;
  /** Device orientation for mobile emulation */
  isLandscape?: boolean;
  /** Whether to touch events */
  hasTouch?: boolean;
}

/**
 * Interface defining quality settings for session recordings
 */
export interface QualitySettings {
  /** Screenshot capture quality (0.1 to 1.0) */
  screenshotQuality: number;
  /** Maximum screenshot dimensions */
  maxScreenshotSize?: {
    width: number;
    height: number;
  };
  /** Video recording quality level */
  videoQuality?: 'low' | 'medium' | 'high' | 'ultra';
  /** Frame rate for video recording (frames per second) */
  frameRate?: number;
  /** Whether to compress screenshots */
  compressScreenshots: boolean;
  /** Compression format for images */
  compressionFormat?: 'jpeg' | 'png' | 'webp';
}

/**
 * Interface defining recording settings for a session
 */
export interface RecordingSettings {
  /** Browser viewport configuration */
  viewport: ViewportSettings;
  /** Quality and performance settings */
  quality: QualitySettings;
  /** Whether to record console logs */
  recordConsoleLogs: boolean;
  /** Whether to record network requests */
  recordNetworkRequests: boolean;
  /** Whether to record DOM changes */
  recordDomChanges: boolean;
  /** Whether to record scroll positions */
  recordScrollPositions: boolean;
  /** Whether to record user inputs (form fields, etc.) */
  recordUserInputs: boolean;
  /** Whether to mask sensitive data */
  maskSensitiveData: boolean;
  /** List of selectors to mask */
  maskedSelectors?: string[];
  /** Maximum session duration in minutes */
  maxDuration?: number;
  /** Whether to auto-save during recording */
  autoSave: boolean;
  /** Auto-save interval in seconds */
  autoSaveInterval?: number;
}

/**
 * Interface defining session statistics and metrics
 */
export interface SessionStats {
  /** Total number of recorded steps/actions */
  stepCount: number;
  /** Total duration of the session in milliseconds */
  duration: number;
  /** Total number of screenshots captured */
  screenshotCount: number;
  /** Total number of console events recorded */
  consoleEventCount: number;
  /** Total number of network requests recorded */
  networkRequestCount: number;
  /** Total number of DOM changes recorded */
  domChangeCount: number;
  /** Total number of user inputs recorded */
  userInputCount: number;
  /** Session start timestamp */
  startTime?: Date;
  /** Session end timestamp */
  endTime?: Date;
  /** Average time between actions in milliseconds */
  averageActionInterval?: number;
  /** Total size of all captured data in bytes */
  totalDataSize?: number;
}

/**
 * Metadata for session tags
 */
export interface SessionTag {
  /** Unique tag identifier */
  id: string;
  /** Tag name/label */
  name: string;
  /** Tag color for UI display */
  color?: string;
  /** Tag description */
  description?: string;
}

/**
 * Interface defining options for creating a new session
 */
export interface SessionCreateOptions {
  /** Session title (optional, will be auto-generated if not provided) */
  title?: string;
  /** Session description */
  description?: string;
  /** Recording settings */
  settings?: Partial<RecordingSettings>;
  /** Initial tags to associate with the session */
  tags?: SessionTag[];
  /** Whether to start recording immediately after creation */
  startImmediately?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Project or category identifier */
  projectId?: string;
  /** User ID who owns the session */
  userId?: string;
}

/**
 * Interface defining update options for an existing session
 */
export interface SessionUpdateOptions {
  /** Updated session title */
  title?: string;
  /** Updated session description */
  description?: string;
  /** Updated recording settings */
  settings?: Partial<RecordingSettings>;
  /** Session status to update */
  status?: SessionStatus;
  /** Tags to add or update */
  tags?: SessionTag[];
  /** Updated metadata */
  metadata?: Record<string, unknown>;
  /** Note about the update */
  updateNote?: string;
}

/**
 * Main interface representing a recording session
 */
export interface Session {
  /** Unique session identifier */
  id: string;
  /** Session title */
  title: string;
  /** Detailed description of the session */
  description: string;
  /** Current status of the session */
  status: SessionStatus;
  /** Recording settings for this session */
  settings: RecordingSettings;
  /** Session statistics and metrics */
  stats: SessionStats;
  /** Associated tags */
  tags: SessionTag[];
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Custom metadata */
  metadata: Record<string, unknown>;
  /** Project or category identifier */
  projectId?: string;
  /** User ID who owns the session */
  userId?: string;
  /** Whether the session is archived */
  isArchived: boolean;
  /** Session version for migration purposes */
  version: string;
  /** Last error message (if any) */
  lastError?: string;
}

/**
 * Type guard to check if a value is a valid SessionStatus
 */
export function isValidSessionStatus(value: unknown): value is SessionStatus {
  return Object.values(SessionStatus).includes(value as SessionStatus);
}

/**
 * Type guard to check if an object implements Session interface
 */
export function isSession(obj: unknown): obj is Session {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const session = obj as Session;
  return (
    typeof session.id === 'string' &&
    typeof session.title === 'string' &&
    typeof session.description === 'string' &&
    isValidSessionStatus(session.status) &&
    typeof session.settings === 'object' &&
    typeof session.stats === 'object' &&
    Array.isArray(session.tags) &&
    session.createdAt instanceof Date &&
    session.updatedAt instanceof Date &&
    typeof session.metadata === 'object' &&
    typeof session.isArchived === 'boolean' &&
    typeof session.version === 'string'
  );
}

/**
 * Type definition for session events
 */
export interface SessionEvent {
  /** Event identifier */
  id: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event type */
  type: 'created' | 'updated' | 'started' | 'paused' | 'resumed' | 'completed' | 'error';
  /** Event data */
  data?: Record<string, unknown>;
  /** Associated session ID */
  sessionId: string;
}

/**
 * Type definition for session search/filter criteria
 */
export interface SessionSearchCriteria {
  /** Text search in title and description */
  query?: string;
  /** Filter by status */
  status?: SessionStatus[];
  /** Filter by project ID */
  projectId?: string;
  /** Filter by user ID */
  userId?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by creation date range */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** Filter by duration range */
  durationRange?: {
    min: number; // in milliseconds
    max: number; // in milliseconds
  };
  /** Whether to include archived sessions */
  includeArchived?: boolean;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'duration' | 'stepCount';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
}

/**
 * Type definition for session export options
 */
export interface SessionExportOptions {
  /** Export format */
  format: 'json' | 'markdown' | 'html' | 'pdf';
  /** Whether to include screenshots */
  includeScreenshots: boolean;
  /** Whether to include console logs */
  includeConsoleLogs: boolean;
  /** Whether to include network requests */
  includeNetworkRequests: boolean;
  /** Whether to include metadata */
  includeMetadata: boolean;
  /** Custom export template */
  template?: string;
  /** Export destination */
  destination?: string;
}