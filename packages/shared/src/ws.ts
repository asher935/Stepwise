/**
 * WebSocket Message Type Definitions for Stepwise Browser Recording
 *
 * This file contains comprehensive TypeScript interfaces and types for
 * WebSocket communication between the client and server in the Stepwise
 * browser recording application.
 */

import type { Session, SessionStatus } from './session';
import type { Step } from './step';

/**
 * Base WebSocket message interface with common fields
 */
export interface BaseWSMessage {
  /** Unique identifier for the message */
  id: string;
  /** Type of the message for discriminated union */
  type: string;
  /** Timestamp when the message was created */
  timestamp: Date;
  /** Optional correlation ID for request/response pairing */
  correlationId?: string;
}

/**
 * Client-to-Server Message Types
 */
export enum ClientMessageType {
  /** Request to create a new recording session */
  CREATE_SESSION = 'create_session',
  /** Request to join an existing session */
  JOIN_SESSION = 'join_session',
  /** Request to start recording */
  START_RECORDING = 'start_recording',
  /** Request to stop recording */
  STOP_RECORDING = 'stop_recording',
  /** Request to pause recording */
  PAUSE_RECORDING = 'pause_recording',
  /** Request to resume recording */
  RESUME_RECORDING = 'resume_recording',
  /** Browser action performed by user */
  BROWSER_ACTION = 'browser_action',
  /** Navigation request */
  NAVIGATE = 'navigate',
  /** Request to close session */
  CLOSE_SESSION = 'close_session'
}

/**
 * Server-to-Client Message Types
 */
export enum ServerMessageType {
  /** Response when session is created */
  SESSION_CREATED = 'session_created',
  /** Notification when session is updated */
  SESSION_UPDATED = 'session_updated',
  /** Notification when session is closed */
  SESSION_CLOSED = 'session_closed',
  /** Notification when recording starts */
  RECORDING_STARTED = 'recording_started',
  /** Notification when recording stops */
  RECORDING_STOPPED = 'recording_stopped',
  /** Notification when recording is paused */
  RECORDING_PAUSED = 'recording_paused',
  /** Notification when recording is resumed */
  RECORDING_RESUMED = 'recording_resumed',
  /** Notification when a new step is created */
  STEP_CREATED = 'step_created',
  /** Notification when a step is updated */
  STEP_UPDATED = 'step_updated',
  /** Notification when a step is deleted */
  STEP_DELETED = 'step_deleted',
  /** Notification when a screenshot is captured */
  SCREENSHOT_CAPTURED = 'screenshot_captured',
  /** Notification when browser is launched */
  BROWSER_LAUNCHED = 'browser_launched',
  /** Notification when browser is closed */
  BROWSER_CLOSED = 'browser_closed',
  /** Error message */
  ERROR = 'error'
}

/**
 * Payload interfaces for Client-to-Server messages
 */

export interface CreateSessionPayload {
  /** Optional session ID to use, server will generate if not provided */
  sessionId?: string;
  /** Optional title for the session */
  title?: string;
  /** Optional description for the session */
  description?: string;
  /** Optional tags for the session */
  tags?: string[];
  /** Browser viewport settings */
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    isLandscape?: boolean;
  };
  /** Quality settings */
  quality?: {
    screenshotQuality?: number;
    maxScreenshotSize?: {
      width: number;
      height: number;
    };
    videoQuality?: 'low' | 'medium' | 'high';
  };
  /** Recording settings */
  recording?: {
    captureNetwork?: boolean;
    captureConsole?: boolean;
    captureHar?: boolean;
    autoScroll?: boolean;
  };
}

export interface JoinSessionPayload {
  /** ID of the session to join */
  sessionId: string;
  /** Optional role of the joining client */
  role?: 'observer' | 'participant' | 'controller';
}

export interface StartRecordingPayload {
  /** ID of the session */
  sessionId: string;
  /** Optional delay before starting */
  delay?: number;
  /** Optional initial URL to navigate to */
  initialUrl?: string;
}

export interface StopRecordingPayload {
  /** ID of the session */
  sessionId: string;
  /** Optional reason for stopping */
  reason?: 'user' | 'error' | 'timeout' | 'completed';
}

export interface PauseRecordingPayload {
  /** ID of the session */
  sessionId: string;
  /** Optional reason for pausing */
  reason?: 'user' | 'system';
}

export interface ResumeRecordingPayload {
  /** ID of the session */
  sessionId: string;
}

