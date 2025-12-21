/**
 * Server-side session type definitions for the Stepwise browser recording application
 *
 * This file contains TypeScript interfaces and types that extend the shared session types
 * with server-specific concerns like browser instances, WebSocket connections, and internal
 * state management.
 */

import type { Session, SessionStatus, SessionEvent as SharedSessionEvent } from '../../../shared/src/session';

/**
 * Browser instance configuration for CDP connections
 */
export interface BrowserInstanceConfig {
  /** Browser executable path */
  executablePath?: string;
  /** Chrome DevTools Protocol endpoint */
  cdpEndpoint?: string;
  /** User data directory for browser profile */
  userDataDir?: string;
  /** Headless mode flag */
  headless?: boolean;
  /** Browser arguments */
  args?: string[];
  /** Debug port to connect to */
  debugPort?: number;
  /** Remote debugging address */
  remoteAddress?: string;
  /** Browser window dimensions */
  windowSize?: {
    width: number;
    height: number;
  };
  /** Browser viewport settings */
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  };
}

/**
 * Represents a Chrome DevTools Protocol (CDP) browser instance
 */
export interface BrowserInstance {
  /** Unique identifier for the browser instance */
  id: string;
  /** Process ID of the browser */
  pid?: number;
  /** WebSocket endpoint for CDP connection */
  websocketEndpoint: string;
  /** HTTP endpoint for browser debugging */
  httpEndpoint: string;
  /** Browser configuration */
  config: BrowserInstanceConfig;
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Session ID this browser instance is attached to */
  sessionId?: string;
  /** Current page/target IDs */
  activeTargets: string[];
  /** Whether the browser is currently active */
  isActive: boolean;
  /** Browser version information */
  version?: string;
  /** User agent string */
  userAgent?: string;
}

/**
 * WebSocket connection metadata for a session
 */
export interface SessionConnection {
  /** Unique connection identifier */
  id: string;
  /** WebSocket connection object */
  socket: any; // WebSocket type would be imported from ws library
  /** Associated session ID */
  sessionId: string;
  /** Connection establishment timestamp */
  connectedAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Connection status */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Client IP address */
  clientIP?: string;
  /** User agent of the client */
  userAgent?: string;
  /** Authentication token */
  authToken?: string;
  /** Connection metadata */
  metadata: Record<string, unknown>;
  /** Heartbeat interval for connection monitoring */
  heartbeatInterval?: NodeJS.Timeout;
}

/**
 * Extended session interface with server-side properties
 */
export interface ServerSession extends Session {
  /** Associated browser instance ID */
  browserInstanceId?: string;
  /** List of active WebSocket connections */
  connections: SessionConnection[];
  /** Has at least one active connection */
  hasActiveConnections: boolean;
  /** In-memory lock status for concurrent operations */
  isLocked: boolean;
  /** Lock acquisition timestamp */
  lockedAt?: Date;
  /** Lock owner (process or request ID) */
  lockOwner?: string;
  /** Session persistence status */
  isPersisted: boolean;
  /** Last persistence timestamp */
  lastPersistedAt?: Date;
  /** Cleanup status */
  isMarkedForCleanup: boolean;
  /** Cleanup reason */
  cleanupReason?: string;
  /** Resource usage statistics */
  resourceUsage: {
    memoryUsage?: number; // in bytes
    cpuUsage?: number; // percentage
    diskUsage?: number; // in bytes
    networkBytesTransferred?: number;
  };
  /** Internal state not exposed to clients */
  internalState: {
    lastBackupAt?: Date;
    checkpointCount: number;
    errorCount: number;
    recoveryAttempts: number;
  };
}

/**
 * Active session with browser connection
 */
export interface ActiveSession extends ServerSession {
  /** Browser instance is guaranteed to exist */
  browserInstanceId: string;
  /** Has at least one active WebSocket connection */
  hasActiveConnections: boolean;
  /** Current recording state details */
  recordingState: {
    /** Current target/page being recorded */
    currentTarget?: string;
    /** Recording buffer size */
    bufferSize: number;
    /** Pending operations count */
    pendingOperations: number;
    /** Last recorded event timestamp */
    lastEventAt?: Date;
  };
}

/**
 * Session manager interface for session lifecycle management
 */
