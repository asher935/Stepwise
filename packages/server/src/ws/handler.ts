/**
 * WebSocket Handler for Stepwise Real-time Communication
 *
 * This module handles WebSocket connections between clients and the Stepwise server,
 * providing real-time communication for session management, browser control,
 * and recording operations.
 */

import { EventEmitter } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import {
  type WSMessage,
  type ClientWSMessage,
  type ServerWSMessage,
  ClientMessageType,
  ServerMessageType,
  WSConnectionState,
  type WSConfig,
  type CreateSessionPayload,
  type JoinSessionPayload,
  type StartRecordingPayload,
  type StopRecordingPayload,
  type PauseRecordingPayload,
  type ResumeRecordingPayload,
  type BrowserActionPayload,
  type NavigatePayload,
  type CloseSessionPayload,
  type SessionCreatedPayload,
  type SessionUpdatedPayload,
  type SessionClosedPayload,
  type RecordingStartedPayload,
  type RecordingStoppedPayload,
  type RecordingPausedPayload,
  type RecordingResumedPayload,
  type StepCreatedPayload,
  type StepUpdatedPayload,
  type StepDeletedPayload,
  type ScreenshotCapturedPayload,
  type BrowserLaunchedPayload,
  type BrowserClosedPayload,
  type ErrorPayload,
  type Step,
  SessionStatus,
  isClientMessage,
  isServerMessage,
  isErrorMessage
} from '@stepwise/shared';
import { SessionManager } from '../services/SessionManager.js';
import { CDPBridge } from '../services/CDPBridge.js';
import { Recorder } from '../services/Recorder.js';
import { logger } from '../lib/logger.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { authenticateToken } from '../lib/auth.js';


/**
 * WebSocket request/response interfaces
 */
export interface WSRequest<T extends string, P = unknown> extends BaseWSMessage {
  type: T;
  payload: P;
}

export interface WSResponse<T extends string, P = unknown> extends BaseWSMessage {
  type: T;
  payload: P;
  correlationId: string;
}

export interface WSError extends BaseWSMessage {
  type: ServerMessageType.ERROR;
  payload: ErrorPayload;
}

export interface BaseWSMessage {
  id: string;
  type: string;
  timestamp: Date;
  correlationId?: string;
}

/**
 * WebSocket connection interface
 */
export interface WSConnection {
  /** Unique connection ID */
  id: string;
  /** WebSocket instance */
  ws: WebSocket;
  /** Authenticated user ID */
  userId?: string;
  /** Session IDs this connection is subscribed to */
  subscribedSessions: Set<string>;
  /** Connection state */
  state: WSConnectionState;
  /** Last heartbeat timestamp */
  lastHeartbeat: Date;
  /** Message rate limiter token bucket */
  rateLimitTokens: number;
  /** Last rate limit refill */
  lastRateLimitRefill: Date;
  /** Connection metadata */
  metadata: {
    /** Connection timestamp */
    connectedAt: Date;
    /** Client IP address */
    ip: string;
    /** User agent string */
    userAgent: string;
    /** Authentication token */
    token?: string;
  };
}

/**
 * WebSocket handler configuration
 */
