import type { SessionState, Step } from './index.js';

/** Client-to-server message types */
export type ClientMessageType =
  | 'input:mouse'
  | 'input:keyboard'
  | 'input:scroll'
  | 'navigate'
  | 'ping';

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

/** Client-to-server messages union */
export type ClientMessage =
  | MouseInputMessage
  | KeyboardInputMessage
  | ScrollInputMessage
  | NavigateMessage
  | PingMessage;

/** Server-to-client message types */
export type ServerMessageType =
  | 'frame'
  | 'step:new'
  | 'step:updated'
  | 'step:deleted'
  | 'session:state'
  | 'error'
  | 'pong'
  | 'cdp:error'
  | 'input:error'
  | 'rate:limited'
  | 'session:unhealthy';

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
  context?: Record<string, any>;
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

/** Server-to-client messages union */
export type ServerMessage =
  | FrameMessage
  | StepNewMessage
  | StepUpdatedMessage
  | StepDeletedMessage
  | SessionStateMessage
  | ErrorMessage
  | PongMessage
  | CDPErrorMessage
  | InputErrorMessage
  | RateLimitedMessage
  | SessionUnhealthyMessage;