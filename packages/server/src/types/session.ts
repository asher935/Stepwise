import type { Browser, Page, CDPSession } from 'playwright-core';
import type { Step, SessionStatus } from '@stepwise/shared';

export interface ServerSession {
  id: string;
  token: string;
  status: SessionStatus;
  browser: Browser | null;
  page: Page | null;
  cdp: CDPSession | null;
  steps: Step[];
  url: string | null;
  title: string | null;
  createdAt: number;
  lastActivityAt: number;
  error?: string;
  screencastSessionId?: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: number;
}

export interface CreateSessionOptions {
  startUrl?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface WSConnection {
  sessionId: string;
  token: string;
  lastPingAt: number;
}

export interface RateLimitState {
  inputCount: number;
  lastReset: number;
}
