
import React, { useState, useEffect } from 'react';
import { useApp } from '../store';
import { ChevronLeft, ChevronRight, RotateCw, ShieldCheck, Play, AlertCircle, RefreshCcw } from 'lucide-react';
import { enhanceStepDescription } from '../geminiService';
import PlaybackControls from './PlaybackControls';

const BrowserViewport: React.FC = () => {
  const { session, addStep, addDebugLog, setPlaybackIndex, setPlaybackStatus, updateStep } = useApp();
  const [currentUrl, setCurrentUrl] = useState(session.initialUrl);
  const [isNavigating, setIsNavigating] = useState(false);
  const [virtualCursor, setVirtualCursor] = useState({ x: 0, y: 0, visible: false });
  const [playbackFeedback, setPlaybackFeedback] = useState<string | null>(null);

  const { playbackStatus, currentStepIndex, steps } = session;

  // Handle Playback Loop
  useEffect(() => {
    let timer: any;
    if (playbackStatus === 'playing' && currentStepIndex < steps.length) {
      const step = steps[currentStepIndex];
      
      // Mark current step as playing
      updateStep(step.id, { status: 'playing' });
      setPlaybackFeedback(`Replaying: ${step.action}`);
      setVirtualCursor({ x: 400 + Math.random() * 200, y: 300 + Math.random() * 200, visible: true });
      
      timer = setTimeout(() => {
        // Simulate a potential error (e.g., 10% chance for demonstration)
        // In a real app, this would be a check for element existence or network timeout
        const isError = Math.random() < 0.1;

        if (isError) {
          const errorMsg = "Element not found or interaction timed out.";
          setPlaybackStatus('error');
          updateStep(step.id, { status: 'error', errorMessage: errorMsg });
          setPlaybackFeedback(`Playback Error: ${step.action}`);
          addDebugLog('playback_error', { stepId: step.id, error: errorMsg });
        } else {
          updateStep(step.id, { status: 'success' });
          if (currentStepIndex < steps.length - 1) {
            setPlaybackIndex(currentStepIndex + 1);
          } else {
            setPlaybackStatus('idle');
            setPlaybackFeedback('Replay Complete');
            setVirtualCursor(v => ({ ...v, visible: false }));
            setTimeout(() => setPlaybackFeedback(null), 3000);
          }
        }
      }, 2000); 
    }

    return () => clearTimeout(timer);
  }, [playbackStatus, currentStepIndex, steps.length, setPlaybackIndex, setPlaybackStatus, updateStep]);

  const handleInteraction = async (e: React.MouseEvent) => {
    if (playbackStatus !== 'idle') return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    addDebugLog('local_interaction_captured', { x, y, url: currentUrl });

    const rawAction = `Interaction at location (${Math.round(x)}, ${Math.round(y)})`;
    const enhancedDesc = await enhanceStepDescription(rawAction, currentUrl);

    addStep({
      id: Math.random().toString(36).substr(2, 9),
      action: enhancedDesc,
      url: currentUrl,
      timestamp: Date.now(),
      screenshot: `https://picsum.photos/seed/${Math.random()}/1280/720`,
      aiDescription: enhancedDesc
    });
  };

  const handleRetry = () => {
    if (currentStepIndex >= 0 && steps[currentStepIndex]) {
      updateStep(steps[currentStepIndex].id, { status: 'pending', errorMessage: undefined });
      setPlaybackStatus('playing');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-hidden relative">
      <div className={`flex flex-col flex-1 bg-white rounded-[48px] shadow-[0_40px_80px_rgba(45,36,30,0.1)] border ${playbackStatus === 'error' ? 'border-red-200' : 'border-white'} overflow-hidden relative transition-colors duration-500`}>
        
        {/* Browser Chrome */}
        <div className="h-16 bg-[#FDF2E9]/60 backdrop-blur-md border-b border-black/5 flex items-center px-6 space-x-6">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${playbackStatus === 'error' ? 'bg-red-400' : 'bg-red-400/20 border border-red-400/40'}`}></div>
            <div className="w-3 h-3 rounded-full bg-yellow-400/20 border border-yellow-400/40"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-400/20 border border-emerald-400/40"></div>
          </div>

          <div className="flex items-center space-x-1">
            <button className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80">
              <ChevronLeft size={18} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80">
              <ChevronRight size={18} />
            </button>
            <button 
              className={`w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80 ${isNavigating || playbackStatus === 'playing' ? 'animate-spin' : ''}`}
            >
              <RotateCw size={16} />
            </button>
          </div>
          
          <div className="flex-1 relative group">
            <div className={`absolute left-4 top-1/2 -translate-y-1/2 ${playbackStatus === 'error' ? 'text-red-500' : 'text-[#E67E22]'}`}>
              {playbackStatus === 'error' ? <AlertCircle size={14} /> : <ShieldCheck size={14} />}
            </div>
            <input
              type="text"
              readOnly={playbackStatus !== 'idle'}
              value={playbackStatus !== 'idle' && steps[currentStepIndex] ? steps[currentStepIndex].url : currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              className={`w-full bg-white border border-black/5 rounded-full py-2.5 pl-10 pr-4 text-xs font-bold text-[#6B5E55] outline-none transition-all shadow-sm ${playbackStatus !== 'idle' ? 'opacity-50' : 'focus:border-[#E67E22]/40 group-hover:shadow-md'}`}
            />
          </div>

          <div className="hidden md:flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest bg-white/40 px-3 py-1.5 rounded-full border border-white">
            <span className={playbackStatus === 'playing' ? 'text-[#E67E22]' : playbackStatus === 'error' ? 'text-red-600' : 'text-emerald-600'}>
              {playbackStatus === 'playing' ? 'REPLAY ACTIVE' : playbackStatus === 'error' ? 'PLAYBACK HALTED' : 'SECURE VIEWPORT'}
            </span>
          </div>
        </div>

        {/* Viewport Surface */}
        <div 
          className={`flex-1 bg-[#FFF9F5] relative overflow-hidden group ${playbackStatus !== 'idle' ? 'cursor-default' : 'cursor-crosshair'}`}
          onClick={handleInteraction}
        >
          {/* Virtual Cursor */}
          {virtualCursor.visible && playbackStatus !== 'error' && (
            <div 
              className="absolute z-40 w-8 h-8 pointer-events-none transition-all duration-700 ease-in-out"
              style={{ left: virtualCursor.x, top: virtualCursor.y }}
            >
              <div className="relative">
                <div className="w-8 h-8 bg-[#E67E22]/20 rounded-full animate-ping absolute" />
                <div className="w-4 h-4 bg-[#E67E22] rounded-full border-2 border-white shadow-lg" />
              </div>
            </div>
          )}

          {/* Feedback Overlay */}
          {playbackFeedback && (
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[55] px-6 py-2 ${playbackStatus === 'error' ? 'bg-red-600' : 'bg-[#2D241E]'} text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full flex items-center space-x-3 shadow-2xl animate-in slide-in-from-top-4`}>
              <div className={`w-2 h-2 rounded-full ${playbackStatus === 'error' ? 'bg-white' : 'bg-[#E67E22] animate-pulse'}`} />
              <span>{playbackFeedback}</span>
            </div>
          )}

          <div className="h-full flex flex-col items-center justify-center p-12">
            {playbackStatus !== 'idle' && steps[currentStepIndex] ? (
              <div className={`w-full h-full max-w-4xl bg-white rounded-[40px] shadow-inner border ${playbackStatus === 'error' ? 'border-red-100' : 'border-black/5'} overflow-hidden animate-in fade-in zoom-in-95 duration-500 relative`}>
                <img 
                  src={steps[currentStepIndex].screenshot} 
                  className={`w-full h-full object-cover transition-all duration-700 ${playbackStatus === 'error' ? 'grayscale opacity-30 blur-sm' : 'opacity-80'}`} 
                  alt="Viewport"
                />
                
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#2D241E]/10 flex items-center justify-center">
                   {playbackStatus === 'error' ? (
                     <div className="bg-white p-10 rounded-[40px] border border-red-100 shadow-2xl max-w-sm text-center space-y-6 animate-in zoom-in-90">
                        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mx-auto">
                          <AlertCircle size={32} />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xl font-black text-[#2D241E]">Playback Interrupted</h3>
                          <p className="text-sm font-bold text-[#6B5E55] leading-relaxed">
                            {steps[currentStepIndex].errorMessage || "An unexpected error occurred during this step."}
                          </p>
                        </div>
                        <button 
                          onClick={handleRetry}
                          className="w-full py-4 bg-[#2D241E] hover:bg-black text-white font-black rounded-2xl flex items-center justify-center space-x-2 transition-all active:scale-95"
                        >
                          <RefreshCcw size={18} />
                          <span>Retry Step</span>
                        </button>
                     </div>
                   ) : (
                    <div className="absolute bottom-12 left-12 bg-white/90 backdrop-blur-md p-8 rounded-[32px] border border-white shadow-2xl max-w-md animate-in slide-in-from-bottom-8">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="w-10 h-10 rounded-2xl bg-[#FAD7BD] flex items-center justify-center text-[#E67E22]">
                            <Play size={18} fill="currentColor" />
                          </div>
                          <h3 className="text-xl font-black text-[#2D241E]">Replaying Step</h3>
                        </div>
                        <p className="text-sm font-bold text-[#6B5E55] leading-relaxed mb-6">
                          {steps[currentStepIndex].action}
                        </p>
                        <div className="flex items-center space-x-2 text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest">
                          <ShieldCheck size={12} className="text-[#E67E22]" />
                          <span>Visual Simulation Mode</span>
                        </div>
                    </div>
                   )}
                </div>
              </div>
            ) : (
              <div className="max-w-md w-full p-10 bg-white rounded-[48px] shadow-[0_20px_50px_rgba(45,36,30,0.06)] border border-black/5 space-y-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-4xl font-black text-[#2D241E]">Secure Log</h2>
                  <div className="w-12 h-12 rounded-2xl bg-[#FAD7BD] flex items-center justify-center">
                    <ShieldCheck className="text-[#E67E22]" />
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#BBAFA7] tracking-widest">Local Buffer Input</label>
                    <div className="w-full h-14 bg-[#FDF2E9] rounded-2xl border border-black/5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#BBAFA7] tracking-widest">Private Key Area</label>
                    <div className="w-full h-14 bg-[#FDF2E9] rounded-2xl border border-black/5" />
                  </div>
                  <button className="w-full py-5 bg-[#2D241E] text-white font-black rounded-3xl shadow-xl transition-all hover:scale-[1.02] active:scale-95">
                    Process Interaction
                  </button>
                </div>
                <p className="text-center text-xs font-bold text-[#BBAFA7] uppercase tracking-widest leading-relaxed">
                  Stepwise operates in <br/>a zero-storage environment.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <PlaybackControls />
    </div>
  );
};

export default BrowserViewport;
