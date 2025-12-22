import React, { useState } from 'react';
import { useApp } from '../store';
import { Bug, X, ChevronUp, ChevronDown, Terminal, Activity } from 'lucide-react';

const DebugOverlay: React.FC = () => {
  const { debugLogs, session } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-[100] w-14 h-14 bg-white border border-black/5 rounded-full flex items-center justify-center text-[#BBAFA7] hover:text-[#E67E22] transition-all hover:scale-110 shadow-xl"
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
          Engine Diagnostics
        </div>
        <button onClick={() => setIsOpen(false)} className="text-[#BBAFA7] hover:text-[#2D241E] transition active:scale-90">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="p-4 bg-[#FDF2E9] rounded-[24px] border border-black/5 space-y-2">
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Session</span>
            <span className="text-[#2D241E]">{session.id || 'NONE'}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono font-bold">
            <span className="text-[#BBAFA7] uppercase">Pipeline</span>
            <span className={session.connected ? 'text-[#E67E22]' : 'text-red-400'}>
              {session.connected ? 'STABLE' : 'INTERRUPTED'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {debugLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
               <div className="w-10 h-10 rounded-full border border-dashed border-[#BBAFA7] flex items-center justify-center text-[#BBAFA7]">
                 <Terminal size={14} />
               </div>
               <p className="text-[10px] text-[#BBAFA7] font-black uppercase tracking-widest">Awaiting interaction...</p>
            </div>
          ) : (
            debugLogs.map((log, i) => (
              <div key={i} className="group pb-3 border-b border-black/5 last:border-0">
                <div className="flex items-center justify-between text-[10px] mb-1.5">
                  <span className="text-[#2D241E] font-black uppercase tracking-widest">{log.type}</span>
                  <span className="text-[#BBAFA7] font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="bg-[#FFF9F5] p-3 rounded-2xl border border-black/5 overflow-hidden">
                  <pre className="text-[10px] font-mono text-[#6B5E55] truncate group-hover:whitespace-pre-wrap group-hover:break-all transition-all">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      <div className="p-4 bg-[#FDF2E9]/60 border-t border-black/5 text-[9px] text-[#BBAFA7] font-black uppercase tracking-[0.2em] text-center">
        Stepwise Engine • v1.0.4-LITE
      </div>
    </div>
  );
};

export default DebugOverlay;