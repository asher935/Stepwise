/**
 * Stepwise Server Entry Point
 *
 * Main server application that initializes the Elysia framework with
 * session management, export/import routes, and WebSocket support.
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { swagger } from '@elysiajs/swagger';
import { serverConfig } from './lib/env.js';
import { logger } from './lib/logger.js';
import { sessionRoutes } from './routes/session.js';
import { importRoutes } from './routes/import.js';
import { exportRoutes } from './routes/export.js';
import { SessionManager } from './services/SessionManager.js';
import { CDPBridge } from './services/CDPBridge.js';
import { Recorder } from './services/Recorder.js';
import { createWebSocketServer, type WSServer } from './ws/server.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Ensure exports directory exists
const exportsDir = join(process.cwd(), 'exports');
if (!existsSync(exportsDir)) {
  mkdirSync(exportsDir, { recursive: true });
  logger.info(`Created exports directory: ${exportsDir}`);
}

// Initialize services with proper configuration
const sessionManager = new SessionManager({
  maxSessions: serverConfig.maxSessions,
  idleTimeoutMs: serverConfig.idleTimeoutMs,
  cleanupIntervalMs: serverConfig.cleanupIntervalMs,
  enablePersistence: true,
  sessionTokenExpirationMs: serverConfig.sessionTokenExpirationMs
});

const cdpBridge = CDPBridge.getInstance({
  maxBrowserInstances: serverConfig.maxSessions,
  defaultViewport: {
    width: serverConfig.browserViewportWidth,
    height: serverConfig.browserViewportHeight
  },
  headless: serverConfig.nodeEnv === 'production',
  screencastOptions: {
    quality: serverConfig.screencastQuality,
    maxFps: serverConfig.screencastMaxFps,
    maxWidth: serverConfig.browserViewportWidth,
    maxHeight: serverConfig.browserViewportHeight
  }
});

const recorder = new Recorder({
  screenshot: {
    enabled: true,
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1080,
    highlightElements: true,
    highlightColor: '#ff0000'
  },
  sensitivity: {
    minStepInterval: 100,
    minScrollAmount: 10,
    recordRapidClicks: false,
    maxTypingDelay: 1000
  }
});

// Create WebSocket server with enhanced configuration
const wsServer = createWebSocketServer(
  sessionManager,
  cdpBridge,
  recorder,
  {
    path: '/ws',
    shareHttpServer: true,
    maxConnectionsPerUser: 5,
    messageRateLimit: 100,
    heartbeatInterval: 30000,
    connectionTimeout: 120000,
    maxMessageSize: 1024 * 1024,
    enableCompression: true,
    reconnection: {
      enabled: true,
      maxAttempts: 5,
      delay: 1000,
      backoffFactor: 2
    }
  }
);

/**
 * Create and configure the main Elysia application
 */
