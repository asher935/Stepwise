import { Elysia, t } from 'elysia';
import { sessionManager } from '../services/SessionManager.js';
import { ImportService } from '../services/ImportService.js';
import { ERROR_CODES } from '@stepwise/shared';

export const importRoutes = new Elysia({ prefix: '/api/import' })
  .post(
    '/:sessionId',
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
      
      try {
        const file = body.file;
        if (!file) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.IMPORT_INVALID, 
              message: 'No file provided' 
            } 
          };
        }
        
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        
        const importService = new ImportService(session);
        const result = await importService.import(fileBuffer, {
          password: body.password,
        });
        
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        
        if (message.includes('DECRYPT_FAILED')) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.IMPORT_DECRYPT_FAILED, 
              message: 'Failed to decrypt file. Check your password.' 
            } 
          };
        }
        
        if (message.includes('INVALID')) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.IMPORT_INVALID, 
              message 
            } 
          };
        }
        
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.IMPORT_FAILED, 
            message 
          } 
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Object({
        file: t.File(),
        password: t.Optional(t.String()),
      }),
    }
  )
  
  .post(
    '/:sessionId/preview',
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
      
      try {
        const file = body.file;
        if (!file) {
          return { 
            success: false, 
            error: { 
              code: ERROR_CODES.IMPORT_INVALID, 
              message: 'No file provided' 
            } 
          };
        }
        
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        
        const importService = new ImportService(session);
        const preview = await importService.preview(fileBuffer, {
          password: body.password,
        });
        
        return { success: true, data: preview };
      } catch (error) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.IMPORT_FAILED, 
            message: error instanceof Error ? error.message : 'Preview failed' 
          } 
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Object({
        file: t.File(),
        password: t.Optional(t.String()),
      }),
    }
  );
