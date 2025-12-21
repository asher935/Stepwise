/**
 * Import Service REST API Routes
 *
 * Provides HTTP endpoints for importing step-by-step guides from various file formats.
 * Supports file uploads with multipart/form-data, job tracking, and progress monitoring.
 */

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import type {
  ImportFile,
  ImportFormat,
  ImportResult,
  ImportProgress,
  ImportError
} from '@stepwise/shared';
import { ImportService, ImportErrorType } from '../services/ImportService.js';
import { logger } from '../lib/logger.js';

// In-memory job storage (in production, use a proper database)
const importJobs = new Map<string, {
  result?: ImportResult;
  progress?: ImportProgress;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}>();

// Import service instance
let importService: ImportService | null = null;

/**
 * Initialize ImportService with SessionManager
 */
function getImportService(sessionManager: any): ImportService {
  if (!importService) {
    importService = new ImportService(sessionManager, {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      supportedExtensions: {
        [ImportFormat.STEPWISE]: ['.stepwise'],
        [ImportFormat.JSON]: ['.json'],
        [ImportFormat.MARKDOWN]: ['.md', '.markdown'],
        [ImportFormat.HTML]: ['.html', '.htm'],
        [ImportFormat.ZIP]: ['.zip', '.stepwise.zip']
      },
      defaultOptions: {
        validateChecksums: true,
        autoFixIssues: true,
        maxStepsPerImport: 10000,
        preserveOriginalIds: false
      }
    });

    // Set up event listeners
    importService.on('import-started', (operationId: string, fileName: string) => {
      const job = importJobs.get(operationId);
      if (job) {
        job.status = 'processing';
        job.updatedAt = new Date();
        logger.info(`Import started`, { operationId, fileName });
      }
    });

    importService.on('import-progress', (progress: ImportProgress) => {
      const job = importJobs.get(progress.operationId);
      if (job) {
        job.progress = progress;
        job.updatedAt = new Date();
      }
    });

    importService.on('import-completed', (result: ImportResult) => {
      const job = importJobs.get(result.id);
      if (job) {
        job.result = result;
        job.status = 'completed';
        job.updatedAt = new Date();
        logger.info(`Import completed`, { operationId: result.id, sessionId: result.sessionId });
      }
    });

    importService.on('import-failed', (operationId: string, error: ImportError) => {
      const job = importJobs.get(operationId);
      if (job) {
        job.status = 'failed';
        job.updatedAt = new Date();
        if (!job.result) {
          job.result = {
            id: operationId,
            sessionId: '',
            sourceFileName: '',
            format: ImportFormat.JSON,
            stepsCount: 0,
            completedAt: new Date(),
            importDuration: 0,
            status: 'failed',
            warnings: [],
            errorMessage: error.message,
            stats: {
              successfulSteps: 0,
              skippedSteps: 0,
              errorSteps: 0,
              screenshotsCount: 0,
              consoleEventsCount: 0,
              networkRequestsCount: 0
            }
          };
        }
        logger.error(`Import failed`, { operationId, error: error.message });
      }
    });

    importService.on('import-cancelled', (operationId: string) => {
      const job = importJobs.get(operationId);
      if (job) {
        job.status = 'cancelled';
        job.updatedAt = new Date();
        logger.info(`Import cancelled`, { operationId });
      }
    });
  }
  return importService;
}

/**
 * Helper to detect import format from file extension and MIME type
 */
function detectImportFormat(fileName: string, mimeType?: string): ImportFormat {
  const ext = extname(fileName).toLowerCase();

  // Check by extension first
  if (ext === '.stepwise') return ImportFormat.STEPWISE;
  if (ext === '.json') return ImportFormat.JSON;
  if (ext === '.md' || ext === '.markdown') return ImportFormat.MARKDOWN;
  if (ext === '.html' || ext === '.htm') return ImportFormat.HTML;
  if (ext === '.zip') return ImportFormat.ZIP;

  // Check by MIME type
  if (mimeType) {
    if (mimeType.includes('json')) return ImportFormat.JSON;
    if (mimeType.includes('markdown') || mimeType.includes('text/plain')) return ImportFormat.MARKDOWN;
    if (mimeType.includes('html')) return ImportFormat.HTML;
    if (mimeType.includes('zip')) return ImportFormat.ZIP;
  }

  // Default to stepwise if unknown
  return ImportFormat.STEPWISE;
}

/**
 * Response schemas for API documentation and validation
 */
