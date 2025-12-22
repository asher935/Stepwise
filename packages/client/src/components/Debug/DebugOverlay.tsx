import { useEffect, useMemo, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@stepwise/shared';
import { Bug, X, Activity, Zap } from 'lucide-react';
import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';

type MessageInfo = {
  summary: string;
  at: number;
};

function formatTime(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
      const _exhaustiveCheck: never = message;
      return `unknown:${(message as { type: string }).type}`;
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
      const _exhaustiveCheck: never = message;
      return `unknown:${(message as { type: string }).type}`;
    }
  }
}

export function DebugOverlay() {
  const isConnected = useSessionStore((s) => s.isConnected);
  const sessionState = useSessionStore((s) => s.sessionState);
  const error = useSessionStore((s) => s.error);
  const [isOpen, setIsOpen] = useState(false);
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-[100] w-14 h-14 bg-white border border-black/5 rounded-full flex items-center justify-center text-[#BBAFA7] hover:text-[#E67E22] transition-all hover:scale-110 shadow-xl"
        type="button"
      >
        <Bug size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-[100] w-96 max-h-[450px] bg-white/95 backdrop-blur-3xl border border-black/5 rounded-[40px] shadow-[0_30px_60px_rgba(45,36,30,0.12)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
      <div className="p-6 border-b border-black/5 flex items-center justify-between">
        <div className="flex items-center text-[10px] font-black text-[#BBAFA7] uppercase tracking-[0.2em]">
          <Activity size={14} className="mr-2 text-[#E67E22]" />
          Debug Overlay
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-[#BBAFA7] hover:text-[#2D241E] transition active:scale-90"
          type="button"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="p-4 bg-[#FDF2E9] rounded-[24px] border border-black/5 space-y-2">
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">WS</span>
            <span className={isConnected ? 'text-[#E67E22]' : 'text-red-400'}>
              {status}
            </span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">WS URL</span>
            <span className="text-[#2D241E] truncate max-w-[200px]" title={wsClient.url ?? '—'}>
              {wsClient.url ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Session</span>
            <span className="text-[#2D241E]">{sessionState?.status ?? '—'}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Connected At</span>
            <span className="text-[#2D241E]">{formatTime(connectedAt)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Disconnected At</span>
            <span className="text-[#2D241E]">{formatTime(disconnectedAt)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Last Sent</span>
            <span className="text-[#2D241E] truncate max-w-[200px]" title={lastSent?.summary ?? '—'}>
              {lastSent ? `${lastSent.summary} • ${formatTime(lastSent.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Last Received</span>
            <span className="text-[#2D241E] truncate max-w-[200px]" title={lastReceived?.summary ?? '—'}>
              {lastReceived ? `${lastReceived.summary} • ${formatTime(lastReceived.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Last Event</span>
            <span className="text-[#2D241E] truncate max-w-[200px]" title={lastReceivedEvent?.summary ?? '—'}>
              {lastReceivedEvent ? `${lastReceivedEvent.summary} • ${formatTime(lastReceivedEvent.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Last Pong</span>
            <span className="text-[#2D241E]">{formatTime(lastPongAt)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Last Error</span>
            <span className="text-[#2D241E] truncate max-w-[200px]" title={lastError?.summary ?? '—'}>
              {lastError ? `${lastError.summary} • ${formatTime(lastError.at)}` : '—'}
            </span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Error</span>
            <span className="text-[#2D241E] truncate max-w-[200px]" title={error ?? '—'}>
              {error ?? '—'}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="w-full py-3 px-4 bg-[#FDF2E9] hover:bg-[#FED8AA] rounded-2xl border border-black/5 flex items-center justify-center text-[10px] font-black text-[#2D241E] uppercase tracking-[0.2em] transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => wsClient.send({ type: 'ping', timestamp: Date.now() })}
          disabled={!isConnected}
        >
          <Zap size={14} className="mr-2" />
          Send Ping
        </button>
      </div>

      <div className="p-4 bg-[#FDF2E9]/60 border-t border-black/5 text-[9px] text-[#BBAFA7] font-black uppercase tracking-[0.2em] text-center">
        Stepwise Engine • v1.0.4-LITE
      </div>
    </div>
  );
}