const app = new Elysia()
  // Store services in context for routes
  .decorate('services', {
    sessionManager,
    cdpBridge,
    recorder,
    wsServer
  })

  // Global CORS configuration with environment-specific settings
  .use(cors({
    origin: serverConfig.nodeEnv === 'production'
      ? false // Will need to configure specific origins in production
      : true, // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Token',
      'X-Requested-With'
    ],
    credentials: true,
    maxAge: 86400 // 24 hours
  }))

  // OpenAPI documentation
  .use(swagger({
    path: '/swagger',
    documentation: {
      info: {
        title: 'Stepwise API',
        version: '1.0.0',
        description: 'Browser recording session management API with import/export capabilities'
      },
      servers: [
        {
          url: `http://localhost:${serverConfig.port}`,
          description: 'Development server'
        }
      ],
      tags: [
        { name: 'sessions', description: 'Session management operations' },
        { name: 'export', description: 'Export operations for sessions' },
        { name: 'import', description: 'Import operations for guides' },
        { name: 'system', description: 'System health and information' }
      ]
    }
  }))

  // Request logging middleware with enhanced details
  .onRequest(({ request, set }: { request: Request; set: any }) => {
    const url = new URL(request.url);
    const { pathname, search } = url;
    const method = request.method;
    const timestamp = new Date().toISOString();

    // Skip logging for health checks and static assets in production
    if (serverConfig.nodeEnv === 'production' &&
        (pathname === '/health' || pathname.startsWith('/public/'))) {
      return;
    }

    logger.info(`Incoming request: ${method} ${pathname}${search}`, {
      timestamp,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') ||
          request.headers.get('x-real-ip') ||
          'unknown',
      contentLength: request.headers.get('content-length'),
      referer: request.headers.get('referer')
    });

    // Store start time for response timing
    (request as any).startTime = Date.now();
  })

  // Response timing middleware
  .onAfterHandle(({ request, set }: { request: Request; set: any }) => {
    const responseTime = Date.now() - (request as any).startTime;
    set.headers['X-Response-Time'] = `${responseTime}ms`;

    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        url: request.url,
        method: request.method,
        responseTime
      });
    }
  })

  // Enhanced health check endpoint with service status
  .get('/health', () => {
    const wsStats = wsServer.getStats();
    const sessionStats = sessionManager.getStats();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] || '1.0.0',
      environment: serverConfig.nodeEnv,
      server: 'stepwise-server',

      // Service health
      services: {
        sessionManager: {
          ...sessionStats,
          healthy: sessionStats.activeSessions >= 0
        },
        cdpBridge: {
          healthy: cdpBridge.isHealthy?.() || true,
          activeBrowsers: cdpBridge.getActiveBrowserCount?.() || 0
        },
        websocket: {
          ...wsStats,
          healthy: wsStats.isStarted
        }
      },

      // System resources
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };
  }, {
    detail: {
      summary: 'Health check',
      description: 'Check if the server and all services are running properly',
      tags: ['system']
    }
  })

  // API information endpoint with OpenAPI documentation reference
  .get('/api', () => {
    return {
      name: 'Stepwise API',
      version: process.env['npm_package_version'] || '1.0.0',
      description: 'Browser recording session management API',
      environment: serverConfig.nodeEnv,

      // Available endpoints
      endpoints: {
        sessions: {
          base: '/sessions',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'Session management operations'
        },
        export: {
          base: '/export',
          methods: ['GET', 'POST', 'DELETE'],
          description: 'Export sessions to various formats'
        },
        import: {
          base: '/import',
          methods: ['GET', 'POST', 'DELETE'],
          description: 'Import guides from various formats'
        },
        websocket: {
          url: `ws://localhost:${serverConfig.port}/ws`,
          protocol: 'WebSocket',
          description: 'Real-time session communication'
        },
        health: {
          url: '/health',
          methods: ['GET'],
          description: 'Server health status'
        }
      },

      // Documentation
      documentation: {
        swagger: '/swagger',
        openapi: '/openapi.json'
      },

      // Configuration limits
      limits: {
        maxSessions: serverConfig.maxSessions,
        maxStepsPerSession: serverConfig.maxStepsPerSession,
        sessionTimeout: serverConfig.idleTimeoutMs,
        maxFileSize: {
          export: '50MB',
          import: '100MB'
        }
      }
    };
  })

  // Session management routes
  .use(sessionRoutes)

  // Export routes
  .use(exportRoutes)

  // Import routes
  .use(importRoutes)

  // Static file serving for exports directory
  .use(staticPlugin({
    assets: exportsDir,
    prefix: '/exports/files',
    headers: {
      'Cache-Control': 'public, max-age=3600' // 1 hour cache
    }
  }))

  // Static file serving for public assets
  .use(staticPlugin({
    assets: 'public',
    prefix: '/public',
    headers: {
      'Cache-Control': serverConfig.nodeEnv === 'production'
        ? 'public, max-age=86400' // 24 hours in production
        : 'no-cache' // No cache in development
    }
  }))

  // Global error handler with enhanced logging
  .onError(({ error, code, set }) => {
    // Log the error with context
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    logger.error('Request error', {
      error: {
        message: errorMessage,
        stack: errorStack,
        name: errorName
      },
      code,
      timestamp: new Date().toISOString()
    });

    // Convert code to string for comparison
    const codeStr = String(code);

    // Determine status code based on error type
    if (codeStr === 'VALIDATION') {
      set.status = 400;
      return {
        success: false,
        error: {
          error: 'ValidationError',
          message: 'Invalid request data',
          details: errorMessage,
          timestamp: new Date()
        }
      };
    }

    if (codeStr === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: {
          error: 'NotFound',
          message: 'Resource not found',
          timestamp: new Date()
        }
      };
    }

    if (codeStr === 'UNAUTHORIZED') {
      set.status = 401;
      return {
        success: false,
        error: {
          error: 'Unauthorized',
          message: 'Authentication required',
          timestamp: new Date()
        }
      };
    }

    if (codeStr === 'FORBIDDEN') {
      set.status = 403;
      return {
        success: false,
        error: {
          error: 'Forbidden',
          message: 'Access denied',
          timestamp: new Date()
        }
      };
    }

    // Default error response
    set.status = 500;
    return {
      success: false,
      error: {
        error: 'InternalServerError',
        message: 'An unexpected error occurred',
        code,
        timestamp: new Date(),
        ...(serverConfig.nodeEnv === 'development' && {
          details: errorMessage,
          stack: errorStack
        })
      }
    };
  })

  // 404 handler
  .all('/*', ({ set, request }) => {
    set.status = 404;

    return {
      success: false,
      error: {
        error: 'NotFound',
        message: 'The requested resource was not found',
        timestamp: new Date(),
        path: new URL(request?.url || '').pathname
      }
    };
  });