const ImportResultSchema = {
  id: t.String(),
  sessionId: t.String(),
  sourceFileName: t.String(),
  format: t.Enum({
    stepwise: 'stepwise',
    json: 'json',
    markdown: 'markdown',
    html: 'html',
    zip: 'zip'
  }),
  stepsCount: t.Number(),
  completedAt: t.Date(),
  importDuration: t.Number(),
  status: t.Enum({
    completed: 'completed',
    failed: 'failed',
    partial: 'partial',
    cancelled: 'cancelled'
  }),
  warnings: t.Array(t.String()),
  errorMessage: t.Optional(t.String()),
  stats: t.Object({
    successfulSteps: t.Number(),
    skippedSteps: t.Number(),
    errorSteps: t.Number(),
    screenshotsCount: t.Number(),
    consoleEventsCount: t.Number(),
    networkRequestsCount: t.Number()
  }),
  stepIdMapping: t.Optional(t.Record(t.String(), t.String())),
  transformations: t.Optional(t.Array(t.Object({
    type: t.String(),
    description: t.String(),
    appliedAt: t.Date()
  }))),
  metadata: t.Optional(t.Record(t.String(), t.Unknown()))
};

const ImportProgressSchema = {
  operationId: t.String(),
  status: t.Enum({
    queued: 'queued',
    validating: 'validating',
    parsing: 'parsing',
    processing: 'processing',
    'validating-data': 'validating-data',
    'creating-session': 'creating-session',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled'
  }),
  progress: t.Number(),
  currentOperation: t.Optional(t.String()),
  estimatedTimeRemaining: t.Optional(t.Number()),
  startedAt: t.Optional(t.Date()),
  updatedAt: t.Date(),
  details: t.Optional(t.Object({
    bytesRead: t.Number(),
    totalBytes: t.Number(),
    stepsParsed: t.Number(),
    totalSteps: t.Number(),
    validSteps: t.Number(),
    invalidSteps: t.Number(),
    parsingSpeed: t.Optional(t.Number())
  })),
  validation: t.Optional(t.Object({
    formatValid: t.Boolean(),
    checksumValid: t.Optional(t.Boolean()),
    schemaErrors: t.Optional(t.Array(t.String()))
  })),
  warnings: t.Optional(t.Array(t.String())),
  error: t.Optional(t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Unknown())
  }))
};

const ErrorResponseSchema = {
  error: t.String(),
  message: t.String(),
  code: t.Optional(t.String()),
  timestamp: t.Date()
};

const PaginationSchema = {
  total: t.Number(),
  offset: t.Number(),
  limit: t.Number(),
  hasMore: t.Boolean()
};

/**
 * Create and configure the import routes
 */
