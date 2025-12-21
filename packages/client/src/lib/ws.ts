/**
 * WebSocket Client for Stepwise Real-time Communication
 *
 * This module handles WebSocket communication between the client and Stepwise server,
 * providing real-time communication for session management, browser control,
 * and recording operations.
 */

import {
  type WSMessage,
  type ClientWSMessage,
  type ServerWSMessage,
  ClientMessageType,
  ServerMessageType,
  WSConnectionState,
  type WSConfig,
  isServerMessage
} from '@stepwise/shared';

/**
 * WebSocket client class for Stepwise
 */
export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private config: WSConfig;
  private state: WSConnectionState = WSConnectionState.CLOSED;
  private messageQueue: ClientWSMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // Event handlers
  private onMessageHandlers: Set<WSMessageHandler> = new Set();
  private onErrorHandlers: Set<WSErrorHandler> = new Set();
  private onOpenHandlers: Set<WSOpenHandler> = new Set();
  private onCloseHandlers: Set<WSCloseHandler> = new Set();
  private onStateChangeHandlers: Set<WSStateChangeHandler> = new Set();

  // Trace logging flag
  private shouldTrace = Boolean(import.meta.env.VITE_TRACE_INPUT);

  constructor(url: string, config: WSConfig = {}) {
    this.url = url;
    this.config = {
      timeout: 10000,
      secure: url.startsWith('wss://'),
      reconnection: {
        enabled: true,
        maxAttempts: 5,
        delay: 1000,
        backoffFactor: 2
      },
      ...config
    };

    if (this.shouldTrace) {
      console.log('[WS] Client initialized', { url, config });
    }
  }

  /**
   * Connect to WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.state !== WSConnectionState.CLOSED) {
      throw new Error('WebSocket is already connected or connecting');
    }

    this.setState(WSConnectionState.CONNECTING);

    try {
      // Build WebSocket URL with token if provided
      let wsUrl = this.url;
      if (this.config.token) {
        const separator = wsUrl.includes('?') ? '&' : '?';
        wsUrl += `${separator}token=${encodeURIComponent(this.config.token)}`;
      }

      this.ws = new WebSocket(wsUrl);

      // Setup event handlers
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout);

        const onceOpen = () => {
          clearTimeout(timeout);
          resolve();
        };

        const onceError = (error: Event) => {
          clearTimeout(timeout);
          reject(error);
        };

        this.ws!.onopen = (event) => {
          onceOpen();
          this.handleOpen(event);
        };

        this.ws!.onerror = (event) => {
          onceError(event);
          this.handleError(event);
        };
      });

    } catch (error) {
      this.setState(WSConnectionState.ERROR);
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws && this.state !== WSConnectionState.CLOSED) {
      this.ws.close(1000, 'Client disconnect');
    }

    this.setState(WSConnectionState.CLOSED);
  }

  /**
   * Send message to server
   */
  public send(message: ClientWSMessage): void {
    if (this.state !== WSConnectionState.OPEN) {
      // Queue message for later if reconnection is enabled
      if (this.config.reconnection?.enabled) {
        this.messageQueue.push(message);
        if (this.shouldTrace) {
          console.log('[WS] Queued message', message);
        }
      }
      return;
    }

    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);

      if (this.shouldTrace) {
        console.log('[WS] send', message);
      }
    } catch (error) {
      console.error('[WS] Failed to send message', { message, error });
      throw error;
    }
  }

  /**
   * Add event listener
   */
  public onMessage(handler: WSMessageHandler): void {
    this.onMessageHandlers.add(handler);
  }

  public onError(handler: WSErrorHandler): void {
    this.onErrorHandlers.add(handler);
  }

  public onOpen(handler: WSOpenHandler): void {
    this.onOpenHandlers.add(handler);
  }

  public onClose(handler: WSCloseHandler): void {
    this.onCloseHandlers.add(handler);
  }

  public onStateChange(handler: WSStateChangeHandler): void {
    this.onStateChangeHandlers.add(handler);
  }

  /**
   * Remove event listener
   */
  public offMessage(handler: WSMessageHandler): void {
    this.onMessageHandlers.delete(handler);
  }

  public offError(handler: WSErrorHandler): void {
    this.onErrorHandlers.delete(handler);
  }

  public offOpen(handler: WSOpenHandler): void {
    this.onOpenHandlers.delete(handler);
  }

  public offClose(handler: WSCloseHandler): void {
    this.onCloseHandlers.delete(handler);
  }

  public offStateChange(handler: WSStateChangeHandler): void {
    this.onStateChangeHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  public getState(): WSConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === WSConnectionState.OPEN;
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(event: Event): void {
    this.setState(WSConnectionState.OPEN);
    this.reconnectAttempts = 0;

    // Send queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }

    // Notify listeners
    this.onOpenHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[WS] Error in open handler', error);
      }
    });

    if (this.shouldTrace) {
      console.log('[WS] Connected', { event });
    }
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSMessage = JSON.parse(event.data);

      if (this.shouldTrace) {
        console.log('[WS] recv', message);
      }

      // Validate message
      if (!message || typeof message.id !== 'string' || typeof message.type !== 'string') {
        console.warn('[WS] Invalid message format', message);
        return;
      }

      // Only process server messages
      if (!isServerMessage(message)) {
        console.warn('[WS] Received non-server message', message);
        return;
      }

      // Notify listeners
      this.onMessageHandlers.forEach(handler => {
        try {
          handler(message as ServerWSMessage);
        } catch (error) {
          console.error('[WS] Error in message handler', error);
        }
      });

    } catch (error) {
      console.error('[WS] Failed to parse message', { data: event.data, error });
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    this.setState(WSConnectionState.CLOSED);

    // Notify listeners
    this.onCloseHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[WS] Error in close handler', error);
      }
    });

    // Attempt reconnection if enabled
    if (
      this.config.reconnection?.enabled &&
      this.reconnectAttempts < (this.config.reconnection.maxAttempts || 5) &&
      event.code !== 1000 // Normal closure
    ) {
      this.scheduleReconnect();
    }

    if (this.shouldTrace) {
      console.log('[WS] Disconnected', { event });
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    this.setState(WSConnectionState.ERROR);

    // Notify listeners
    this.onErrorHandlers.forEach(handler => {
      try {
        handler(new Error('WebSocket connection error'));
      } catch (error) {
        console.error('[WS] Error in error handler', error);
      }
    });

    if (this.shouldTrace) {
      console.log('[WS] Error', { event });
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    const delay = (this.config.reconnection?.delay || 1000) * 
                  Math.pow(this.config.reconnection?.backoffFactor || 2, this.reconnectAttempts);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      
      if (this.shouldTrace) {
        console.log('[WS] Reconnection attempt', { attempt: this.reconnectAttempts });
      }

      try {
        await this.connect();
      } catch (error) {
        if (this.shouldTrace) {
          console.log('[WS] Reconnection failed', { error });
        }
      }
    }, delay);
  }

  /**
   * Set connection state and notify listeners
   */
  private setState(state: WSConnectionState): void {
    if (this.state !== state) {
      const oldState = this.state;
      this.state = state;

      this.onStateChangeHandlers.forEach(handler => {
        try {
          handler(state);
        } catch (error) {
          console.error('[WS] Error in state change handler', error);
        }
      });

      if (this.shouldTrace) {
        console.log('[WS] State change', { from: oldState, to: state });
      }
    }
  }
}

// Export types for external use
export type WSMessageHandler = (message: ServerWSMessage) => void;
export type WSErrorHandler = (error: Error) => void;
export type WSOpenHandler = (event: Event) => void;
export type WSCloseHandler = (event: CloseEvent) => void;
export type WSStateChangeHandler = (state: WSConnectionState) => void;

// Export singleton factory
export function createWSClient(url: string, config?: WSConfig): WSClient {
  return new WSClient(url, config);
}