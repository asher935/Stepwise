import { useEffect, useMemo, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@stepwise/shared';
import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';

type MessageInfo = {
  summary: string;
  at: number;
};

function formatTime(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString();
}

function describeClientMessage(message: ClientMessage): string {
  switch (message.type) {
    case 'input:mouse':
      return `mouse:${message.action} (${Math.round(message.x)},${Math.round(message.y)})`;
    case 'input:keyboard':
      return `keyboard:${message.action} ${message.key}${message.text ? ` "${message.text}"` : ''}`;
    case 'input:scroll':
      return `scroll (${Math.round(message.deltaX)},${Math.round(message.deltaY)})`;
    case 'navigate':
      return `navigate:${message.action}${message.url ? ` ${message.url}` : ''}`;
    case 'ping':
      return 'ping';
    default: {
      // Handle unknown message types
      const _exhaustiveCheck: never = message;
      return `unknown:${(message as any).type}`;
    }
  }
}

function describeServerMessage(message: ServerMessage): string {
  switch (message.type) {
    case 'frame':
      return 'frame';
    case 'session:state':
      return `session:${message.state.status}${message.state.url ? ` ${message.state.url}` : ''}`;
    case 'step:new':
      return 'step:new';
    case 'step:updated':
      return 'step:updated';
    case 'step:deleted':
      return 'step:deleted';
    case 'pong':
      return 'pong';
    case 'cdp:error':
      return `cdp:error ${message.code}`;
    case 'input:error':
      return `input:error ${message.action}`;
    case 'rate:limited':
      return `rate:limited ${message.action}`;
    case 'session:unhealthy':
      return 'session:unhealthy';
    case 'element:hover':
      return `element:hover ${message.element?.tagName || 'null'}`;
    case 'error':
      return `error ${message.code}`;
    default: {
      // Handle unknown message types
      const _exhaustiveCheck: never = message;
      return `unknown:${(message as any).type}`;
    }
  }
}

export function DebugOverlay() {
  const isConnected = useSessionStore((s) => s.isConnected);
  const sessionState = useSessionStore((s) => s.sessionState);
  const error = useSessionStore((s) => s.error);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lastSent, setLastSent] = useState<MessageInfo | null>(null);
  const [lastReceived, setLastReceived] = useState<MessageInfo | null>(null);
  const [lastReceivedEvent, setLastReceivedEvent] = useState<MessageInfo | null>(null);
  const [lastPongAt, setLastPongAt] = useState<number | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [disconnectedAt, setDisconnectedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<MessageInfo | null>(null);

  useEffect(() => {
    const unsubSend = wsClient.onSend((message) => {
      setLastSent({ summary: describeClientMessage(message), at: Date.now() });
    });
    const unsubMessage = wsClient.onMessage((message) => {
      const info = { summary: describeServerMessage(message), at: Date.now() };
      setLastReceived(info);
      if (message.type !== 'frame') {
        setLastReceivedEvent(info);
      }
      if (message.type === 'error') {
        setLastError({ summary: message.message, at: Date.now() });
      }
      if (message.type === 'cdp:error') {
        setLastError({ summary: message.message, at: Date.now() });
      }
      if (message.type === 'input:error') {
        setLastError({ summary: message.reason, at: Date.now() });
      }
      if (message.type === 'pong') {
        setLastPongAt(Date.now());
      }
    });
    const unsubConnect = wsClient.onConnect(() => {
      setConnectedAt(Date.now());
      setDisconnectedAt(null);
    });
    const unsubDisconnect = wsClient.onDisconnect(() => {
      setDisconnectedAt(Date.now());
    });
    return () => {
      unsubSend();
      unsubMessage();
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  const status = useMemo(() => (isConnected ? 'connected' : 'disconnected'), [isConnected]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-3 right-3 z-50 w-[360px] rounded-md border bg-background/95 shadow-lg backdrop-blur">
      <div className="px-3 py-2 border-b text-xs font-semibold flex items-center justify-between">
        <span>Debug Overlay</span>
        <button
          type="button"
          className="rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wide hover:bg-muted"
          onClick={() => setIsMinimized((value) => !value)}
        >
          {isMinimized ? 'Expand' : 'Minimize'}
        </button>
      </div>
      {!isMinimized && (
        <div className="px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span>WS</span>
            <span>{status}</span>
          </div>
          <div className="flex justify-between">
            <span>WS URL</span>
            <span className="truncate max-w-[200px]" title={wsClient.url ?? '—'}>{wsClient.url ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Session</span>
            <span>{sessionState?.status ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Connected At</span>
            <span>{formatTime(connectedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Disconnected At</span>
            <span>{formatTime(disconnectedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Last Sent</span>
            <span className="truncate max-w-[200px]" title={lastSent?.summary ?? '—'}>
              {lastSent ? `${lastSent.summary} • ${formatTime(lastSent.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last Received</span>
            <span className="truncate max-w-[200px]" title={lastReceived?.summary ?? '—'}>
              {lastReceived ? `${lastReceived.summary} • ${formatTime(lastReceived.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last Event</span>
            <span className="truncate max-w-[200px]" title={lastReceivedEvent?.summary ?? '—'}>
              {lastReceivedEvent ? `${lastReceivedEvent.summary} • ${formatTime(lastReceivedEvent.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last Pong</span>
            <span>{formatTime(lastPongAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Last Error</span>
            <span className="truncate max-w-[200px]" title={lastError?.summary ?? '—'}>
              {lastError ? `${lastError.summary} • ${formatTime(lastError.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Error</span>
            <span className="truncate max-w-[200px]" title={error ?? '—'}>{error ?? '—'}</span>
          </div>
          <div className="pt-1">
            <button
              type="button"
              className="w-full rounded-sm border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => wsClient.send({ type: 'ping', timestamp: Date.now() })}
              disabled={!isConnected}
            >
              Send Ping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
