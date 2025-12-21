/**
 * SessionManager - Comprehensive session management service for Stepwise
 *
 * This service handles the complete lifecycle of recording sessions including:
 * - Session creation, retrieval, update, and deletion
 * - Session state management and transitions
 * - Browser instance and WebSocket connection tracking
 * - Idle timeout cleanup and resource management
 * - Session event emission and monitoring
 * - Statistics and metrics collection
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  SessionCreateOptions,
  SessionUpdateOptions,
  SessionEvent,
  SessionSearchCriteria,
  RecordingSettings,
  SessionStats,
  SessionTag,
  ViewportSettings,
  QualitySettings
} from '@stepwise/shared';
import { SessionStatus } from '@stepwise/shared';
import { serverConfig, securityConfig } from '../lib/env.js';
import { generateSessionToken } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';

/**
 * Configuration interface for SessionManager
 */
export interface SessionManagerConfig {
  /** Maximum number of concurrent sessions */
  maxSessions: number;
  /** Idle timeout in milliseconds */
  idleTimeoutMs: number;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;
  /** Whether to enable session persistence */
  enablePersistence: boolean;
  /** Session token expiration in milliseconds */
  sessionTokenExpirationMs: number;
}

/**
 * Browser instance information tracking
 */
export interface BrowserInstance {
  /** Browser instance ID */
  id: string;
  /** Browser type (chromium, firefox, webkit) */
  type: 'chromium' | 'firefox' | 'webkit';
  /** Browser version */
  version: string;
  /** User agent string */
  userAgent: string;
  /** Browser launch timestamp */
  launchedAt: Date;
  /** WebSocket connection IDs */
  wsConnectionIds: Set<string>;
  /** Current URL if known */
  currentUrl?: string;
  /** Additional browser metadata */
  metadata: Record<string, unknown>;
}

/**
 * Extended session interface with additional management fields
 */
export interface ManagedSession extends Session {
  /** Authentication token for the session */
  token: string;
  /** Token expiration timestamp */
  tokenExpiresAt: Date;
  /** Last accessed timestamp */
  lastAccessed: Date;
  /** Browser instances for this session */
  browserInstances: Map<string, BrowserInstance>;
  /** WebSocket connections for this session */
  wsConnections: Set<string>;
  /** Marked for cleanup flag */
  markedForCleanup: boolean;
  /** Recording started timestamp (when recording first began) */
  recordingStartedAt?: Date;
  /** Recording paused timestamp (when recording was last paused) */
  recordingPausedAt?: Date;
  /** Recording completed timestamp */
  recordingCompletedAt?: Date;
  /** Recording duration in milliseconds */
  duration: number;
  /** Array of recording steps */
  steps: any[];
  /** Creation metadata */
  metadata: {
    clientIp?: string;
    userAgent?: string;
    sessionId?: string;
  };
}

/**
 * Session search result with pagination
 */
