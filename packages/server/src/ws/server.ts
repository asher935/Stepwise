/**
 * WebSocket Server Module for Stepwise
 *
 * This module sets up a WebSocket server that works alongside the Elysia HTTP server,
 * providing real-time communication capabilities for the Stepwise browser recording application.
 */

import { createServer as createHttpServer, Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { WSHandler, type WSHandlerConfig } from './handler.js';
import { SessionManager } from '../services/SessionManager.js';
import { CDPBridge } from '../services/CDPBridge.js';
import { Recorder } from '../services/Recorder.js';
import { logger } from '../lib/logger.js';

/**
 * WebSocket server configuration
 */
export interface WSServerConfig extends WSHandlerConfig {
  /** WebSocket server port (if separate from HTTP server) */
  port?: number;
  /** WebSocket server path */
  path?: string;
  /** Whether to share server with HTTP */
  shareHttpServer?: boolean;
}

/**
 * Default WebSocket server configuration
 */
const DEFAULT_WS_CONFIG: WSServerConfig = {
  port: 3001, // Default to port + 1
  path: '/ws',
  shareHttpServer: true,
  maxConnectionsPerUser: 5,
  messageRateLimit: 100,
  heartbeatInterval: 30000,
  connectionTimeout: 120000,
  maxMessageSize: 1024 * 1024, // 1MB
  enableCompression: true,
  reconnection: {
    enabled: true,
    maxAttempts: 5,
    delay: 1000,
    backoffFactor: 2
  }
};

/**
 * WebSocket Server class
 * Manages WebSocket server lifecycle and integration with services
 */
export class WSServer {
  /** WebSocket server instance */
  private wss: WebSocketServer;
  /** WebSocket handler */
  private handler: WSHandler;
  /** HTTP server instance (if sharing) */
  private httpServer?: HttpServer;
  /** Configuration */
  private config: WSServerConfig;
  /** Service instances */
  private sessionManager: SessionManager;
  private cdpBridge: CDPBridge;
  private recorder: Recorder;
  /** Server state */
  private isStarted = false;
  /** Event listeners */
  private listeners = new Map<string, Set<Function>>();

  constructor(
    sessionManager: SessionManager,
    cdpBridge: CDPBridge,
    recorder: Recorder,
    config: Partial<WSServerConfig> = {}
  ) {
    this.config = { ...DEFAULT_WS_CONFIG, ...config };
    this.sessionManager = sessionManager;
    this.cdpBridge = cdpBridge;
    this.recorder = recorder;

    // Create WebSocket server
    this.wss = new WebSocketServer({
      path: this.config.path,
      maxPayload: this.config.maxMessageSize,
      ...(!this.config.shareHttpServer && {
        port: this.config.port
      })
    });

    // Create handler
    this.handler = new WSHandler(
      this.wss,
      this.sessionManager,
      this.cdpBridge,
      this.recorder,
      this.config
    );

    // Setup error handling
    this.setupErrorHandling();

    logger.info('WebSocket server initialized', {
      config: this.config
    });
  }

  /**
   * Start the WebSocket server
   */
  public async start(httpServer?: HttpServer): Promise<void> {
    if (this.isStarted) {
      logger.warn('WebSocket server already started');
      return;
    }

    try {
      if (this.config.shareHttpServer && httpServer) {
        // Attach to existing HTTP server
        this.httpServer = httpServer;
        this.wss.handleUpgrade = (request: any, socket: any, head: any) => {
          if (request.url?.startsWith(this.config.path!)) {
            this.wss.emit('connection', socket.upgrade(request), request);
            socket.destroy();
          } else {
            // Let the HTTP server handle it
            this.httpServer.emit('upgrade', request, socket, head);
          }
        };

        // Listen for upgrade events
        httpServer.on('upgrade', (request: any, socket: any, head: any) => {
          if (request.url?.startsWith(this.config.path!)) {
            this.wss.handleUpgrade(request, socket, head, (ws: any) => {
              this.wss.emit('connection', ws, request);
            });
          }
        });

        logger.info('WebSocket server attached to HTTP server', {
          path: this.config.path
        });
      } else {
        // Standalone WebSocket server requires creating an HTTP server
        const { createServer } = await import('http');
        const standaloneServer = createServer();
        standaloneServer.listen(this.config.port!);

        // Attach WebSocket server to the standalone HTTP server
        this.wss = new WebSocketServer({
          server: standaloneServer,
          path: this.config.path
        });

        logger.info('WebSocket server started', {
          port: this.config.port,
          path: this.config.path
        });
      }

      this.isStarted = true;
      this.emit('started');

    } catch (error: any) {
      logger.error('Failed to start WebSocket server', { error });
      throw error;
    }
  }

  /**
   * Stop the WebSocket server
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    logger.info('Stopping WebSocket server...');

    // Close all connections
    this.handler.closeAllConnections();

    // Close the WebSocket server
    return new Promise((resolve) => {
      this.wss.close((error: any) => {
        if (error) {
          logger.error('Error closing WebSocket server', { error });
        } else {
          logger.info('WebSocket server stopped');
        }
        this.isStarted = false;
        resolve();
      });
    });
  }

  /**
   * Get the WebSocket handler
   */
  public getHandler(): WSHandler {
    return this.handler;
  }

  /**
   * Get server statistics
   */
  public getStats() {
    return {
      isStarted: this.isStarted,
      connections: this.handler.getConnectionCount(),
      config: this.config,
      uptime: process.uptime()
    };
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.wss.on('error', (error: Error) => {
      logger.error('WebSocket server error', { error });
      this.emit('error', error);
    });

    this.handler.on('error', (error: Error) => {
      logger.error('WebSocket handler error', { error });
      this.emit('error', error);
    });

    // Handle process termination
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, stopping WebSocket server...');
      await this.stop();
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, stopping WebSocket server...');
      await this.stop();
    });
  }

  /**
   * Event emitter methods
   */
  public on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  public off(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  private emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(...args);
        } catch (error: any) {
          logger.error('Error in WebSocket server event listener', {
            event,
            error
          });
        }
      }
    }
  }
}

/**
 * Create and initialize a WebSocket server instance
 */
export function createWebSocketServer(
  sessionManager: SessionManager,
  cdpBridge: CDPBridge,
  recorder: Recorder,
  config?: Partial<WSServerConfig>
): WSServer {
  return new WSServer(sessionManager, cdpBridge, recorder, config);
}