import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store';
import { ChevronLeft, ChevronRight, RotateCw, Globe, ShieldCheck, Zap, PlusCircle } from 'lucide-react';
import { enhanceStepDescription } from '../geminiService';

const BrowserViewport: React.FC = () => {
  const { session, addStep, addDebugLog } = useApp();
  const [currentUrl, setCurrentUrl] = useState(session.initialUrl);
  const [isNavigating, setIsNavigating] = useState(false);

  const handleInteraction = async (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    addDebugLog('user_click', { x, y, url: currentUrl });

    const rawAction = `Clicked near interaction area at (${Math.round(x)}, ${Math.round(y)})`;
    const aiDesc = await enhanceStepDescription(rawAction, `Current page: ${currentUrl}`);

    addStep({
      id: Math.random().toString(36).substr(2, 9),
      action: aiDesc,
      url: currentUrl,
      timestamp: Date.now(),
      screenshot: `https://picsum.photos/seed/${Math.random()}/1280/720`,
      aiDescription: aiDesc
    });
  };

  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 1200);
    return () => clearTimeout(timer);
  }, [currentUrl]);

  return (
    <div className="flex-1 flex flex-col p-8 overflow-hidden">
      <div className="flex flex-col flex-1 bg-white rounded-[48px] shadow-[0_40px_80px_rgba(45,36,30,0.1)] border border-white overflow-hidden relative">
        
        {/* Browser Chrome */}
        <div className="h-16 bg-[#FDF2E9]/60 backdrop-blur-md border-b border-black/5 flex items-center px-6 space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-400/20 border border-red-400/40"></div>
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
              className={`w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-white/80 ${isNavigating ? 'animate-spin' : ''}`}
            >
              <RotateCw size={16} />
            </button>
          </div>
          
          <div className="flex-1 relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E67E22]">
              <ShieldCheck size={14} />
            </div>
            <input
              type="text"
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              className="w-full bg-white border border-black/5 rounded-full py-2.5 pl-10 pr-4 text-xs font-bold text-[#6B5E55] focus:border-[#E67E22]/40 outline-none transition-all shadow-sm group-hover:shadow-md"
            />
          </div>

          <div className="hidden md:flex items-center space-x-2 text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest bg-white/40 px-3 py-1.5 rounded-full border border-white">
            <span className="text-[#E67E22]">1920</span>
            <span className="opacity-40">×</span>
            <span className="text-[#E67E22]">1080</span>
          </div>
        </div>

        {/* Viewport Surface */}
        <div 
          className="flex-1 bg-[#FFF9F5] relative overflow-hidden cursor-crosshair group"
          onClick={handleInteraction}
        >
          {isNavigating && (
            <div className="absolute inset-0 z-50 bg-[#FDF2E9]/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-500">
               <div className="flex flex-col items-center space-y-6">
                 <div className="relative">
                    <div className="w-24 h-24 border-4 border-[#E67E22]/10 border-t-[#E67E22] rounded-full animate-spin" />
                    <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#E67E22] fill-current" size={32} />
                 </div>
                 <p className="text-[#2D241E] font-black uppercase tracking-widest text-sm animate-pulse">Syncing Browser...</p>
               </div>
            </div>
          )}

          {/* Interactive Simulation */}
          <div className="h-full flex flex-col items-center justify-center p-12">
            <div className="max-w-md w-full p-10 bg-white rounded-[48px] shadow-[0_20px_50px_rgba(45,36,30,0.06)] border border-black/5 space-y-8 animate-in slide-in-from-bottom-8 duration-700">
              <div className="flex justify-between items-center">
                <h2 className="text-4xl font-black text-[#2D241E]">Login</h2>
                <div className="w-12 h-12 rounded-2xl bg-[#FAD7BD] flex items-center justify-center">
                  <Zap className="text-[#E67E22]" />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-black uppercase text-[#BBAFA7] tracking-widest">Email Address</label>
                  </div>
                  <div className="w-full h-14 bg-[#FDF2E9] rounded-2xl border border-black/5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-[#BBAFA7] tracking-widest">Password</label>
                  <div className="w-full h-14 bg-[#FDF2E9] rounded-2xl border border-black/5" />
                </div>
                <button className="w-full py-5 bg-[#2D241E] text-white font-black rounded-3xl shadow-xl shadow-[#2D241E]/10 transition-all hover:scale-[1.02] active:scale-95">
                  Sign in to Continue
                </button>
              </div>
              <p className="text-center text-xs font-bold text-[#BBAFA7] uppercase tracking-widest leading-relaxed">
                Interactions are being <br/>captured by Stepwise AI.
              </p>
            </div>
          </div>

          {/* Floating Recording Tag */}
          <div className="absolute bottom-8 right-8 bg-[#2D241E] px-6 py-3 rounded-full text-[10px] font-black text-white tracking-[0.2em] shadow-2xl flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0">
             <div className="w-2 h-2 rounded-full bg-[#E67E22] animate-pulse" />
             <span>LIVE CAPTURE ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrowserViewport;