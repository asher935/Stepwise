/**
 * Export Service REST API Routes
 *
 * Provides HTTP endpoints for exporting Stepwise sessions to various formats.
 * Supports both single and batch export operations with progress tracking.
 */

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { promiseTimeout } from 'promise-timeout';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { lookup } from 'mrmime';
import type {
  ExportFormat,
  ExportOptions,
  ExportRequest,
  ExportResult,
  ExportProgress,
  ExportTemplate,
  BatchExportRequest,
  BatchExportResult,
  ExportJob
} from '@stepwise/shared';
import { exportService } from '../services/ExportService.js';
import { authenticateToken, type AuthResult } from '../lib/auth.js';
import { serverConfig } from '../lib/env.js';

/**
 * Authentication middleware for protected endpoints
 */
async function authenticate({ headers }: { headers: Record<string, string> }): Promise<AuthResult> {
  const authHeader = headers['authorization'] || headers['x-session-token'];

  if (!authHeader) {
    return {
      success: false,
      reason: 'No authentication token provided'
    };
  }

  return authenticateToken(authHeader);
}

/**
 * Default export templates for each format
 */
const DEFAULT_TEMPLATES: Record<ExportFormat, ExportTemplate[]> = {
  [ExportFormat.PDF]: [
    {
      id: 'default',
      name: 'Default PDF',
      description: 'Clean and professional PDF export',
      format: ExportFormat.PDF,
      type: 'built-in',
      config: {
        layout: {
          pageSize: 'A4',
          orientation: 'portrait',
          margins: { top: 20, right: 20, bottom: 20, left: 20 }
        },
        colors: {
          primary: '#2563eb',
          secondary: '#64748b',
          background: '#ffffff',
          text: '#1e293b'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'compact',
      name: 'Compact PDF',
      description: 'Space-efficient PDF with smaller margins',
      format: ExportFormat.PDF,
      type: 'built-in',
      config: {
        layout: {
          pageSize: 'A4',
          orientation: 'portrait',
          margins: { top: 10, right: 10, bottom: 10, left: 10 }
        },
        colors: {
          primary: '#2563eb',
          secondary: '#64748b',
          background: '#ffffff',
          text: '#1e293b'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  [ExportFormat.DOCX]: [
    {
      id: 'default',
      name: 'Default Word',
      description: 'Standard Microsoft Word document',
      format: ExportFormat.DOCX,
      type: 'built-in',
      config: {
        layout: {
          pageSize: 'A4',
          orientation: 'portrait',
          margins: { top: 25, right: 25, bottom: 25, left: 25 }
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  [ExportFormat.MARKDOWN]: [
    {
      id: 'default',
      name: 'Default Markdown',
      description: 'GitHub-flavored markdown with proper formatting',
      format: ExportFormat.MARKDOWN,
      type: 'built-in',
      config: {},
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'readme',
      name: 'README Style',
      description: 'Markdown optimized for README files',
      format: ExportFormat.MARKDOWN,
      type: 'built-in',
      config: {
        header: '# {title}\n\n{description}\n\n---\n\n',
        stepTemplate: '## Step {stepNumber}\n\n{stepContent}\n\n'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  [ExportFormat.HTML]: [
    {
      id: 'default',
      name: 'Default HTML',
      description: 'Responsive HTML with embedded styling',
      format: ExportFormat.HTML,
      type: 'built-in',
      config: {
        styles: `
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .step { margin-bottom: 2rem; padding: 1rem; border: 1px solid #e5e7eb; }
          .screenshot { max-width: 100%; height: auto; }
        `
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'bootstrap',
      name: 'Bootstrap HTML',
      description: 'HTML styled with Bootstrap CSS framework',
      format: ExportFormat.HTML,
      type: 'built-in',
      config: {
        styles: `
          @import url('https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css');
          .step { @extend .card, .mb-3; }
          .screenshot { @extend .img-fluid, .rounded; }
        `
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  [ExportFormat.ZIP]: [
    {
      id: 'default',
      name: 'Complete Archive',
      description: 'ZIP containing all formats and assets',
      format: ExportFormat.ZIP,
      type: 'built-in',
      config: {
        includeHtml: true,
        includeMarkdown: true,
        includeScreenshots: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]
};

/**
 * Response schemas for API validation
 */
const ExportJobResponseSchema = {
  id: t.String(),
  type: t.Union([t.Literal('export'), t.Literal('import')]),
  priority: t.Number(),
  status: t.Union([
    t.Literal('pending'),
    t.Literal('processing'),
    t.Literal('completed'),
    t.Literal('failed'),
    t.Literal('cancelled')
  ]),
  createdAt: t.Date(),
  startedAt: t.Optional(t.Date()),
  completedAt: t.Optional(t.Date()),
  retryCount: t.Number(),
  maxRetries: t.Number(),
  lastError: t.Optional(t.String())
};

const ExportProgressResponseSchema = {
  requestId: t.String(),
  status: t.Union([
    t.Literal('queued'),
    t.Literal('preparing'),
    t.Literal('processing'),
    t.Literal('generating'),
    t.Literal('uploading'),
    t.Literal('completed'),
    t.Literal('failed'),
    t.Literal('cancelled')
  ]),
  progress: t.Number(),
  currentOperation: t.Optional(t.String()),
  estimatedTimeRemaining: t.Optional(t.Number()),
  startedAt: t.Optional(t.Date()),
  updatedAt: t.Date(),
  details: t.Optional(t.Object({
    stepsProcessed: t.Number(),
    totalSteps: t.Number(),
    screenshotsProcessed: t.Number(),
    totalScreenshots: t.Number(),
    currentSize: t.Number(),
    processingSpeed: t.Optional(t.Number())
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
  timestamp: t.Date(),
  details: t.Optional(t.Unknown())
};

/**
 * Create and configure the export routes
 */
export function createExportRoutes(): Elysia {
  // Active export progress tracking
  const activeExports = new Map<string, ExportProgress>();

  // Set up event listeners for export progress
  exportService.on('exportProgress', (progress: ExportProgress) => {
    activeExports.set(progress.requestId, progress);

    // Clean up completed exports after 5 minutes
    if (progress.status === 'completed' || progress.status === 'failed') {
      setTimeout(() => {
        activeExports.delete(progress.requestId);
      }, 300000);
    }
  });

  exportService.on('exportCompleted', ({ jobId, result }) => {
    // Update active exports with completion
    const progress = activeExports.get(jobId);
    if (progress) {
      progress.status = 'completed';
      progress.progress = 100;
      progress.updatedAt = new Date();
    }
  });

  exportService.on('exportError', ({ jobId, error }) => {
    // Update active exports with error
    const progress = activeExports.get(jobId);
    if (progress) {
      progress.status = 'failed';
      progress.error = {
        code: 'EXPORT_FAILED',
        message: error
      };
      progress.updatedAt = new Date();
    }
  });

  exportService.on('exportCancelled', ({ jobId }) => {
    // Update active exports with cancellation
    const progress = activeExports.get(jobId);
    if (progress) {
      progress.status = 'cancelled';
      progress.updatedAt = new Date();
    }
  });

  return new Elysia({ prefix: '/export' })
    .use(cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
    }))

    /**
     * POST /export
     * Export a session to a specific format
     */
    .post('', async ({ body, set, headers }) => {
      try {
        // Authenticate request
        const auth = await authenticate({ headers });
        if (!auth.success) {
          set.status = 401;
          return {
            success: false,
            error: {
              error: 'AuthenticationRequired',
              message: auth.reason || 'Authentication failed',
              timestamp: new Date()
            }
          };
        }

        // Validate session exists (would integrate with SessionService)
        // For now, we assume session exists

        // Create export request
        const exportRequest: ExportRequest = {
          id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sessionId: body.sessionId,
          format: body.format,
          options: {
            ...body.options,
            format: body.format
          },
          requestedAt: new Date(),
          userId: auth.userId,
          notifyOnComplete: body.notifyOnComplete || false,
          notificationEmail: body.notificationEmail,
          priority: body.priority,
          destination: body.destination
        };

        // Queue the export
        const exportPromise = exportService.queueExport(exportRequest);

        // Apply timeout if specified
        const timeout = body.timeout || 300000; // Default 5 minutes
        const result = await promiseTimeout(exportPromise, timeout);

        return {
          success: true,
          data: {
            exportJob: {
              id: exportRequest.id,
              type: 'export' as const,
              status: result.status,
              createdAt: exportRequest.requestedAt,
              completedAt: result.completedAt,
              retryCount: 0,
              maxRetries: 3
            },
            result: {
              ...result,
              sessionId: result.sessionId.toString() // Convert URL to string for response
            }
          }
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          set.status = 408;
          return {
            success: false,
            error: {
              error: 'ExportTimeout',
              message: 'Export operation timed out',
              timestamp: new Date()
            }
          };
        }

        set.status = 500;
        return {
          success: false,
          error: {
            error: 'ExportFailed',
            message: error instanceof Error ? error.message : 'Export operation failed',
            timestamp: new Date()
          }
        };
      }
    }, {
      body: t.Object({
        sessionId: t.String(),
        format: t.Enum({
          pdf: 'pdf',
          docx: 'docx',
          markdown: 'markdown',
          html: 'html',
          zip: 'zip'
        }),
        options: t.Optional(t.Object({
          includeScreenshots: t.Optional(t.Boolean()),
          screenshotQuality: t.Optional(t.Number({ minimum: 0.1, maximum: 1.0 })),
          screenshotMaxSize: t.Optional(t.Object({
            width: t.Number(),
            height: t.Number()
          })),
          template: t.Optional(t.String()),
          templateOverrides: t.Optional(t.Record(t.String(), t.Unknown())),
          password: t.Optional(t.String()),
          includeConsoleLogs: t.Optional(t.Boolean()),
          includeNetworkRequests: t.Optional(t.Boolean()),
          includeDomChanges: t.Optional(t.Boolean()),
          includeUserInputs: t.Optional(t.Boolean()),
          includeMetadata: t.Optional(t.Boolean()),
          includeTimestamps: t.Optional(t.Boolean()),
          timestampFormat: t.Optional(t.Union([t.Literal('ISO'), t.Literal('relative'), t.Literal('custom')])),
          customTimestampFormat: t.Optional(t.String()),
          groupByPages: t.Optional(t.Boolean()),
          locale: t.Optional(t.String()),
          customCss: t.Optional(t.String()),
          minify: t.Optional(t.Boolean()),
          includeTableOfContents: t.Optional(t.Boolean()),
          tocMaxDepth: t.Optional(t.Number({ minimum: 1 })),
          includeAnnotations: t.Optional(t.Boolean()),
          stepFilter: t.Optional(t.Object({
            includeTypes: t.Optional(t.Array(t.String())),
            excludeTypes: t.Optional(t.Array(t.String()))
          })),
          timeRange: t.Optional(t.Object({
            start: t.String(),
            end: t.String()
          })),
          compression: t.Optional(t.Object({
            enabled: t.Boolean(),
            level: t.Optional(t.Number({ minimum: 0, maximum: 9 })),
            format: t.Optional(t.Union([t.Literal('gzip'), t.Literal('zip'), t.Literal('brotli')]))
          })),
          watermark: t.Optional(t.Object({
            enabled: t.Boolean(),
            text: t.Optional(t.String()),
            imageUrl: t.Optional(t.String()),
            position: t.Optional(t.Union([
              t.Literal('top-left'),
              t.Literal('top-right'),
              t.Literal('bottom-left'),
              t.Literal('bottom-right'),
              t.Literal('center')
            ])),
            opacity: t.Optional(t.Number({ minimum: 0.0, maximum: 1.0 }))
          })),
          customMetadata: t.Optional(t.Record(t.String(), t.Union([t.String(), t.Number(), t.Boolean()])))
        })),
        notifyOnComplete: t.Optional(t.Boolean()),
        notificationEmail: t.Optional(t.String()),
        priority: t.Optional(t.Union([t.Literal('low'), t.Literal('normal'), t.Literal('high'), t.Literal('urgent')])),
        timeout: t.Optional(t.Number()),
        destination: t.Optional(t.Object({
          type: t.Union([t.Literal('download'), t.Literal('email'), t.Literal('cloud-storage'), t.Literal('api')]),
          url: t.Optional(t.String()),
          cloudStorage: t.Optional(t.Object({
            provider: t.Union([t.Literal('aws-s3'), t.Literal('google-cloud'), t.Literal('azure-blob'), t.Literal('dropbox')]),
            bucket: t.Optional(t.String()),
            path: t.Optional(t.String()),
            credentials: t.Optional(t.Record(t.String(), t.String()))
          })),
          api: t.Optional(t.Object({
            endpoint: t.String(),
            method: t.Union([t.Literal('POST'), t.Literal('PUT')]),
            headers: t.Optional(t.Record(t.String(), t.String())),
            auth: t.Optional(t.Object({
              type: t.Union([t.Literal('bearer'), t.Literal('basic'), t.Literal('api-key')]),
              token: t.Optional(t.String()),
              username: t.Optional(t.String()),
              password: t.Optional(t.String()),
              apiKey: t.Optional(t.String())
            }))
          }))
        }))
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            exportJob: ExportJobResponseSchema,
            result: t.Object({
              id: t.String(),
              requestId: t.String(),
              sessionId: t.String(),
              downloadUrl: t.String(),
              fileName: t.String(),
              size: t.Number(),
              format: t.Enum({
                pdf: 'pdf',
                docx: 'docx',
                markdown: 'markdown',
                html: 'html',
                zip: 'zip'
              }),
              mimeType: t.String(),
              completedAt: t.Date(),
              exportDuration: t.Number(),
              status: t.Union([t.Literal('completed'), t.Literal('failed'), t.Literal('cancelled')]),
              errorMessage: t.Optional(t.String()),
              stats: t.Object({
                stepsCount: t.Number(),
                screenshotsCount: t.Number(),
                pageCount: t.Optional(t.Number()),
                wordCount: t.Optional(t.Number()),
                compressionRatio: t.Optional(t.Number())
              }),
              previewUrl: t.Optional(t.String()),
              thumbnailUrl: t.Optional(t.String()),
              checksum: t.Optional(t.Object({
                algorithm: t.Union([t.Literal('md5'), t.Literal('sha1'), t.Literal('sha256'), t.Literal('sha512')]),
                value: t.String()
              })),
              metadata: t.Optional(t.Record(t.String(), t.Unknown()))
            })
          })
        }),
        401: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        408: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Export session',
        description: 'Export a session to the specified format with custom options',
        tags: ['export']
      }
    })

    /**
     * GET /export/jobs/:id
     * Get export job status
     */
    .get('/jobs/:id', async ({ params, set, headers }) => {
      try {
        // Authenticate request
        const auth = await authenticate({ headers });
        if (!auth.success) {
          set.status = 401;
          return {
            success: false,
            error: {
              error: 'AuthenticationRequired',
              message: auth.reason || 'Authentication failed',
              timestamp: new Date()
            }
          };
        }

        const jobId = params.id;

        // Check active jobs
        const activeJobs = exportService.getActiveJobs();
        const activeJob = activeJobs.find(job => job.id === jobId);

        if (activeJob) {
          return {
            success: true,
            data: {
              job: {
                id: activeJob.id,
                type: activeJob.type,
                priority: activeJob.priority,
                status: activeJob.status,
                createdAt: activeJob.createdAt,
                startedAt: activeJob.startedAt,
                completedAt: activeJob.completedAt,
                retryCount: activeJob.retryCount,
                maxRetries: activeJob.maxRetries,
                lastError: activeJob.lastError,
                payload: activeJob.payload
              },
              progress: activeExports.get(jobId) || null
            }
          };
        }

        // Check queued jobs
        const queuedJobs = exportService.getQueuedJobs();
        const queuedJob = queuedJobs.find(job => job.id === jobId);

        if (queuedJob) {
          return {
            success: true,
            data: {
              job: {
                id: queuedJob.id,
                type: queuedJob.type,
                priority: queuedJob.priority,
                status: queuedJob.status,
                createdAt: queuedJob.createdAt,
                startedAt: queuedJob.startedAt,
                completedAt: queuedJob.completedAt,
                retryCount: queuedJob.retryCount,
                maxRetries: queuedJob.maxRetries,
                lastError: queuedJob.lastError,
                payload: queuedJob.payload
              },
              progress: activeExports.get(jobId) || null
            }
          };
        }

        // Job not found
        set.status = 404;
        return {
          success: false,
          error: {
            error: 'JobNotFound',
            message: 'Export job not found',
            timestamp: new Date()
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'JobStatusRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve job status',
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
            job: ExportJobResponseSchema,
            progress: t.Nullable(ExportProgressResponseSchema)
          })
        }),
        401: t.Object({
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
        summary: 'Get export job status',
        description: 'Retrieve the current status and progress of an export job',
        tags: ['export', 'jobs']
      }
    })

    /**
     * GET /export/jobs/:id/download
     * Download exported file
     */
    .get('/jobs/:id/download', async ({ params, set, headers, query }) => {
      try {
        // Authenticate request
        const auth = await authenticate({ headers });
        if (!auth.success) {
          set.status = 401;
          return {
            success: false,
            error: {
              error: 'AuthenticationRequired',
              message: auth.reason || 'Authentication failed',
              timestamp: new Date()
            }
          };
        }

        const jobId = params.id;

        // Get the export result from completed job
        // In a real implementation, this would query a database for completed exports
        // For now, we'll check if the file exists in the exports directory

        const fileName = `${jobId}.export`;
        const filePath = join(serverConfig.exportsDir || '/exports', fileName);

        // Check if file exists
        if (!existsSync(filePath)) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'FileNotFound',
              message: 'Export file not found or has expired',
              timestamp: new Date()
            }
          };
        }

        // Determine MIME type
        const mimeType = lookup(fileName) || 'application/octet-stream';

        // Set download headers
        set.headers['Content-Type'] = mimeType;
        set.headers['Content-Disposition'] = query.inline === 'true'
          ? `inline; filename="${fileName}"`
          : `attachment; filename="${fileName}"`;

        // Enable CORS for download
        set.headers['Access-Control-Allow-Origin'] = '*';
        set.headers['Access-Control-Allow-Methods'] = 'GET';
        set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';

        // Stream the file
        const fileStream = createReadStream(filePath);

        return fileStream as any; // Elysia handles streams
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'DownloadFailed',
            message: error instanceof Error ? error.message : 'Failed to download file',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      query: t.Object({
        inline: t.Optional(t.Boolean())
      }),
      response: {
        200: t.Any(), // File stream
        401: t.Object({
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
        summary: 'Download exported file',
        description: 'Download the file generated by an export job',
        tags: ['export', 'jobs', 'download']
      }
    })

    /**
     * DELETE /export/jobs/:id
     * Cancel/delete export job
     */
    .delete('/jobs/:id', async ({ params, set, headers }) => {
      try {
        // Authenticate request
        const auth = await authenticate({ headers });
        if (!auth.success) {
          set.status = 401;
          return {
            success: false,
            error: {
              error: 'AuthenticationRequired',
              message: auth.reason || 'Authentication failed',
              timestamp: new Date()
            }
          };
        }

        const jobId = params.id;

        // Attempt to cancel the export
        const cancelled = exportService.cancelExport(jobId);

        if (!cancelled) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'JobNotFound',
              message: 'Export job not found or already completed',
              timestamp: new Date()
            }
          };
        }

        // Remove from active exports tracking
        activeExports.delete(jobId);

        return {
          success: true,
          data: {
            message: 'Export job cancelled successfully',
            jobId
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'JobCancellationFailed',
            message: error instanceof Error ? error.message : 'Failed to cancel export job',
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
            jobId: t.String()
          })
        }),
        401: t.Object({
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
        summary: 'Cancel export job',
        description: 'Cancel or delete an active export job',
        tags: ['export', 'jobs']
      }
    })

    /**
     * GET /export/jobs
     * List export jobs with filtering
     */
    .get('/jobs', async ({ query, set, headers }) => {
      try {
        // Authenticate request
        const auth = await authenticate({ headers });
        if (!auth.success) {
          set.status = 401;
          return {
            success: false,
            error: {
              error: 'AuthenticationRequired',
              message: auth.reason || 'Authentication failed',
              timestamp: new Date()
            }
          };
        }

        // Parse query parameters
        const status = query.status ? (Array.isArray(query.status) ? query.status : [query.status]) : undefined;
        const type = query.type as 'export' | 'import' | undefined;
        const limit = Math.min(Number(query.limit) || 50, 100);
        const offset = Number(query.offset) || 0;

        // Get all jobs
        const activeJobs = exportService.getActiveJobs();
        const queuedJobs = exportService.getQueuedJobs();
        const allJobs = [...activeJobs, ...queuedJobs];

        // Filter jobs
        let filteredJobs = allJobs;

        if (status) {
          filteredJobs = filteredJobs.filter(job =>
            status.includes(job.status)
          );
        }

        if (type) {
          filteredJobs = filteredJobs.filter(job =>
            job.type === type
          );
        }

        if (query.userId) {
          // In a real implementation, would filter by user ID from payload
          // For now, we'll skip this filter
        }

        // Sort jobs
        filteredJobs.sort((a, b) => {
          const sortBy = query.sortBy || 'createdAt';
          const sortOrder = query.sortOrder || 'desc';

          const aValue = a[sortBy as keyof typeof a];
          const bValue = b[sortBy as keyof typeof b];

          if (!aValue || !bValue) return 0;

          if (sortOrder === 'asc') {
            return aValue > bValue ? 1 : -1;
          } else {
            return aValue < bValue ? 1 : -1;
          }
        });

        // Paginate
        const paginatedJobs = filteredJobs.slice(offset, offset + limit);

        // Format response
        const jobs = paginatedJobs.map(job => ({
          id: job.id,
          type: job.type,
          priority: job.priority,
          status: job.status,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          lastError: job.lastError,
          progress: activeExports.get(job.id) || null
        }));

        return {
          success: true,
          data: {
            jobs,
            pagination: {
              total: filteredJobs.length,
              offset,
              limit,
              hasMore: offset + limit < filteredJobs.length
            }
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'JobListFailed',
            message: error instanceof Error ? error.message : 'Failed to list export jobs',
            timestamp: new Date()
          }
        };
      }
    }, {
      query: t.Object({
        status: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        type: t.Optional(t.Union([t.Literal('export'), t.Literal('import')])),
        userId: t.Optional(t.String()),
        sortBy: t.Optional(t.Union([
          t.Literal('createdAt'),
          t.Literal('startedAt'),
          t.Literal('priority'),
          t.Literal('status')
        ])),
        sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
        offset: t.Optional(t.String()),
        limit: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            jobs: t.Array(t.Object({
              id: t.String(),
              type: t.Union([t.Literal('export'), t.Literal('import')]),
              priority: t.Number(),
              status: t.Union([
                t.Literal('pending'),
                t.Literal('processing'),
                t.Literal('completed'),
                t.Literal('failed'),
                t.Literal('cancelled')
              ]),
              createdAt: t.Date(),
              startedAt: t.Optional(t.Date()),
              completedAt: t.Optional(t.Date()),
              retryCount: t.Number(),
              maxRetries: t.Number(),
              lastError: t.Optional(t.String()),
              progress: t.Nullable(ExportProgressResponseSchema)
            })),
            pagination: t.Object({
              total: t.Number(),
              offset: t.Number(),
              limit: t.Number(),
              hasMore: t.Boolean()
            })
          })
        }),
        401: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'List export jobs',
        description: 'Retrieve a paginated list of export jobs with optional filtering',
        tags: ['export', 'jobs']
      }
    })

    /**
     * GET /export/formats
     * Get available export formats
     */
    .get('/formats', async ({ set }) => {
      try {
        const formats = Object.values(ExportFormat).map(format => ({
          format,
          name: format.charAt(0).toUpperCase() + format.slice(1),
          description: getFormatDescription(format),
          mimeType: getFormatMimeType(format),
          supportedOptions: getSupportedOptions(format)
        }));

        return {
          success: true,
          data: {
            formats
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'FormatsRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve export formats',
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
              format: t.Enum({
                pdf: 'pdf',
                docx: 'docx',
                markdown: 'markdown',
                html: 'html',
                zip: 'zip'
              }),
              name: t.String(),
              description: t.String(),
              mimeType: t.String(),
              supportedOptions: t.Array(t.String())
            }))
          })
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Get export formats',
        description: 'Retrieve the list of supported export formats',
        tags: ['export']
      }
    })

    /**
     * GET /export/templates
     * Get available templates for a format
     */
    .get('/templates', async ({ query, set }) => {
      try {
        const format = query.format as ExportFormat;

        if (!format) {
          // Return all templates
          const allTemplates = Object.entries(DEFAULT_TEMPLATES).flatMap(
            ([fmt, templates]) => templates.map(t => ({ ...t, format: fmt as ExportFormat }))
          );

          return {
            success: true,
            data: {
              templates: allTemplates
            }
          };
        }

        // Validate format
        if (!Object.values(ExportFormat).includes(format)) {
          set.status = 400;
          return {
            success: false,
            error: {
              error: 'InvalidFormat',
              message: 'Invalid export format specified',
              timestamp: new Date()
            }
          };
        }

        // Return templates for specific format
        const templates = DEFAULT_TEMPLATES[format] || [];

        return {
          success: true,
          data: {
            templates,
            format
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'TemplatesRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve templates',
            timestamp: new Date()
          }
        };
      }
    }, {
      query: t.Object({
        format: t.Optional(t.Enum({
          pdf: 'pdf',
          docx: 'docx',
          markdown: 'markdown',
          html: 'html',
          zip: 'zip'
        }))
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            templates: t.Array(t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.String()),
              format: t.Enum({
                pdf: 'pdf',
                docx: 'docx',
                markdown: 'markdown',
                html: 'html',
                zip: 'zip'
              }),
              type: t.Union([t.Literal('built-in'), t.Literal('custom'), t.Literal('user-defined')]),
              config: t.Record(t.String(), t.Unknown()),
              createdAt: t.Date(),
              updatedAt: t.Date()
            })),
            format: t.Optional(t.Enum({
              pdf: 'pdf',
              docx: 'docx',
              markdown: 'markdown',
              html: 'html',
              zip: 'zip'
            }))
          })
        }),
        400: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        500: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Get export templates',
        description: 'Retrieve available export templates for a specific format',
        tags: ['export', 'templates']
      }
    });
}

/**
 * Helper functions
 */

function getFormatDescription(format: ExportFormat): string {
  switch (format) {
    case ExportFormat.PDF:
      return 'Portable Document Format with high-quality rendering';
    case ExportFormat.DOCX:
      return 'Microsoft Word document with editable content';
    case ExportFormat.MARKDOWN:
      return 'Markdown text with embedded images';
    case ExportFormat.HTML:
      return 'Interactive HTML document with styling';
    case ExportFormat.ZIP:
      return 'Compressed archive containing all formats';
    default:
      return 'Unknown format';
  }
}

function getFormatMimeType(format: ExportFormat): string {
  switch (format) {
    case ExportFormat.PDF:
      return 'application/pdf';
    case ExportFormat.DOCX:
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case ExportFormat.MARKDOWN:
      return 'text/markdown';
    case ExportFormat.HTML:
      return 'text/html';
    case ExportFormat.ZIP:
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

function getSupportedOptions(format: ExportFormat): string[] {
  const baseOptions = [
    'includeScreenshots',
    'screenshotQuality',
    'includeMetadata',
    'includeTimestamps',
    'customMetadata'
  ];

  switch (format) {
    case ExportFormat.PDF:
      return [
        ...baseOptions,
        'template',
        'layout',
        'watermark',
        'includeTableOfContents',
        'customCss'
      ];
    case ExportFormat.DOCX:
      return [
        ...baseOptions,
        'template',
        'layout',
        'includeTableOfContents'
      ];
    case ExportFormat.MARKDOWN:
      return [
        ...baseOptions,
        'template',
        'groupByPages',
        'includeTableOfContents'
      ];
    case ExportFormat.HTML:
      return [
        ...baseOptions,
        'template',
        'customCss',
        'minify',
        'includeTableOfContents'
      ];
    case ExportFormat.ZIP:
      return [
        ...baseOptions,
        'compression',
        'includeAllFormats'
      ];
    default:
      return baseOptions;
  }
}

/**
 * Export the export routes plugin for use in the main Elysia app
 */
export const exportRoutes = createExportRoutes();