// Startup logging with configuration details
logger.info('Starting Stepwise server...', {
  port: serverConfig.port,
  environment: serverConfig.nodeEnv,
  maxSessions: serverConfig.maxSessions,
  logLevel: serverConfig.logLevel,
  browser: {
    viewport: `${serverConfig.browserViewportWidth}x${serverConfig.browserViewportHeight}`,
    headless: serverConfig.nodeEnv === 'production'
  },
  screencast: {
    quality: serverConfig.screencastQuality,
    maxFps: serverConfig.screencastMaxFps
  },
  directories: {
    exports: exportsDir
  }
});

// Start HTTP server
const server = app.listen(serverConfig.port, async () => {
  const baseUrl = `http://localhost:${serverConfig.port}`;
  const wsUrl = `ws://localhost:${serverConfig.port}/ws`;

  logger.info('Server started successfully', {
    httpUrl: baseUrl,
    wsUrl: wsUrl,
    apiInfo: `${baseUrl}/api`,
    healthCheck: `${baseUrl}/health`,
    swagger: `${baseUrl}/swagger`,
    environment: serverConfig.nodeEnv
  });

  try {
    // Initialize WebSocket server after HTTP server is ready
    await wsServer.start(server);
    logger.info('WebSocket server initialized successfully');

    // Log successful startup
    logger.info('All services initialized and ready', {
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });

  } catch (error: any) {
    logger.error('Failed to initialize services', { error });
    await shutdown('INIT_ERROR');
  }
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, initiating graceful shutdown...`);

  const shutdownStart = Date.now();

  try {
    // Set timeout for graceful shutdown
    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds timeout

    // Stop WebSocket server
    logger.info('Stopping WebSocket server...');
    await wsServer.stop();
    logger.info('WebSocket server stopped');

    // Close all active sessions
    logger.info('Closing all sessions...');
    await sessionManager.closeAllSessions();
    logger.info('All sessions closed');

    // Close all browser instances
    logger.info('Closing all browsers...');
    if (typeof cdpBridge.closeAllBrowsers === 'function') {
      await cdpBridge.closeAllBrowsers();
    }
    logger.info('All browsers closed');

    // Stop HTTP server
    logger.info('Stopping HTTP server...');
    if (typeof server.stop === 'function') {
      server.stop();
      logger.info('HTTP server stopped');
    } else {
      logger.warn('Could not stop HTTP server: stop method not available');
    }

    // Clear timeout
    clearTimeout(shutdownTimeout);

    const shutdownDuration = Date.now() - shutdownStart;
    logger.info(`Graceful shutdown completed in ${shutdownDuration}ms`);

    process.exit(0);
  } catch (error: any) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection', { reason });
  shutdown('unhandledRejection');
});

// Export for testing or external use
export default app;
export {
  server,
  sessionManager,
  cdpBridge,
  recorder,
  wsServer
};