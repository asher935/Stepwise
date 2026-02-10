import { useReplayStore } from '../../stores/replayStore';
import { useSessionStore } from '../../stores/sessionStore';
import { Play, Pause, Square, ChevronLeft, ChevronRight, Zap, RefreshCcw, AlertTriangle } from 'lucide-react';

export function ReplayControls() {
  const {
    status,
    currentStepIndex,
    totalSteps,
    startReplay,
    pauseReplay,
    stopReplay,
    setPlaybackIndex,
  } = useReplayStore();

  const { steps } = useSessionStore();

  const totalStepCount = totalSteps > 0 ? totalSteps : steps.length;
  const progress = totalStepCount > 0 ? ((currentStepIndex + 1) / totalStepCount) * 100 : 0;
  const isPlaying = status === 'playing';
  const isError = status === 'error';

  const handleRetry = () => {
    if (currentStepIndex >= 0 && steps[currentStepIndex]) {
      const step = steps[currentStepIndex];
      useSessionStore.getState().updateStep(step.id, { status: 'pending' } as { caption?: string }).catch(console.error);
      startReplay();
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      pauseReplay();
    } else {
      startReplay();
    }
  };

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div className={`bg-white/70 backdrop-blur-2xl border ${isError ? 'border-red-200 shadow-red-100' : 'border-white shadow-neutral-100'} rounded-[32px] p-4 shadow-[0_30px_60px_rgba(45,36,30,0.15)] flex flex-col space-y-4 transition-all duration-500`}>
        <div className="w-full h-1.5 bg-[#FDF2E9] rounded-full overflow-hidden relative">
          <div 
            className={`absolute left-0 top-0 h-full transition-all duration-700 ease-out ${isError ? 'bg-red-500' : 'bg-[#E67E22]'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-2 px-2">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-full ${isError ? 'bg-red-50' : 'bg-[#FAD7BD]/40'} flex items-center justify-center transition-colors`}>
              {isError ? <AlertTriangle size={14} className="text-red-500" /> : <Zap size={14} className="text-[#E67E22]" />}
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${isError ? 'text-red-400' : 'text-[#BBAFA7]'}`}>
                {isError ? 'Playback Error' : `Step ${currentStepIndex + 1} of ${totalStepCount}`}
              </span>
              <span className="text-xs font-bold text-[#2D241E] truncate">
                {currentStepIndex >= 0 ? steps[currentStepIndex]?.caption || steps[currentStepIndex]?.action : 'Ready to start'}
              </span>
            </div>
          </div>

          <div className="flex items-center bg-[#FDF2E9] rounded-full p-1.5 space-x-1 shrink-0">
            <button 
              type="button"
              onClick={() => setPlaybackIndex(Math.max(0, currentStepIndex - 1))}
              disabled={isPlaying}
              className="w-10 h-10 flex items-center justify-center hover:bg-white disabled:opacity-30 rounded-full transition-all text-[#6B5E55]"
            >
              <ChevronLeft size={18} />
            </button>

            {isError ? (
              <button 
                type="button"
                onClick={handleRetry}
                className="w-12 h-12 flex items-center justify-center bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition-all"
                title="Retry Step"
              >
                <RefreshCcw size={20} />
              </button>
            ) : (
              <button 
                type="button"
                onClick={handleTogglePlay}
                className="w-12 h-12 flex items-center justify-center bg-[#2D241E] text-white rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-1" fill="currentColor" />}
              </button>
            )}

            <button 
              type="button"
              onClick={() => setPlaybackIndex(Math.min(totalStepCount - 1, currentStepIndex + 1))}
              disabled={isPlaying}
              className="w-10 h-10 flex items-center justify-center hover:bg-white disabled:opacity-30 rounded-full transition-all text-[#6B5E55]"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button 
              type="button"
              onClick={stopReplay}
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
}
