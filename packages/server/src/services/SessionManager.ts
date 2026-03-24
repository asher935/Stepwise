import { chromium } from 'playwright-core';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import type { SessionState, SessionMode, Step, TypeStep, PasteStep } from '@stepwise/shared';
import type { ServerSession, CreateSessionOptions } from '../types/session.js';
import { env } from '../lib/env.js';
import { generateToken, generateSessionId } from '../lib/crypto.js';
import { redactionService } from './RedactionService.js';

type SessionEventType =
  | 'session:created'
  | 'session:started'
  | 'session:ended'
  | 'session:expiring'
  | 'session:error'
  | 'session:activity'
  | 'session:updated';

type SessionEventHandler = (sessionId: string, data?: unknown) => void;

export class SessionManager {
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
      void this.cleanupIdleSessions();
    }, 60_000);
  }

  /**
   * Cleans up sessions that have been idle too long
   */
  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const idleDuration = now - session.lastActivityAt;
      const remainingMs = env.IDLE_TIMEOUT_MS - idleDuration;

      if (remainingMs <= 0) {
        console.warn(`[SessionManager] Cleaning up idle session: ${id}`);
        void this.endSession(id, 'timeout');
        continue;
      }

      if (
        remainingMs <= env.SESSION_EXPIRY_WARNING_MS &&
        (session.lastExpiryWarningAt === null || now - session.lastExpiryWarningAt >= 30_000)
      ) {
        session.lastExpiryWarningAt = now;
        this.emit('session:expiring', id, { remainingMs });
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
  async createSession(_options: CreateSessionOptions = {}): Promise<{ sessionId: string; token: string }> {
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
      mode: 'record' as const,
      recordingPaused: false,
      browser: null,
      page: null,
      cdp: null,
      steps: [],
      url: null,
      title: null,
      startUrl: null,
      createdAt: now,
      lastActivityAt: now,
      lastExpiryWarningAt: null,
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
        ignoreHTTPSErrors: true,
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
      session.lastExpiryWarningAt = null;
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
   * Sets the session mode
   */
  setMode(sessionId: string, mode: SessionMode): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mode = mode;
    }
  }

  /**
   * Gets session mode
   */
  getMode(sessionId: string): SessionMode {
    const session = this.sessions.get(sessionId);
    return session?.mode ?? 'record';
  }

  setRecordingPaused(sessionId: string, paused: boolean): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.recordingPaused = paused;
    session.lastActivityAt = Date.now();
    session.lastExpiryWarningAt = null;

    const state = this.getSessionState(sessionId);
    this.emit('session:updated', sessionId, state);
    return state;
  }

  isRecordingPaused(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.recordingPaused ?? false;
  }

  /**
   * Toggles redaction for a step
   */
  async toggleRedaction(sessionId: string, stepId: string, enable: boolean): Promise<{ redactedScreenshotPath: string | null; screenshotDataUrl: string | null }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const step = session.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error('STEP_NOT_FOUND');
    }

    if (enable) {
      // Generate redacted screenshots for all available modes
      const redactionPromises: Promise<void>[] = [];
      const generationPromises = new Map<string, Promise<string>>();

      const queueRedaction = (
        sourcePath: string | undefined,
        rects: Array<{ x: number; y: number; width: number; height: number }>,
        assign: (redactedPath: string) => void
      ): void => {
        if (!sourcePath || rects.length === 0) {
          return;
        }

        const redactedPath = sourcePath.replace(/\.(png|jpg)$/, '.redacted.$1');
        const key = `${sourcePath}:${JSON.stringify(rects)}`;

        let generationPromise = generationPromises.get(key);
        if (!generationPromise) {
          generationPromise = redactionService.generateRedactedScreenshot(
            sourcePath,
            rects,
            redactedPath
          ).then(() => redactedPath);
          generationPromises.set(key, generationPromise);
        }

        redactionPromises.push(
          generationPromise.then((resolvedPath) => {
            assign(resolvedPath);
          })
        );
      };

      // Zoomed mode redaction
      const zoomedRedactionRects = this.getRedactionRectsForMode(step, 'zoomed');
      queueRedaction(step.screenshotPath, zoomedRedactionRects, (redactedPath) => {
        step.redactedScreenshotPath = redactedPath;
      });

      // Viewport mode redaction
      const viewportRedactionRects = this.getRedactionRectsForMode(step, 'viewport');
      queueRedaction(step.fullScreenshotPath, viewportRedactionRects, (redactedPath) => {
        step.redactedFullScreenshotPath = redactedPath;
      });

      // FullPage mode redaction
      const pageRedactionRects = this.getRedactionRectsForMode(step, 'fullPage');
      queueRedaction(step.pageScreenshotPath, pageRedactionRects, (redactedPath) => {
        step.redactedPageScreenshotPath = redactedPath;
      });

      if (redactionPromises.length === 0) {
        throw new Error('CANNOT_DETERMINE_REDACTION_AREA');
      }

      await Promise.all(redactionPromises);
      step.redactScreenshot = true;

      // Return the redacted screenshot for the currently selected mode
      const mode = step.selectedScreenshotMode || 'zoomed';
      let redactedPath: string | undefined;
      if (mode === 'fullPage') {
        redactedPath = step.redactedPageScreenshotPath;
      } else if (mode === 'viewport') {
        redactedPath = step.redactedFullScreenshotPath;
      } else {
        redactedPath = step.redactedScreenshotPath;
      }

      if (redactedPath) {
        const mimeType = env.SCREENSHOT_FORMAT === 'png' ? 'image/png' : 'image/jpeg';
        const redactedBuffer = await import('node:fs/promises').then(fs => fs.readFile(redactedPath));
        const screenshotDataUrl = `data:${mimeType};base64,${redactedBuffer.toString('base64')}`;
        return { redactedScreenshotPath: redactedPath, screenshotDataUrl };
      }

      return { redactedScreenshotPath: null, screenshotDataUrl: null };
    } else {
      step.redactScreenshot = false;
      step.redactedScreenshotPath = undefined;
      step.redactedFullScreenshotPath = undefined;
      step.redactedPageScreenshotPath = undefined;

      return { redactedScreenshotPath: null, screenshotDataUrl: null };
    }
  }

  private getRedactionRectsForMode(step: Step, mode: 'zoomed' | 'viewport' | 'fullPage'): Array<{ x: number; y: number; width: number; height: number }> {
    // Use the new getRedactionRects method which handles mode-specific rectangles
    const rects = redactionService.getRedactionRects({
      redactionRects: step.redactionRects,
      viewportRedactionRects: step.viewportRedactionRects,
      pageRedactionRects: step.pageRedactionRects,
      selectedScreenshotMode: mode,
    });

    if (rects.length > 0) {
      return rects;
    }

    // Fallback for legacy steps without redactionRects/pageRedactionRects
    if (step.action === 'type') {
      const typeStep = step as TypeStep;
      const redactionRect = redactionService.getRedactionRect({
        target: typeStep.target,
        screenshotClip: typeStep.screenshotClip,
        selectedScreenshotMode: mode,
      });
      return redactionRect ? [redactionRect] : [];
    }

    if (step.action === 'paste') {
      const pasteStep = step as PasteStep;
      const redactionRect = redactionService.getRedactionRect({
        target: pasteStep.target,
        screenshotClip: pasteStep.screenshotClip,
        selectedScreenshotMode: mode,
      });
      return redactionRect ? [redactionRect] : [];
    }

    return [];
  }

  private getRedactionRects(step: Step): Array<{ x: number; y: number; width: number; height: number }> {
    // Use the new getRedactionRects method which handles mode-specific rectangles
    const rects = redactionService.getRedactionRects({
      redactionRects: step.redactionRects,
      viewportRedactionRects: step.viewportRedactionRects,
      pageRedactionRects: step.pageRedactionRects,
      selectedScreenshotMode: step.selectedScreenshotMode,
    });

    if (rects.length > 0) {
      return rects;
    }

    // Fallback for legacy steps without redactionRects/pageRedactionRects
    if (step.action === 'type') {
      const typeStep = step as TypeStep;
      const redactionRect = redactionService.getRedactionRect({
        target: typeStep.target,
        screenshotClip: typeStep.screenshotClip,
        selectedScreenshotMode: typeStep.selectedScreenshotMode,
      });
      return redactionRect ? [redactionRect] : [];
    }

    if (step.action === 'paste') {
      const pasteStep = step as PasteStep;
      const redactionRect = redactionService.getRedactionRect({
        target: pasteStep.target,
        screenshotClip: pasteStep.screenshotClip,
        selectedScreenshotMode: pasteStep.selectedScreenshotMode,
      });
      return redactionRect ? [redactionRect] : [];
    }

    return [];
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
      recordingPaused: session.recordingPaused,
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
