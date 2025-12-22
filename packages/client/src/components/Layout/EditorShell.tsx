import { useState, useEffect } from 'react';
import { Download, Upload, LogOut, Menu, X, Power, Zap } from 'lucide-react';
import { Toolbar } from '@/components/Browser/Toolbar';
import { Viewport } from '@/components/Browser/Viewport';
import { DebugOverlay } from '@/components/Debug/DebugOverlay';
import { ExportModal } from '@/components/Export/ExportModal';
import { ImportModal } from '@/components/Import/ImportModal';
import { StepsList } from '@/components/Steps/StepsList';
import { useSessionStore } from '@/stores/sessionStore';

export function EditorShell() {
  const endSession = useSessionStore((s) => s.endSession);
  const initWebSocket = useSessionStore((s) => s.initWebSocket);
  const steps = useSessionStore((s) => s.steps);
  const sessionId = useSessionStore((s) => s.sessionId);
  const isConnected = useSessionStore((s) => s.isConnected);
  const guideTitle = useSessionStore((s) => s.guideTitle);
  const setGuideTitle = useSessionStore((s) => s.setGuideTitle);

  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const cleanup = initWebSocket();
    return cleanup;
  }, [initWebSocket]);

  const handleConfirmFinish = async () => {
    await endSession();
    setShowFinish(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#FDF2E9] overflow-hidden text-[#2D241E]">
      {/* Header */}
      <header className="h-20 border-b border-black/5 bg-white/40 backdrop-blur-xl px-6 flex items-center justify-between z-50">
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/60 rounded-full text-[#2D241E] transition-all active:scale-90"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex flex-col">
            <input
              type="text"
              value={guideTitle}
              onChange={(e) => setGuideTitle(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-lg font-extrabold text-[#2D241E] w-64 p-0"
            />
            <span className="text-[10px] font-bold text-[#BBAFA7] uppercase tracking-[0.2em]">
              SESSION • {sessionId?.toUpperCase() || 'CONNECTING...'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center bg-white/60 px-4 py-2 rounded-full border border-white shadow-sm">
            <div className={`w-2.5 h-2.5 rounded-full mr-2.5 ${isConnected ? 'bg-[#E67E22] animate-pulse shadow-[0_0_8px_#E67E22]' : 'bg-red-400'}`} />
            <span className="text-[10px] uppercase font-black tracking-widest text-[#6B5E55]">
              {isConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          <button
            onClick={() => setShowImport(true)}
            className="flex items-center px-6 py-3 bg-white hover:bg-[#FDF2E9] border border-white rounded-full text-sm font-bold shadow-sm transition active:scale-95"
          >
            <Upload size={16} className="mr-2" />
            Import
          </button>

          <button
            onClick={() => setShowExport(true)}
            className="flex items-center px-6 py-3 bg-white hover:bg-[#FDF2E9] border border-white rounded-full text-sm font-bold shadow-sm transition active:scale-95"
            disabled={steps.length === 0}
          >
            <Download size={16} className="mr-2" />
            Export
          </button>

          <button
            onClick={() => setShowFinish(true)}
            className="flex items-center px-6 py-3 bg-[#2D241E] hover:bg-[#1A1512] text-white rounded-full text-sm font-bold shadow-lg transition active:scale-95"
          >
            <Power size={16} className="mr-2" />
            Finish
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - Steps List */}
        <aside
          className={`
            fixed lg:relative z-40 h-[calc(100vh-80px)] bg-white/20 backdrop-blur-2xl border-r border-black/5
            transition-all duration-500 ease-in-out
            ${sidebarOpen ? 'w-[400px] translate-x-0 opacity-100' : 'w-0 -translate-x-full opacity-0'}
          `}
        >
          <div className="p-8 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#2D241E]">Steps</h2>
            <div className="w-10 h-10 rounded-full bg-[#E67E22] text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-[#E67E22]/20">
              {steps.length}
            </div>
          </div>
          <div className="overflow-y-auto h-full pb-48 px-6 scrollbar-thin">
            <StepsList />
          </div>
        </aside>

        {/* Browser Area */}
        <main className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
          <Toolbar />
          <Viewport />
        </main>
      </div>

      <ExportModal open={showExport} onOpenChange={setShowExport} guideTitle={guideTitle} setGuideTitle={setGuideTitle} />
      <ImportModal open={showImport} onOpenChange={setShowImport} setGuideTitle={setGuideTitle} />
      <DebugOverlay />

      {/* Finish Modal */}
      {showFinish && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500"
            onClick={() => setShowFinish(false)}
          />

          <div className="relative w-full max-w-md bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
            <div className="p-10 md:p-12 space-y-8 relative">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 bg-[#FAD7BD]/30 rounded-[32px] flex items-center justify-center text-[#E67E22] mb-2">
                  <Power size={40} />
                </div>
                <h2 className="text-3xl font-black text-[#2D241E] tracking-tight">Finish Session?</h2>
                <div className="space-y-3 px-2">
                  <p className="text-[#6B5E55] font-bold text-sm leading-relaxed">
                    Stepwise does not auto-save your progress.
                  </p>
                  <p className="text-[#6B5E55] font-medium text-xs leading-relaxed opacity-80">
                    Please ensure you have exported your work. Ending the session now will <span className="text-[#E67E22] font-black">permanently delete</span> all unsaved steps.
                  </p>
                </div>
              </div>

              <div className="flex flex-col space-y-3">
                <button
                  onClick={handleConfirmFinish}
                  className="w-full py-5 bg-[#2D241E] hover:bg-[#1A1512] text-white rounded-[28px] font-black text-base shadow-xl shadow-[#2D241E]/10 transition-all active:scale-95 flex items-center justify-center space-x-2"
                >
                  <LogOut size={20} />
                  <span>I Understand, End Session</span>
                </button>
                <button
                  onClick={() => setShowFinish(false)}
                  className="w-full py-5 bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-[28px] font-black text-base text-[#6B5E55] transition-all active:scale-95"
                >
                  Go Back to Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