export interface BrowserActionPayload {
  /** ID of the session */
  sessionId: string;
  /** Type of action */
  action: 'click' | 'type' | 'scroll' | 'hover' | 'drag' | 'keypress' | 'screenshot';
  /** Element selector or identifier */
  selector?: string;
  /** Action-specific data */
  data?: {
    /** For click actions */
    button?: 'left' | 'right' | 'middle';
    modifiers?: string[];
    /** For type actions */
    text?: string;
    clear?: boolean;
    submit?: boolean;
    /** For scroll actions */
    x?: number;
    y?: number;
    deltaX?: number;
    deltaY?: number;
    /** For drag actions */
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    /** For keypress actions */
    key?: string;
    code?: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  };
  /** Coordinates for the action */
  coordinates?: {
    x: number;
    y: number;
  };
  /** Screenshot data if capturing */
  screenshot?: {
    data: string; // base64
    width: number;
    height: number;
  };
}

export interface NavigatePayload {
  /** ID of the session */
  sessionId: string;
  /** URL to navigate to */
  url: string;
  /** Optional referrer */
  referrer?: string;
  /** Optional wait condition */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

export interface CloseSessionPayload {
  /** ID of the session to close */
  sessionId: string;
  /** Optional reason for closing */
  reason?: 'completed' | 'error' | 'user' | 'timeout';
}

/**
 * Payload interfaces for Server-to-Client messages
 */

export interface SessionCreatedPayload {
  /** The created session */
  session: Session;
  /** WebSocket connection ID */
  connectionId: string;
}

export interface SessionUpdatedPayload {
  /** The updated session */
  session: Session;
  /** List of changed fields */
  changes: string[];
}

export interface SessionClosedPayload {
  /** ID of the closed session */
  sessionId: string;
  /** Reason for closure */
  reason: 'completed' | 'error' | 'user' | 'timeout';
  /** Final session state */
  finalState?: {
    status: SessionStatus;
    duration: number;
    stepCount: number;
  };
}

export interface RecordingStartedPayload {
  /** ID of the session */
  sessionId: string;
  /** Timestamp when recording started */
  startedAt: Date;
  /** Initial URL if navigation occurred */
  initialUrl?: string;
}

export interface RecordingStoppedPayload {
  /** ID of the session */
  sessionId: string;
  /** Timestamp when recording stopped */
  stoppedAt: Date;
  /** Reason for stopping */
  reason: 'user' | 'error' | 'timeout' | 'completed';
  /** Total recording duration in milliseconds */
  duration: number;
  /** Total number of steps recorded */
  stepCount: number;
}

export interface RecordingPausedPayload {
  /** ID of the session */
  sessionId: string;
  /** Timestamp when paused */
  pausedAt: Date;
  /** Reason for pausing */
  reason: 'user' | 'system';
}

export interface RecordingResumedPayload {
  /** ID of the session */
  sessionId: string;
  /** Timestamp when resumed */
  resumedAt: Date;
  /** Total pause duration in milliseconds */
  pauseDuration: number;
}

export interface StepCreatedPayload {
  /** The created step */
  step: Step;
  /** ID of the session */
  sessionId: number;
}

export interface StepUpdatedPayload {
  /** The updated step */
  step: Step;
  /** ID of the session */
  sessionId: number;
  /** List of changed fields */
  changes: string[];
}

export interface StepDeletedPayload {
  /** ID of the deleted step */
  stepId: string;
  /** ID of the session */
  sessionId: number;
  /** Reason for deletion */
  reason: 'user' | 'system' | 'merge';
}

export interface ScreenshotCapturedPayload {
  /** Base64 encoded image data */
  data: string;
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Screenshot format */
  format: 'png' | 'jpeg';
  /** Associated step ID if applicable */
  stepId?: string;
  /** ID of the session */
  sessionId: number;
  /** Timestamp when captured */
  capturedAt: Date;
}

export interface BrowserLaunchedPayload {
  /** ID of the session */
  sessionId: number;
  /** Browser instance details */
  browser: {
    id: string;
    type: 'chromium' | 'firefox' | 'webkit';
    version: string;
    userAgent: string;
    viewport: {
      width: number;
      height: number;
    };
  };
  /** Current URL */
  currentUrl?: string;
}

export interface BrowserClosedPayload {
  /** ID of the session */
  sessionId: number;
  /** Browser instance ID */
  browserId: string;
  /** Reason for closure */
  reason: 'session_end' | 'error' | 'crash' | 'user';
}

export interface ErrorPayload {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Optional detailed error information */
  details?: Record<string, unknown>;
  /** ID of the session if error is session-specific */
  sessionId?: string;
  /** Stack trace if available */
  stack?: string;
}

/**
 * Request/Response correlation interfaces
 */

export interface WSRequest<T extends ClientMessageType, P = unknown> extends BaseWSMessage {
  type: T;
  payload: P;
}

export interface WSResponse<T extends ServerMessageType, P = unknown> extends BaseWSMessage {
  type: T;
  payload: P;
  /** Reference to the original request ID */
  correlationId: string;
}

export interface WSError extends BaseWSMessage {
  type: ServerMessageType.ERROR;
  payload: ErrorPayload;
}

/**
 * Discriminated union types for all WebSocket messages
 */

export type ClientWSMessage =
  | WSRequest<ClientMessageType.CREATE_SESSION, CreateSessionPayload>
  | WSRequest<ClientMessageType.JOIN_SESSION, JoinSessionPayload>
  | WSRequest<ClientMessageType.START_RECORDING, StartRecordingPayload>
  | WSRequest<ClientMessageType.STOP_RECORDING, StopRecordingPayload>
  | WSRequest<ClientMessageType.PAUSE_RECORDING, PauseRecordingPayload>
  | WSRequest<ClientMessageType.RESUME_RECORDING, ResumeRecordingPayload>
  | WSRequest<ClientMessageType.BROWSER_ACTION, BrowserActionPayload>
  | WSRequest<ClientMessageType.NAVIGATE, NavigatePayload>
  | WSRequest<ClientMessageType.CLOSE_SESSION, CloseSessionPayload>;

export type ServerWSMessage =
  | WSResponse<ServerMessageType.SESSION_CREATED, SessionCreatedPayload>
  | WSResponse<ServerMessageType.SESSION_UPDATED, SessionUpdatedPayload>
  | WSResponse<ServerMessageType.SESSION_CLOSED, SessionClosedPayload>
  | WSResponse<ServerMessageType.RECORDING_STARTED, RecordingStartedPayload>
  | WSResponse<ServerMessageType.RECORDING_STOPPED, RecordingStoppedPayload>
  | WSResponse<ServerMessageType.RECORDING_PAUSED, RecordingPausedPayload>
  | WSResponse<ServerMessageType.RECORDING_RESUMED, RecordingResumedPayload>
  | WSResponse<ServerMessageType.STEP_CREATED, StepCreatedPayload>
  | WSResponse<ServerMessageType.STEP_UPDATED, StepUpdatedPayload>
  | WSResponse<ServerMessageType.STEP_DELETED, StepDeletedPayload>
  | WSResponse<ServerMessageType.SCREENSHOT_CAPTURED, ScreenshotCapturedPayload>
  | WSResponse<ServerMessageType.BROWSER_LAUNCHED, BrowserLaunchedPayload>
  | WSResponse<ServerMessageType.BROWSER_CLOSED, BrowserClosedPayload>
  | WSError;

export type WSMessage = ClientWSMessage | ServerWSMessage;

/**
 * Type guards for message type discrimination
 */

export function isClientMessage(message: WSMessage): message is ClientWSMessage {
  return Object.values(ClientMessageType).includes(message.type as ClientMessageType);
}

export function isServerMessage(message: WSMessage): message is ServerWSMessage {
  return Object.values(ServerMessageType).includes(message.type as ServerMessageType);
}

export function isErrorMessage(message: WSMessage): message is WSError {
  return message.type === ServerMessageType.ERROR;
}

/**
 * WebSocket connection state
 */
export enum WSConnectionState {
  /** Connection is being established */
  CONNECTING = 'connecting',
  /** Connection is open and ready */
  OPEN = 'open',
  /** Connection is closing */
  CLOSING = 'closing',
  /** Connection is closed */
  CLOSED = 'closed',
  /** Connection encountered an error */
  ERROR = 'error'
}

/**
 * WebSocket configuration options
 */
export interface WSConfig {
  /** WebSocket server URL */
  url: string;
  /** Authentication token */
  token?: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Whether to use SSL/WSS */
  secure?: boolean;
  /** Custom headers to send with connection */
  headers?: Record<string, string>;
  /** Reconnection settings */
  reconnection?: {
    /** Whether to automatically reconnect */
    enabled: boolean;
    /** Number of reconnection attempts */
    maxAttempts?: number;
    /** Delay between attempts in milliseconds */
    delay?: number;
    /** Exponential backoff factor */
    backoffFactor?: number;
  };
}

/**
 * WebSocket event handler types
 */
export type WSMessageHandler = (message: WSMessage) => void;
export type WSErrorHandler = (error: Error) => void;
export type WSOpenHandler = (event: Event) => void;
export type WSCloseHandler = (event: CloseEvent) => void;
export type WSStateChangeHandler = (state: WSConnectionState) => void;