import { afterEach, describe, expect, it } from 'bun:test';
import type { ApiResponse, CreateSessionResponse, SessionState } from '@stepwise/shared';
import { Elysia } from 'elysia';
import { sessionRoutes } from './session.js';
import { sessionManager } from '../services/SessionManager.js';

const app = new Elysia().use(sessionRoutes);
const createdSessionIds = new Set<string>();

async function createActiveSession(): Promise<CreateSessionResponse> {
  const { sessionId, token } = await sessionManager.createSession();
  createdSessionIds.add(sessionId);

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found in test setup');
  }

  session.status = 'active';
  return { sessionId, token };
}

async function setRecordingRequest(sessionId: string, token: string, paused: boolean): Promise<ApiResponse<SessionState | null>> {
  const response = await app.handle(new Request(`http://localhost/api/sessions/${sessionId}/recording`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paused }),
  })) as Response;

  return JSON.parse(await response.text()) as ApiResponse<SessionState | null>;
}

afterEach(async () => {
  const ids = [...createdSessionIds];
  createdSessionIds.clear();
  for (const sessionId of ids) {
    await sessionManager.endSession(sessionId, 'error');
  }
});

describe('POST /api/sessions/:sessionId/recording', () => {
  it('pauses recording and returns the updated session state', async () => {
    const { sessionId, token } = await createActiveSession();

    const result = await setRecordingRequest(sessionId, token, true);

    expect(result.success).toBe(true);
    expect(result.data?.recordingPaused).toBe(true);
    expect(sessionManager.getSession(sessionId)?.recordingPaused).toBe(true);
  });

  it('resumes recording and returns the updated session state', async () => {
    const { sessionId, token } = await createActiveSession();
    sessionManager.setRecordingPaused(sessionId, true);

    const result = await setRecordingRequest(sessionId, token, false);

    expect(result.success).toBe(true);
    expect(result.data?.recordingPaused).toBe(false);
    expect(sessionManager.getSession(sessionId)?.recordingPaused).toBe(false);
  });
});
