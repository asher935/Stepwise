import { Elysia, t } from 'elysia';
import type { Step } from '@stepwise/shared';
import { sessionManager } from '../services/SessionManager.js';
import { ERROR_CODES } from '@stepwise/shared';
import { notifyStepDeleted } from '../ws/handler.js';

function normalizeSessionSteps(session: { steps: unknown }): Step[] {
  const rawSteps = Array.isArray(session.steps) ? session.steps : [];
  const normalized: Step[] = [];

  for (const candidate of rawSteps) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const step = candidate as Partial<Step> & { id?: unknown };
    if (typeof step.id !== 'string' || step.id.length === 0) {
      continue;
    }

    normalized.push(step as Step);
  }

  for (let i = 0; i < normalized.length; i++) {
    normalized[i]!.index = i;
  }

  session.steps = normalized;
  return normalized;
}

export const sessionRoutes = new Elysia({ prefix: '/api/sessions' })
  .post(
    '/',
    async () => {
      try {
        const { sessionId, token } = await sessionManager.createSession();
        return { 
          success: true, 
          data: { sessionId, token } 
        };
      } catch (error) {
        if (error instanceof Error && error.message === 'SESSION_LIMIT_REACHED') {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.SESSION_LIMIT_REACHED, 
              message: 'Maximum session limit reached' 
            } 
          };
        }
        throw error;
      }
    },
    {
      body: t.Optional(t.Object({
        startUrl: t.Optional(t.String()),
      })),
    }
  )
  
  .get(
    '/:sessionId',
    async ({ params, headers }) => {
      const token = headers['authorization']?.replace('Bearer ', '');
      
      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.INVALID_TOKEN, 
            message: 'Invalid or missing token' 
          } 
        };
      }
      
      const state = sessionManager.getSessionState(params.sessionId);
      if (!state) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.SESSION_NOT_FOUND, 
            message: 'Session not found' 
          } 
        };
      }
      
      return { success: true, data: state };
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
    }
  )
  
  .post(
    '/:sessionId/start',
    async ({ params, headers, body }) => {
      const token = headers['authorization']?.replace('Bearer ', '');
      
      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.INVALID_TOKEN, 
            message: 'Invalid or missing token' 
          } 
        };
      }
      
      try {
        await sessionManager.startSession(params.sessionId, body?.startUrl);
        const state = sessionManager.getSessionState(params.sessionId);
        return { success: true, data: state };
      } catch (error) {
        if (error instanceof Error) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.BROWSER_LAUNCH_FAILED, 
              message: error.message 
            } 
          };
        }
        throw error;
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Optional(t.Object({
        startUrl: t.Optional(t.String()),
      })),
    }
  )
  
  .post(
    '/:sessionId/end',
    async ({ params, headers }) => {
      const token = headers['authorization']?.replace('Bearer ', '');
      
      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.INVALID_TOKEN, 
            message: 'Invalid or missing token' 
          } 
        };
      }
      
      await sessionManager.endSession(params.sessionId, 'user');
      return { success: true, data: true };
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
    }
  )
  
  .get(
    '/:sessionId/steps',
    async ({ params, headers }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '');
        
        if (!token || !sessionManager.validateToken(params.sessionId, token)) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.INVALID_TOKEN, 
              message: 'Invalid or missing token' 
            } 
          };
        }
        
        const session = sessionManager.getSession(params.sessionId);
        if (!session) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.SESSION_NOT_FOUND, 
              message: 'Session not found' 
            } 
          };
        }

        const steps = normalizeSessionSteps(session);
        return { success: true, data: steps };
      } catch (error) {
        console.error('[SessionRoutes] Failed to fetch steps', {
          sessionId: params.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: {
            code: ERROR_CODES.IMPORT_FAILED,
            message: error instanceof Error ? error.message : 'Failed to get steps',
          },
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
    }
  )
  
  .patch(
    '/:sessionId/steps/:stepId',
    async ({ params, headers, body }) => {
      const token = headers['authorization']?.replace('Bearer ', '');

      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.INVALID_TOKEN,
            message: 'Invalid or missing token'
          }
        };
      }

      const session = sessionManager.getSession(params.sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Session not found'
          }
        };
      }

      const steps = normalizeSessionSteps(session);
      const stepIndex = steps.findIndex(s => s.id === params.stepId);
      if (stepIndex === -1) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.STEP_NOT_FOUND,
            message: 'Step not found'
          }
        };
      }

      const step = steps[stepIndex]!;

      const updatedStep = { ...step };

      if (body.caption !== undefined) {
        updatedStep.caption = body.caption;
        updatedStep.isEdited = true;
      }

      if (body.redactScreenshot !== undefined) {
        (step as Step & { redactScreenshot?: boolean }).redactScreenshot = body.redactScreenshot;
      }

      if (body.redactedScreenshotPath !== undefined) {
        (step as Step & { redactedScreenshotPath?: string }).redactedScreenshotPath = body.redactedScreenshotPath;
      }

      steps[stepIndex] = updatedStep;

      return { success: true, data: updatedStep };
    },
    {
      params: t.Object({
        sessionId: t.String(),
        stepId: t.String(),
      }),
      body: t.Object({
        caption: t.Optional(t.String()),
        redactScreenshot: t.Optional(t.Boolean()),
        redactedScreenshotPath: t.Optional(t.String()),
      }),
    }
  )

  .post(
    '/:sessionId/steps/:stepId/redact',
    async ({ params, headers, body }) => {
      const token = headers['authorization']?.replace('Bearer ', '');

      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.INVALID_TOKEN,
            message: 'Invalid or missing token'
          }
        };
      }

      const session = sessionManager.getSession(params.sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Session not found'
          }
        };
      }

      normalizeSessionSteps(session);

      try {
        const result = await sessionManager.toggleRedaction(
          params.sessionId,
          params.stepId,
          body.redact
        );
        return {
          success: true,
          data: result
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            success: false,
            error: {
              code: ERROR_CODES.STEP_NOT_FOUND,
              message: error.message
            }
          };
        }
        throw error;
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
        stepId: t.String(),
      }),
      body: t.Object({
        redact: t.Boolean(),
      }),
    }
  )
  
  .delete(
    '/:sessionId/steps/:stepId',
    async ({ params, headers }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '');
        
        if (!token || !sessionManager.validateToken(params.sessionId, token)) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.INVALID_TOKEN, 
              message: 'Invalid or missing token' 
            } 
          };
        }
        
        const session = sessionManager.getSession(params.sessionId);
        if (!session) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.SESSION_NOT_FOUND, 
              message: 'Session not found' 
            } 
          };
        }

        const steps = normalizeSessionSteps(session);
        const stepIndex = steps.findIndex((step) => step.id === params.stepId);

        if (stepIndex === -1) {
          return { success: true, data: false };
        }

        steps.splice(stepIndex, 1);

        for (let i = stepIndex; i < steps.length; i++) {
          steps[i]!.index = i;
        }

        session.steps = steps;
        notifyStepDeleted(session.id, params.stepId);

        return { success: true, data: true };
      } catch (error) {
        console.error('[SessionRoutes] Failed to delete step', {
          sessionId: params.sessionId,
          stepId: params.stepId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          error: {
            code: ERROR_CODES.IMPORT_FAILED,
            message: error instanceof Error ? error.message : 'Failed to delete step',
          },
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
        stepId: t.String(),
      }),
    }
  );
