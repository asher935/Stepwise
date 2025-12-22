
import React, { useState } from 'react';
import { X, FileText, FileCode, Download, Shield, Eye, EyeOff, Sparkles, CheckCircle2, FileUp, UploadCloud, FileCheck, AlertCircle, LogOut } from 'lucide-react';
import { useApp } from '../store';

export const FinishModal: React.FC<{ onClose: () => void; onConfirm: () => void }> = ({ onClose, onConfirm }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="p-10 md:p-12 space-y-8 relative">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-20 h-20 bg-[#FAD7BD]/30 rounded-[32px] flex items-center justify-center text-[#E67E22] mb-2">
              <AlertCircle size={40} />
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
              onClick={onConfirm}
              className="w-full py-5 bg-[#2D241E] hover:bg-[#1A1512] text-white rounded-[28px] font-black text-base shadow-xl shadow-[#2D241E]/10 transition-all active:scale-95 flex items-center justify-center space-x-2"
            >
              <LogOut size={20} />
              <span>I Understand, End Session</span>
            </button>
            <button 
              onClick={onClose}
              className="w-full py-5 bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-[28px] font-black text-base text-[#6B5E55] transition-all active:scale-95"
            >
              Go Back to Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { session } = useApp();
  const [format, setFormat] = useState<'pdf' | 'md' | 'stepwise'>('pdf');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-xl bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#FAD7BD]/20 blur-3xl pointer-events-none" />
        
        <div className="p-10 md:p-14 space-y-10 relative">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAD7BD]/30 text-[#E67E22] text-[10px] font-black uppercase tracking-widest mb-2">
                <Sparkles size={12} className="mr-1.5" />
                Ready for Packaging
              </div>
              <h2 className="text-4xl font-black text-[#2D241E] tracking-tight">Export Guide</h2>
              <p className="text-[#6B5E55] font-medium text-sm">Convert your session into a professional guide.</p>
            </div>
            <button 
              onClick={onClose} 
              className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
            >
              <X size={20} className="text-[#BBAFA7]" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormatOption 
                active={format === 'pdf'} 
                onClick={() => setFormat('pdf')}
                icon={<FileText size={24} />}
                label="PDF"
                desc="Pro Print"
                color="text-blue-500"
              />
              <FormatOption 
                active={format === 'md'} 
                onClick={() => setFormat('md')}
                icon={<FileCode size={24} />}
                label="Markdown"
                desc="Tech Docs"
                color="text-orange-500"
              />
              <FormatOption 
                active={format === 'stepwise'} 
                onClick={() => setFormat('stepwise')}
                icon={<Shield size={24} />}
                label="Stepwise"
                desc="Encrypted"
                color="text-[#E67E22]"
              />
            </div>

            {format === 'stepwise' && (
              <div className="space-y-3 animate-in slide-in-from-top-4 duration-500">
                <label className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
                  Privacy Password
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
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            )}

            <button 
              onClick={handleExport}
              disabled={isExporting}
              className={`
                w-full py-6 rounded-[32px] font-black text-lg transition-all active:scale-95 flex items-center justify-center space-x-3
                ${isExporting 
                  ? 'bg-[#BBAFA7] cursor-not-allowed text-white' 
                  : 'bg-[#2D241E] hover:bg-[#1A1512] text-white shadow-xl shadow-[#2D241E]/10'}
              `}
            >
              {isExporting ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Download size={24} />
                  <span>Generate Guide</span>
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
};

export const ImportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { loadSession } = useApp();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = () => {
    if (!selectedFile) return;
    setIsImporting(true);
    
    // Mocking an imported session
    setTimeout(() => {
      loadSession({
        id: 'imp-' + Math.random().toString(36).substr(2, 5),
        title: 'Imported Tutorial Guide',
        initialUrl: 'https://example.com',
        steps: [
          {
            id: 's1',
            number: 1,
            action: 'Navigated to the dashboard',
            url: 'https://example.com/dashboard',
            timestamp: Date.now(),
            screenshot: 'https://picsum.photos/seed/import1/1280/720'
          },
          {
            id: 's2',
            number: 2,
            action: 'Clicked the settings icon in the top right',
            url: 'https://example.com/settings',
            timestamp: Date.now(),
            screenshot: 'https://picsum.photos/seed/import2/1280/720'
          }
        ]
      });
      setIsImporting(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose} />
      
      <div className="relative w-full max-w-xl bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="p-10 md:p-14 space-y-10 relative">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#E2F0D9]/60 text-emerald-700 text-[10px] font-black uppercase tracking-widest mb-2">
                <FileUp size={12} className="mr-1.5" />
                Restore Guide
              </div>
              <h2 className="text-4xl font-black text-[#2D241E] tracking-tight">Import Guide</h2>
              <p className="text-[#6B5E55] font-medium text-sm">Load a previously recorded .stepwise file.</p>
            </div>
            <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition active:scale-90 shadow-sm">
              <X size={20} className="text-[#BBAFA7]" />
            </button>
          </div>

          <div className="space-y-8">
            <div 
              onClick={() => setSelectedFile('tutorial-guide.stepwise')}
              className={`
                group relative border-2 border-dashed rounded-[40px] p-12 flex flex-col items-center justify-center transition-all cursor-pointer
                ${selectedFile ? 'bg-emerald-50 border-emerald-200' : 'bg-[#FDF2E9]/40 border-black/5 hover:border-[#E67E22]/20 hover:bg-[#FDF2E9]'}
              `}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center animate-in zoom-in duration-300">
                   <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-md mb-4 text-emerald-500">
                      <FileCheck size={40} />
                   </div>
                   <span className="text-sm font-black text-[#2D241E]">{selectedFile}</span>
                   <span className="text-[10px] font-bold text-emerald-600 uppercase mt-1">Ready to Load</span>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6 text-[#BBAFA7] group-hover:scale-110 group-hover:text-[#E67E22] transition-all">
                    <UploadCloud size={40} />
                  </div>
                  <p className="text-sm font-bold text-[#6B5E55] text-center px-8">
                    Drag and drop your file here, or <br/>
                    <span className="text-[#E67E22]">click to browse</span>
                  </p>
                </>
              )}
            </div>

            <button 
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
              className={`
                w-full py-6 rounded-[32px] font-black text-lg transition-all active:scale-95 flex items-center justify-center space-x-3
                ${isImporting 
                  ? 'bg-[#BBAFA7] cursor-not-allowed text-white' 
                  : selectedFile 
                    ? 'bg-[#2D241E] hover:bg-[#1A1512] text-white shadow-xl shadow-[#2D241E]/10'
                    : 'bg-[#BBAFA7]/30 text-white cursor-not-allowed'}
              `}
            >
              {isImporting ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <FileUp size={24} />
                  <span>Resume Recording</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const FormatOption: React.FC<{ 
  active: boolean; 
  icon: React.ReactNode; 
  label: string; 
  desc: string; 
  color: string;
  onClick: () => void 
}> = ({ active, icon, label, desc, color, onClick }) => (
  <button 
    onClick={onClick}
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
    {active && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#E67E22]" />}
  </button>
);
