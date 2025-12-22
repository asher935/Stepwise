import type { ClientMessage, ServerMessage, CDPErrorMessage, InputErrorMessage, RateLimitedMessage } from '@stepwise/shared';
import { ERROR_CODES, WS_CLOSE_CODES } from '@stepwise/shared';
import type { ServerSession, RateLimitState, WSConnection } from '../types/session.js';
import type { ServerWebSocket } from 'bun';
import { CDPBridge } from '../services/CDPBridge.js';
import { Recorder } from '../services/Recorder.js';
import { sessionManager } from '../services/SessionManager.js';

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_INPUTS_PER_SECOND: 60,
  RESET_INTERVAL_MS: 1000,
};

// Active connections and their state
const connections = new Map<ServerWebSocket<WSConnection>, {
  bridge: CDPBridge | null;
  recorder: Recorder | null;
  rateLimit: RateLimitState;
}>();

type OutgoingMessage = ServerMessage | CDPErrorMessage | InputErrorMessage | RateLimitedMessage;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isModifiers(value: unknown): value is { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } {
  if (!isRecord(value)) return false;
  const { ctrl, alt, shift, meta } = value;
  if (ctrl !== undefined && typeof ctrl !== 'boolean') return false;
  if (alt !== undefined && typeof alt !== 'boolean') return false;
  if (shift !== undefined && typeof shift !== 'boolean') return false;
  if (meta !== undefined && typeof meta !== 'boolean') return false;
  return true;
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (typeof type !== 'string') return false;

  if (type === 'input:mouse') {
    const action = value.action;
    const x = value.x;
    const y = value.y;
    const button = value.button;
    if (action !== 'move' && action !== 'down' && action !== 'up' && action !== 'click') return false;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') return false;
    return true;
  }

  if (type === 'input:keyboard') {
    const action = value.action;
    const key = value.key;
    const text = value.text;
    const modifiers = value.modifiers;
    if (action !== 'down' && action !== 'up' && action !== 'press') return false;
    if (typeof key !== 'string') return false;
    if (text !== undefined && typeof text !== 'string') return false;
    if (modifiers !== undefined && !isModifiers(modifiers)) return false;
    return true;
  }

  if (type === 'input:scroll') {
    const { deltaX, deltaY, x, y } = value;
    if (typeof deltaX !== 'number' || typeof deltaY !== 'number') return false;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    return true;
  }

  if (type === 'navigate') {
    const action = value.action;
    const url = value.url;
    if (action !== 'goto' && action !== 'back' && action !== 'forward' && action !== 'reload') return false;
    if (url !== undefined && typeof url !== 'string') return false;
    return true;
  }

  if (type === 'ping') {
    const timestamp = value.timestamp;
    if (typeof timestamp !== 'number') return false;
    return true;
  }

  return false;
}

function unwrapClientMessage(value: unknown): ClientMessage | null {
  if (isClientMessage(value)) return value;
  if (!isRecord(value)) return null;
  if (value.type !== 'BROWSER_ACTION') return null;
  const payload = value.payload;
  if (!isClientMessage(payload)) return null;
  return payload;
}

/**
 * Sends a message to a WebSocket client
 */
function send(ws: ServerWebSocket<WSConnection>, message: OutgoingMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error('[WS] Send error:', error);
  }
}

/**
 * Broadcasts a message to all connections for a session
 */
function broadcastToSession(sessionId: string, message: ServerMessage): void {
  for (const [ws, _state] of connections) {
    if (ws.data.sessionId === sessionId) {
      send(ws, message);
    }
  }
}

/**
 * Checks rate limit for a connection
 */
function checkRateLimit(state: RateLimitState): boolean {
  const now = Date.now();
  
  // Reset counter if interval passed
  if (now - state.lastReset > RATE_LIMIT.RESET_INTERVAL_MS) {
    state.inputCount = 0;
    state.lastReset = now;
  }
  
  // Check if under limit
  if (state.inputCount >= RATE_LIMIT.MAX_INPUTS_PER_SECOND) {
    return false;
  }
  
  state.inputCount++;
  return true;
}

/**
 * Handles WebSocket open
 */
