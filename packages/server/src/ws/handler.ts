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
export async function handleMessage(
  ws: ServerWebSocket<WSConnection>,
  _message: string | Buffer
): Promise<void> {
  const state = connections.get(ws);
  if (!state) return;
  
  const { sessionId } = ws.data;
  
  // Update session activity
  sessionManager.updateActivity(sessionId);
  
  // Parse message
  let parsed: ClientMessage;
  try {
    const text = typeof _message === 'string' ? _message : _message.toString();
    parsed = JSON.parse(text) as ClientMessage;
  } catch {
    send(ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Invalid message format',
    });
    return;
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