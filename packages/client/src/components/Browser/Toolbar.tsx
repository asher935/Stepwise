import { useCallback, useState } from 'react';

import { ArrowLeft, ArrowRight, Pause, Play, RotateCw, ShieldCheck } from 'lucide-react';

import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';

export function Toolbar() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const isConnected = useSessionStore((s) => s.isConnected);
  const stepHighlightColor = useSessionStore((s) => s.stepHighlightColor);
  const setStepHighlightColor = useSessionStore((s) => s.setStepHighlightColor);
  const setRecordingPaused = useSessionStore((s) => s.setRecordingPaused);
  const [urlInput, setUrlInput] = useState('');
  const [isUrlInputDirty, setIsUrlInputDirty] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const displayedUrl = isUrlInputDirty ? urlInput : (sessionState?.url ?? '');
  const isRecordingPaused = sessionState?.recordingPaused ?? false;

  const handleNavigate = useCallback(() => {
    const rawUrl = isUrlInputDirty ? urlInput : (sessionState?.url ?? '');
    if (rawUrl.trim()) {
      let url = rawUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      setIsNavigating(true);
      wsClient.navigate(url);
      setTimeout(() => setIsNavigating(false), 1200);
      setUrlInput(url);
      setIsUrlInputDirty(false);
    }
  }, [isUrlInputDirty, sessionState?.url, urlInput]);

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

  const handleToggleRecording = useCallback(() => {
    void setRecordingPaused(!isRecordingPaused);
  }, [isRecordingPaused, setRecordingPaused]);

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
          value={displayedUrl}
          onChange={(e) => {
            setUrlInput(e.target.value);
            setIsUrlInputDirty(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-black/5 rounded-full py-2.5 pl-10 pr-4 text-xs font-bold text-[#6B5E55] outline-none focus:outline-2 focus:outline-[#E67E22]/40 focus:outline-offset-2 transition-all shadow-sm group-hover:shadow-md"
          disabled={!isConnected}
          placeholder="Enter URL..."
        />
      </div>

      {/* Viewport Dimensions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleRecording}
          disabled={!isConnected}
          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
            isRecordingPaused
              ? 'border-[#E67E22]/30 bg-[#FFF3E8] text-[#E67E22]'
              : 'border-[#2D241E]/10 bg-white text-[#2D241E]'
          }`}
        >
          {isRecordingPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
          <span>{isRecordingPaused ? 'Resume Recording' : 'Pause Recording'}</span>
        </button>
        <span className="text-[10px] font-black uppercase tracking-wider text-[#BBAFA7]">
          Highlight
        </span>
        <label className="w-8 h-8 rounded-full border border-black/10 bg-white overflow-hidden shadow-sm cursor-pointer">
          <input
            type="color"
            value={stepHighlightColor}
            onChange={(e) => setStepHighlightColor(e.target.value)}
            className="w-full h-full border-0 p-0 cursor-pointer"
            aria-label="Step highlight color"
          />
        </label>
      </div>
    </div>
  );
}
