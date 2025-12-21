/**
 * Session Management REST API Routes
 *
 * Provides HTTP endpoints for managing recording sessions in the Stepwise application.
 * These routes complement the WebSocket real-time communication for session operations.
 */

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import type {
  Session,
  SessionStatus,
  SessionCreateOptions,
  SessionUpdateOptions,
  SessionSearchCriteria,
  SessionTag,
  RecordingSettings,
  ViewportSettings,
  QualitySettings,
  SessionStats
} from '@stepwise/shared';
import { getSessionManager, type ManagedSession } from '../services/SessionManager.js';

/**
 * Helper to sanitize session data for API responses
 * Removes sensitive internal fields while preserving public-facing data
 */
function sanitizeSession(session: ManagedSession): Omit<Session, 'version'> {
  const { token, tokenExpiresAt, browserInstances, lastAccessed, clientIp, userAgent, markedForCleanup, cleanupReason, ...publicSession } = session;
  return publicSession;
}

/**
 * Helper to validate session status values
 */
function validateSessionStatus(status: unknown): SessionStatus {
  const validStatuses: SessionStatus[] = ['idle', 'recording', 'paused', 'completed', 'error'];
  if (typeof status === 'string' && validStatuses.includes(status as SessionStatus)) {
    return status as SessionStatus;
  }
  throw new Error(`Invalid session status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
}

/**
 * Response schemas for API documentation and validation
 */
const SessionResponseSchema = {
  id: t.String(),
  title: t.String(),
  description: t.String(),
  status: t.Enum({ idle: 'idle', recording: 'recording', paused: 'paused', completed: 'completed', error: 'error' }),
  settings: t.Object({
    viewport: t.Object({
      width: t.Number(),
      height: t.Number(),
      deviceScaleFactor: t.Optional(t.Number()),
      isMobile: t.Optional(t.Boolean()),
      isLandscape: t.Optional(t.Boolean()),
      hasTouch: t.Optional(t.Boolean())
    }),
    quality: t.Object({
      screenshotQuality: t.Number(),
      maxScreenshotSize: t.Optional(t.Object({
        width: t.Number(),
        height: t.Number()
      })),
      videoQuality: t.Optional(t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high'), t.Literal('ultra')])),
      frameRate: t.Optional(t.Number()),
      compressScreenshots: t.Boolean(),
      compressionFormat: t.Optional(t.Union([t.Literal('jpeg'), t.Literal('png'), t.Literal('webp')]))
    }),
    recordConsoleLogs: t.Boolean(),
    recordNetworkRequests: t.Boolean(),
    recordDomChanges: t.Boolean(),
    recordScrollPositions: t.Boolean(),
    recordUserInputs: t.Boolean(),
    maskSensitiveData: t.Boolean(),
    maskedSelectors: t.Optional(t.Array(t.String())),
    maxDuration: t.Optional(t.Number()),
    autoSave: t.Boolean(),
    autoSaveInterval: t.Optional(t.Number())
  }),
  stats: t.Object({
    stepCount: t.Number(),
    duration: t.Number(),
    screenshotCount: t.Number(),
    consoleEventCount: t.Number(),
    networkRequestCount: t.Number(),
    domChangeCount: t.Number(),
    userInputCount: t.Number(),
    startTime: t.Optional(t.Date()),
    endTime: t.Optional(t.Date()),
    averageActionInterval: t.Optional(t.Number()),
    totalDataSize: t.Optional(t.Number())
  }),
  tags: t.Array(t.Object({
    id: t.String(),
    name: t.String(),
    color: t.Optional(t.String()),
    description: t.Optional(t.String())
  })),
  createdAt: t.Date(),
  updatedAt: t.Date(),
  metadata: t.Record(t.String(), t.Unknown()),
  projectId: t.Optional(t.String()),
  userId: t.Optional(t.String()),
  isArchived: t.Boolean(),
  lastError: t.Optional(t.String())
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
 * Create and configure the session routes
 */
export function createSessionRoutes(): Elysia {
  const sessionManager = getSessionManager();

  return new Elysia({ prefix: '/sessions' })
    .use(cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
    }))

    /**
     * POST /sessions
     * Create a new recording session
     */
    .post('', async ({ body, set, headers }) => {
      try {
        const clientIp = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
        const userAgent = headers['user-agent'] || 'unknown';

        const session = await sessionManager.createSession(
          body as SessionCreateOptions,
          clientIp as string,
          userAgent as string
        );

        set.status = 201;
        return {
          success: true,
          data: {
            session: sanitizeSession(session),
            token: session.token
          }
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: {
            error: 'SessionCreationFailed',
            message: error instanceof Error ? error.message : 'Failed to create session',
            timestamp: new Date()
          }
        };
      }
    }, {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.String({ maxLength: 1000 })),
        settings: t.Optional(t.Pick(RecordingSettings, [
          'viewport', 'quality', 'recordConsoleLogs', 'recordNetworkRequests',
          'recordDomChanges', 'recordScrollPositions', 'recordUserInputs',
          'maskSensitiveData', 'maskedSelectors', 'maxDuration', 'autoSave', 'autoSaveInterval'
        ])),
        tags: t.Optional(t.Array(t.Object({
          id: t.String(),
          name: t.String(),
          color: t.Optional(t.String()),
          description: t.Optional(t.String())
        }))),
        startImmediately: t.Optional(t.Boolean()),
        metadata: t.Optional(t.Record(t.String(), t.Unknown())),
        projectId: t.Optional(t.String()),
        userId: t.Optional(t.String())
      }),
      response: {
        201: t.Object({
          success: t.Literal(true),
          data: t.Object({
            session: SessionResponseSchema,
            token: t.String()
          })
        }),
        400: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Create a new session',
        description: 'Creates a new recording session with the provided configuration',
        tags: ['sessions']
      }
    })

    /**
     * GET /sessions
     * List sessions with filtering and pagination
     */
    .get('', async ({ query, set }) => {
      try {
        const criteria: SessionSearchCriteria = {
          query: query.query,
          status: query.status ? (Array.isArray(query.status) ? query.status : [query.status]) as SessionStatus[] : undefined,
          projectId: query.projectId,
          userId: query.userId,
          tags: query.tags ? (Array.isArray(query.tags) ? query.tags : [query.tags]) : undefined,
          dateRange: query.startDate && query.endDate ? {
            start: new Date(query.startDate),
            end: new Date(query.endDate)
          } : undefined,
          durationRange: query.minDuration && query.maxDuration ? {
            min: Number(query.minDuration),
            max: Number(query.maxDuration)
          } : undefined,
          includeArchived: query.includeArchived === 'true',
          sortBy: query.sortBy || 'createdAt',
          sortOrder: query.sortOrder || 'desc',
          offset: Number(query.offset) || 0,
          limit: Math.min(Number(query.limit) || 50, 100) // Cap at 100 for safety
        };

        const sessions = await sessionManager.listSessions(criteria);
        const sanitizedSessions = sessions.map(sanitizeSession);

        // Get total count for pagination
        const totalCount = await sessionManager.listSessions({ ...criteria, offset: 0, limit: 10000 });

        return {
          success: true,
          data: {
            sessions: sanitizedSessions,
            pagination: {
              total: totalCount.length,
              offset: criteria.offset,
              limit: criteria.limit,
              hasMore: criteria.offset + criteria.limit < totalCount.length
            }
          }
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: {
            error: 'SessionListFailed',
            message: error instanceof Error ? error.message : 'Failed to list sessions',
            timestamp: new Date()
          }
        };
      }
    }, {
      query: t.Object({
        query: t.Optional(t.String()),
        status: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        projectId: t.Optional(t.String()),
        userId: t.Optional(t.String()),
        tags: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        minDuration: t.Optional(t.String()),
        maxDuration: t.Optional(t.String()),
        includeArchived: t.Optional(t.String()),
        sortBy: t.Optional(t.Union([
          t.Literal('createdAt'), t.Literal('updatedAt'), t.Literal('title'),
          t.Literal('duration'), t.Literal('stepCount')
        ])),
        sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
        offset: t.Optional(t.String()),
        limit: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            sessions: t.Array(SessionResponseSchema),
            pagination: PaginationSchema
          })
        }),
        400: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'List sessions',
        description: 'Retrieve a paginated list of sessions with optional filtering',
        tags: ['sessions']
      }
    })

    /**
     * GET /sessions/:id
     * Get session details by ID
     */
    .get('/:id', async ({ params, set, headers }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '') || headers['x-session-token'];
        let session: ManagedSession | null = null;

        if (token) {
          // Try to get session by token first
          session = await sessionManager.getSessionByToken(token);
        }

        // If no token or token lookup failed, try direct ID access
        if (!session) {
          session = await sessionManager.getSession(params.id);
        }

        if (!session) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found or access denied',
              timestamp: new Date()
            }
          };
        }

        return {
          success: true,
          data: {
            session: sanitizeSession(session),
            lastAccessed: session.lastAccessed,
            browserInstanceCount: session.browserInstances.size,
            isActive: session.browserInstances.size > 0
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'SessionRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve session',
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
            session: SessionResponseSchema,
            lastAccessed: t.Date(),
            browserInstanceCount: t.Number(),
            isActive: t.Boolean()
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
        summary: 'Get session details',
        description: 'Retrieve detailed information about a specific session',
        tags: ['sessions']
      }
    })

    /**
     * PUT /sessions/:id
     * Update session metadata
     */
    .put('/:id', async ({ params, body, set, headers }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '') || headers['x-session-token'];

        // Verify session access
        const existingSession = token
          ? await sessionManager.getSessionByToken(token)
          : await sessionManager.getSession(params.id);

        if (!existingSession || existingSession.id !== params.id) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found or access denied',
              timestamp: new Date()
            }
          };
        }

        // Validate status if provided
        const updateOptions: SessionUpdateOptions = { ...body };
        if (updateOptions.status) {
          updateOptions.status = validateSessionStatus(updateOptions.status);
        }

        const updatedSession = await sessionManager.updateSession(params.id, updateOptions);

        if (!updatedSession) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found',
              timestamp: new Date()
            }
          };
        }

        return {
          success: true,
          data: {
            session: sanitizeSession(updatedSession)
          }
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: {
            error: 'SessionUpdateFailed',
            message: error instanceof Error ? error.message : 'Failed to update session',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.String({ maxLength: 1000 })),
        status: t.Optional(t.Union([
          t.Literal('idle'), t.Literal('recording'), t.Literal('paused'),
          t.Literal('completed'), t.Literal('error')
        ])),
        settings: t.Optional(t.Pick(RecordingSettings, [
          'viewport', 'quality', 'recordConsoleLogs', 'recordNetworkRequests',
          'recordDomChanges', 'recordScrollPositions', 'recordUserInputs',
          'maskSensitiveData', 'maskedSelectors', 'maxDuration', 'autoSave', 'autoSaveInterval'
        ])),
        tags: t.Optional(t.Array(t.Object({
          id: t.String(),
          name: t.String(),
          color: t.Optional(t.String()),
          description: t.Optional(t.String())
        }))),
        metadata: t.Optional(t.Record(t.String(), t.Unknown())),
        updateNote: t.Optional(t.String({ maxLength: 500 }))
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            session: SessionResponseSchema
          })
        }),
        400: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        }),
        404: t.Object({
          success: t.Literal(false),
          error: ErrorResponseSchema
        })
      },
      detail: {
        summary: 'Update session',
        description: 'Update session metadata and settings',
        tags: ['sessions']
      }
    })

    /**
     * DELETE /sessions/:id
     * Delete a session
     */
    .delete('/:id', async ({ params, set, headers }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '') || headers['x-session-token'];

        // Verify session access
        const existingSession = token
          ? await sessionManager.getSessionByToken(token)
          : await sessionManager.getSession(params.id);

        if (!existingSession || existingSession.id !== params.id) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found or access denied',
              timestamp: new Date()
            }
          };
        }

        const deleted = await sessionManager.deleteSession(params.id);

        if (!deleted) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found',
              timestamp: new Date()
            }
          };
        }

        return {
          success: true,
          data: {
            message: 'Session deleted successfully'
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'SessionDeletionFailed',
            message: error instanceof Error ? error.message : 'Failed to delete session',
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
            message: t.String()
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
        summary: 'Delete session',
        description: 'Delete a session and all associated data',
        tags: ['sessions']
      }
    })

    /**
     * GET /sessions/:id/stats
     * Get session statistics
     */
    .get('/:id/stats', async ({ params, set, headers }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '') || headers['x-session-token'];

        // Verify session access
        const session = token
          ? await sessionManager.getSessionByToken(token)
          : await sessionManager.getSession(params.id);

        if (!session || session.id !== params.id) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found or access denied',
              timestamp: new Date()
            }
          };
        }

        // Calculate additional stats
        const currentDuration = session.stats.startTime
          ? (session.stats.endTime || new Date()).getTime() - session.stats.startTime.getTime()
          : 0;

        const averageStepTime = session.stats.stepCount > 0
          ? currentDuration / session.stats.stepCount
          : 0;

        return {
          success: true,
          data: {
            stats: session.stats,
            calculated: {
              currentDuration,
              averageStepTime,
              isActive: session.status === 'recording',
              browserInstances: session.browserInstances.size,
              totalWebSockets: Array.from(session.browserInstances.values())
                .reduce((sum, instance) => sum + instance.wsConnectionIds.size, 0)
            },
            limits: {
              maxDuration: session.settings.maxDuration,
              maxSteps: 200 // This should come from config
            }
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'StatsRetrievalFailed',
            message: error instanceof Error ? error.message : 'Failed to retrieve session statistics',
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
            stats: SessionStats,
            calculated: t.Object({
              currentDuration: t.Number(),
              averageStepTime: t.Number(),
              isActive: t.Boolean(),
              browserInstances: t.Number(),
              totalWebSockets: t.Number()
            }),
            limits: t.Object({
              maxDuration: t.Optional(t.Number()),
              maxSteps: t.Number()
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
        summary: 'Get session statistics',
        description: 'Retrieve detailed statistics and metrics for a session',
        tags: ['sessions']
      }
    })

    /**
     * POST /sessions/:id/join
     * Join an existing session
     */
    .post('/:id/join', async ({ params, set, headers, body }) => {
      try {
        const session = await sessionManager.getSession(params.id);

        if (!session) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found',
              timestamp: new Date()
            }
          };
        }

        // Add browser instance for the joining client
        const instanceId = body.instanceId || `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const added = await sessionManager.addBrowserInstance(params.id, {
          id: instanceId,
          launchOptions: body.launchOptions,
          clientInfo: {
            userAgent: headers['user-agent'],
            ip: headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown'
          }
        });

        if (!added) {
          set.status = 500;
          return {
            success: false,
            error: {
              error: 'JoinFailed',
              message: 'Failed to join session',
              timestamp: new Date()
            }
          };
        }

        // Generate new token for this connection
        const newToken = await sessionManager.regenerateToken(params.id);

        return {
          success: true,
          data: {
            sessionId: params.id,
            instanceId,
            token: newToken,
            sessionToken: session.token,
            settings: session.settings,
            message: 'Successfully joined session'
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'JoinFailed',
            message: error instanceof Error ? error.message : 'Failed to join session',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        instanceId: t.Optional(t.String()),
        launchOptions: t.Optional(t.Record(t.String(), t.Unknown()))
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            sessionId: t.String(),
            instanceId: t.String(),
            token: t.String(),
            sessionToken: t.String(),
            settings: RecordingSettings,
            message: t.String()
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
        summary: 'Join session',
        description: 'Join an existing recording session as a participant',
        tags: ['sessions']
      }
    })

    /**
     * POST /sessions/:id/launch
     * Launch browser for a session
     */
    .post('/:id/launch', async ({ params, set, headers, body }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '') || headers['x-session-token'];

        // Verify session access
        const session = token
          ? await sessionManager.getSessionByToken(token)
          : await sessionManager.getSession(params.id);

        if (!session || session.id !== params.id) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found or access denied',
              timestamp: new Date()
            }
          };
        }

        // Check if session can launch
        if (session.status === 'completed' || session.status === 'error') {
          set.status = 400;
          return {
            success: false,
            error: {
              error: 'SessionCannotLaunch',
              message: 'Cannot launch browser for completed or errored session',
              timestamp: new Date()
            }
          };
        }

        // Create browser instance
        const instanceId = body.instanceId || `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const added = await sessionManager.addBrowserInstance(params.id, {
          id: instanceId,
          launchOptions: {
            headless: body.headless ?? false,
            ...body.launchOptions
          },
          isActive: true
        });

        if (!added) {
          set.status = 500;
          return {
            success: false,
            error: {
              error: 'BrowserLaunchFailed',
              message: 'Failed to launch browser instance',
              timestamp: new Date()
            }
          };
        }

        // Update session status to recording if requested
        if (body.startRecording && session.status === 'idle') {
          await sessionManager.updateSession(params.id, { status: 'recording' });
        }

        return {
          success: true,
          data: {
            instanceId,
            launched: true,
            recording: body.startRecording ? session.status === 'recording' : false,
            settings: session.settings,
            wsEndpoint: `ws://localhost:3000/ws/${params.id}/${instanceId}`
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'BrowserLaunchFailed',
            message: error instanceof Error ? error.message : 'Failed to launch browser',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        instanceId: t.Optional(t.String()),
        headless: t.Optional(t.Boolean()),
        startRecording: t.Optional(t.Boolean()),
        launchOptions: t.Optional(t.Record(t.String(), t.Unknown()))
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            instanceId: t.String(),
            launched: t.Boolean(),
            recording: t.Boolean(),
            settings: RecordingSettings,
            wsEndpoint: t.String()
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
        summary: 'Launch browser',
        description: 'Launch a new browser instance for the session',
        tags: ['sessions']
      }
    })

    /**
     * POST /sessions/:id/close
     * Close browser for a session
     */
    .post('/:id/close', async ({ params, set, headers, body }) => {
      try {
        const token = headers['authorization']?.replace('Bearer ', '') || headers['x-session-token'];

        // Verify session access
        const session = token
          ? await sessionManager.getSessionByToken(token)
          : await sessionManager.getSession(params.id);

        if (!session || session.id !== params.id) {
          set.status = 404;
          return {
            success: false,
            error: {
              error: 'SessionNotFound',
              message: 'Session not found or access denied',
              timestamp: new Date()
            }
          };
        }

        // Close specific instance or all instances
        const instanceId = body.instanceId;
        let closedCount = 0;

        if (instanceId) {
          // Close specific instance
          const removed = await sessionManager.removeBrowserInstance(params.id, instanceId);
          if (removed) {
            closedCount = 1;
          }
        } else {
          // Close all instances
          const instances = Array.from(session.browserInstances.keys());
          for (const id of instances) {
            const removed = await sessionManager.removeBrowserInstance(params.id, id);
            if (removed) {
              closedCount++;
            }
          }
        }

        // Stop recording if requested
        if (body.stopRecording && session.status === 'recording') {
          await sessionManager.updateSession(params.id, { status: 'completed' });
        }

        return {
          success: true,
          data: {
            closed: true,
            instancesClosed: closedCount,
            recording: session.status,
            message: `Closed ${closedCount} browser instance(s)`
          }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            error: 'BrowserCloseFailed',
            message: error instanceof Error ? error.message : 'Failed to close browser',
            timestamp: new Date()
          }
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        instanceId: t.Optional(t.String()),
        stopRecording: t.Optional(t.Boolean()),
        force: t.Optional(t.Boolean())
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            closed: t.Boolean(),
            instancesClosed: t.Number(),
            recording: t.Union([
              t.Literal('idle'), t.Literal('recording'), t.Literal('paused'),
              t.Literal('completed'), t.Literal('error')
            ]),
            message: t.String()
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
        summary: 'Close browser',
        description: 'Close browser instance(s) for the session',
        tags: ['sessions']
      }
    });
}

/**
 * Export the session routes plugin for use in the main Elysia app
 */
export const sessionRoutes = createSessionRoutes();