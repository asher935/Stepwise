
import React, { useState } from 'react';
import { useApp } from '../store';
import { 
  Menu, X, Power, Download, Zap, ChevronLeft
} from 'lucide-react';
import StepCard from './StepCard';
import BrowserViewport from './BrowserViewport';
import StepInsertionPoint from './StepInsertionPoint';
import { ExportModal, FinishModal } from './Modals';

const EditorShell: React.FC = () => {
  const { session, resetSession, addDebugLog } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [guideTitle, setGuideTitle] = useState(session.title);

  const handleConfirmFinish = () => {
    addDebugLog('session_end', { id: session.id });
    resetSession();
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
              SESSION • {session.id.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center bg-white/60 px-4 py-2 rounded-full border border-white shadow-sm">
            <div className={`w-2.5 h-2.5 rounded-full mr-2.5 ${session.connected ? 'bg-[#E67E22] animate-pulse shadow-[0_0_8px_#E67E22]' : 'bg-red-400'}`} />
            <span className="text-[10px] uppercase font-black tracking-widest text-[#6B5E55]">
              {session.connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          
          <button 
            onClick={() => setShowExport(true)}
            className="flex items-center px-6 py-3 bg-white hover:bg-[#FDF2E9] border border-white rounded-full text-sm font-bold shadow-sm transition active:scale-95"
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
              {session.steps.length}
            </div>
          </div>
          <div className="overflow-y-auto h-full pb-48 px-6 space-y-2 scrollbar-thin">
            {session.steps.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
                <div className="w-20 h-20 bg-white/60 rounded-[32px] flex items-center justify-center shadow-inner">
                  <Zap className="text-[#BBAFA7]" size={32} />
                </div>
                <p className="text-sm text-[#6B5E55] font-semibold leading-relaxed">
                  Start interacting with the browser <br/>to record your first step.
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {session.steps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    {/* Only show insertion point BEFORE step 1 if user wants, 
                        but usually between steps makes more sense */}
                    {index > 0 && <StepInsertionPoint index={index} />}
                    <StepCard step={step} />
                  </React.Fragment>
                ))}
                {/* Always allow adding one at the very end if needed */}
                {session.steps.length > 0 && <StepInsertionPoint index={session.steps.length} />}
              </div>
            )}
          </div>
        </aside>

        {/* Browser Area */}
        <main className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
          <BrowserViewport />
        </main>
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showFinish && <FinishModal onClose={() => setShowFinish(false)} onConfirm={handleConfirmFinish} />}
    </div>
  );
};

export default EditorShell;
