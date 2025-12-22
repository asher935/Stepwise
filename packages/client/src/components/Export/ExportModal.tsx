import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, FileCode, Shield, Sparkles, CheckCircle2, X, Eye, EyeOff, Check } from 'lucide-react';
import type { ExportFormat } from '@stepwise/shared';

import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guideTitle: string;
  setGuideTitle: (title: string) => void;
}

const FORMATS: { value: ExportFormat; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  { value: 'pdf', label: 'PDF', description: 'Pro Print', icon: <FileText size={24} />, color: 'text-red-500' },
  { value: 'docx', label: 'Word', description: 'DOCX', icon: <FileText size={24} />, color: 'text-blue-600' },
  { value: 'html', label: 'Web', description: 'HTML', icon: <FileCode size={24} />, color: 'text-amber-600' },
  { value: 'markdown', label: 'Markdown', description: 'Tech Docs', icon: <FileCode size={24} />, color: 'text-slate-600' },
  { value: 'stepwise', label: 'Stepwise', description: 'Encrypted', icon: <Shield size={24} />, color: 'text-[#E67E22]' },
];

export function ExportModal({ open, onOpenChange, guideTitle, setGuideTitle }: ExportModalProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(['pdf']);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Close modal on ESC key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  const toggleFormat = (f: ExportFormat) => {
    setSelectedFormats(prev =>
      prev.includes(f)
        ? prev.filter(item => item !== f)
        : [...prev, f]
    );
  };

  const handleExport = useCallback(async () => {
    if (!sessionId || selectedFormats.length === 0) return;

    setIsExporting(true);
    try {
      const result = await api.exportSession(sessionId, {
        formats: selectedFormats,
        title: guideTitle,
        password: selectedFormats.includes('stepwise') && password ? password : undefined,
        includeScreenshots: true,
      });

      const blob = await api.downloadExport(sessionId, result.filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, selectedFormats, guideTitle, password, onOpenChange]);

  const hasStepwise = selectedFormats.includes('stepwise');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#FAD7BD]/20 blur-3xl pointer-events-none" />

        <div className="p-10 md:p-14 space-y-10 relative">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAD7BD]/30 text-[#E67E22] text-[10px] font-black uppercase tracking-widest mb-2">
                <Sparkles size={12} className="mr-1.5" />
                Multi-Format Export
              </div>
              <h2 className="text-4xl font-black text-[#2D241E] tracking-tight">Export Package</h2>
              <p className="text-[#6B5E55] font-medium text-sm">Select all the formats you need for your guide.</p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
            >
              <X size={20} className="text-[#BBAFA7]" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
                Guide Title
              </label>
              <input
                type="text"
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
                placeholder="Enter guide title..."
                className="w-full bg-[#FDF2E9] border border-black/5 rounded-[24px] py-4 px-6 text-sm font-bold text-[#2D241E] focus:ring-2 ring-[#E67E22]/20 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {FORMATS.map((f) => (
                <FormatOption
                  key={f.value}
                  active={selectedFormats.includes(f.value)}
                  onClick={() => toggleFormat(f.value)}
                  icon={f.icon}
                  label={f.label}
                  desc={f.description}
                  color={f.color}
                />
              ))}
            </div>

            {hasStepwise && (
              <div className="space-y-3 animate-in slide-in-from-top-4 duration-500">
                <label className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
                  Privacy Password (Stepwise Format)
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set decryption password..."
                    className="w-full bg-[#FDF2E9] border border-black/5 rounded-[24px] py-4 pl-6 pr-14 text-sm font-bold text-[#2D241E] focus:ring-2 ring-[#E67E22]/20 outline-none transition-all"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#BBAFA7] hover:text-[#2D241E] transition-colors"
                    type="button"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={isExporting || selectedFormats.length === 0}
              className={`
                w-full py-6 rounded-[32px] font-black text-lg transition-all active:scale-95 flex items-center justify-center space-x-3
                ${isExporting
                  ? 'bg-[#BBAFA7] cursor-not-allowed text-white'
                  : selectedFormats.length === 0
                    ? 'bg-[#BBAFA7]/30 text-white cursor-not-allowed'
                    : 'bg-[#2D241E] hover:bg-[#1A1512] text-white shadow-xl shadow-[#2D241E]/10'}
              `}
            >
              {isExporting ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Download size={24} />
                  <span>
                    {selectedFormats.length === 0
                      ? 'Select Format'
                      : `Generate ${selectedFormats.length} Guide${selectedFormats.length > 1 ? 's' : ''}`}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center space-x-2 pt-2 text-[#BBAFA7] text-[10px] font-black uppercase tracking-widest">
            <CheckCircle2 size={12} className="text-[#E67E22]" />
            <span>High-resolution captures included</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const FormatOption: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
  onClick: () => void;
}> = ({ active, icon, label, desc, color, onClick }) => (
  <button
    onClick={onClick}
    type="button"
    className={`
      group flex flex-col items-center text-center p-6 rounded-[32px] border transition-all duration-500 relative overflow-hidden
      ${active
        ? 'bg-[#FAD7BD]/30 border-[#E67E22]/30 shadow-sm'
        : 'bg-white border-black/5 hover:border-[#FAD7BD] hover:bg-[#FDF2E9]/50 shadow-none'}
    `}
  >
    <div className={`
      mb-4 p-4 rounded-[20px] transition-all duration-500
      ${active ? 'bg-white shadow-md scale-110 ' + color : 'bg-[#FDF2E9] text-[#BBAFA7] group-hover:scale-105'}
    `}>
      {icon}
    </div>
    <span className={`text-sm font-black tracking-tight ${active ? 'text-[#2D241E]' : 'text-[#6B5E55]'}`}>{label}</span>
    <span className="text-[9px] text-[#BBAFA7] font-black uppercase mt-1 tracking-widest">{desc}</span>

    <div className={`
      absolute top-3 right-3 w-5 h-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center
      ${active ? 'bg-[#E67E22] border-[#E67E22] scale-100' : 'bg-transparent border-black/10 scale-90'}
    `}>
      {active && <Check size={12} className="text-white" />}
    </div>
  </button>
);