export interface SessionSearchResult {
  sessions: ManagedSession[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Session token information
 */
export interface SessionToken {
  token: string;
  expiresAt: Date;
}

/**
 * Session statistics
 */
export interface SessionManagerStats {
  /** Total number of sessions */
  totalSessions: number;
  /** Active sessions count */
  activeSessions: number;
  /** Sessions by status */
  sessionsByStatus: Record<SessionStatus, number>;
  /** Total browser instances */
  totalBrowserInstances: number;
  /** Total WebSocket connections */
  totalWebSocketConnections: number;
  /** Average session duration */
  averageSessionDuration: number;
  /** Memory usage in MB */
  memoryUsage: number;
  /** Uptime in seconds */
  uptime: number;
}

/**
 * SessionManager class
 * Manages all recording sessions with full lifecycle support
 */
export class SessionManager extends EventEmitter {
  /** Configuration */
  private config: SessionManagerConfig;
  /** Active sessions map */
  private sessions = new Map<string, ManagedSession>();
  /** Session token to session ID mapping */
  private sessionTokens = new Map<string, string>();
  /** Cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;
  /** Statistics */
  private stats: SessionManagerStats;
  /** Start time */
  private startTime: Date;

  constructor(config?: Partial<SessionManagerConfig>) {
    super();

    // Initialize configuration with defaults
    this.config = {
      maxSessions: 10,
      idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
      enablePersistence: true,
      sessionTokenExpirationMs: 24 * 60 * 60 * 1000, // 24 hours
      ...config
    };

    // Initialize statistics
    this.startTime = new Date();
    this.stats = {
      totalSessions: 0,
      activeSessions: 0,
      sessionsByStatus: {
        ready: 0,
        recording: 0,
        paused: 0,
        completed: 0,
        error: 0,
        closed: 0
      },
      totalBrowserInstances: 0,
      totalWebSocketConnections: 0,
      averageSessionDuration: 0,
      memoryUsage: 0,
      uptime: 0
    };

    // Start cleanup interval
    this.startCleanupInterval();

    // Update statistics periodically
    setInterval(() => {
      this.updateStatistics();
    }, 10000); // Update every 10 seconds
  }

  /**
   * Creates a new recording session
   * @param options - Session creation options
   * @param clientIp - Client IP address for tracking
   * @param userAgent - Client user agent for tracking
   * @returns Promise resolving to the created session
   */
  public async createSession(
    options: SessionCreateOptions,
    clientIp?: string,
    userAgent?: string
  ): Promise<ManagedSession> {
    // Check session limit
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(`Maximum session limit (${this.config.maxSessions}) reached`);
    }

    // Generate session ID if not provided
    const sessionId = options.id || uuidv4();

    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session with ID ${sessionId} already exists`);
    }

    // Generate session token
    const sessionToken = await generateSessionToken(this.config.sessionTokenExpirationMs);

    // Create session object
    const now = new Date();
    const session: ManagedSession = {
      id: sessionId,
      title: options.title || 'Untitled Recording',
      description: options.description || '',
      status: 'ready',
      tags: options.tags || [],
      userId: options.userId || 'anonymous',
      createdAt: now,
      updatedAt: now,
      recordingStartedAt: null,
      recordingPausedAt: null,
      recordingCompletedAt: null,
      duration: 0,
      steps: [],
      settings: {
        viewport: options.viewport || {
          width: 1280,
          height: 800,
          deviceScaleFactor: 1,
          isMobile: false,
          isLandscape: false
        },
        quality: options.quality || {
          screenshotQuality: 80,
          maxScreenshotSize: {
            width: 1920,
            height: 1080
          },
          videoQuality: 'medium'
        },
        recording: options.recording || {
          captureNetwork: true,
          captureConsole: true,
          captureHar: false,
          autoScroll: false
        }
      },
      token: sessionToken.token,
      tokenExpiresAt: new Date(sessionToken.expiresAt),
      lastAccessed: now,
      browserInstances: new Map(),
      wsConnections: new Set(),
      markedForCleanup: false,
      metadata: {
        clientIp,
        userAgent
      }
    };

    // Store session
    this.sessions.set(sessionId, session);
    this.sessionTokens.set(sessionToken.token, sessionId);

    // Update statistics
    this.stats.totalSessions++;
    this.stats.activeSessions++;
    this.stats.sessionsByStatus.ready++;

    // Emit events
    this.emit('session:created', session);
    this.emitEvent({
      id: uuidv4(),
      timestamp: now,
      type: 'created',
      sessionId,
      data: { options, clientIp, userAgent }
    });

    return session;
  }

  /**
   * Retrieves a session by ID
   * @param sessionId - Session identifier
   * @param updateAccess - Whether to update last accessed timestamp
   * @returns Promise resolving to the session or null if not found
   */
  public async getSession(sessionId: string, updateAccess: boolean = true): Promise<ManagedSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return null;
    }

    if (updateAccess) {
      session.lastAccessed = new Date();
    }

    return session;
  }

  /**
   * Retrieves a session by token
   * @param token - Session token
   * @param updateAccess - Whether to update last accessed timestamp
   * @returns Promise resolving to the session or null if not found
   */
  public async getSessionByToken(token: string, updateAccess: boolean = true): Promise<ManagedSession | null> {
    const sessionId = this.sessionTokens.get(token);
    if (!sessionId) {
      return null;
    }

    const session = await this.getSession(sessionId, updateAccess);
    if (!session || session.token !== token) {
      return null;
    }

    // Check token expiration
    if (new Date() > session.tokenExpiresAt) {
      this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Updates a session with the provided options
   * @param sessionId - Session identifier
   * @param options - Update options
   * @returns Promise resolving to the updated session or null if not found
   */
  public async updateSession(
    sessionId: string,
    options: SessionUpdateOptions
  ): Promise<ManagedSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return null;
    }

    const oldStatus = session.status;
    const now = new Date();

    // Apply updates
    if (options.title !== undefined) session.title = options.title;
    if (options.description !== undefined) session.description = options.description;
    if (options.settings) {
      session.settings = this.mergeSettings(session.settings, options.settings);
    }
    if (options.tags !== undefined) session.tags = options.tags;
    if (options.metadata !== undefined) session.metadata = { ...session.metadata, ...options.metadata };

    // Update status and trigger change event if different
    if (options.status !== undefined && options.status !== oldStatus) {
      await this.updateSessionStatus(sessionId, options.status);
    }

    session.updatedAt = now;
    session.lastAccessed = now;

    // Update statistics
    this.updateStatistics();

    // Emit events
    this.emit('session:updated', session, options);
    this.emitEvent({
      id: uuidv4(),
      timestamp: now,
      type: 'updated',
      sessionId,
      data: { options, oldStatus }
    });

    return session;
  }

  /**
   * Updates a session's status
   * @param sessionId - Session identifier
   * @param status - New session status
   * @returns Promise resolving to true if updated successfully
   */
  public async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    const oldStatus = session.status;
    if (oldStatus === status) {
      return true; // No change needed
    }

    const now = new Date();
    session.status = status;
    session.updatedAt = now;

    // Update timestamps based on status
    switch (status) {
      case 'recording':
        if (!session.recordingStartedAt) {
          session.recordingStartedAt = now;
        }
        session.recordingPausedAt = null;
        break;

      case 'paused':
        session.recordingPausedAt = now;
        break;

      case 'completed':
      case 'closed':
        if (session.recordingStartedAt && !session.recordingCompletedAt) {
          session.recordingCompletedAt = now;
          session.duration = now.getTime() - session.recordingStartedAt.getTime();
        }
        break;

      case 'error':
        // Reset timestamps on error
        session.recordingStartedAt = null;
        session.recordingPausedAt = null;
        session.recordingCompletedAt = null;
        break;
    }

    // Update statistics
    this.stats.sessionsByStatus[oldStatus]--;
    this.stats.sessionsByStatus[status]++;

    // Emit events
    this.emit('session:statusChanged', session, oldStatus, status);
    this.emitEvent({
      id: uuidv4(),
      timestamp: now,
      type: 'status_changed',
      sessionId,
      data: { oldStatus, newStatus: status }
    });

    return true;
  }

  /**
   * Deletes a session
   * @param sessionId - Session identifier
   * @param reason - Reason for deletion
   * @returns Promise resolving to true if deleted successfully
   */
  public async deleteSession(sessionId: string, reason?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    // Mark for cleanup
    session.markedForCleanup = true;

    // Clean up resources
    await this.cleanupSession(session, reason || 'deleted');

    // Remove from maps
    this.sessions.delete(sessionId);
    this.sessionTokens.delete(session.token);

    // Update statistics
    this.stats.activeSessions--;
    this.stats.sessionsByStatus[session.status]--;

    // Emit events
    this.emit('session:deleted', session, reason);
    this.emitEvent({
      id: uuidv4(),
      timestamp: new Date(),
      type: 'deleted',
      sessionId,
      data: { reason }
    });

    return true;
  }

  /**
   * Searches for sessions based on criteria
   * @param criteria - Search criteria
   * @param page - Page number (1-based)
   * @param pageSize - Number of results per page
   * @returns Promise resolving to search results
   */
  public async searchSessions(
    criteria: SessionSearchCriteria,
    page: number = 1,
    pageSize: number = 20
  ): Promise<SessionSearchResult> {
    let sessions = Array.from(this.sessions.values());

    // Apply filters
    if (criteria.userId) {
      sessions = sessions.filter(s => s.userId === criteria.userId);
    }

    if (criteria.status) {
      sessions = sessions.filter(s => s.status === criteria.status);
    }

    if (criteria.tags && criteria.tags.length > 0) {
      sessions = sessions.filter(s =>
        criteria.tags!.some(tag => s.tags.includes(tag))
      );
    }

    if (criteria.dateFrom) {
      const from = new Date(criteria.dateFrom);
      sessions = sessions.filter(s => s.createdAt >= from);
    }

    if (criteria.dateTo) {
      const to = new Date(criteria.dateTo);
      sessions = sessions.filter(s => s.createdAt <= to);
    }

    if (criteria.search) {
      const searchTerm = criteria.search.toLowerCase();
      sessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchTerm) ||
        s.description.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by creation date (newest first)
    sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedSessions = sessions.slice(startIndex, endIndex);

    return {
      sessions: paginatedSessions,
      totalCount: sessions.length,
      page,
      pageSize
    };
  }

  /**
   * Gets all active sessions
   * @returns Array of active sessions
   */
  public getActiveSessions(): ManagedSession[] {
    return Array.from(this.sessions.values()).filter(
      s => !s.markedForCleanup && s.status !== 'closed'
    );
  }

  /**
   * Gets sessions by user ID
   * @param userId - User identifier
   * @returns Array of user sessions
   */
  public getUserSessions(userId: string): ManagedSession[] {
    return Array.from(this.sessions.values()).filter(
      s => !s.markedForCleanup && s.userId === userId
    );
  }

  /**
   * Adds a browser instance to a session
   * @param sessionId - Session identifier
   * @param browserInstance - Browser instance information
   * @returns Promise resolving to true if added successfully
   */
  public async addBrowserInstance(
    sessionId: string,
    browserInstance: BrowserInstance
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    session.browserInstances.set(browserInstance.id, browserInstance);
    session.lastAccessed = new Date();

    // Update statistics
    this.stats.totalBrowserInstances++;

    this.emit('browser:added', session, browserInstance);

    return true;
  }

  /**
   * Removes a browser instance from a session
   * @param sessionId - Session identifier
   * @param browserId - Browser instance ID
   * @returns Promise resolving to true if removed successfully
   */
  public async removeBrowserInstance(
    sessionId: string,
    browserId: string
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    const browserInstance = session.browserInstances.get(browserId);
    if (!browserInstance) {
      return false;
    }

    session.browserInstances.delete(browserId);
    session.lastAccessed = new Date();

    // Update statistics
    this.stats.totalBrowserInstances = Math.max(0, this.stats.totalBrowserInstances - 1);

    this.emit('browser:removed', session, browserInstance);

    return true;
  }

  /**
   * Adds a WebSocket connection to a session
   * @param sessionId - Session identifier
   * @param connectionId - WebSocket connection ID
   * @param role - Connection role (optional)
   * @returns Promise resolving to true if added successfully
   */
  public async addConnectionToSession(
    sessionId: string,
    connectionId: string,
    role: string = 'observer'
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    session.wsConnections.add(connectionId);
    session.lastAccessed = new Date();

    // Update statistics
    this.stats.totalWebSocketConnections++;

    this.emit('connection:added', session, connectionId, role);

    return true;
  }

  /**
   * Removes a WebSocket connection from a session
   * @param sessionId - Session identifier
   * @param connectionId - WebSocket connection ID
   * @returns Promise resolving to true if removed successfully
   */
  public async removeConnectionFromSession(
    sessionId: string,
    connectionId: string
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    const removed = session.wsConnections.delete(connectionId);
    if (removed) {
      session.lastAccessed = new Date();

      // Update statistics
      this.stats.totalWebSocketConnections = Math.max(0, this.stats.totalWebSocketConnections - 1);

      this.emit('connection:removed', session, connectionId);
    }

    return removed;
  }

  /**
   * Sets the browser ID for a session
   * @param sessionId - Session identifier
   * @param browserId - Browser instance ID
   * @returns Promise resolving to true if set successfully
   */
  public async setBrowserId(sessionId: string, browserId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return false;
    }

    session.metadata.browserId = browserId;
    session.lastAccessed = new Date();

    return true;
  }

  /**
   * Closes a session
   * @param sessionId - Session identifier
   * @param reason - Reason for closing
   * @returns Promise resolving to the final session state
   */
  public async closeSession(
    sessionId: string,
    reason: 'completed' | 'error' | 'user' | 'timeout' = 'user'
  ): Promise<{
    status: SessionStatus;
    duration: number;
    stepCount: number;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      throw new Error(`Session ${sessionId} not found or already marked for cleanup`);
    }

    const now = new Date();
    let duration = 0;
    let stepCount = session.steps.length;

    // Update session status
    if (session.status !== SessionStatus.COMPLETED && session.status !== SessionStatus.ERROR) {
      await this.updateSessionStatus(sessionId, SessionStatus.COMPLETED);
    }

    // Calculate duration
    if (session.recordingStartedAt) {
      duration = now.getTime() - session.recordingStartedAt.getTime();
    }

    // Mark for cleanup
    session.markedForCleanup = true;

    // Store final state
    const finalState = {
      status: session.status,
      duration,
      stepCount
    };

    // Emit close event
    this.emit('session:closed', session, reason, finalState);
    this.emitEvent({
      id: uuidv4(),
      timestamp: now,
      type: 'closed',
      sessionId,
      data: { reason, finalState }
    });

    // Schedule cleanup
    setTimeout(() => {
      this.cleanupSession(session, reason);
    }, 5000); // Cleanup after 5 seconds

    return finalState;
  }

  /**
   * Closes all active sessions
   * @param reason - Reason for closing
   * @returns Promise resolving when all sessions are closed
   */
  public async closeAllSessions(
    reason: 'completed' | 'error' | 'user' | 'timeout' = 'user'
  ): Promise<void> {
    const activeSessions = this.getActiveSessions();
    await Promise.all(
      activeSessions.map(session => this.closeSession(session.id, reason))
    );
  }

  /**
   * Gets the current configuration
   * @returns Current session manager configuration
   */
  public getConfig(): SessionManagerConfig {
    return { ...this.config };
  }

  /**
   * Regenerates a session token
   * @param sessionId - Session identifier
   * @returns Promise resolving to the new token or null if session not found
   */
  public async regenerateToken(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.markedForCleanup) {
      return null;
    }

    // Remove old token
    this.sessionTokens.delete(session.token);

    // Generate new token
    const sessionToken = await generateSessionToken(this.config.sessionTokenExpirationMs);
    session.token = sessionToken.token;
    session.tokenExpiresAt = new Date(sessionToken.expiresAt);
    session.lastAccessed = new Date();

    // Store new token
    this.sessionTokens.set(sessionToken.token, sessionId);

    return sessionToken.token;
  }

  /**
   * Checks if a session is valid and not expired
   * @param sessionId - Session identifier
   * @returns Promise resolving to true if session is valid
   */
  public async isSessionValid(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId, false);
    if (!session) {
      return false;
    }

    // Check token expiration
    if (new Date() > session.tokenExpiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Gets the total number of active browser instances across all sessions
   * @returns Number of active browser instances
   */
  public getActiveBrowserInstanceCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!session.markedForCleanup) {
        count += session.browserInstances.size;
      }
    }
    return count;
  }

  /**
   * Gets the total number of active WebSocket connections across all sessions
   * @returns Number of active WebSocket connections
   */
  public getActiveWebSocketCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!session.markedForCleanup) {
        count += session.wsConnections.size;
      }
    }
    return count;
  }

  /**
   * Gets session manager statistics
   * @returns Current statistics
   */
  public getStats(): SessionManagerStats {
    // Update uptime
    this.stats.uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    // Update memory usage
    if (process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.stats.memoryUsage = Math.round(memUsage.heapUsed / 1024 / 1024);
    }

    return { ...this.stats };
  }

  /**
   * Merges session settings with updates
   * @param current - Current settings
   * @param updates - Settings to merge
   * @returns Merged settings
   */
  private mergeSettings(
    current: Session['settings'],
    updates: Partial<Session['settings']>
  ): Session['settings'] {
    return {
      viewport: { ...current.viewport, ...updates.viewport },
      quality: { ...current.quality, ...updates.quality },
      recording: { ...current.recording, ...updates.recording }
    };
  }

  /**
   * Cleans up a session and its resources
   * @param session - Session to clean up
   * @param reason - Cleanup reason
   */
  private async cleanupSession(session: ManagedSession, reason: string): Promise<void> {
    // Clear browser instances
    session.browserInstances.clear();

    // Clear WebSocket connections
    session.wsConnections.clear();

    // Remove from tokens map
    this.sessionTokens.delete(session.token);

    // Remove from sessions map
    this.sessions.delete(session.id);

    // Update statistics
    this.stats.activeSessions = Math.max(0, this.stats.activeSessions - 1);

    this.emit('session:cleaned', session, reason);
  }

  /**
   * Starts the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Performs cleanup of idle and expired sessions
   */
  private performCleanup(): void {
    const now = new Date();
    const sessionsToCleanup: ManagedSession[] = [];

    for (const session of this.sessions.values()) {
      if (session.markedForCleanup) {
        continue; // Already marked for cleanup
      }

      // Check for idle timeout
      const idleTime = now.getTime() - session.lastAccessed.getTime();
      if (idleTime > this.config.idleTimeoutMs) {
        sessionsToCleanup.push(session);
        continue;
      }

      // Check for token expiration
      if (now > session.tokenExpiresAt) {
        sessionsToCleanup.push(session);
        continue;
      }
    }

    // Clean up identified sessions
    for (const session of sessionsToCleanup) {
      this.deleteSession(session.id, 'idle_timeout');
    }

    if (sessionsToCleanup.length > 0) {
      logger.info(`Cleaned up ${sessionsToCleanup.length} idle sessions`);
    }
  }

  /**
   * Updates session statistics
   */
  private updateStatistics(): void {
    // Reset counts
    this.stats.activeSessions = 0;
    this.stats.sessionsByStatus = {
      ready: 0,
      recording: 0,
      paused: 0,
      completed: 0,
      error: 0,
      closed: 0
    };
    this.stats.totalBrowserInstances = 0;
    this.stats.totalWebSocketConnections = 0;

    let totalDuration = 0;
    let sessionCount = 0;

    // Calculate from active sessions
    for (const session of this.sessions.values()) {
      if (!session.markedForCleanup) {
        this.stats.activeSessions++;
        this.stats.sessionsByStatus[session.status]++;
        this.stats.totalBrowserInstances += session.browserInstances.size;
        this.stats.totalWebSocketConnections += session.wsConnections.size;

        if (session.duration > 0) {
          totalDuration += session.duration;
          sessionCount++;
        }
      }
    }

    // Calculate average duration
    this.stats.averageSessionDuration = sessionCount > 0
      ? Math.round(totalDuration / sessionCount)
      : 0;
  }

  /**
   * Emits a session event
   * @param event - Event to emit
   */
  private emitEvent(event: SessionEvent): void {
    this.emit('session:event', event);
  }

  /**
   * Destroys the session manager and cleans up all resources
   */
  public async destroy(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    await this.closeAllSessions('shutdown');

    // Clear all maps
    this.sessions.clear();
    this.sessionTokens.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info('SessionManager destroyed');
  }
}

// Export a singleton instance for easy usage
let sessionManagerInstance: SessionManager | null = null;

/**
 * Gets or creates the singleton SessionManager instance
 * @param config - Optional configuration for first-time creation
 * @returns SessionManager instance
 */
export function getSessionManager(config?: Partial<SessionManagerConfig>): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(config);
  }
  return sessionManagerInstance;
}

/**
 * Closes and cleans up the singleton SessionManager instance
 */
export async function closeSessionManager(): Promise<void> {
  if (sessionManagerInstance) {
    await sessionManagerInstance.destroy();
    sessionManagerInstance = null;
  }
}