export async function handleOpen(ws: ServerWebSocket<WSConnection>): Promise<void> {
  const { sessionId, token } = ws.data;
  
  // Validate session and token
  if (!sessionManager.validateToken(sessionId, token)) {
    send(ws, {
      type: 'error',
      code: ERROR_CODES.INVALID_TOKEN,
      message: 'Invalid session token',
    });
    ws.close(WS_CLOSE_CODES.UNAUTHORIZED);
    return;
  }
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    send(ws, {
      type: 'error',
      code: ERROR_CODES.SESSION_NOT_FOUND,
      message: 'Session not found',
    });
    ws.close(WS_CLOSE_CODES.SESSION_NOT_FOUND);
    return;
  }
  
  // Initialize connection state
  const state = {
    bridge: null as CDPBridge | null,
    recorder: null as Recorder | null,
    rateLimit: { inputCount: 0, lastReset: Date.now() },
  };
  
  connections.set(ws, state);
  
  // If session is active, set up CDP bridge and recorder
  if (session.status === 'active' && session.cdp && session.page) {
    await setupBridgeAndRecorder(ws, session, state);
  }
  
  // Send initial session state
  const sessionState = sessionManager.getSessionState(sessionId);
  if (sessionState) {
    send(ws, { type: 'session:state', state: sessionState });
  }
  
  console.log(`[WS] Client connected to session ${sessionId}`);
}

/**
 * Sets up CDP bridge and recorder for a connection
 */
async function setupBridgeAndRecorder(
  ws: ServerWebSocket<WSConnection>,
  session: ServerSession,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; rateLimit: RateLimitState }
): Promise<void> {
  // Create CDP bridge
  const bridge = new CDPBridge({
    session,
    onFrame: (data, timestamp) => {
      send(ws, { type: 'frame', data, timestamp });
    },
    onNavigation: (url, title) => {
      const sessionState = sessionManager.getSessionState(session.id);
      if (sessionState) {
        send(ws, { type: 'session:state', state: sessionState });
      }
    },
    onError: (error) => {
      send(ws, {
        type: 'cdp:error',
        code: error.code,
        message: error.message,
        context: error.context,
      });
    },
  });
  
  // Create recorder
  const recorder = new Recorder({
    session,
    cdpBridge: bridge,
  });
  
  // Set up step event handlers
  recorder.on('step:created', (step) => {
    broadcastToSession(session.id, { type: 'step:new', step });
  });
  
  recorder.on('step:updated', (step) => {
    broadcastToSession(session.id, { type: 'step:updated', step });
  });
  
  recorder.on('step:deleted', (step) => {
    broadcastToSession(session.id, { type: 'step:deleted', stepId: step.id });
  });
  
  // Start screencast
  await bridge.startScreencast();
  
  state.bridge = bridge;
  state.recorder = recorder;
}

/**
 * Handles WebSocket message
 */
function decodeMessage(value: unknown): string | unknown {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }
  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(value));
  }
  if (typeof Buffer !== 'undefined' && value instanceof Buffer) {
    return value.toString();
  }
  if (isRecord(value) && 'data' in value) {
    return decodeMessage(value.data);
  }
  return value;
}

export async function handleMessage(
  ws: ServerWebSocket<WSConnection>,
  _message: unknown
): Promise<void> {
  const state = connections.get(ws);
  if (!state) return;
  
  const { sessionId } = ws.data;
  
  // Update session activity
  sessionManager.updateActivity(sessionId);
  
  // Parse message
  let parsed: ClientMessage | null;
  try {
    const decoded = decodeMessage(_message);
    if (typeof decoded === 'string') {
      parsed = unwrapClientMessage(JSON.parse(decoded) as unknown);
    } else {
      parsed = unwrapClientMessage(decoded);
    }
  } catch {
    console.warn('[WS] Failed to parse message', {
      sessionId,
    });
    send(ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Invalid message format',
    });
    return;
  }
  if (!parsed) {
    send(ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Invalid message format',
    });
    return;
  }

  if (
    parsed.type === 'ping' ||
    parsed.type === 'input:keyboard' ||
    parsed.type === 'input:scroll' ||
    (parsed.type === 'input:mouse' && parsed.action !== 'move')
  ) {
    console.log('[WS] Received action', parsed);
  }
  
  // Handle message types
  switch (parsed.type) {
    case 'ping':
      send(ws, {
        type: 'pong',
        timestamp: parsed.timestamp,
        serverTime: Date.now(),
      });
      break;
      
    case 'input:mouse':
      await handleMouseInput(ws, state, parsed);
      break;
      
    case 'input:keyboard':
      await handleKeyboardInput(ws, state, parsed);
      break;
      
    case 'input:scroll':
      await handleScrollInput(ws, state, parsed);
      break;
      
    case 'navigate':
      await handleNavigate(ws, state, parsed);
      break;
      
    default:
      send(ws, {
        type: 'error',
        code: 'UNKNOWN_MESSAGE',
        message: `Unknown message type`,
      });
  }
}

