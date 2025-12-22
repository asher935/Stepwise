import { chromium, type Browser, type Page, type CDPSession } from 'playwright-core';
import { nanoid } from 'nanoid';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import type { SessionState } from '@stepwise/shared';
import type { ServerSession, CreateSessionOptions } from '../types/session.js';
import { env } from '../lib/env.js';
import { generateToken, generateSessionId } from '../lib/crypto.js';

type SessionEventType = 
  | 'session:created'
  | 'session:started'
  | 'session:ended'
  | 'session:error'
  | 'session:activity';

type SessionEventHandler = (sessionId: string, data?: unknown) => void;

class SessionManager {
  private sessions: Map<string, ServerSession> = new Map();
  private eventHandlers: Map<SessionEventType, Set<SessionEventHandler>> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupJob();
  }

  /**
   * Starts the idle session cleanup job
   */
  private startCleanupJob(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 60_000);
  }

  /**
   * Cleans up sessions that have been idle too long
   */
  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > env.IDLE_TIMEOUT_MS) {
        console.log(`[SessionManager] Cleaning up idle session: ${id}`);
        await this.endSession(id, 'timeout');
      }
    }
  }

  /**
   * Registers an event handler
   */
  on(event: SessionEventType, handler: SessionEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler
   */
  off(event: SessionEventType, handler: SessionEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emits an event to all handlers
   */
  private emit(event: SessionEventType, sessionId: string, data?: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(sessionId, data);
        } catch (error) {
          console.error(`[SessionManager] Event handler error:`, error);
        }
      }
    }
  }

  /**
   * Creates a new session
   */
  async createSession(options: CreateSessionOptions = {}): Promise<{ sessionId: string; token: string }> {
    // Check session limit
    if (this.sessions.size >= env.MAX_SESSIONS) {
      throw new Error('SESSION_LIMIT_REACHED');
    }

    const sessionId = generateSessionId();
    const token = generateToken(env.SESSION_TOKEN_BYTES);
    const now = Date.now();

    // Create session directories
    const sessionDir = join(env.TEMP_DIR, 'sessions', sessionId);
    await mkdir(join(sessionDir, 'screenshots'), { recursive: true });

    const session: ServerSession = {
      id: sessionId,
      token,
      status: 'lobby',
      browser: null,
      page: null,
      cdp: null,
      steps: [],
      url: null,
      title: null,
      startUrl: null,
      createdAt: now,
      lastActivityAt: now,
      healthStatus: 'unknown',
      lastHealthCheck: now,
      initialNavigationRecorded: false,
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', sessionId);

    return { sessionId, token };
  }

  /**
   * Starts a session (launches browser)
   */
  async startSession(sessionId: string, startUrl?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (session.status !== 'lobby') {
      throw new Error('SESSION_ALREADY_STARTED');
    }

    session.status = 'starting';
    session.lastActivityAt = Date.now();

    try {
      // Launch browser
      const browser = await chromium.launch({
        headless: true,
        executablePath: process.env['CHROME_BIN'] || undefined,
        args: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
        ],
      });

      // Create page with viewport
      const page = await browser.newPage({
        viewport: {
          width: env.BROWSER_VIEWPORT_WIDTH,
          height: env.BROWSER_VIEWPORT_HEIGHT,
        },
      });
      await page.bringToFront();

      // Get CDP session
      const cdp = await page.context().newCDPSession(page);

      // Navigate to start URL
      session.startUrl = startUrl ?? null;
      const url = startUrl ?? 'about:blank';
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Update session
      session.browser = browser;
      session.page = page;
      session.cdp = cdp;
      session.url = page.url();
      session.title = await page.title();
      session.status = 'active';
      session.lastActivityAt = Date.now();

      this.emit('session:started', sessionId);
    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('session:error', sessionId, error);
      throw error;
    }
  }

  /**
   * Ends a session
   */
  async endSession(sessionId: string, reason: 'user' | 'timeout' | 'error' = 'user'): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'ending';

    try {
      // Close browser
      if (session.browser) {
        try {
          await session.browser.close();
        } catch {
          // Silent failure - continue cleanup
        }
      }

      // Clean up session directory
      const sessionDir = join(env.TEMP_DIR, 'sessions', sessionId);
      await rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`[SessionManager] Cleanup error for ${sessionId}:`, error);
    } finally {
      session.status = 'closed';
      this.sessions.delete(sessionId);
      this.emit('session:ended', sessionId, { reason });
    }
  }

  /**
   * Gets a session by ID
   */
  getSession(sessionId: string): ServerSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Validates a session token
   */
  validateToken(sessionId: string, token: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.token === token;
  }

  /**
   * Updates session activity timestamp
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
      this.emit('session:activity', sessionId);
    }
  }

  /**
   * Updates session health status
   */
  updateHealthStatus(sessionId: string, status: 'healthy' | 'unhealthy', lastHealthCheck: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.healthStatus = status;
      session.lastHealthCheck = lastHealthCheck;
      
      if (status === 'unhealthy') {
        console.warn(`[SessionManager] Session ${sessionId} marked as unhealthy`);
      }
    }
  }

  /**
   * Gets client-facing session state
   */
  getSessionState(sessionId: string): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      status: session.status,
      url: session.url,
      title: session.title,
      stepCount: session.steps.length,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      error: session.error,
    };
  }

  /**
   * Gets all active sessions count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Shuts down all sessions
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const endPromises = Array.from(this.sessions.keys()).map(id =>
      this.endSession(id, 'error')
    );

    await Promise.allSettled(endPromises);
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
