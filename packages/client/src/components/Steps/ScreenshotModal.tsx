import { useState, useCallback, useEffect } from 'react';
import { X, Download, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ScreenshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshotDataUrl: string;
  stepNumber: number;
  caption: string;
  onSaveCaption: (caption: string) => Promise<void>;
}

export function ScreenshotModal({ open, onOpenChange, screenshotDataUrl, stepNumber, caption, onSaveCaption }: ScreenshotModalProps) {
  const [editedCaption, setEditedCaption] = useState(caption);
  const [isSaving, setIsSaving] = useState(false);

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

  // Sync editedCaption when caption prop changes
  useEffect(() => {
    setEditedCaption(caption);
  }, [caption]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = screenshotDataUrl;
    a.download = `step-${stepNumber}-capture.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveCaption = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSaveCaption(editedCaption);
    } finally {
      setIsSaving(false);
    }
  }, [editedCaption, onSaveCaption]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSaveCaption();
    }
  }, [handleSaveCaption]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-5xl bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#FAD7BD]/20 blur-3xl pointer-events-none" />

        <div className="p-6 md:p-8 space-y-6 relative">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAD7BD]/30 text-[#E67E22] text-[10px] font-black uppercase tracking-widest">
                Step {stepNumber}
              </div>
              <h2 className="text-2xl font-black text-[#2D241E] tracking-tight">Screenshot Capture</h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownload}
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
                title="Download screenshot"
              >
                <Download size={20} className="text-[#BBAFA7]" />
              </button>
              <button
                onClick={() => onOpenChange(false)}
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
              >
                <X size={20} className="text-[#BBAFA7]" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
              Step Label
            </label>
            <div className="relative">
              <textarea
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a description for this step..."
                className="w-full bg-[#FDF2E9] border border-black/5 rounded-[24px] py-4 px-6 text-sm font-bold text-[#2D241E] resize-none outline-none ring-2 ring-[#E67E22]/20 focus:ring-[#E67E22]/40 transition-all min-h-[80px]"
                rows={3}
              />
              <div className="absolute bottom-3 right-3 flex items-center space-x-2">
                <span className="text-[9px] text-[#BBAFA7] font-black uppercase tracking-widest">
                  Cmd+Enter to save
                </span>
                <button
                  onClick={handleSaveCaption}
                  disabled={isSaving || editedCaption === caption}
                  className={`
                    w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90
                    ${isSaving || editedCaption === caption
                      ? 'bg-[#BBAFA7] cursor-not-allowed'
                      : 'bg-[#E67E22] hover:bg-[#D35400] text-white'}
                  `}
                  title="Save caption"
                >
                  {isSaving ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="relative bg-[#FDF2E9] rounded-[32px] overflow-hidden border border-black/5">
            <img
              src={screenshotDataUrl}
              alt={`Step ${stepNumber} screenshot`}
              className="w-full h-auto"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