export interface SessionManager {
  /** Create a new session */
  createSession(options: any): Promise<ServerSession>;
  /** Get session by ID */
  getSession(sessionId: string): Promise<ServerSession | null>;
  /** Update session properties */
  updateSession(sessionId: string, updates: Partial<ServerSession>): Promise<ServerSession>;
  /** Delete a session */
  deleteSession(sessionId: string): Promise<boolean>;
  /** List all sessions with optional filtering */
  listSessions(filter?: {
    status?: SessionStatus;
    userId?: string;
    projectId?: string;
    includeArchived?: boolean;
  }): Promise<ServerSession[]>;
  /** Get active sessions count */
  getActiveSessionsCount(): Promise<number>;
  /** Cleanup inactive sessions */
  cleanupInactiveSessions(maxIdleTime?: number): Promise<number>;
  /** Backup session data */
  backupSession(sessionId: string): Promise<string>;
  /** Restore session from backup */
  restoreSession(backupId: string): Promise<ServerSession>;
}

/**
 * Server-side session events extending shared events
 */
export interface SessionEvent extends SharedSessionEvent {
  /** Event source */
  source: 'client' | 'server' | 'browser' | 'system';
  /** Event severity level */
  severity?: 'info' | 'warning' | 'error' | 'critical';
  /** Stack trace for error events */
  stackTrace?: string;
  /** Related connection ID if event is connection-specific */
  connectionId?: string;
  /** Browser instance ID if event is browser-related */
  browserInstanceId?: string;
  /** Performance metrics */
  metrics?: {
    duration?: number; // Event processing time in ms
    memoryUsage?: number; // Memory usage at event time
  };
}

/**
 * In-memory session store interface
 */
export interface SessionStore {
  /** Store a session */
  set(sessionId: string, session: ServerSession): Promise<void>;
  /** Retrieve a session */
  get(sessionId: string): Promise<ServerSession | null>;
  /** Check if session exists */
  has(sessionId: string): Promise<boolean>;
  /** Delete a session */
  delete(sessionId: string): Promise<boolean>;
  /** List all session IDs */
  keys(): Promise<string[]>;
  /** Clear all sessions */
  clear(): Promise<void>;
  /** Get session count */
  size(): Promise<number>;
  /** Set session with TTL (time to live) */
  setWithTTL(sessionId: string, session: ServerSession, ttlMs: number): Promise<void>;
  /** Get session TTL */
  getTTL(sessionId: string): Promise<number>;
  /** Update session TTL */
  updateTTL(sessionId: string, ttlMs: number): Promise<void>;
  /** Persist session to durable storage */
  persist(sessionId: string): Promise<void>;
  /** Restore session from durable storage */
  restore(sessionId: string): Promise<ServerSession | null>;
}

/**
 * Session configuration for the server
 */
export interface SessionServerConfig {
  /** Maximum concurrent sessions per user */
  maxSessionsPerUser: number;
  /** Maximum sessions total */
  maxTotalSessions: number;
  /** Default session timeout in milliseconds */
  sessionTimeoutMs: number;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;
  /** Auto-save interval in milliseconds */
  autoSaveIntervalMs: number;
  /** Maximum session size in bytes */
  maxSessionSizeBytes: number;
  /** Backup configuration */
  backup: {
    enabled: boolean;
    intervalMs: number;
    maxBackupsPerSession: number;
    backupLocation: string;
  };
  /** Browser instance configuration */
  browser: BrowserInstanceConfig;
}

/**
 * Type guard to check if a session is a ServerSession
 */
export function isServerSession(obj: unknown): obj is ServerSession {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const session = obj as ServerSession;
  return (
    typeof session.id === 'string' &&
    Array.isArray(session.connections) &&
    typeof session.isLocked === 'boolean' &&
    typeof session.isPersisted === 'boolean' &&
    typeof session.isMarkedForCleanup === 'boolean' &&
    typeof session.resourceUsage === 'object' &&
    typeof session.internalState === 'object'
  );
}

/**
 * Type guard to check if a session is active
 */
export function isActiveSession(session: ServerSession): session is ActiveSession {
  return (
    isServerSession(session) &&
    !!session.browserInstanceId &&
    session.hasActiveConnections &&
    session.connections.length > 0
  );
}