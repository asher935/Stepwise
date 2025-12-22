import { Elysia, t } from 'elysia';
import { sessionManager } from '../services/SessionManager.js';
import { ERROR_CODES } from '@stepwise/shared';

export const sessionRoutes = new Elysia({ prefix: '/api/sessions' })
  .post(
    '/',
    async ({ body }) => {
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
      
      return { success: true, data: session.steps };
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
      
      const step = session.steps.find(s => s.id === params.stepId);
      if (!step) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.STEP_NOT_FOUND, 
            message: 'Step not found' 
          } 
        };
      }
      
      if (body.caption !== undefined) {
        step.caption = body.caption;
        step.isEdited = true;
      }
      
      return { success: true, data: step };
    },
    {
      params: t.Object({
        sessionId: t.String(),
        stepId: t.String(),
      }),
      body: t.Object({
        caption: t.Optional(t.String()),
      }),
    }
  )
  
  .delete(
    '/:sessionId/steps/:stepId',
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
      
      const index = session.steps.findIndex(s => s.id === params.stepId);
      if (index === -1) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.STEP_NOT_FOUND, 
            message: 'Step not found' 
          } 
        };
      }
      
      session.steps.splice(index, 1);
      
      for (let i = index; i < session.steps.length; i++) {
        session.steps[i]!.index = i;
      }
      
      return { success: true, data: true };
    },
    {
      params: t.Object({
        sessionId: t.String(),
        stepId: t.String(),
      }),
    }
  );