/**
 * Handles mouse input
 */
async function handleMouseInput(
  ws: ServerWebSocket<WSConnection>,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; rateLimit: RateLimitState },
  message: { type: 'input:mouse'; action: string; x: number; y: number; button?: string }
): Promise<void> {
  if (!state.bridge || !state.recorder) return;
  
  // Rate limit check
  if (!checkRateLimit(state.rateLimit)) {
    send(ws, {
      type: 'rate:limited',
      action: 'mouse',
      retryAfter: RATE_LIMIT.RESET_INTERVAL_MS - (Date.now() - state.rateLimit.lastReset),
      message: 'Too many mouse inputs. Please slow down.'
    });
    return;
  }
  
  // Validate CDP session health before proceeding
  if (!(await state.bridge.isCDPHealthy())) {
    send(ws, {
      type: 'cdp:error',
      code: 'SESSION_UNHEALTHY',
      message: 'Browser session is not responding. Please refresh the page or try again.',
      context: { action: 'mouse', mouseAction: message.action }
    });
    return;
  }
  
  const { action, x, y, button = 'left' } = message;
  const btn = button as 'left' | 'right' | 'middle';
  
  try {
    switch (action) {
      case 'move':
        await state.bridge.sendMouseInput('move', x, y, btn);
        break;
        
      case 'down':
        await state.bridge.sendMouseInput('down', x, y, btn);
        break;
        
      case 'up':
        await state.bridge.sendMouseInput('up', x, y, btn);
        break;
        
      case 'click':
        await state.bridge.click(x, y, btn);
        // Record click action
        await state.recorder.recordClick(x, y, btn);
        break;
    }
  } catch (error) {
    send(ws, {
      type: 'input:error',
      action: `mouse:${action}`,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Handles keyboard input
 */
async function handleKeyboardInput(
  ws: ServerWebSocket<WSConnection>,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; rateLimit: RateLimitState },
  message: { 
    type: 'input:keyboard'; 
    action: string; 
    key: string; 
    text?: string;
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean };
  }
): Promise<void> {
  if (!state.bridge || !state.recorder) return;
  
  const { action, key, text, modifiers } = message;
  
  // Rate limit check
  if (!checkRateLimit(state.rateLimit)) {
    send(ws, {
      type: 'rate:limited',
      action: 'keyboard',
      retryAfter: RATE_LIMIT.RESET_INTERVAL_MS - (Date.now() - state.rateLimit.lastReset),
      message: 'Too many keyboard inputs. Please slow down.'
    });
    return;
  }
  
  // Validate CDP session health before proceeding
  if (!(await state.bridge.isCDPHealthy())) {
    send(ws, {
      type: 'cdp:error',
      code: 'SESSION_UNHEALTHY',
      message: 'Browser session is not responding. Please refresh the page or try again.',
      context: { action: 'keyboard', keyAction: action, key }
    });
    return;
  }
  
  try {
    if (action === 'down') {
      await state.bridge.sendKeyboardInput('down', key, text, modifiers);
      // Record typing
      if (text) {
        await state.recorder.recordKeyInput(key, text);
      }
    } else if (action === 'up') {
      await state.bridge.sendKeyboardInput('up', key, undefined, modifiers);
    } else if (action === 'press') {
      await state.bridge.sendKeyboardInput('down', key, text, modifiers);
      await state.bridge.sendKeyboardInput('up', key, undefined, modifiers);
      if (text) {
        await state.recorder.recordKeyInput(key, text);
      }
    }
  } catch (error) {
    send(ws, {
      type: 'input:error',
      action: `keyboard:${action}`,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Handles scroll input
 */
async function handleScrollInput(
  ws: ServerWebSocket<WSConnection>,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; rateLimit: RateLimitState },
  message: { type: 'input:scroll'; deltaX: number; deltaY: number; x: number; y: number }
): Promise<void> {
  if (!state.bridge || !state.recorder) return;
  
  const { deltaX, deltaY, x, y } = message;
  
  // Rate limit check (less strict for scroll)
  if (!checkRateLimit(state.rateLimit)) {
    send(ws, {
      type: 'rate:limited',
      action: 'scroll',
      retryAfter: RATE_LIMIT.RESET_INTERVAL_MS - (Date.now() - state.rateLimit.lastReset),
      message: 'Too many scroll inputs. Please slow down.'
    });
    return;
  }
  
  // Validate CDP session health before proceeding
  if (!(await state.bridge.isCDPHealthy())) {
    send(ws, {
      type: 'cdp:error',
      code: 'SESSION_UNHEALTHY',
      message: 'Browser session is not responding. Please refresh the page or try again.',
      context: { action: 'scroll', deltaX, deltaY }
    });
    return;
  }
  
  try {
    await state.bridge.scroll(x, y, deltaX, deltaY);
    await state.recorder.recordScroll(deltaX, deltaY);
  } catch (error) {
    send(ws, {
      type: 'input:error',
      action: 'scroll',
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Handles navigation commands
 */
async function handleNavigate(
  ws: ServerWebSocket<WSConnection>,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; rateLimit: RateLimitState },
  message: { type: 'navigate'; action: string; url?: string }
): Promise<void> {
  if (!state.bridge || !state.recorder) return;
  
  const { action, url } = message;
  
  // Validate CDP session health before proceeding
  if (!(await state.bridge.isCDPHealthy())) {
    send(ws, {
      type: 'cdp:error',
      code: 'SESSION_UNHEALTHY',
      message: 'Browser session is not responding. Please refresh the page or try again.',
      context: { action: 'navigate', navigateAction: action, url }
    });
    return;
  }
  
  const session = sessionManager.getSession(ws.data.sessionId);
  const fromUrl = session?.url ?? '';
  
  try {
    switch (action) {
      case 'goto':
        if (url) {
          await state.bridge.navigate(url);
          await state.recorder.recordNavigation(fromUrl, url);
        }
        break;
        
      case 'back':
        await state.bridge.goBack();
        break;
        
      case 'forward':
        await state.bridge.goForward();
        break;
        
      case 'reload':
        await state.bridge.reload();
        break;
    }
    
    // Send updated session state
    const sessionState = sessionManager.getSessionState(ws.data.sessionId);
    if (sessionState) {
      send(ws, { type: 'session:state', state: sessionState });
    }
  } catch (error) {
    send(ws, {
      type: 'input:error',
      action: `navigate:${action}`,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Handles WebSocket close
 */
export async function handleClose(ws: ServerWebSocket<WSConnection>): Promise<void> {
  const state = connections.get(ws);
  if (state) {
    // Cleanup bridge and recorder
    if (state.bridge) {
      await state.bridge.cleanup();
    }
    if (state.recorder) {
      await state.recorder.cleanup();
    }
    connections.delete(ws);
  }
  
  console.log(`[WS] Client disconnected from session ${ws.data.sessionId}`);
}

/**
 * Gets all active connections for a session
 */
export function getSessionConnections(sessionId: string): number {
  let count = 0;
  for (const [ws, _] of connections) {
    if (ws.data.sessionId === sessionId) {
      count++;
    }
  }
  return count;
}

/**
 * Notifies a session that it has started (to set up bridges)
 */
export async function notifySessionStarted(sessionId: string): Promise<void> {
  const session = sessionManager.getSession(sessionId);
  if (!session || session.status !== 'active') return;
  
  for (const [ws, state] of connections) {
    if (ws.data.sessionId === sessionId && !state.bridge) {
      await setupBridgeAndRecorder(ws, session, state);
    }
  }
}
