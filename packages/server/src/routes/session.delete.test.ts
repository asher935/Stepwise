import { afterEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import type { ApiResponse, CreateSessionResponse, Step } from '@stepwise/shared';
import { sessionRoutes } from './session.js';
import { sessionManager } from '../services/SessionManager.js';

const app = new Elysia().use(sessionRoutes);
const createdSessionIds = new Set<string>();
type MalformedStoredStep = Partial<Step> | number | null;

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

async function deleteStepRequest(sessionId: string, token: string, stepId: string): Promise<ApiResponse<boolean>> {
  const response = await app.handle(new Request(`http://localhost/api/sessions/${sessionId}/steps/${stepId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })) as Response;

  return JSON.parse(await response.text()) as ApiResponse<boolean>;
}

afterEach(async () => {
  const ids = [...createdSessionIds];
  createdSessionIds.clear();
  for (const sessionId of ids) {
    await sessionManager.endSession(sessionId, 'error');
  }
});

describe('DELETE /api/sessions/:sessionId/steps/:stepId', () => {
  it('removes a step and reindexes remaining steps', async () => {
    const { sessionId, token } = await createSession();
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found in test setup');
    }

    session.steps = [createNavigateStep('step-1', 0), createNavigateStep('step-2', 1)];

    const result = await deleteStepRequest(sessionId, token, 'step-1');

    expect(result.success).toBe(true);
    expect(result.data).toBe(true);
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]?.id).toBe('step-2');
    expect(session.steps[0]?.index).toBe(0);
  });

  it('treats deleting a missing step as success without mutation', async () => {
    const { sessionId, token } = await createSession();
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found in test setup');
    }

    session.steps = [createNavigateStep('step-1', 0)];

    const result = await deleteStepRequest(sessionId, token, 'missing-step');

    expect(result.success).toBe(true);
    expect(result.data).toBe(false);
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]?.id).toBe('step-1');
    expect(session.steps[0]?.index).toBe(0);
  });

  it('normalizes malformed step arrays before deleting', async () => {
    const { sessionId, token } = await createSession();
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found in test setup');
    }

    session.steps = [
      null,
      createNavigateStep('step-1', 0),
      { id: '', index: 88 },
      42,
      createNavigateStep('step-2', 5),
    ] as MalformedStoredStep[] as Step[];

    const result = await deleteStepRequest(sessionId, token, 'step-1');

    expect(result.success).toBe(true);
    expect(result.data).toBe(true);
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]?.id).toBe('step-2');
    expect(session.steps[0]?.index).toBe(0);
  });
});
