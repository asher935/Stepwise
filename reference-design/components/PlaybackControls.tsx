
import React from 'react';
import { useApp } from '../store';
import { Play, Pause, Square, ChevronLeft, ChevronRight, Zap, RefreshCcw, AlertTriangle } from 'lucide-react';

const PlaybackControls: React.FC = () => {
  const { session, startPlayback, pausePlayback, stopPlayback, setPlaybackIndex, updateStep, setPlaybackStatus } = useApp();
  const { playbackStatus, currentStepIndex, steps } = session;

  if (steps.length === 0) return null;

  const isPlaying = playbackStatus === 'playing';
  const isError = playbackStatus === 'error';
  const progress = steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

  const handleRetry = () => {
    if (currentStepIndex >= 0 && steps[currentStepIndex]) {
      updateStep(steps[currentStepIndex].id, { status: 'pending', errorMessage: undefined });
      setPlaybackStatus('playing');
    }
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[60] w-full max-w-2xl px-4">
      <div className={`bg-white/70 backdrop-blur-2xl border ${isError ? 'border-red-200 shadow-red-100' : 'border-white shadow-neutral-100'} rounded-[32px] p-4 shadow-[0_30px_60px_rgba(45,36,30,0.15)] flex flex-col space-y-4 transition-all duration-500`}>
        
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-[#FDF2E9] rounded-full overflow-hidden relative">
          <div 
            className={`absolute left-0 top-0 h-full transition-all duration-700 ease-out ${isError ? 'bg-red-500' : 'bg-[#E67E22]'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full ${isError ? 'bg-red-50' : 'bg-[#FAD7BD]/40'} flex items-center justify-center transition-colors`}>
              {isError ? <AlertTriangle size={14} className="text-red-500" /> : <Zap size={14} className="text-[#E67E22]" />}
            </div>
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isError ? 'text-red-400' : 'text-[#BBAFA7]'}`}>
                {isError ? 'Playback Error' : `Step ${currentStepIndex + 1} of ${steps.length}`}
              </span>
              <span className="text-xs font-bold text-[#2D241E] truncate max-w-[180px]">
                {currentStepIndex >= 0 ? steps[currentStepIndex]?.action : 'Ready to start'}
              </span>
            </div>
          </div>

          <div className="flex items-center bg-[#FDF2E9] rounded-full p-1.5 space-x-1">
            <button 
              onClick={() => setPlaybackIndex(Math.max(0, currentStepIndex - 1))}
              disabled={isPlaying}
              className="w-10 h-10 flex items-center justify-center hover:bg-white disabled:opacity-30 rounded-full transition-all text-[#6B5E55]"
            >
              <ChevronLeft size={18} />
            </button>

            {isError ? (
              <button 
                onClick={handleRetry}
                className="w-12 h-12 flex items-center justify-center bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition-all"
                title="Retry Step"
              >
                <RefreshCcw size={20} />
              </button>
            ) : (
              <button 
                onClick={isPlaying ? pausePlayback : startPlayback}
                className="w-12 h-12 flex items-center justify-center bg-[#2D241E] text-white rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-1" fill="currentColor" />}
              </button>
            )}

            <button 
              onClick={() => setPlaybackIndex(Math.min(steps.length - 1, currentStepIndex + 1))}
              disabled={isPlaying}
              className="w-10 h-10 flex items-center justify-center hover:bg-white disabled:opacity-30 rounded-full transition-all text-[#6B5E55]"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button 
              onClick={stopPlayback}
              className="w-10 h-10 flex items-center justify-center bg-white border border-black/5 hover:bg-[#FDF2E9] rounded-full transition-all text-[#BBAFA7] hover:text-[#2D241E]"
              title="Stop Replay"
            >
              <Square size={16} fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaybackControls;
