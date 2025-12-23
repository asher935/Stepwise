import { useState, useCallback } from 'react';
import { Play, Lock, Layers, ShieldCheck, Search, FileUp, Shield } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';

interface LobbyProps {
  onImportClick: () => void;
}

export function Lobby({ onImportClick }: LobbyProps) {
  const createSession = useSessionStore((s) => s.createSession);
  const startSession = useSessionStore((s) => s.startSession);
  const isLoading = useSessionStore((s) => s.isLoading);
  const error = useSessionStore((s) => s.error);
  const [url, setUrl] = useState('');

  const handleStart = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url) return;

    await createSession();
    const startUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    await startSession(startUrl);
  }, [createSession, startSession, url]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 md:p-12 relative">
      <div className="max-w-5xl w-full flex flex-col items-center space-y-16">

        {/* Header Section */}
        <div className="text-center space-y-6">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/40 border border-white/60 text-[#E67E22] text-xs font-bold uppercase tracking-wider mb-2">
            <Shield className="w-3.5 h-3.5 mr-2" />
            100% Private & Local
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tight text-[#2D241E]">
            Stepwise<span className="text-[#E67E22]">!</span>
          </h1>
          <p className="text-xl text-[#6B5E55] max-w-xl mx-auto leading-relaxed font-medium">
            Turn your browser interactions into beautiful, <br />structured guides automatically.
          </p>
        </div>

        {/* Action Center - Pill Input */}
        <form
          onSubmit={handleStart}
          className="w-full max-w-xl group relative"
        >
          <div className="relative flex items-center bg-white/80 backdrop-blur-2xl border border-white rounded-[40px] p-2.5 shadow-[0_20px_50px_rgba(45,36,30,0.08)] transition-all duration-500 hover:shadow-[0_25px_60px_rgba(45,36,30,0.12)]">
            <div className="pl-5 text-[#BBAFA7]">
              <Search className="w-6 h-6" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter target website URL..."
              disabled={isLoading}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-lg px-4 py-3 placeholder:text-[#BBAFA7] font-semibold text-[#2D241E] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !url}
              className="bg-[#2D241E] hover:bg-[#1A1512] disabled:opacity-50 text-white w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-90"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>
          </div>
        </form>

        {/* Error Display */}
        {error && (
          <div className="text-sm text-red-600 text-center font-medium px-4 py-2 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        {/* Bento Grid Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          <BentoItem
            icon={<Layers className="w-6 h-6 text-[#E67E22]" />}
            title="UI/UX Driven"
            desc="Capture every visual nuance of your interaction."
            bgColor="bg-[#FAD7BD]/30"
          />
          <BentoItem
            icon={<Lock className="w-6 h-6 text-[#2D241E]" />}
            title="Zero-Storage"
            desc="No database, no cloud accounts, and no tracking."
            bgColor="bg-white"
            isFeatured
          />
          <BentoItem
            icon={<ShieldCheck className="w-6 h-6 text-emerald-600" />}
            title="Safe Export"
            desc="Package guides with industrial encryption."
            bgColor="bg-[#E2F0D9]/40"
          />
        </div>

        {/* Import Button */}
        <button
          onClick={onImportClick}
          disabled={isLoading}
          className="flex items-center space-x-2 text-[#6B5E55] hover:text-[#2D241E] font-bold text-sm tracking-wide transition-all uppercase active:scale-95 disabled:opacity-50"
        >
          <FileUp className="w-4 h-4" />
          <span>Import existing guide</span>
        </button>
      </div>

    </div>
  );
}

const BentoItem: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  bgColor: string;
  isFeatured?: boolean;
}> = ({ icon, title, desc, bgColor, isFeatured }) => (
  <div className={`p-10 rounded-[48px] ${bgColor} border ${isFeatured ? 'border-[#2D241E]/5 shadow-xl' : 'border-white/60'
    } transition-all duration-500 hover:-translate-y-2 group overflow-hidden relative`}>
    <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/20 blur-2xl group-hover:bg-white/40 transition-all"></div>

    <div className="mb-6 p-4 rounded-[24px] bg-white w-fit shadow-sm group-hover:scale-110 transition-transform duration-500">
      {icon}
    </div>
    <h3 className="text-xl font-extrabold mb-3 text-[#2D241E]">{title}</h3>
    <p className="text-[#6B5E55] text-sm leading-relaxed font-medium">{desc}</p>
  </div>
);
