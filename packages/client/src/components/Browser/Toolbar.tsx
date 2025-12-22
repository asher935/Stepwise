import { useCallback, useState, useEffect } from 'react';

import { ArrowLeft, ArrowRight, RotateCw, ShieldCheck } from 'lucide-react';

import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';
;

export function Toolbar() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const isConnected = useSessionStore((s) => s.isConnected);
  const [urlInput, setUrlInput] = useState(sessionState?.url ?? '');
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setUrlInput(sessionState?.url ?? '');
  }, [sessionState?.url]);

  const handleNavigate = useCallback(() => {
    if (urlInput.trim()) {
      let url = urlInput.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      setIsNavigating(true);
      wsClient.navigate(url);
      setTimeout(() => setIsNavigating(false), 1200);
    }
  }, [urlInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  }, [handleNavigate]);

  const handleBack = useCallback(() => {
    setIsNavigating(true);
    wsClient.goBack();
    setTimeout(() => setIsNavigating(false), 1200);
  }, []);

  const handleForward = useCallback(() => {
    setIsNavigating(true);
    wsClient.goForward();
    setTimeout(() => setIsNavigating(false), 1200);
  }, []);

  const handleReload = useCallback(() => {
    setIsNavigating(true);
    wsClient.reload();
    setTimeout(() => setIsNavigating(false), 1200);
  }, []);

  return (
    <div className="h-16 bg-[#FDF2E9]/60 backdrop-blur-md border-b border-black/5 flex items-center px-6 space-x-6">

      {/* Navigation Buttons */}
      <div className="flex items-center space-x-1">
        <button
          onClick={handleBack}
          disabled={!isConnected}
          className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80 disabled:opacity-50"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={handleForward}
          disabled={!isConnected}
          className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80 disabled:opacity-50"
        >
          <ArrowRight size={18} />
        </button>
        <button
          onClick={handleReload}
          disabled={!isConnected}
          className={`w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80 disabled:opacity-50 ${isNavigating ? 'animate-spin' : ''}`}
        >
          <RotateCw size={16} />
        </button>
      </div>

      {/* URL Input */}
      <div className="flex-1 relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E67E22]">
          <ShieldCheck size={14} />
        </div>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-black/5 rounded-full py-2.5 pl-10 pr-4 text-xs font-bold text-[#6B5E55] focus:border-[#E67E22]/40 outline-none transition-all shadow-sm group-hover:shadow-md"
          disabled={!isConnected}
          placeholder="Enter URL..."
        />
      </div>

      {/* Viewport Dimensions */}
    </div>
  );
}