export interface WSHandlerConfig {
  /** Maximum connections per user */
  maxConnectionsPerUser: number;
  /** Message rate limit (messages per second) */
  messageRateLimit: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval: number;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Maximum message size in bytes */
  maxMessageSize: number;
  /** Enable message compression */
  enableCompression: boolean;
  /** Reconnection settings */
  reconnection: {
    enabled: boolean;
    maxAttempts: number;
    delay: number;
    backoffFactor: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: WSHandlerConfig = {
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
 * WebSocket Handler class
 * Manages all WebSocket connections and message routing
 */
export class WSHandler extends EventEmitter {
  /** WebSocket server instance */
  private wss: WebSocketServer;
  /** Active connections by ID */
  private connections = new Map<string, WSConnection>();
  /** Connections by user ID */
  private userConnections = new Map<string, Set<string>>();
  /** Configuration */
  private config: WSHandlerConfig;
  /** Service instances */
  private sessionManager: SessionManager;
  private cdpBridge: CDPBridge;
  private recorder: Recorder;
  /** Heartbeat interval */
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    wss: WebSocketServer,
    sessionManager: SessionManager,
    cdpBridge: CDPBridge,
    recorder: Recorder,
    config: Partial<WSHandlerConfig> = {}
  ) {
    super();
    this.wss = wss;
    this.sessionManager = sessionManager;
    this.cdpBridge = cdpBridge;
    this.recorder = recorder;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Setup WebSocket server
    this.setupWSServer();

    // Start heartbeat
    this.startHeartbeat();

    // Setup service event listeners
    this.setupServiceListeners();

    logger.info('WebSocket handler initialized', {
      config: this.config
    });
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWSServer(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
      this.emit('error', error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    try {
      const connectionId = nanoid();
      const ip = request.socket?.remoteAddress || 'unknown';
      const userAgent = request.headers['user-agent'] || 'unknown';

      // Extract auth token from query params or headers
      const token = this.extractToken(request);

      // Authenticate if token provided
      let userId: string | undefined;
      if (token) {
        const authResult = await authenticateToken(token);
        if (authResult.success) {
          userId = authResult.userId;
        } else {
          logger.warn('WebSocket authentication failed', {
            connectionId,
            ip,
            reason: authResult.reason
          });
          this.sendError(ws, 'AUTH_FAILED', 'Authentication failed');
          ws.close(1008, 'Authentication failed');
          return;
        }
      }

      // Check connection limits
      if (userId && this.isAtConnectionLimit(userId)) {
        logger.warn('Connection limit exceeded', { userId, ip });
        this.sendError(ws, 'CONNECTION_LIMIT', 'Too many connections');
        ws.close(1008, 'Connection limit exceeded');
        return;
      }

      // Create connection object
      const connection: WSConnection = {
        id: connectionId,
        ws,
        userId,
        subscribedSessions: new Set(),
        state: WSConnectionState.OPEN,
        lastHeartbeat: new Date(),
        rateLimitTokens: this.config.messageRateLimit,
        lastRateLimitRefill: new Date(),
        metadata: {
          connectedAt: new Date(),
          ip,
          userAgent,
          token
        }
      };

      // Store connection
      this.connections.set(connectionId, connection);

      if (userId) {
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(connectionId);
      }

      // Setup WebSocket handlers
      this.setupConnectionHandlers(connection);

      logger.info('WebSocket connection established', {
        connectionId,
        userId,
        ip,
        userAgent
      });

      this.emit('connection', connection);

    } catch (error) {
      logger.error('Error handling WebSocket connection', { error });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Setup handlers for individual WebSocket connection
   */
  private setupConnectionHandlers(connection: WSConnection): void {
    const { ws } = connection;

    ws.on('message', async (data: Buffer) => {
      try {
        await this.handleMessage(connection, data);
      } catch (error) {
        logger.error('Error handling WebSocket message', {
          connectionId: connection.id,
          error
        });
        this.sendError(connection.ws, 'MESSAGE_ERROR', 'Failed to process message');
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(connection, code, reason.toString());
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket connection error', {
        connectionId: connection.id,
        error
      });
      this.handleDisconnection(connection, 1011, error.message);
    });

    ws.on('pong', () => {
      connection.lastHeartbeat = new Date();
    });

    // Set connection timeout
    setTimeout(() => {
      if (this.connections.has(connection.id)) {
        logger.warn('Connection timeout', { connectionId: connection.id });
        connection.ws.terminate();
      }
    }, this.config.connectionTimeout);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(connection: WSConnection, data: Buffer): Promise<void> {
    // Check rate limit
    if (!this.checkRateLimit(connection)) {
      this.sendError(connection.ws, 'RATE_LIMIT', 'Message rate limit exceeded');
      return;
    }

    // Parse message
    let message: WSMessage;
    try {
      const messageStr = data.toString('utf8');
      message = JSON.parse(messageStr);

      const shouldTrace = process.env['STEPWISE_TRACE_INPUT'] === '1';
      if (shouldTrace) {
        console.log('[WS] recv', message);
      }

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.sendError(connection.ws, 'INVALID_MESSAGE', 'Invalid message format');
        return;
      }
    } catch (error) {
      logger.warn('Failed to parse WebSocket message', {
        connectionId: connection.id,
        error
      });
      this.sendError(connection.ws, 'PARSE_ERROR', 'Failed to parse message');
      return;
    }

    // Log message
    logger.debug('WebSocket message received', {
      connectionId: connection.id,
      messageType: message.type,
      messageId: message.id
    });

    // Process client messages only
    if (!isClientMessage(message)) {
      this.sendError(connection.ws, 'UNEXPECTED_MESSAGE', 'Server messages not allowed');
      return;
    }

    // Route message based on type
    await this.routeMessage(connection, message as ClientWSMessage);
  }

  /**
   * Route message to appropriate handler
   */
  private async routeMessage(connection: WSConnection, message: ClientWSMessage): Promise<void> {
    try {
      switch (message.type) {
        case ClientMessageType.CREATE_SESSION:
          await this.handleCreateSession(connection, message as WSRequest<ClientMessageType.CREATE_SESSION, CreateSessionPayload>);
          break;

        case ClientMessageType.JOIN_SESSION:
          await this.handleJoinSession(connection, message as WSRequest<ClientMessageType.JOIN_SESSION, JoinSessionPayload>);
          break;

        case ClientMessageType.START_RECORDING:
          await this.handleStartRecording(connection, message as WSRequest<ClientMessageType.START_RECORDING, StartRecordingPayload>);
          break;

        case ClientMessageType.STOP_RECORDING:
          await this.handleStopRecording(connection, message as WSRequest<ClientMessageType.STOP_RECORDING, StopRecordingPayload>);
          break;

        case ClientMessageType.PAUSE_RECORDING:
          await this.handlePauseRecording(connection, message as WSRequest<ClientMessageType.PAUSE_RECORDING, PauseRecordingPayload>);
          break;

        case ClientMessageType.RESUME_RECORDING:
          await this.handleResumeRecording(connection, message as WSRequest<ClientMessageType.RESUME_RECORDING, ResumeRecordingPayload>);
          break;

        case ClientMessageType.BROWSER_ACTION:
          await this.handleBrowserAction(connection, message as WSRequest<ClientMessageType.BROWSER_ACTION, BrowserActionPayload>);
          break;

        case ClientMessageType.NAVIGATE:
          await this.handleNavigate(connection, message as WSRequest<ClientMessageType.NAVIGATE, NavigatePayload>);
          break;

        case ClientMessageType.CLOSE_SESSION:
          await this.handleCloseSession(connection, message as WSRequest<ClientMessageType.CLOSE_SESSION, CloseSessionPayload>);
          break;

        default:
          logger.warn('Unknown message type', {
            connectionId: connection.id,
            messageType: message.type
          });
          this.sendError(connection.ws, 'UNKNOWN_MESSAGE', 'Unknown message type');
      }
    } catch (error) {
      logger.error('Error routing message', {
        connectionId: connection.id,
        messageType: message.type,
        error
      });
      this.sendError(
        connection.ws,
        'HANDLER_ERROR',
        `Failed to handle ${message.type}`,
        { messageId: message.id }
      );
    }
  }

  /**
   * Handle CREATE_SESSION message
   */
  private async handleCreateSession(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.CREATE_SESSION, CreateSessionPayload>
  ): Promise<void> {
    const { payload } = message;

    // Create session
    const session = await this.sessionManager.createSession({
      id: payload.sessionId || uuidv4(),
      title: payload.title || 'New Recording Session',
      description: payload.description,
      tags: (payload.tags || []).map((tag, index) => typeof tag === 'string' ? { id: `tag-${index}`, name: tag } : tag),
      userId: connection.userId,
      viewport: payload.viewport || {
        width: 1280,
        height: 800
      },
      quality: payload.quality || {
        screenshotQuality: 80,
        maxScreenshotSize: {
          width: 1920,
          height: 1080
        }
      },
      recording: payload.recording || {
        captureNetwork: true,
        captureConsole: true,
        captureHar: false,
        autoScroll: false
      }
    });

    // Subscribe connection to session
    connection.subscribedSessions.add(session.id);

    // Send response
    const response: WSResponse<ServerMessageType.SESSION_CREATED, SessionCreatedPayload> = {
      id: nanoid(),
      type: ServerMessageType.SESSION_CREATED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        session,
        connectionId: connection.id
      }
    };

    this.sendMessage(connection, response);

    logger.info('Session created', {
      sessionId: session.id,
      connectionId: connection.id,
      userId: connection.userId
    });
  }

  /**
   * Handle JOIN_SESSION message
   */
  private async handleJoinSession(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.JOIN_SESSION, JoinSessionPayload>
  ): Promise<void> {
    const { payload } = message;

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session is joinable
    if (session.status === SessionStatus.COMPLETED) {
      this.sendError(
        connection.ws,
        'SESSION_CLOSED',
        'Cannot join closed session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Subscribe connection to session
    connection.subscribedSessions.add(session.id);

    // Add connection to session
    await this.sessionManager.addConnectionToSession(
      session.id,
      connection.id,
      payload.role || 'observer'
    );

    // Send current session state
    const response: WSResponse<ServerMessageType.SESSION_UPDATED, SessionUpdatedPayload> = {
      id: nanoid(),
      type: ServerMessageType.SESSION_UPDATED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        session,
        changes: ['connection_added']
      }
    };

    this.sendMessage(connection, response);

    logger.info('Joined session', {
      sessionId: session.id,
      connectionId: connection.id,
      role: payload.role
    });
  }

  /**
   * Handle START_RECORDING message
   */
  private async handleStartRecording(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.START_RECORDING, StartRecordingPayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session can start recording
    if (session.status !== SessionStatus.IDLE) {
      this.sendError(
        connection.ws,
        'INVALID_STATE',
        'Session cannot start recording in current state',
        { sessionId: payload.sessionId, status: session.status }
      );
      return;
    }

    // Start recording
    const startTime = new Date();
    await this.sessionManager.updateSessionStatus(session.id, SessionStatus.RECORDING);

    // Launch browser if needed
    let browserId = (session.metadata as any).browserId;
    if (!browserId) {
      const browser = await this.cdpBridge.launchBrowser({
        sessionId: session.id,
        viewport: session.settings.viewport,
        headless: false
      });

      browserId = browser.id;
      await this.sessionManager.setBrowserId(session.id, browserId);

      // Notify browser launch
      this.broadcastToSession(session.id, {
        id: nanoid(),
        type: ServerMessageType.BROWSER_LAUNCHED,
        timestamp: new Date(),
        payload: {
          sessionId: session.id,
          browser: {
            id: browser.id,
            type: browser.type,
            version: browser.version,
            userAgent: browser.userAgent,
            viewport: session.settings.viewport
          },
          currentUrl: browser.initialUrl
        }
      });
    }

    // Navigate to initial URL if provided
    if (payload.initialUrl) {
      await this.cdpBridge.navigate(browserId, payload.initialUrl);
    }

    // Start recorder
    await this.recorder.startRecording(session.id, browserId);

    // Notify recording started
    const response: WSResponse<ServerMessageType.RECORDING_STARTED, RecordingStartedPayload> = {
      id: nanoid(),
      type: ServerMessageType.RECORDING_STARTED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        sessionId: session.id,
        startedAt: startTime,
        initialUrl: payload.initialUrl
      }
    };

    this.broadcastToSession(session.id, response);

    logger.info('Recording started', {
      sessionId: session.id,
      connectionId: connection.id
    });
  }

  /**
   * Handle STOP_RECORDING message
   */
  private async handleStopRecording(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.STOP_RECORDING, StopRecordingPayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session is recording
    if (session.status !== SessionStatus.RECORDING) {
      this.sendError(
        connection.ws,
        'INVALID_STATE',
        'Session is not recording',
        { sessionId: payload.sessionId, status: session.status }
      );
      return;
    }

    // Stop recording
    const stopTime = new Date();
    const duration = stopTime.getTime() - (session.recordingStartedAt?.getTime() || 0);

    await this.sessionManager.updateSessionStatus(session.id, SessionStatus.COMPLETED);
    await this.recorder.stopRecording(session.id);

    // Get step count
    const steps = await this.recorder.getSteps(session.id);
    const stepCount = steps.length;

    // Notify recording stopped
    const response: WSResponse<ServerMessageType.RECORDING_STOPPED, RecordingStoppedPayload> = {
      id: nanoid(),
      type: ServerMessageType.RECORDING_STOPPED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        sessionId: session.id,
        stoppedAt: stopTime,
        reason: payload.reason || 'user',
        duration,
        stepCount
      }
    };

    this.broadcastToSession(session.id, response);

    logger.info('Recording stopped', {
      sessionId: session.id,
      connectionId: connection.id,
      reason: payload.reason,
      duration,
      stepCount
    });
  }

  /**
   * Handle PAUSE_RECORDING message
   */
  private async handlePauseRecording(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.PAUSE_RECORDING, PauseRecordingPayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session is recording
    if (session.status !== SessionStatus.RECORDING) {
      this.sendError(
        connection.ws,
        'INVALID_STATE',
        'Session is not recording',
        { sessionId: payload.sessionId, status: session.status }
      );
      return;
    }

    // Pause recording
    const pausedAt = new Date();
    await this.sessionManager.updateSessionStatus(session.id, SessionStatus.PAUSED);
    await this.recorder.pauseRecording(session.id);

    // Notify recording paused
    const response: WSResponse<ServerMessageType.RECORDING_PAUSED, RecordingPausedPayload> = {
      id: nanoid(),
      type: ServerMessageType.RECORDING_PAUSED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        sessionId: session.id,
        pausedAt,
        reason: payload.reason || 'user'
      }
    };

    this.broadcastToSession(session.id, response);

    logger.info('Recording paused', {
      sessionId: session.id,
      connectionId: connection.id,
      reason: payload.reason
    });
  }

  /**
   * Handle RESUME_RECORDING message
   */
  private async handleResumeRecording(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.RESUME_RECORDING, ResumeRecordingPayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session is paused
    if (session.status !== SessionStatus.PAUSED) {
      this.sendError(
        connection.ws,
        'INVALID_STATE',
        'Session is not paused',
        { sessionId: payload.sessionId, status: session.status }
      );
      return;
    }

    // Resume recording
    const resumedAt = new Date();
    const pauseDuration = resumedAt.getTime() - (session.recordingPausedAt?.getTime() || 0);

    await this.sessionManager.updateSessionStatus(session.id, SessionStatus.RECORDING);
    await this.recorder.resumeRecording(session.id);

    // Notify recording resumed
    const response: WSResponse<ServerMessageType.RECORDING_RESUMED, RecordingResumedPayload> = {
      id: nanoid(),
      type: ServerMessageType.RECORDING_RESUMED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        sessionId: session.id,
        resumedAt,
        pauseDuration
      }
    };

    this.broadcastToSession(session.id, response);

    logger.info('Recording resumed', {
      sessionId: session.id,
      connectionId: connection.id,
      pauseDuration
    });
  }

  /**
   * Handle BROWSER_ACTION message
   */
  private async handleBrowserAction(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.BROWSER_ACTION, BrowserActionPayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session has browser
    const browserId = (session.metadata as any).browserId;
    if (!browserId) {
      this.sendError(
        connection.ws,
        'NO_BROWSER',
        'Session has no browser instance',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Execute browser action via CDPBridge
    try {
      const result = await this.cdpBridge.executeAction(browserId, {
        type: payload.action,
        selector: payload.selector,
        data: payload.data,
        coordinates: payload.coordinates
      });

      // If recorder is active, it will automatically capture this as a step
      // through the CDP event listeners

      // If screenshot was captured, broadcast it
      if (payload.screenshot) {
        const screenshotMsg: WSResponse<ServerMessageType.SCREENSHOT_CAPTURED, ScreenshotCapturedPayload> = {
          id: nanoid(),
          type: ServerMessageType.SCREENSHOT_CAPTURED,
          timestamp: new Date(),
          payload: {
            data: payload.screenshot.data,
            dimensions: {
              width: payload.screenshot.width,
              height: payload.screenshot.height
            },
            format: 'png',
            sessionId: session.id,
            capturedAt: new Date()
          }
        };
        this.broadcastToSession(session.id, screenshotMsg);
      }

      logger.debug('Browser action executed', {
        sessionId: session.id,
        action: payload.action,
        connectionId: connection.id
      });

    } catch (error) {
      logger.error('Failed to execute browser action', {
        sessionId: session.id,
        action: payload.action,
        error
      });
      this.sendError(
        connection.ws,
        'ACTION_FAILED',
        'Failed to execute browser action',
        { action: payload.action, error: (error as Error).message }
      );
    }
  }

  /**
   * Handle NAVIGATE message
   */
  private async handleNavigate(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.NAVIGATE, NavigatePayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Check if session has browser
    const browserId = (session.metadata as any).browserId;
    if (!browserId) {
      this.sendError(
        connection.ws,
        'NO_BROWSER',
        'Session has no browser instance',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Navigate browser
    try {
      await this.cdpBridge.navigate(browserId, payload.url, {
        referrer: payload.referrer,
        waitUntil: payload.waitUntil || 'load'
      });

      logger.info('Browser navigated', {
        sessionId: session.id,
        url: payload.url,
        connectionId: connection.id
      });

    } catch (error) {
      logger.error('Failed to navigate browser', {
        sessionId: session.id,
        url: payload.url,
        error
      });
      this.sendError(
        connection.ws,
        'NAVIGATION_FAILED',
        'Failed to navigate',
        { url: payload.url, error: (error as Error).message }
      );
    }
  }

  /**
   * Handle CLOSE_SESSION message
   */
  private async handleCloseSession(
    connection: WSConnection,
    message: WSRequest<ClientMessageType.CLOSE_SESSION, CloseSessionPayload>
  ): Promise<void> {
    const { payload } = message;

    // Verify connection is subscribed to session
    if (!connection.subscribedSessions.has(payload.sessionId)) {
      this.sendError(
        connection.ws,
        'NOT_SUBSCRIBED',
        'Not subscribed to session',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Get session
    const session = await this.sessionManager.getSession(payload.sessionId);
    if (!session) {
      this.sendError(
        connection.ws,
        'SESSION_NOT_FOUND',
        'Session not found',
        { sessionId: payload.sessionId }
      );
      return;
    }

    // Close session
    const finalState = await this.sessionManager.closeSession(
      payload.sessionId,
      payload.reason || 'user'
    );

    // Clean up resources
    const browserId = (session.metadata as any).browserId;
    if (browserId) {
      await this.cdpBridge.closeBrowser(browserId);
    }
    await this.recorder.cleanupSession(payload.sessionId);

    // Remove connection from session
    connection.subscribedSessions.delete(payload.sessionId);

    // Notify session closed
    const response: WSResponse<ServerMessageType.SESSION_CLOSED, SessionClosedPayload> = {
      id: nanoid(),
      type: ServerMessageType.SESSION_CLOSED,
      timestamp: new Date(),
      correlationId: message.id,
      payload: {
        sessionId: payload.sessionId,
        reason: payload.reason || 'user',
        finalState
      }
    };

    this.broadcastToSession(payload.sessionId, response);

    logger.info('Session closed', {
      sessionId: payload.sessionId,
      connectionId: connection.id,
      reason: payload.reason
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(
    connection: WSConnection,
    code: number,
    reason: string
  ): void {
    logger.info('WebSocket disconnected', {
      connectionId: connection.id,
      userId: connection.userId,
      code,
      reason
    });

    // Remove connection
    this.connections.delete(connection.id);

    // Remove from user connections
    if (connection.userId && this.userConnections.has(connection.userId)) {
      const userConnSet = this.userConnections.get(connection.userId)!;
      userConnSet.delete(connection.id);
      if (userConnSet.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Unsubscribe from all sessions
    for (const sessionId of connection.subscribedSessions) {
      this.sessionManager.removeConnectionFromSession(sessionId, connection.id).catch((error) => {
        logger.error('Failed to remove connection from session', {
          sessionId,
          connectionId: connection.id,
          error
        });
      });
    }

    // Update connection state
    connection.state = WSConnectionState.CLOSED;

    // Emit disconnection event
    this.emit('disconnection', connection, code, reason);
  }

  /**
   * Setup event listeners for services
   */
  private setupServiceListeners(): void {
    // Session manager events
    this.sessionManager.on('stepCreated', (sessionId: string, step: Step) => {
      const message: WSResponse<ServerMessageType.STEP_CREATED, StepCreatedPayload> = {
        id: nanoid(),
        type: ServerMessageType.STEP_CREATED,
        timestamp: new Date(),
        payload: {
          step,
          sessionId: sessionId
        }
      };
      this.broadcastToSession(sessionId, message);
    });

    this.sessionManager.on('stepUpdated', (sessionId: string, step: Step, changes: string[]) => {
      const message: WSResponse<ServerMessageType.STEP_UPDATED, StepUpdatedPayload> = {
        id: nanoid(),
        type: ServerMessageType.STEP_UPDATED,
        timestamp: new Date(),
        payload: {
          step,
          sessionId: sessionId,
          changes
        }
      };
      this.broadcastToSession(sessionId, message);
    });

    this.sessionManager.on('stepDeleted', (sessionId: string, stepId: string, reason: string) => {
      const message: WSResponse<ServerMessageType.STEP_DELETED, StepDeletedPayload> = {
        id: nanoid(),
        type: ServerMessageType.STEP_DELETED,
        timestamp: new Date(),
        payload: {
          stepId,
          sessionId: sessionId,
          reason: reason as any
        }
      };
      this.broadcastToSession(sessionId, message);
    });

    // CDP Bridge events
    this.cdpBridge.on('screenshotCaptured', (sessionId: string, screenshot: any) => {
      const message: WSResponse<ServerMessageType.SCREENSHOT_CAPTURED, ScreenshotCapturedPayload> = {
        id: nanoid(),
        type: ServerMessageType.SCREENSHOT_CAPTURED,
        timestamp: new Date(),
        payload: {
          data: screenshot.data,
          dimensions: screenshot.dimensions,
          format: screenshot.format,
          sessionId: sessionId,
          capturedAt: new Date()
        }
      };
      this.broadcastToSession(sessionId, message);
    });

    this.cdpBridge.on('browser:closed', (sessionId: string, browserId: string, reason: string) => {
      const message: WSResponse<ServerMessageType.BROWSER_CLOSED, BrowserClosedPayload> = {
        id: nanoid(),
        type: ServerMessageType.BROWSER_CLOSED,
        timestamp: new Date(),
        payload: {
          sessionId: sessionId,
          browserId,
          reason: reason as any
        }
      };
      this.broadcastToSession(sessionId, message);
    });

    // Recorder events
    this.recorder.on('step:captured', (sessionId: string, step: any) => {
      const message: WSResponse<ServerMessageType.STEP_CREATED, StepCreatedPayload> = {
        id: nanoid(),
        type: ServerMessageType.STEP_CREATED,
        timestamp: new Date(),
        payload: {
          step,
          sessionId: sessionId
        }
      };
      this.broadcastToSession(sessionId, message);
    });
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const [connectionId, connection] of this.connections) {
        // Check for stale connections
        const staleMs = now.getTime() - connection.lastHeartbeat.getTime();
        if (staleMs > this.config.heartbeatInterval * 2) {
          logger.warn('Connection stale, terminating', {
            connectionId,
            staleMs
          });
          connection.ws.terminate();
          continue;
        }

        // Send ping
        try {
          connection.ws.ping();
        } catch (error) {
          logger.error('Failed to send ping', {
            connectionId,
            error
          });
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Extract authentication token from request
   */
  private extractToken(request: any): string | undefined {
    // Try query parameter
    const url = new URL(request.url || '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (token) return token;

    // Try header
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return undefined;
  }

  /**
   * Check if user is at connection limit
   */
  private isAtConnectionLimit(userId: string): boolean {
    const userConnSet = this.userConnections.get(userId);
    if (!userConnSet) return false;

    return userConnSet.size >= this.config.maxConnectionsPerUser;
  }

  /**
   * Check message rate limit
   */
  private checkRateLimit(connection: WSConnection): boolean {
    const now = new Date();
    const timeDiff = now.getTime() - connection.lastRateLimitRefill.getTime();

    // Refill tokens based on time elapsed
    if (timeDiff > 1000) {
      connection.rateLimitTokens = this.config.messageRateLimit;
      connection.lastRateLimitRefill = now;
    }

    // Check if has tokens
    if (connection.rateLimitTokens <= 0) {
      return false;
    }

    // Consume token
    connection.rateLimitTokens--;
    return true;
  }

  /**
   * Validate message structure
   */
  private validateMessage(message: any): boolean {
    return (
      message &&
      typeof message.id === 'string' &&
      typeof message.type === 'string' &&
      message.timestamp &&
      typeof message.payload === 'object'
    );
  }

  /**
   * Send message to specific connection
   */
  private sendMessage(connection: WSConnection, message: ServerWSMessage): void {
    if (connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      connection.ws.send(messageStr);

      logger.debug('WebSocket message sent', {
        connectionId: connection.id,
        messageType: message.type,
        messageId: message.id
      });
    } catch (error) {
      logger.error('Failed to send WebSocket message', {
        connectionId: connection.id,
        messageType: message.type,
        error
      });
    }
  }

  /**
   * Send error message to connection
   */
  private sendError(
    ws: WebSocket,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): void {
    const errorMessage: WSError = {
      id: nanoid(),
      type: ServerMessageType.ERROR,
      timestamp: new Date(),
      payload: {
        code,
        message,
        details
      }
    };

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorMessage));
      }
    } catch (error) {
      logger.error('Failed to send error message', { error });
    }
  }

  /**
   * Broadcast message to all connections subscribed to a session
   */
  public broadcastToSession(sessionId: string, message: ServerWSMessage): void {
    let sentCount = 0;

    for (const connection of this.connections.values()) {
      if (connection.subscribedSessions.has(sessionId)) {
        this.sendMessage(connection, message);
        sentCount++;
      }
    }

    logger.debug('Broadcast to session', {
      sessionId,
      messageType: message.type,
      sentCount,
      messageId: message.id
    });
  }

  /**
   * Get active connection count
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connections for user
   */
  public getUserConnections(userId: string): WSConnection[] {
    const connectionIds = this.userConnections.get(userId) || new Set();
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter(Boolean) as WSConnection[];
  }

  /**
   * Close all connections
   */
  public closeAllConnections(): void {
    for (const connection of this.connections.values()) {
      connection.ws.close(1001, 'Server shutdown');
    }
    this.connections.clear();
    this.userConnections.clear();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}