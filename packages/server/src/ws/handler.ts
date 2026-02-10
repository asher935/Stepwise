import type { ClientMessage, ServerMessage, CDPErrorMessage, InputErrorMessage, RateLimitedMessage } from '@stepwise/shared';
import type { ReplayStatusMessage, ReplayStepStartMessage, ReplayStepCompleteMessage, ReplayErrorMessage } from '@stepwise/shared';
import { ERROR_CODES, WS_CLOSE_CODES } from '@stepwise/shared';
import type { ServerSession, RateLimitState, WSConnection } from '../types/session.js';
import type { ServerWebSocket } from 'bun';
import { CDPBridge } from '../services/CDPBridge.js';
import { Recorder } from '../services/Recorder.js';
import { ReplayService } from '../services/ReplayService.js';
import { sessionManager } from '../services/SessionManager.js';

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_INPUTS_PER_SECOND: 60,
  RESET_INTERVAL_MS: 1000,
};

// Element hover throttling configuration
const HOVER_THROTTLE = {
  MIN_INTERVAL_MS: 67, // ~15 updates per second
};

// Active connections and their state
const connections = new Map<ServerWebSocket<WSConnection>, {
  bridge: CDPBridge | null;
  recorder: Recorder | null;
  replayService: ReplayService | null;
  rateLimit: RateLimitState;
  lastHoverUpdate: number;
}>();

function getConnectionIdentity(ws: ServerWebSocket<WSConnection>): { sessionId: string; token: string } | null {
  const data = ws.data as WSConnection & {
    query?: { sessionId?: string; token?: string };
  };

  const sessionId = data?.sessionId ?? data?.query?.sessionId;
  const token = data?.token ?? data?.query?.token;

  if (!sessionId || !token) {
    return null;
  }

  return { sessionId, token };
}

function resolveConnectionState(
  ws: ServerWebSocket<WSConnection>
): {
  socket: ServerWebSocket<WSConnection>;
  state: {
    bridge: CDPBridge | null;
    recorder: Recorder | null;
    replayService: ReplayService | null;
    rateLimit: RateLimitState;
    lastHoverUpdate: number;
  };
} | null {
  const direct = connections.get(ws);
  if (direct) {
    return { socket: ws, state: direct };
  }

  const identity = getConnectionIdentity(ws);
  if (!identity) {
    return null;
  }

  for (const [candidateSocket, candidateState] of connections) {
    const candidateIdentity = getConnectionIdentity(candidateSocket);
    if (!candidateIdentity) {
      continue;
    }
    if (
      candidateIdentity.sessionId === identity.sessionId &&
      candidateIdentity.token === identity.token
    ) {
      return { socket: candidateSocket, state: candidateState };
    }
  }

  return null;
}

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

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value)) return false;
  const type = value['type'];
  if (typeof type !== 'string') return false;

  if (type === 'input:mouse') {
    const action = value['action'];
    const x = value['x'];
    const y = value['y'];
    const button = value['button'];
    if (action !== 'move' && action !== 'down' && action !== 'up' && action !== 'click') return false;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') return false;
    return true;
  }

  if (type === 'input:keyboard') {
    const action = value['action'];
    const key = value['key'];
    const text = value['text'];
    const code = value['code'];
    const keyCode = value['keyCode'];
    const modifiers = value['modifiers'];
    if (action !== 'down' && action !== 'up' && action !== 'press') return false;
    if (typeof key !== 'string') return false;
    if (text !== undefined && typeof text !== 'string') return false;
    if (code !== undefined && typeof code !== 'string') return false;
    if (keyCode !== undefined && typeof keyCode !== 'number') return false;
    if (modifiers !== undefined && !isModifiers(modifiers)) return false;
    return true;
  }

  if (type === 'input:scroll') {
    const deltaX = value['deltaX'];
    const deltaY = value['deltaY'];
    const x = value['x'];
    const y = value['y'];
    if (typeof deltaX !== 'number' || typeof deltaY !== 'number') return false;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    return true;
  }

  if (type === 'navigate') {
    const action = value['action'];
    const url = value['url'];
    if (action !== 'goto' && action !== 'back' && action !== 'forward' && action !== 'reload') return false;
    if (url !== undefined && typeof url !== 'string') return false;
    return true;
  }

  if (type === 'settings:highlight') {
    const color = value['color'];
    if (typeof color !== 'string' || !isHexColor(color)) return false;
    return true;
  }

  if (type === 'ping') {
    const timestamp = value['timestamp'];
    if (typeof timestamp !== 'number') return false;
    return true;
  }

  if (type === 'replay:start') {
    const options = value['options'];
    if (options !== undefined) {
      if (typeof options !== 'object' || options === null) return false;
      const opts = options as { speed?: unknown; stopOnError?: unknown };
      const { speed, stopOnError } = opts;
      if (speed !== undefined && typeof speed !== 'number') return false;
      if (stopOnError !== undefined && typeof stopOnError !== 'boolean') return false;
    }
    return true;
  }

  if (type === 'replay:pause' || type === 'replay:resume' || type === 'replay:stop') {
    return true;
  }

  return false;
}

