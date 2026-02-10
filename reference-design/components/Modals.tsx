
import React, { useState } from 'react';
import { X, FileText, FileCode, Download, Shield, Eye, EyeOff, Lock, CheckCircle2, FileUp, UploadCloud, FileCheck, AlertCircle, LogOut, Check } from 'lucide-react';
import { useApp } from '../store';

type ExportFormat = 'pdf' | 'docx' | 'html' | 'md' | 'stepwise';

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
              <Shield size={40} />
            </div>
            <h2 className="text-3xl font-black text-[#2D241E] tracking-tight">End Private Session?</h2>
            <div className="space-y-3 px-2">
              <p className="text-[#6B5E55] font-bold text-sm leading-relaxed">
                Stepwise uses zero-storage architecture.
              </p>
              <p className="text-[#6B5E55] font-medium text-xs leading-relaxed opacity-80">
                Your data exists only in RAM. Once you end this session, all steps will be <span className="text-[#E67E22] font-black">wiped from memory</span> and cannot be recovered.
              </p>
            </div>
          </div>

          <div className="flex flex-col space-y-3">
            <button 
              onClick={onConfirm}
              className="w-full py-5 bg-[#2D241E] hover:bg-[#1A1512] text-white rounded-[28px] font-black text-base shadow-xl shadow-[#2D241E]/10 transition-all active:scale-95 flex items-center justify-center space-x-2"
            >
              <LogOut size={20} />
              <span>Wipe Session & Finish</span>
            </button>
            <button 
              onClick={onClose}
              className="w-full py-5 bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-[28px] font-black text-base text-[#6B5E55] transition-all active:scale-95"
            >
              Return to Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { session } = useApp();
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(['pdf']);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const toggleFormat = (f: ExportFormat) => {
    setSelectedFormats(prev => 
      prev.includes(f) 
        ? prev.filter(item => item !== f) 
        : [...prev, f]
    );
  };

  const handleExport = () => {
    if (selectedFormats.length === 0) return;
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      onClose();
    }, 1500);
  };

  const hasStepwise = selectedFormats.includes('stepwise');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#FAD7BD]/20 blur-3xl pointer-events-none" />
        
        <div className="p-10 md:p-14 space-y-10 relative">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAD7BD]/30 text-[#E67E22] text-[10px] font-black uppercase tracking-widest mb-2">
                <Lock size={12} className="mr-1.5" />
                Local Asset Generation
              </div>
              <h2 className="text-4xl font-black text-[#2D241E] tracking-tight">Download Assets</h2>
              <p className="text-[#6B5E55] font-medium text-sm">Convert your local memory session into portable files.</p>
            </div>
            <button 
              onClick={onClose} 
              className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
            >
              <X size={20} className="text-[#BBAFA7]" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <FormatOption 
                active={selectedFormats.includes('pdf')} 
                onClick={() => toggleFormat('pdf')}
                icon={<FileText size={24} />}
                label="PDF"
                desc="Pro Print"
                color="text-red-500"
              />
              <FormatOption 
                active={selectedFormats.includes('docx')} 
                onClick={() => toggleFormat('docx')}
                icon={<FileText size={24} />}
                label="Word"
                desc="DOCX"
                color="text-blue-600"
              />
              <FormatOption 
                active={selectedFormats.includes('html')} 
                onClick={() => toggleFormat('html')}
                icon={<FileCode size={24} />}
                label="Web"
                desc="HTML"
                color="text-amber-600"
              />
              <FormatOption 
                active={selectedFormats.includes('md')} 
                onClick={() => toggleFormat('md')}
                icon={<FileCode size={24} />}
                label="Markdown"
                desc="Tech Docs"
                color="text-slate-600"
              />
              <FormatOption 
                active={selectedFormats.includes('stepwise')} 
                onClick={() => toggleFormat('stepwise')}
                icon={<Shield size={24} />}
                label="Stepwise"
                desc="Encrypted"
                color="text-[#E67E22]"
              />
            </div>

            {hasStepwise && (
              <div className="space-y-3 animate-in slide-in-from-top-4 duration-500">
                <label className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
                  Private Decryption Password
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set local password..."
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
                      : `Save ${selectedFormats.length} Guide${selectedFormats.length > 1 ? 's' : ''}`}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-center space-x-2 pt-2 text-[#BBAFA7] text-[10px] font-black uppercase tracking-widest">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span>Zero cloud footprint verified</span>
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
    
    setTimeout(() => {
      loadSession({
        id: 'imp-' + Math.random().toString(36).substr(2, 5),
        title: 'Restored Private Session',
        initialUrl: 'https://example.com',
        steps: [
          {
            id: 's1',
            number: 1,
            action: 'Initialized local capture',
            url: 'https://example.com/dashboard',
            timestamp: Date.now(),
            screenshot: 'https://picsum.photos/seed/import1/1280/720'
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
                Local Restoration
              </div>
              <h2 className="text-4xl font-black text-[#2D241E] tracking-tight">Open File</h2>
              <p className="text-[#6B5E55] font-medium text-sm">Load a .stepwise file from your device.</p>
            </div>
            <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition active:scale-90 shadow-sm">
              <X size={20} className="text-[#BBAFA7]" />
            </button>
          </div>

          <div className="space-y-8">
            <div 
              onClick={() => setSelectedFile('private-guide.stepwise')}
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
                   <span className="text-[10px] font-bold text-emerald-600 uppercase mt-1">Ready for Memory Load</span>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6 text-[#BBAFA7] group-hover:scale-110 group-hover:text-[#E67E22] transition-all">
                    <UploadCloud size={40} />
                  </div>
                  <p className="text-sm font-bold text-[#6B5E55] text-center px-8">
                    Select your encrypted file <br/>
                    <span className="text-[#E67E22]">Data never leaves your machine</span>
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
                  <span>Restore to Local Memory</span>
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
    
    <div className={`
      absolute top-3 right-3 w-5 h-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center
      ${active ? 'bg-[#E67E22] border-[#E67E22] scale-100' : 'bg-transparent border-black/10 scale-90'}
    `}>
      {active && <Check size={12} className="text-white" />}
    </div>
  </button>
);
