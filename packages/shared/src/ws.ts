import type { SessionState, Step } from './index.js';

/** Client-to-server message types */
export type ClientMessageType =
  | 'input:mouse'
  | 'input:keyboard'
  | 'input:scroll'
  | 'navigate'
  | 'settings:highlight'
  | 'session:extend'
  | 'ping'
  | 'replay:start'
  | 'replay:pause'
  | 'replay:resume'
  | 'replay:stop';

/** Mouse input message */
export interface MouseInputMessage {
  type: 'input:mouse';
  action: 'move' | 'down' | 'up' | 'click';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
}

/** Keyboard input message */
export interface KeyboardInputMessage {
  type: 'input:keyboard';
  action: 'down' | 'up' | 'press';
  key: string;
  code?: string;
  keyCode?: number;
  text?: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

/** Scroll input message */
export interface ScrollInputMessage {
  type: 'input:scroll';
  deltaX: number;
  deltaY: number;
  x: number;
  y: number;
}

/** Navigation message */
export interface NavigateMessage {
  type: 'navigate';
  action: 'goto' | 'back' | 'forward' | 'reload';
  url?: string;
}

/** Ping message */
export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

/** Highlight settings message */
export interface HighlightSettingsMessage {
  type: 'settings:highlight';
  color: string;
}

export interface SessionExtendMessage {
  type: 'session:extend';
}

/** Replay start message */
export interface ReplayStartMessage {
  type: 'replay:start';
  options?: import('./session.js').ReplayOptions;
}

/** Replay control message */
export interface ReplayControlMessage {
  type: 'replay:pause' | 'replay:resume' | 'replay:stop';
}

/** Client-to-server messages union */
export type ClientMessage =
  | MouseInputMessage
  | KeyboardInputMessage
  | ScrollInputMessage
  | NavigateMessage
  | HighlightSettingsMessage
  | SessionExtendMessage
  | PingMessage
  | ReplayStartMessage
  | ReplayControlMessage;

/** Element information for hover highlighting */
export interface ElementInfo {
  tagName: string;
  inputType?: string;
  fileUploadTarget?: boolean;
  id?: string;
  className?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** Server-to-client message types */
export type ServerMessageType =
  | 'frame'
  | 'step:new'
  | 'step:updated'
  | 'step:deleted'
  | 'session:state'
  | 'session:expiring'
  | 'error'
  | 'pong'
  | 'cdp:error'
  | 'input:error'
  | 'rate:limited'
  | 'session:unhealthy'
  | 'element:hover'
  | 'upload:requested'
  | 'replay:status'
  | 'replay:step:start'
  | 'replay:step:complete'
  | 'replay:error';

/** Screencast frame message */
export interface FrameMessage {
  type: 'frame';
  data: string;
  timestamp: number;
}

/** New step message */
export interface StepNewMessage {
  type: 'step:new';
  step: Step;
}

/** Step updated message */
export interface StepUpdatedMessage {
  type: 'step:updated';
  step: Step;
}

/** Step deleted message */
export interface StepDeletedMessage {
  type: 'step:deleted';
  stepId: string;
}

/** Session state update message */
export interface SessionStateMessage {
  type: 'session:state';
  state: SessionState;
}

export interface SessionExpiringMessage {
  type: 'session:expiring';
  remainingMs: number;
}

/** Error message */
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

/** Pong message */
export interface PongMessage {
  type: 'pong';
  timestamp: number;
  serverTime: number;
}

export interface CDPErrorMessage {
  type: 'cdp:error';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface InputErrorMessage {
  type: 'input:error';
  action: string;
  reason: string;
}

export interface RateLimitedMessage {
  type: 'rate:limited';
  action: string;
  retryAfter: number;
  message?: string;
}

export interface SessionUnhealthyMessage {
  type: 'session:unhealthy';
  sessionId: string;
  reason: string;
}

/** Element hover message */
export interface ElementHoverMessage {
  type: 'element:hover';
  element: ElementInfo | null;
}

export interface UploadRequestedMessage {
  type: 'upload:requested';
  x: number;
  y: number;
}

/** Replay status message */
export interface ReplayStatusMessage {
  type: 'replay:status';
  status: import('./session.js').ReplayStatus;
}

/** Replay step start message */
export interface ReplayStepStartMessage {
  type: 'replay:step:start';
  stepIndex: number;
  stepId: string;
}

/** Replay step complete message */
export interface ReplayStepCompleteMessage {
  type: 'replay:step:complete';
  stepIndex: number;
  stepId: string;
}

/** Replay error message */
export interface ReplayErrorMessage {
  type: 'replay:error';
  stepId?: string;
  error: string;
}

/** Server-to-client messages union */
export type ServerMessage =
  | FrameMessage
  | StepNewMessage
  | StepUpdatedMessage
  | StepDeletedMessage
  | SessionStateMessage
  | SessionExpiringMessage
  | ErrorMessage
  | PongMessage
  | CDPErrorMessage
  | InputErrorMessage
  | RateLimitedMessage
  | SessionUnhealthyMessage
  | ElementHoverMessage
  | UploadRequestedMessage
  | ReplayStatusMessage
  | ReplayStepStartMessage
  | ReplayStepCompleteMessage
  | ReplayErrorMessage;