function unwrapClientMessage(value: unknown): ClientMessage | null {
  if (isClientMessage(value)) return value;
  if (!isRecord(value)) return null;
  if (value['type'] !== 'BROWSER_ACTION') return null;
  const payload = value['payload'];
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
    replayService: null as ReplayService | null,
    rateLimit: { inputCount: 0, lastReset: Date.now() },
    lastHoverUpdate: 0,
  };

  connections.set(ws, state);

  // If session is active, set up CDP bridge and recorder
  if (session.status === 'active' && session.cdp && session.page) {
    await setupBridgeAndRecorder(ws, session, state);
    await ensureInitialNavigationStep(session, state.recorder);
  }

  // Send initial session state
  const sessionState = sessionManager.getSessionState(sessionId);
  if (sessionState) {
    send(ws, { type: 'session:state', state: sessionState });
  }

  send(ws, {
    type: 'replay:status',
    status: {
      state: 'idle',
      currentStepIndex: 0,
      totalSteps: session.steps.length,
    },
  });

  console.warn(`[WS] Client connected to session ${sessionId}`);
}

/**
 * Sets up CDP bridge and recorder for a connection
 */
async function setupBridgeAndRecorder(
  ws: ServerWebSocket<WSConnection>,
  session: ServerSession,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; replayService: ReplayService | null; rateLimit: RateLimitState }
): Promise<void> {
  // Create CDP bridge
  const bridge = new CDPBridge({
    session,
    onFrame: (data, timestamp) => {
      send(ws, { type: 'frame', data, timestamp });
    },
    onNavigation: (_url, _title) => {
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

async function ensureInitialNavigationStep(
  session: ServerSession,
  recorder: Recorder | null
): Promise<void> {
  if (
    !recorder ||
    !session.startUrl ||
    session.steps.length > 0 ||
    session.initialNavigationRecorded
  ) {
    return;
  }

  session.initialNavigationRecorded = true;
  await recorder.recordNavigation('about:blank', session.startUrl);
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
    return decodeMessage(value['data']);
  }
  return value;
}

export async function handleMessage(
  ws: ServerWebSocket<WSConnection>,
  _message: unknown
): Promise<void> {
  const resolved = resolveConnectionState(ws);
  if (!resolved) return;

  const { socket, state } = resolved;

  const identity = getConnectionIdentity(socket);
  if (!identity) return;
  const { sessionId } = identity;

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
    send(socket, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Invalid message format',
    });
    return;
  }
  if (!parsed) {
    send(socket, {
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
    console.warn('[WS] Received action', parsed);
  }

  // Handle message types
  switch (parsed.type) {
    case 'ping':
      send(socket, {
        type: 'pong',
        timestamp: parsed.timestamp,
        serverTime: Date.now(),
      });
      break;

    case 'input:mouse':
      await handleMouseInput(socket, state, parsed);
      break;

    case 'input:keyboard':
      await handleKeyboardInput(socket, state, parsed);
      break;

    case 'input:scroll':
      await handleScrollInput(socket, state, parsed);
      break;

    case 'navigate':
      await handleNavigate(socket, state, parsed);
      break;

    case 'settings:highlight':
      handleHighlightSettings(state, parsed);
      break;

    case 'replay:start':
      await handleReplayStart(socket, state, parsed);
      break;

    case 'replay:pause':
      handleReplayControl(socket, state, 'pause');
      break;

    case 'replay:resume':
      handleReplayControl(socket, state, 'resume');
      break;

    case 'replay:stop':
      handleReplayControl(socket, state, 'stop');
      break;

    default:
      send(socket, {
        type: 'error',
        code: 'UNKNOWN_MESSAGE',
        message: `Unknown message type`,
      });
  }
}

function handleHighlightSettings(
  state: { bridge: CDPBridge | null; recorder: Recorder | null; replayService: ReplayService | null; rateLimit: RateLimitState; lastHoverUpdate: number },
  message: { type: 'settings:highlight'; color: string }
): void {
  if (!state.bridge) return;
  state.bridge.setHighlightColor(message.color);
}

/**
 * Handles mouse input
 */
async function handleMouseInput(
  ws: ServerWebSocket<WSConnection>,
  state: { bridge: CDPBridge | null; recorder: Recorder | null; replayService: ReplayService | null; rateLimit: RateLimitState; lastHoverUpdate: number },
  message: { type: 'input:mouse'; action: string; x: number; y: number; button?: string }
): Promise<void> {
  // Ignore input during replay
  if (sessionManager.getMode(ws.data.sessionId) === 'replay') {
    return;
  }

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
      case 'move': {
        await state.bridge.sendMouseInput('move', x, y, btn);
        // Element hover detection with throttling
        const now = Date.now();
        if (now - state.lastHoverUpdate >= HOVER_THROTTLE.MIN_INTERVAL_MS) {
          state.lastHoverUpdate = now;
          const element = await state.bridge.getElementAtPoint(x, y);
          send(ws, {
            type: 'element:hover',
            element: element ? {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
              boundingBox: element.boundingBox,
            } : null,
          });
        }
        break;
      }

      case 'down':
        // Prepare screenshot before sending mouse down to browser
        await state.recorder.prepareClickScreenshot(x, y, btn);
        await state.bridge.sendMouseInput('down', x, y, btn);
        break;

      case 'up':
        await state.bridge.sendMouseInput('up', x, y, btn);
        break;

      case 'click':
        // Record click action using pre-captured screenshot
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
  state: { bridge: CDPBridge | null; recorder: Recorder | null; replayService: ReplayService | null; rateLimit: RateLimitState },
  message: {
    type: 'input:keyboard';
    action: string;
    key: string;
    text?: string;
    code?: string;
    keyCode?: number;
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean };
  }
): Promise<void> {
  // Ignore input during replay
  if (sessionManager.getMode(ws.data.sessionId) === 'replay') {
    return;
  }

  if (!state.bridge || !state.recorder) return;

  const { action, key, text, modifiers, code, keyCode } = message;

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

  // Detect paste (Cmd+V or Ctrl+V)
  const isPaste =
    (key === 'v' || key === 'V') &&
    (modifiers?.meta || modifiers?.ctrl) &&
    !modifiers?.shift &&
    !modifiers?.alt;

  if (isPaste) {
    // Send keyboard input to browser
    await state.bridge.sendKeyboardInput('down', key, text, modifiers, code, keyCode);

    // Get clipboard content from browser
    const session = sessionManager.getSession(ws.data.sessionId);
    const clipboardText = session ? await getClipboardContent(session) : null;

    // Create paste step immediately
    if (clipboardText && state.recorder) {
      await state.recorder.recordPaste(clipboardText);
    }

    return;
  }

  try {
    if (action === 'down') {
      await state.bridge.sendKeyboardInput('down', key, text, modifiers, code, keyCode);
      // Record typing
      if (text) {
        await state.recorder.recordKeyInput(key, text);
      }
    } else if (action === 'up') {
      await state.bridge.sendKeyboardInput('up', key, undefined, modifiers, code, keyCode);
    } else if (action === 'press') {
      await state.bridge.sendKeyboardInput('down', key, text, modifiers, code, keyCode);
      await state.bridge.sendKeyboardInput('up', key, undefined, modifiers, code, keyCode);
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
  state: { bridge: CDPBridge | null; recorder: Recorder | null; replayService: ReplayService | null; rateLimit: RateLimitState },
  message: { type: 'input:scroll'; deltaX: number; deltaY: number; x: number; y: number }
): Promise<void> {
  // Ignore input during replay
  if (sessionManager.getMode(ws.data.sessionId) === 'replay') {
    return;
  }

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
  state: { bridge: CDPBridge | null; recorder: Recorder | null; replayService: ReplayService | null; rateLimit: RateLimitState },
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
 * Handles replay start command
 */
async function handleReplayStart(
  ws: ServerWebSocket<WSConnection>,
  state: {
    bridge: CDPBridge | null;
    recorder: Recorder | null;
    replayService: ReplayService | null;
    rateLimit: RateLimitState;
  },
  message: { type: 'replay:start'; options?: { speed?: number; stopOnError?: boolean } }
): Promise<void> {
  if (!state.bridge) {
    send(ws, {
      type: 'input:error',
      action: 'replay:start',
      reason: 'No active browser session'
    });
    return;
  }

  const session = sessionManager.getSession(ws.data.sessionId);
  if (!session || session.status !== 'active') {
    send(ws, {
      type: 'input:error',
      action: 'replay:start',
      reason: 'Session is not active'
    });
    return;
  }

  if (session.steps.length === 0) {
    send(ws, {
      type: 'input:error',
      action: 'replay:start',
      reason: 'No steps to replay'
    });
    return;
  }

  // Stop any existing replay
  if (state.replayService) {
    state.replayService.stop();
  }

  // Merge options with defaults
  const options = {
    speed: message.options?.speed ?? 1,
    stopOnError: message.options?.stopOnError ?? false
  };

  // Create replay service
  const replayService = new ReplayService(
    state.bridge,
    session,
    options,
    sessionManager,
    // onStatus callback
    (status) => {
      const msg: ReplayStatusMessage = {
        type: 'replay:status',
        status
      };
      send(ws, msg);
    },
    // onStepStart callback
    (stepIndex, stepId) => {
      const msg: ReplayStepStartMessage = {
        type: 'replay:step:start',
        stepIndex,
        stepId
      };
      send(ws, msg);
    },
    // onStepComplete callback
    (stepIndex, stepId) => {
      const msg: ReplayStepCompleteMessage = {
        type: 'replay:step:complete',
        stepIndex,
        stepId
      };
      send(ws, msg);
    },
    // onError callback
    (stepId, error) => {
      const msg: ReplayErrorMessage = {
        type: 'replay:error',
        stepId,
        error
      };
      send(ws, msg);
    }
  );

  state.replayService = replayService;

  // Start replay (don't await - let it run in background)
  replayService.play().catch((error) => {
    console.error('[Replay] Error:', error);
  });
}

/**
 * Handles replay control commands (pause/resume/stop)
 */
function handleReplayControl(
  ws: ServerWebSocket<WSConnection>,
  state: {
    bridge: CDPBridge | null;
    recorder: Recorder | null;
    replayService: ReplayService | null;
    rateLimit: RateLimitState;
  },
  action: 'pause' | 'resume' | 'stop'
): void {
  if (!state.replayService) {
    send(ws, {
      type: 'input:error',
      action: `replay:${action}`,
      reason: 'No active replay'
    });
    return;
  }

  switch (action) {
    case 'pause':
      state.replayService.pause();
      break;
    case 'resume':
      state.replayService.resume();
      break;
    case 'stop':
      state.replayService.stop();
      state.replayService = null;
      break;
  }
}

/**
 * Gets clipboard content from the browser via page evaluation
 */
async function getClipboardContent(session: ServerSession): Promise<string | null> {
  try {
    const page = session.page;
    if (!page) return null;

    const result = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    });
    return result;
  } catch (error) {
    console.error('[Handler] Failed to read clipboard:', error);
    return null;
  }
}

/**
 * Handles WebSocket close
 */
export async function handleClose(ws: ServerWebSocket<WSConnection>): Promise<void> {
  const resolved = resolveConnectionState(ws);
  if (resolved) {
    const { socket, state } = resolved;
    // Cleanup bridge and recorder
    if (state.bridge) {
      await state.bridge.cleanup();
    }
    if (state.recorder) {
      await state.recorder.cleanup();
    }
    if (state.replayService) {
      state.replayService.stop();
    }
    connections.delete(socket);
  }

  const identity = getConnectionIdentity(ws);
  console.warn(`[WS] Client disconnected from session ${identity?.sessionId ?? 'unknown'}`);
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
      await ensureInitialNavigationStep(session, state.recorder);
    }
  }
}
