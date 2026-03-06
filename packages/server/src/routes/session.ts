import { Elysia, t } from 'elysia';
import type { Step, StepLegendItem } from '@stepwise/shared';
import { sessionManager } from '../services/SessionManager.js';
import { ERROR_CODES } from '@stepwise/shared';
import { getSessionBridge, getSessionRecorder, notifyStepDeleted } from '../ws/handler.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

function isStepAction(value: unknown): value is Step['action'] {
  return value === 'click'
    || value === 'type'
    || value === 'paste'
    || value === 'navigate'
    || value === 'scroll'
    || value === 'select'
    || value === 'hover';
}

function isInsertableStep(value: unknown): value is Step {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const step = value as Partial<Step> & { id?: unknown; action?: unknown };
  return typeof step.id === 'string' && step.id.length > 0 && isStepAction(step.action);
}

function isLegendItem(value: unknown): value is StepLegendItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<StepLegendItem> & { bubbleNumber?: unknown; label?: unknown; kind?: unknown; boundingBox?: unknown };
  if (typeof item.bubbleNumber !== 'number' || !Number.isFinite(item.bubbleNumber)) return false;
  if (typeof item.label !== 'string') return false;
  if (item.kind !== 'field' && item.kind !== 'button') return false;
  if (!item.boundingBox || typeof item.boundingBox !== 'object') return false;
  const box = item.boundingBox as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  if (typeof box.x !== 'number' || typeof box.y !== 'number' || typeof box.width !== 'number' || typeof box.height !== 'number') return false;
  if (item.inViewport !== undefined && typeof item.inViewport !== 'boolean') return false;
  if (item.semanticKey !== undefined && item.semanticKey !== 'username' && item.semanticKey !== 'password') return false;
  return true;
}

function parseFormNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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
      sessionManager.updateActivity(params.sessionId);
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
        sessionManager.updateActivity(params.sessionId);
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
      
      sessionManager.updateActivity(params.sessionId);
      await sessionManager.endSession(params.sessionId, 'user');
      return { success: true, data: true };
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
    }
  )

  .post(
    '/:sessionId/upload',
    async ({ params, headers, body }) => {
      const token = headers['authorization']?.replace('Bearer ', '');

      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.INVALID_TOKEN,
            message: 'Invalid or missing token',
          },
        };
      }

      const session = sessionManager.getSession(params.sessionId);
      if (!session || session.status !== 'active') {
        return {
          success: false,
          error: {
            code: ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Session not found or not active',
          },
        };
      }

      const bridge = getSessionBridge(params.sessionId);
      if (!bridge) {
        return {
          success: false,
          error: {
            code: 'FILE_UPLOAD_FAILED',
            message: 'No active browser connection for this session',
          },
        };
      }

      const x = parseFormNumber(body.x);
      const y = parseFormNumber(body.y);
      if (x === null || y === null) {
        return {
          success: false,
          error: {
            code: 'FILE_UPLOAD_FAILED',
            message: 'Invalid upload coordinates',
          },
        };
      }

      const file = body.file;
      if (!file) {
        return {
          success: false,
          error: {
            code: 'FILE_UPLOAD_FAILED',
            message: 'No file provided',
          },
        };
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return {
          success: false,
          error: {
            code: 'FILE_UPLOAD_FAILED',
            message: `File exceeds max upload size of ${MAX_UPLOAD_BYTES} bytes`,
          },
        };
      }

      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        await bridge.uploadFileAtPoint(x, y, {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          buffer: fileBuffer,
        });

        const recorder = getSessionRecorder(params.sessionId);
        if (recorder) {
          await recorder.recordClick(x, y, 'left');
        }

        sessionManager.updateActivity(params.sessionId);

        return {
          success: true,
          data: {
            fileName: file.name,
            size: file.size,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'FILE_UPLOAD_FAILED',
            message: error instanceof Error ? error.message : 'File upload failed',
          },
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Object({
        file: t.File(),
        x: t.Union([t.String(), t.Number()]),
        y: t.Union([t.String(), t.Number()]),
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

        sessionManager.updateActivity(params.sessionId);
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

  .post(
    '/:sessionId/steps',
    async ({ params, headers, body }) => {
      const token = headers['authorization']?.replace('Bearer ', '');

      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.INVALID_TOKEN,
            message: 'Invalid or missing token',
          },
        };
      }

      const session = sessionManager.getSession(params.sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.SESSION_NOT_FOUND,
            message: 'Session not found',
          },
        };
      }

      sessionManager.updateActivity(params.sessionId);
      let stepToInsert: Step | null;
      if (body.autoDetect) {
        const recorder = getSessionRecorder(params.sessionId);
        if (!recorder) {
          return {
            success: false,
            error: {
              code: ERROR_CODES.IMPORT_FAILED,
              message: 'Insert auto-detect is only available during an active live session',
            },
          };
        }
        stepToInsert = await recorder.createInsertStepFromCurrentView();
      } else if (isInsertableStep(body.step)) {
        stepToInsert = body.step;
      } else {
        return {
          success: false,
          error: {
            code: ERROR_CODES.IMPORT_FAILED,
            message: 'Invalid step payload',
          },
        };
      }

      if (!stepToInsert) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.IMPORT_FAILED,
            message: 'Failed to build insert step from current view',
          },
        };
      }

      const steps = normalizeSessionSteps(session);
      const insertionIndex = Math.max(0, Math.min(Math.floor(body.index), steps.length));
      steps.splice(insertionIndex, 0, { ...stepToInsert, index: insertionIndex });

      for (let i = 0; i < steps.length; i++) {
        steps[i]!.index = i;
      }

      session.steps = steps;
      return { success: true, data: steps };
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Object({
        index: t.Number(),
        step: t.Optional(t.Unknown()),
        autoDetect: t.Optional(t.Boolean()),
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

      sessionManager.updateActivity(params.sessionId);
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

      if (body.legendItems !== undefined && Array.isArray(body.legendItems)) {
        const legendItems = body.legendItems.filter(isLegendItem).map((item, index) => ({
          ...item,
          bubbleNumber: index + 1,
        }));
        (updatedStep as Step & { legendItems?: StepLegendItem[] }).legendItems = legendItems;
      }

      if (body.pageLegendItems !== undefined && Array.isArray(body.pageLegendItems)) {
        const pageLegendItems = body.pageLegendItems.filter(isLegendItem).map((item, index) => ({
          ...item,
          bubbleNumber: index + 1,
        }));
        (updatedStep as Step & { pageLegendItems?: StepLegendItem[] }).pageLegendItems = pageLegendItems;
      }

      if (
        body.selectedScreenshotMode === 'zoomed'
        || body.selectedScreenshotMode === 'viewport'
        || body.selectedScreenshotMode === 'fullPage'
      ) {
        (updatedStep as Step & { selectedScreenshotMode?: 'zoomed' | 'viewport' | 'fullPage' }).selectedScreenshotMode = body.selectedScreenshotMode;
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
        legendItems: t.Optional(t.Array(t.Unknown())),
        pageLegendItems: t.Optional(t.Array(t.Unknown())),
        selectedScreenshotMode: t.Optional(t.Union([
          t.Literal('zoomed'),
          t.Literal('viewport'),
          t.Literal('fullPage'),
        ])),
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

      sessionManager.updateActivity(params.sessionId);
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

        sessionManager.updateActivity(params.sessionId);
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