export function createImportRoutes(): Elysia {
  return new Elysia({ prefix: '/import' })
    .use(cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
    }))

    /**
     * POST /import
     * Import a file (multipart form data)
     */
    .post('', async ({ body, set, headers, services }) => {
      try {
        const { file, password } = body;
        const sessionManager = services.sessionManager;
        const service = getImportService(sessionManager);

        // Validate file
        if (!file) {
          set.status = 400;
          return {
            success: false,
            error: {
              error: 'MissingFile',
              message: 'No file provided for import',
              timestamp: new Date()
            }
          };
        }

        // Check file size
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
          set.status = 413;
          return {
            success: false,
            error: {
              error: 'FileTooLarge',
              message: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`,
              timestamp: new Date()
            }
          };
        }

        // Read file buffer
        const fileBuffer = await readFile(file.path);

        // Detect format if not provided
        const format = body.format as ImportFormat || detectImportFormat(file.name, file.type);

        // Create import file object
        const importFile: ImportFile = {
          file: fileBuffer,
          format,
          password: password || undefined,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          lastModified: file.lastModified ? new Date(file.lastModified) : undefined,
          metadata: body.metadata ? JSON.parse(body.metadata as string) : undefined
        };

        // Generate operation ID
        const operationId = `import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Create job record
        importJobs.set(operationId, {
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Start import in background
        service.importFile(importFile).then((result) => {
          const job = importJobs.get(operationId);
          if (job) {
            job.result = result;
            job.status = 'completed';
            job.updatedAt = new Date();
          }
        }).catch((error) => {
          const job = importJobs.get(operationId);
          if (job) {
            job.status = 'failed';
            job.updatedAt = new Date();
            if (!job.result) {
              job.result = {
                id: operationId,
                sessionId: '',
                sourceFileName: file.name,
                format,
                stepsCount: 0,
                completedAt: new Date(),
                importDuration: 0,
                status: 'failed',
                warnings: [],
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                stats: {
                  successfulSteps: 0,
                  skippedSteps: 0,
                  errorSteps: 0,
                  screenshotsCount: 0,
                  consoleEventsCount: 0,
                  networkRequestsCount: 0
                }
              };
            }
          }
          logger.error('Import failed', { operationId, error: error.message });
        });

        // Return immediate response with job ID
        set.status = 202;
        return {
          success: true,
          data: {
            operationId,
            fileName: file.name,
            format,
            status: 'pending',
            message: 'Import job started. Use the operation ID to track progress.',
            checkUrl: `/import/jobs/${operationId}`
          }
        };

      } catch (error) {
        logger.error('Import request failed', { error });
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'ImportFailed',
            message: error instanceof Error ? error.message : 'Failed to process import request',
            timestamp: new Date()
          }
        };
      }
    }, {
      body: t.Object({
        file: t.File({
          type: ['application/octet-stream', 'application/json', 'text/markdown', 'text/html', 'application/zip'],
          maxSize: '100m'
        }),
        format: t.Optional(t.Enum({
          stepwise: 'stepwise',
          json: 'json',
          markdown: 'markdown',
          html: 'html',
          zip: 'zip'
        })),
        password: t.Optional(t.String()),
        metadata: t.Optional(t.String())
      }),
      response: {
        202: t.Object({
          success: t.Literal(true),
          data: t.Object({
            operationId: t.String(),
            fileName: t.String(),
            format: t.Enum({
              stepwise: 'stepwise',
              json: 'json',
              markdown: 'markdown',
              html: 'html',
              zip: 'zip'
            }),
            status: t.Literal('pending'),
            message: t.String(),
            checkUrl: t.String()
          })
        }),
        400: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        413: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Import a file',
        description: 'Upload and import a stepwise guide from various file formats',
        tags: ['import']
      }
    })

    /**
     * GET /import/jobs/:id
     * Get import job status
     */
    .get('/jobs/:id', async ({ params, set }) => {
      try {
        const job = importJobs.get(params.id);

        if (!job) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'JobNotFound',
              message: 'Import job not found',
              timestamp: new Date()
            }
          };
        }

        return {
          success: true,
          data: {
            operationId: params.id,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            progress: job.progress,
            result: job.result
          }
        };

      } catch (error) {
        logger.error('Failed to get import job status', { operationId: params.id, error });
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'StatusCheckFailed',
            message: error instanceof Error ? error.message : 'Failed to check job status',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            operationId: t.String(),
            status: t.Enum({
              pending: 'pending',
              processing: 'processing',
              completed: 'completed',
              failed: 'failed',
              cancelled: 'cancelled'
            }),
            createdAt: t.Date(),
            updatedAt: t.Date(),
            progress: t.Optional(ImportProgressSchema),
            result: t.Optional(ImportResultSchema)
          })
        }),
        404: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Get import job status',
        description: 'Check the status and progress of an import job',
        tags: ['import']
      }
    })

    /**
     * GET /import/jobs/:id/result
     * Get import result with session ID
     */
    .get('/jobs/:id/result', async ({ params, set, query, services }) => {
      try {
        const job = importJobs.get(params.id);

        if (!job) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'JobNotFound',
              message: 'Import job not found',
              timestamp: new Date()
            }
          };
        }

        if (job.status !== 'completed' || !job.result) {
          set.status = 400;
          return {
            success: false,
            error: {
              error: 'JobNotCompleted',
              message: 'Import job has not completed yet',
              timestamp: new Date()
            }
          };
        }

        // If session details requested
        if (query.includeSession === 'true' && job.result.sessionId) {
          const sessionManager = services.sessionManager;
          const session = await sessionManager.getSession(job.result.sessionId);

          if (session) {
            return {
              success: true,
              data: {
                result: job.result,
                session: {
                  id: session.id,
                  title: session.title,
                  description: session.description,
                  status: session.status,
                  stats: session.stats,
                  createdAt: session.createdAt,
                  updatedAt: session.updatedAt
                }
              }
            };
          }
        }

        return {
          success: true,
          data: {
            result: job.result
          }
        };

      } catch (error) {
        logger.error('Failed to get import result', { operationId: params.id, error });
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'ResultRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve import result',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      query: t.Object({
        includeSession: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            result: ImportResultSchema,
            session: t.Optional(t.Object({
              id: t.String(),
              title: t.String(),
              description: t.String(),
              status: t.Enum({
                idle: 'idle',
                recording: 'recording',
                paused: 'paused',
                completed: 'completed',
                error: 'error'
              }),
              stats: t.Record(t.String(), t.Unknown()),
              createdAt: t.Date(),
              updatedAt: t.Date()
            }))
          })
        }),
        400: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        404: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Get import result',
        description: 'Get the detailed result of a completed import, optionally including session details',
        tags: ['import']
      }
    })

    /**
     * DELETE /import/jobs/:id
     * Cancel/delete import job
     */
    .delete('/jobs/:id', async ({ params, set, services }) => {
      try {
        const job = importJobs.get(params.id);

        if (!job) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'JobNotFound',
              message: 'Import job not found',
              timestamp: new Date()
            }
          };
        }

        // If job is still processing, try to cancel it
        if (job.status === 'processing' || job.status === 'pending') {
          const sessionManager = services.sessionManager;
          const service = getImportService(sessionManager);
          await service.cancelImport(params.id);
        }

        // Remove from storage
        importJobs.delete(params.id);

        return {
          success: true,
          data: {
            message: job.status === 'completed'
              ? 'Import job deleted'
              : 'Import job cancelled and deleted',
            operationId: params.id,
            previousStatus: job.status
          }
        };

      } catch (error) {
        logger.error('Failed to cancel/delete import job', { operationId: params.id, error });
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'JobCancellationFailed',
            message: error instanceof Error ? error.message : 'Failed to cancel/delete job',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            message: t.String(),
            operationId: t.String(),
            previousStatus: t.Enum({
              pending: 'pending',
              processing: 'processing',
              completed: 'completed',
              failed: 'failed',
              cancelled: 'cancelled'
            })
          })
        }),
        404: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Cancel or delete import job',
        description: 'Cancel an active import job or delete a completed job from storage',
        tags: ['import']
      }
    })

    /**
     * GET /import/jobs
     * List import jobs with filtering
     */
    .get('/jobs', async ({ query, set }) => {
      try {
        const {
          status,
          format,
          offset = '0',
          limit = '50',
          sortBy = 'createdAt',
          sortOrder = 'desc'
        } = query;

        // Convert and validate parameters
        const offsetNum = Math.max(0, Number(offset));
        const limitNum = Math.min(Number(limit), 100); // Cap at 100

        // Filter jobs
        let filteredJobs = Array.from(importJobs.entries());

        if (status) {
          const statuses = Array.isArray(status) ? status : [status];
          filteredJobs = filteredJobs.filter(([_, job]) =>
            statuses.includes(job.status)
          );
        }

        if (format) {
          filteredJobs = filteredJobs.filter(([_, job]) =>
            job.result?.format === format
          );
        }

        // Sort jobs
        filteredJobs.sort(([_, a], [__, b]) => {
          let compareValue = 0;

          switch (sortBy) {
            case 'status':
              compareValue = a.status.localeCompare(b.status);
              break;
            case 'updatedAt':
              compareValue = a.updatedAt.getTime() - b.updatedAt.getTime();
              break;
            case 'createdAt':
            default:
              compareValue = a.createdAt.getTime() - b.createdAt.getTime();
              break;
          }

          return sortOrder === 'desc' ? -compareValue : compareValue;
        });

        // Apply pagination
        const total = filteredJobs.length;
        const paginatedJobs = filteredJobs.slice(offsetNum, offsetNum + limitNum);

        // Format response
        const jobs = paginatedJobs.map(([id, job]) => ({
          operationId: id,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          progress: job.progress?.progress || 0,
          fileName: job.result?.sourceFileName,
          format: job.result?.format,
          stepsCount: job.result?.stepsCount,
          hasError: !!job.result?.errorMessage,
          warnings: job.result?.warnings?.length || 0
        }));

        return {
          success: true,
          data: {
            jobs,
            pagination: {
              total,
              offset: offsetNum,
              limit: limitNum,
              hasMore: offsetNum + limitNum < total
            }
          }
        };

      } catch (error) {
        logger.error('Failed to list import jobs', { error });
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'JobListFailed',
            message: error instanceof Error ? error.message : 'Failed to list import jobs',
            timestamp: new Date()
          }
        };
      }
    }, {
      query: t.Object({
        status: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        format: t.Optional(t.Enum({
          stepwise: 'stepwise',
          json: 'json',
          markdown: 'markdown',
          html: 'html',
          zip: 'zip'
        })),
        offset: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        sortBy: t.Optional(t.Union([
          t.Literal('createdAt'),
          t.Literal('updatedAt'),
          t.Literal('status')
        ])),
        sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')]))
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            jobs: t.Array(t.Object({
              operationId: t.String(),
              status: t.Enum({
                pending: 'pending',
                processing: 'processing',
                completed: 'completed',
                failed: 'failed',
                cancelled: 'cancelled'
              }),
              createdAt: t.Date(),
              updatedAt: t.Date(),
              progress: t.Number(),
              fileName: t.Optional(t.String()),
              format: t.Optional(t.Enum({
                stepwise: 'stepwise',
                json: 'json',
                markdown: 'markdown',
                html: 'html',
                zip: 'zip'
              })),
              stepsCount: t.Optional(t.Number()),
              hasError: t.Boolean(),
              warnings: t.Number()
            })),
            pagination: PaginationSchema
          })
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'List import jobs',
        description: 'Retrieve a paginated list of import jobs with optional filtering',
        tags: ['import']
      }
    })

    /**
     * GET /import/formats
     * Get supported import formats
     */
    .get('/formats', ({ set }) => {
      try {
        const formats = [
          {
            format: 'stepwise',
            name: 'Stepwise Native Format',
            description: 'Native Stepwise file format with complete session data and embedded screenshots',
            extensions: ['.stepwise'],
            mimeTypes: ['application/octet-stream'],
            features: {
              encrypted: true,
              screenshots: true,
              metadata: true,
              checksum: true
            },
            maxFileSize: '100MB'
          },
          {
            format: 'json',
            name: 'JSON Export',
            description: 'JSON format exported from Stepwise or compatible applications',
            extensions: ['.json'],
            mimeTypes: ['application/json'],
            features: {
              encrypted: false,
              screenshots: false,
              metadata: true,
              checksum: false
            },
            maxFileSize: '50MB'
          },
          {
            format: 'markdown',
            name: 'Markdown Guide',
            description: 'Markdown document with embedded step descriptions and images',
            extensions: ['.md', '.markdown'],
            mimeTypes: ['text/markdown', 'text/plain'],
            features: {
              encrypted: false,
              screenshots: true,
              metadata: true,
              checksum: false
            },
            maxFileSize: '10MB'
          },
          {
            format: 'html',
            name: 'HTML Document',
            description: 'HTML document with embedded stepwise data or step lists',
            extensions: ['.html', '.htm'],
            mimeTypes: ['text/html'],
            features: {
              encrypted: false,
              screenshots: true,
              metadata: true,
              checksum: false
            },
            maxFileSize: '20MB'
          },
          {
            format: 'zip',
            name: 'ZIP Archive',
            description: 'Compressed archive containing multiple sessions and assets',
            extensions: ['.zip', '.stepwise.zip'],
            mimeTypes: ['application/zip'],
            features: {
              encrypted: true,
              screenshots: true,
              metadata: true,
              checksum: true
            },
            maxFileSize: '200MB'
          }
        ];

        return {
          success: true,
          data: {
            formats,
            defaultFormat: 'stepwise',
            maxFileSize: '100MB',
            supportedFeatures: {
              encryption: true,
              passwordProtection: true,
              batchImport: true,
              progressTracking: true,
              errorRecovery: true,
              validation: true
            }
          }
        };

      } catch (error) {
        logger.error('Failed to get import formats', { error });
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'FormatsRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve supported formats',
            timestamp: new Date()
          }
        };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            formats: t.Array(t.Object({
              format: t.String(),
              name: t.String(),
              description: t.String(),
              extensions: t.Array(t.String()),
              mimeTypes: t.Array(t.String()),
              features: t.Object({
                encrypted: t.Boolean(),
                screenshots: t.Boolean(),
                metadata: t.Boolean(),
                checksum: t.Boolean()
              }),
              maxFileSize: t.String()
            })),
            defaultFormat: t.String(),
            maxFileSize: t.String(),
            supportedFeatures: t.Object({
              encryption: t.Boolean(),
              passwordProtection: t.Boolean(),
              batchImport: t.Boolean(),
              progressTracking: t.Boolean(),
              errorRecovery: t.Boolean(),
              validation: t.Boolean()
            })
          })
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Get supported import formats',
        description: 'Retrieve information about all supported file formats for import',
        tags: ['import']
      }
    });
}

/**
 * Export the import routes plugin for use in the main Elysia app
 */
export const importRoutes = createImportRoutes();