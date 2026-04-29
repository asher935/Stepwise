import type {
  ClientMessage,
  ServerMessage,
} from '@stepwise/shared';
import { WS_CLOSE_CODES } from '@stepwise/shared';
import { getRuntimeConfig } from './runtime';

type MessageHandler = (message: ServerMessage) => void;
type ConnectionHandler = () => void;
type DisconnectHandler = (event: CloseEvent) => void;
type SendHandler = (message: ClientMessage) => void;
type WebSocketSender = Pick<WebSocket, 'readyState' | 'send' | 'close'>;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private testingSocket: WebSocketSender | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private sendHandlers: Set<SendHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<DisconnectHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private token: string | null = null;
  private currentUrl: string | null = null;
  // Pending disconnect timer — lets StrictMode cleanup+remount cancel the
  // churn before it reaches the server, which would otherwise tear down and
  // re-create the CDP screencast and lose the shared stream.
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(sessionId: string, token: string): void {
    // If a disconnect for the same session is pending (StrictMode cleanup
    // about to fire), cancel it — the WS is still live, reuse it.
    if (this.disconnectTimer && this.sessionId === sessionId && this.token === token) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      return;
    }
    // Pending disconnect for a different session — run it now so the new
    // connection starts from a clean state.
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this.performDisconnect();
    }
    // Already connected/connecting to the same session — no-op.
    if (
      this.ws &&
      this.sessionId === sessionId &&
      this.token === token &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.sessionId = sessionId;
    this.token = token;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.sessionId || !this.token) return;

    const runtimeConfig = getRuntimeConfig();
    const url = `${runtimeConfig.wsBaseUrl}?sessionId=${this.sessionId}&token=${this.token}`;

    this.currentUrl = url;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.warn('[WS] Connected');
      this.reconnectAttempts = 0;
      this.startPing();
      this.connectHandlers.forEach(h => { h(); });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        this.messageHandlers.forEach(h => { h(message); });
      } catch (error) {
        console.error('[WS] Parse error:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.warn('[WS] Disconnected');
      this.stopPing();
      this.disconnectHandlers.forEach(h => { h(event); });

      if (!this.shouldReconnect(event.code)) {
        return;
      }

      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * (2 ** (this.reconnectAttempts - 1));

    console.warn(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  private shouldReconnect(code: number): boolean {
    if (
      code === WS_CLOSE_CODES.SESSION_ENDED ||
      code === WS_CLOSE_CODES.SESSION_NOT_FOUND ||
      code === WS_CLOSE_CODES.UNAUTHORIZED
    ) {
      return false;
    }
    return true;
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect(): void {
    // Defer so a near-immediate connect() (e.g. React StrictMode's
    // cleanup→remount) can cancel it before we tear down the server-side
    // bridge and kill the shared CDP screencast.
    if (this.disconnectTimer) return;
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      this.performDisconnect();
    }, 250);
  }

  private performDisconnect(): void {
    this.stopPing();
    this.sessionId = null;
    this.token = null;
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.testingSocket = null;
    this.ws?.close();
    this.ws = null;
    this.currentUrl = null;
  }

  setSocketForTesting(socket: WebSocketSender | null): void {
    this.testingSocket = socket;
  }

  send(message: ClientMessage): void {
    const socket = this.testingSocket ?? this.ws;
    if (socket?.readyState === WebSocket.OPEN) {
      this.sendHandlers.forEach(h => { h(message); });
      socket.send(JSON.stringify(message));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onSend(handler: SendHandler): () => void {
    this.sendHandlers.add(handler);
    return () => this.sendHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return (this.testingSocket ?? this.ws)?.readyState === WebSocket.OPEN;
  }

  get url(): string | null {
    return this.currentUrl;
  }

  sendMouseMove(x: number, y: number): void {
    this.send({ type: 'input:mouse', action: 'move', x, y });
  }

  sendMouseClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): void {
    this.send({ type: 'input:mouse', action: 'click', x, y, button });
  }

  sendMouseDown(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): void {
    this.send({ type: 'input:mouse', action: 'down', x, y, button });
  }

  sendMouseUp(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): void {
    this.send({ type: 'input:mouse', action: 'up', x, y, button });
  }

  sendKeyDown(
    key: string,
    text?: string,
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean },
    code?: string,
    keyCode?: number
  ): void {
    this.send({ type: 'input:keyboard', action: 'down', key, text, modifiers, code, keyCode });
  }

  sendKeyUp(
    key: string,
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean },
    code?: string,
    keyCode?: number
  ): void {
    this.send({ type: 'input:keyboard', action: 'up', key, modifiers, code, keyCode });
  }

  sendScroll(x: number, y: number, deltaX: number, deltaY: number): void {
    this.send({ type: 'input:scroll', x, y, deltaX, deltaY });
  }

  navigate(url: string): void {
    this.send({ type: 'navigate', action: 'goto', url });
  }

  goBack(): void {
    this.send({ type: 'navigate', action: 'back' });
  }

  goForward(): void {
    this.send({ type: 'navigate', action: 'forward' });
  }

  reload(): void {
    this.send({ type: 'navigate', action: 'reload' });
  }

  setHighlightColor(color: string): void {
    this.send({ type: 'settings:highlight', color });
  }

  extendSession(): void {
    this.send({ type: 'session:extend' });
  }
}

export const wsClient = new WebSocketClient();
