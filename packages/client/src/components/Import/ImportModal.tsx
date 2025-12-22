import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, Lock, X, UploadCloud, FileCheck, Eye, EyeOff } from 'lucide-react';
import type { NavigateStep, Step } from '@stepwise/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setGuideTitle?: (title: string) => void;
}

export function ImportModal({ open, onOpenChange, setGuideTitle }: ImportModalProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const startSession = useSessionStore((s) => s.startSession);
  const setSteps = useSessionStore((s) => s.setSteps);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStartUrl = useCallback((steps: Step[]) => {
    const navigateSteps = steps
      .filter((step): step is NavigateStep => step.action === 'navigate')
      .sort((a, b) => a.index - b.index);
    return navigateSteps[0]?.toUrl;
  }, []);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    await createSession();
    const nextSessionId = useSessionStore.getState().sessionId;
    if (!nextSessionId) {
      throw new Error('Failed to create session');
    }
    return nextSessionId;
  }, [sessionId, createSession]);

  const handleFileChange = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setPassword('');

    try {
      const activeSessionId = await ensureSession();
      const preview = await api.previewImport(activeSessionId, selectedFile);
      if (preview.encrypted) {
        setPassword('');
      }
    } catch {
      setError('Failed to preview file');
    }
  }, [ensureSession]);

  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    await handleFileChange(selectedFile);
  }, [handleFileChange]);

  const handleImport = useCallback(async () => {
    if (!file) return;

    setIsImporting(true);
    setError(null);

    try {
      const activeSessionId = await ensureSession();
      const result = await api.importFile(activeSessionId, file, password ? password : undefined);
      setSteps(result.steps);
      setGuideTitle?.(result.title);
      const startUrl = getStartUrl(result.steps);
      await startSession(startUrl);
      onOpenChange(false);
      setFile(null);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  }, [file, password, onOpenChange, ensureSession, getStartUrl, startSession, setSteps, setGuideTitle]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith('.stepwise')) {
      await handleFileChange(droppedFile);
    }
  }, [handleFileChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setFile(null);
    setPassword('');
    setError(null);
  }, [onOpenChange]);

  // Close modal on ESC key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, handleClose]);

  const needsPassword = file ? file.name.endsWith('.stepwise') : false;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500"
        onClick={handleClose}
      />

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
            <button onClick={handleClose} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition active:scale-90 shadow-sm">
              <X size={20} className="text-[#BBAFA7]" />
            </button>
          </div>

          <div className="space-y-8">
            <input
              ref={fileInputRef}
              type="file"
              accept=".stepwise"
              onChange={handleInputChange}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`
                group relative border-2 border-dashed rounded-[40px] p-12 flex flex-col items-center justify-center transition-all cursor-pointer
                ${file ? 'bg-emerald-50 border-emerald-200' : 'bg-[#FDF2E9]/40 border-black/5 hover:border-[#E67E22]/20 hover:bg-[#FDF2E9]'}
              `}
            >
              {file ? (
                <div className="flex flex-col items-center animate-in zoom-in duration-300">
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-md mb-4 text-emerald-500">
                    <FileCheck size={40} />
                  </div>
                  <span className="text-sm font-black text-[#2D241E]">{file.name}</span>
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

            {needsPassword && (
              <div className="space-y-3 animate-in slide-in-from-top-4 duration-500">
                <label className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4 flex items-center gap-2">
                  <Lock size={12} />
                  Decryption Password
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter file password..."
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

            {error && (
              <div className="text-sm text-red-600 text-center font-medium px-4 py-2 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!file || isImporting}
              className={`
                w-full py-6 rounded-[32px] font-black text-lg transition-all active:scale-95 flex items-center justify-center space-x-3
                ${isImporting
                  ? 'bg-[#BBAFA7] cursor-not-allowed text-white'
                  : file
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
}
