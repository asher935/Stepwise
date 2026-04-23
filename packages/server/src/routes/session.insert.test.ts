import { afterEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import type { ApiResponse, CreateSessionResponse, Step } from '@stepwise/shared';
import { sessionRoutes } from './session.js';
import { sessionManager } from '../services/SessionManager.js';

const app = new Elysia().use(sessionRoutes);
const createdSessionIds = new Set<string>();

function createNavigateStep(id: string, index: number): Step {
  return {
    id,
    index,
    action: 'navigate',
    timestamp: Date.now(),
    screenshotPath: `/tmp/${id}.png`,
    caption: `Step ${index + 1}`,
    isEdited: false,
    fromUrl: 'about:blank',
    toUrl: 'https://example.com',
  };
}

async function createSession(): Promise<CreateSessionResponse> {
  const { sessionId, token } = await sessionManager.createSession();
  createdSessionIds.add(sessionId);
  return { sessionId, token };
}

async function insertStepRequest(
  sessionId: string,
  token: string,
  index: number,
  step: Step
): Promise<ApiResponse<Step[]>> {
  const response = await app.handle(new Request(`http://localhost/api/sessions/${sessionId}/steps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ index, step }),
  })) as Response;

  return JSON.parse(await response.text()) as ApiResponse<Step[]>;
}

afterEach(async () => {
  const ids = [...createdSessionIds];
  createdSessionIds.clear();
  for (const sessionId of ids) {
    await sessionManager.endSession(sessionId, 'error');
  }
});

describe('POST /api/sessions/:sessionId/steps', () => {
  it('inserts a step at the requested position and reindexes all steps', async () => {
    const { sessionId, token } = await createSession();
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found in test setup');
    }

    session.steps = [createNavigateStep('step-1', 0), createNavigateStep('step-2', 1)];
    const insertedStep = createNavigateStep('step-inserted', 99);

    const result = await insertStepRequest(sessionId, token, 1, insertedStep);

    expect(result.success).toBe(true);
    expect(session.steps).toHaveLength(3);
    expect(session.steps[0]?.id).toBe('step-1');
    expect(session.steps[1]?.id).toBe('step-inserted');
    expect(session.steps[2]?.id).toBe('step-2');
    expect(session.steps[0]?.index).toBe(0);
    expect(session.steps[1]?.index).toBe(1);
    expect(session.steps[2]?.index).toBe(2);
  });

  it('clamps an out-of-range insertion index to the end', async () => {
    const { sessionId, token } = await createSession();
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found in test setup');
    }

    session.steps = [createNavigateStep('step-1', 0)];
    const insertedStep = createNavigateStep('step-inserted', 0);

    const result = await insertStepRequest(sessionId, token, 50, insertedStep);

    expect(result.success).toBe(true);
    expect(session.steps).toHaveLength(2);
    expect(session.steps[0]?.id).toBe('step-1');
    expect(session.steps[1]?.id).toBe('step-inserted');
    expect(session.steps[1]?.index).toBe(1);
  });

  it('returns an error when auto-detect insert is requested without active recorder', async () => {
    const { sessionId, token } = await createSession();

    const response = await app.handle(new Request(`http://localhost/api/sessions/${sessionId}/steps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ index: 0, autoDetect: true }),
    })) as Response;

    const result = JSON.parse(await response.text()) as ApiResponse<Step[]>;
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Insert auto-detect is only available during an active live session');
  });
});
