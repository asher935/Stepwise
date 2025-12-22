import { Elysia, t } from 'elysia';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionManager } from '../services/SessionManager.js';
import { ExportService } from '../services/ExportService.js';
import { ERROR_CODES, MIME_TYPES } from '@stepwise/shared';
import type { ExportFormat } from '@stepwise/shared';
import { env } from '../lib/env.js';

export const exportRoutes = new Elysia({ prefix: '/api/export' })
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
        const exportService = new ExportService(session);

        // Support both single format and multiple formats
        const formats = body.formats
          ? body.formats as ExportFormat[]
          : body.format
            ? [body.format as ExportFormat]
            : [];

        if (formats.length === 0) {
          return {
            success: false,
            error: {
              code: ERROR_CODES.EXPORT_FAILED,
              message: 'At least one format must be specified',
            },
          };
        }

        const result = await exportService.export({
          formats,
          title: body.title,
          includeScreenshots: body.includeScreenshots ?? true,
          password: body.password,
          theme: body.theme as 'light' | 'dark' | undefined,
        });

        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.EXPORT_FAILED, 
            message: error instanceof Error ? error.message : 'Export failed' 
          } 
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
      body: t.Object({
        format: t.Optional(t.Union([
          t.Literal('pdf'),
          t.Literal('docx'),
          t.Literal('markdown'),
          t.Literal('html'),
          t.Literal('stepwise'),
        ])),
        formats: t.Optional(t.Array(t.Union([
          t.Literal('pdf'),
          t.Literal('docx'),
          t.Literal('markdown'),
          t.Literal('html'),
          t.Literal('stepwise'),
        ]))),
        title: t.Optional(t.String()),
        includeScreenshots: t.Optional(t.Boolean()),
        password: t.Optional(t.String()),
        theme: t.Optional(t.Union([t.Literal('light'), t.Literal('dark')])),
      }),
    }
  )
  
  .get(
    '/:sessionId/download/:filename',
    async ({ params, headers, set }) => {
      const token = headers['authorization']?.replace('Bearer ', '');
      
      if (!token || !sessionManager.validateToken(params.sessionId, token)) {
        set.status = 401;
        return { 
          success: false, 
          error: { 
            code: ERROR_CODES.INVALID_TOKEN, 
            message: 'Invalid or missing token' 
          } 
        };
      }
      
      const filepath = join(
        env.TEMP_DIR, 
        'exports', 
        params.sessionId, 
        params.filename
      );
      
      try {
        const fileBuffer = await readFile(filepath);
        
        let mimeType = 'application/octet-stream';
        if (params.filename.endsWith('.pdf')) {
          mimeType = MIME_TYPES.PDF;
        } else if (params.filename.endsWith('.docx')) {
          mimeType = MIME_TYPES.DOCX;
        } else if (params.filename.endsWith('.zip')) {
          mimeType = MIME_TYPES.ZIP;
        } else if (params.filename.endsWith('.stepwise')) {
          mimeType = 'application/octet-stream';
        }
        
        set.headers['Content-Type'] = mimeType;
        set.headers['Content-Disposition'] = `attachment; filename="${params.filename}"`;
        
        return fileBuffer;
      } catch {
        set.status = 404;
        return { 
          success: false, 
          error: { 
            code: 'FILE_NOT_FOUND', 
            message: 'Export file not found' 
          } 
        };
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
        filename: t.String(),
      }),
    }
  );
