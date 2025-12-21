import type { 
  ClientMessage, 
  ServerMessage,
  SessionState,
  Step,
} from '@stepwise/shared';

type MessageHandler = (message: ServerMessage) => void;
type ConnectionHandler = () => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private token: string | null = null;

  connect(sessionId: string, token: string): void {
    this.sessionId = sessionId;
    this.token = token;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.sessionId || !this.token) return;

    const isDev = window.location.port === '5173';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isDev ? 'localhost:3000' : window.location.host;
    const url = `${protocol}//${host}/ws?sessionId=${this.sessionId}&token=${this.token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
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

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.stopPing();
      this.disconnectHandlers.forEach(h => { h(); });
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * (2 ** (this.reconnectAttempts - 1));
    
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.doConnect();
    }, delay);
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
    this.stopPing();
    this.sessionId = null;
    this.token = null;
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.ws?.close();
    this.ws = null;
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const wrappedMessage = {
        id: crypto.randomUUID(),
        type: 'BROWSER_ACTION',
        timestamp: Date.now(),
        payload: message
      };
      this.ws.send(JSON.stringify(wrappedMessage));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
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

  sendKeyDown(key: string, text?: string, modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }): void {
    this.send({ type: 'input:keyboard', action: 'down', key, text, modifiers });
  }

  sendKeyUp(key: string, modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }): void {
    this.send({ type: 'input:keyboard', action: 'up', key, modifiers });
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
}

export const wsClient = new WebSocketClient();
