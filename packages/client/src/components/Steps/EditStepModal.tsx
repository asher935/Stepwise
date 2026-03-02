import { useState, useCallback, useEffect } from 'react';
import { X, Download, Check, Edit3, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { createPortal } from 'react-dom';

interface EditStepModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshotDataUrl?: string;
  originalScreenshotDataUrl?: string;
  stepNumber: number;
  caption: string;
  onSaveCaption: (caption: string) => Promise<void>;
  onToggleRedaction?: (redact: boolean) => Promise<string | undefined>;
  canToggleRedaction?: boolean;
  isRedacted?: boolean;
}

export function EditStepModal({ open, onOpenChange, screenshotDataUrl, originalScreenshotDataUrl, stepNumber, caption, onSaveCaption, onToggleRedaction, canToggleRedaction, isRedacted }: EditStepModalProps) {
  const [editedCaption, setEditedCaption] = useState(caption);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [redactEnabled, setRedactEnabled] = useState(isRedacted ?? false);
  const [isTogglingRedaction, setIsTogglingRedaction] = useState(false);
  const [originalScreenshotUrl, setOriginalScreenshotUrl] = useState(screenshotDataUrl);
  const [redactedScreenshotUrl, setRedactedScreenshotUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    setRedactEnabled(isRedacted ?? false);
  }, [isRedacted]);

  useEffect(() => {
    // Use originalScreenshotDataUrl if available (when redaction is enabled),
    // otherwise fall back to screenshotDataUrl
    setOriginalScreenshotUrl(originalScreenshotDataUrl ?? screenshotDataUrl);
  }, [screenshotDataUrl, originalScreenshotDataUrl]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      if (isEditing) {
        setIsEditing(false);
        setEditedCaption(caption);
      } else {
        onOpenChange(false);
      }
    }
  }, [open, onOpenChange, isEditing, caption]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  useEffect(() => {
    if (open) {
      setIsEditing(false);
      setEditedCaption(caption);
    }
  }, [open, caption]);

  useEffect(() => {
    if (!isEditing) {
      setEditedCaption(caption);
    }
  }, [caption, isEditing]);

  const handleDownload = () => {
    const urlToDownload = redactedScreenshotUrl || originalScreenshotUrl;
    if (!urlToDownload) return;
    const a = document.createElement('a');
    a.href = urlToDownload;
    a.download = `step-${stepNumber}-capture.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveCaption = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSaveCaption(editedCaption);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [editedCaption, onSaveCaption]);

  const handleStartEdit = useCallback(() => {
    setEditedCaption(caption);
    setIsEditing(true);
  }, [caption]);

  const handleCancelEdit = useCallback(() => {
    setEditedCaption(caption);
    setIsEditing(false);
  }, [caption]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSaveCaption();
    }
  }, [handleSaveCaption]);

  const handleToggleRedaction = useCallback(async () => {
    if (!onToggleRedaction) return;

    setIsTogglingRedaction(true);
    try {
      const newValue = !redactEnabled;
      const newScreenshotUrl = await onToggleRedaction(newValue);
      setRedactEnabled(newValue);
      setRedactedScreenshotUrl(newScreenshotUrl);
    } catch (error) {
      console.error('Failed to toggle redaction:', error);
      setRedactEnabled(redactEnabled);
    } finally {
      setIsTogglingRedaction(false);
    }
  }, [onToggleRedaction, redactEnabled]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500"
        onClick={() => onOpenChange(false)}
        aria-label="Close modal"
      />

      <div className="relative w-full max-w-5xl bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#FAD7BD]/20 blur-3xl pointer-events-none" />

        <div className="p-6 md:p-8 space-y-6 relative">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAD7BD]/30 text-[#E67E22] text-[10px] font-black uppercase tracking-widest">
                Step {stepNumber}
              </div>
              <h2 className="text-2xl font-black text-[#2D241E] tracking-tight">Edit Step</h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleDownload}
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
                title="Download screenshot"
              >
                <Download size={20} className="text-[#BBAFA7]" />
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-[#FDF2E9] border border-black/5 rounded-full transition-all active:scale-90 shadow-sm"
              >
                <X size={20} className="text-[#BBAFA7]" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
              Step Label
            </div>
            {isEditing ? (
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
                    type="button"
                    onClick={handleCancelEdit}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 bg-[#BBAFA7] hover:bg-[#A89E96] text-white"
                    title="Cancel editing"
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCaption}
                    disabled={isSaving}
                    className={`
                      w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90
                      ${isSaving
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
            ) : (
              <button
                type="button"
                className="relative group w-full text-left cursor-text"
                onClick={handleStartEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleStartEdit();
                  }
                }}
              >
                <div className="w-full bg-[#FDF2E9] border border-black/5 rounded-[24px] py-4 px-6 text-sm font-bold text-[#2D241E] min-h-[80px] group-hover:bg-[#F5EBE0] transition-colors">
                  {caption || <span className="text-[#BBAFA7]">No caption</span>}
                </div>
                <div className="absolute bottom-3 right-3 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span className="text-[9px] text-[#BBAFA7] font-black uppercase tracking-widest">
                    Click to edit
                  </span>
                  <Edit3 size={14} className="text-[#BBAFA7]" />
                </div>
              </button>
            )}
          </div>

          {canToggleRedaction && (
            <div className="space-y-3">
              <div className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
                Privacy
              </div>
              <div className="relative bg-[#FDF2E9] border border-black/5 rounded-[24px] py-4 px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      className={`
                        w-12 h-7 rounded-full transition-colors duration-200 relative
                        ${redactEnabled ? 'bg-[#E67E22]' : 'bg-[#BBAFA7]'}
                      `}
                      onClick={handleToggleRedaction}
                      role="switch"
                      aria-checked={redactEnabled}
                      aria-label="Toggle redaction"
                    >
                      <div className={`
                        w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 absolute top-1
                        ${redactEnabled ? 'left-6' : 'left-1'}
                      `}
                      />
                    </button>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[#2D241E]">Redact input fields</span>
                      {isTogglingRedaction && (
                        <span className="text-[9px] text-[#E67E22] font-black uppercase tracking-wider">
                          Generating redacted image...
                        </span>
                      )}
                    </div>
                  </div>
                  {redactEnabled ? (
                    <EyeOff size={20} className="text-[#BBAFA7]" />
                  ) : (
                    <Eye size={20} className="text-[#E67E22]" />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="relative bg-[#FDF2E9] rounded-[32px] overflow-hidden border border-black/5 min-h-[300px]">
            {originalScreenshotUrl ? (
              <div className="relative">
                <img
                  src={redactEnabled && redactedScreenshotUrl ? redactedScreenshotUrl : originalScreenshotUrl}
                  alt={`Step ${stepNumber} screenshot`}
                  className="w-full h-auto"
                />
                {redactEnabled && (
                  <div className="absolute top-4 right-4">
                    <div className="bg-black/70 backdrop-blur-sm px-3 py-2 rounded-full text-white shadow-lg flex items-center space-x-2">
                      <EyeOff size={16} />
                      <span className="text-xs font-bold uppercase tracking-wider">Redacted</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-[300px] flex flex-col items-center justify-center text-[#BBAFA7]">
                <ImageIcon size={48} className="mb-4 opacity-50" />
                <span className="text-sm font-bold">No screenshot captured</span>
                <span className="text-xs mt-1">This step was manually inserted</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
