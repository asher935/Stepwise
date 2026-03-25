import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Download, Check, Edit3, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ScreenshotMode, StepLegendItem } from '@stepwise/shared';
import { StepLegendOverlay } from './StepLegendOverlay';
import { useSessionStore } from '@/stores/sessionStore';

interface EditStepModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenshotDataUrl?: string;
  fullScreenshotDataUrl?: string;
  pageScreenshotDataUrl?: string;
  originalScreenshotDataUrl?: string;
  stepNumber: number;
  caption: string;
  onSaveCaption: (caption: string) => Promise<void>;
  legendItems?: StepLegendItem[];
  pageLegendItems?: StepLegendItem[];
  onSaveLegendItems?: (legendItems: StepLegendItem[], caption: string, pageLegendItems: StepLegendItem[]) => Promise<void>;
  selectedScreenshotMode?: ScreenshotMode;
  onSaveScreenshotMode?: (mode: ScreenshotMode) => Promise<void>;
  onToggleRedaction?: (redact: boolean) => Promise<string | undefined>;
  canToggleRedaction?: boolean;
  isRedacted?: boolean;
}

function buildLegendCaption(items: StepLegendItem[]): string {
  if (items.length === 0) {
    return 'Review the current view';
  }
  const lines = items.map((item) => `(${item.bubbleNumber}) ${item.label.toLowerCase()}`);
  return ['On this page:', ...lines].join('\n');
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getLegendItemKey(item: StepLegendItem): string {
  return [
    item.kind,
    item.label,
    item.boundingBox.x,
    item.boundingBox.y,
    item.boundingBox.width,
    item.boundingBox.height,
  ].join(':');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDownloadExtension(url: string): string {
  if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg')) {
    return 'jpg';
  }
  if (url.startsWith('data:image/webp')) {
    return 'webp';
  }
  return 'png';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load screenshot image'));
    image.src = src;
  });
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildScreenshotDownloadUrl(
  screenshotUrl: string,
  legendItems: StepLegendItem[],
  highlightColor: string,
): Promise<string> {
  if (legendItems.length === 0) {
    return screenshotUrl;
  }

  const image = await loadImage(screenshotUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return screenshotUrl;
  }

  ctx.drawImage(image, 0, 0);

  for (const item of legendItems) {
    const x = clamp(item.boundingBox.x, 0, canvas.width);
    const y = clamp(item.boundingBox.y, 0, canvas.height);
    const width = clamp(item.boundingBox.width, 0, canvas.width - x);
    const height = clamp(item.boundingBox.height, 0, canvas.height - y);

    if (width <= 0 || height <= 0) {
      continue;
    }

    const bubbleRadius = 12;
    const bubbleCenterX = clamp(x + width + 16, bubbleRadius, canvas.width - bubbleRadius);
    const bubbleCenterY = clamp(y + (height / 2), bubbleRadius, canvas.height - bubbleRadius);

    ctx.save();
    ctx.fillStyle = hexToRgba(highlightColor, 0.1);
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, x, y, width, height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = highlightColor;
    ctx.arc(bubbleCenterX, bubbleCenterY, bubbleRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(item.bubbleNumber), bubbleCenterX, bubbleCenterY + 0.5);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}

export function EditStepModal({ open, onOpenChange, screenshotDataUrl, fullScreenshotDataUrl, pageScreenshotDataUrl, originalScreenshotDataUrl, stepNumber, caption, onSaveCaption, legendItems, pageLegendItems, onSaveLegendItems, selectedScreenshotMode, onSaveScreenshotMode, onToggleRedaction, canToggleRedaction, isRedacted }: EditStepModalProps) {
  const stepHighlightColor = useSessionStore((s) => s.stepHighlightColor);
  const [editedCaption, setEditedCaption] = useState(caption);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [redactEnabled, setRedactEnabled] = useState(isRedacted ?? false);
  const [isTogglingRedaction, setIsTogglingRedaction] = useState(false);
  const [originalScreenshotUrl, setOriginalScreenshotUrl] = useState(screenshotDataUrl);
  const [redactedScreenshotUrl, setRedactedScreenshotUrl] = useState<string | undefined>(undefined);
  const [editableLegendItems, setEditableLegendItems] = useState<StepLegendItem[]>(legendItems ?? []);
  const [editablePageLegendItems, setEditablePageLegendItems] = useState<StepLegendItem[]>(pageLegendItems ?? legendItems ?? []);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isUpdatingLegend, setIsUpdatingLegend] = useState(false);
  const [hoveredLegendBubbleNumber, setHoveredLegendBubbleNumber] = useState<number | null>(null);
  const [screenshotMode, setScreenshotMode] = useState<ScreenshotMode>(selectedScreenshotMode ?? 'zoomed');
  const wasOpenRef = useRef(false);
  const isFullPageMode = screenshotMode === 'fullPage';
  const displayedLegendItems = isFullPageMode ? editablePageLegendItems : editableLegendItems;

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
    if (open && !wasOpenRef.current) {
      setIsEditing(false);
      setEditedCaption(caption);
      setEditableLegendItems(legendItems ?? []);
      setEditablePageLegendItems(pageLegendItems ?? legendItems ?? []);
      setHoveredLegendBubbleNumber(null);
      setScreenshotMode(selectedScreenshotMode ?? 'zoomed');
    }
    wasOpenRef.current = open;
  }, [open, caption, legendItems, pageLegendItems, selectedScreenshotMode]);

  useEffect(() => {
    if (!isEditing) {
      setEditedCaption(caption);
    }
  }, [caption, isEditing]);

  const handleDownload = useCallback(async () => {
    // Determine which screenshot to download
    let currentScreenshotUrl: string | undefined;
    
    // If redaction is enabled, always use the redacted screenshot
    if (redactEnabled && redactedScreenshotUrl) {
      currentScreenshotUrl = redactedScreenshotUrl;
    } else {
      // Otherwise, use the appropriate screenshot based on mode
      if (screenshotMode === 'zoomed') {
        currentScreenshotUrl = originalScreenshotUrl;
      } else if (screenshotMode === 'viewport') {
        currentScreenshotUrl = fullScreenshotDataUrl || originalScreenshotUrl;
      } else {
        // fullPage mode
        currentScreenshotUrl = pageScreenshotDataUrl || fullScreenshotDataUrl || originalScreenshotUrl;
      }
    }
    
    if (!currentScreenshotUrl) return;

    let urlToDownload = currentScreenshotUrl;
    try {
      urlToDownload = await buildScreenshotDownloadUrl(
        currentScreenshotUrl,
        displayedLegendItems,
        stepHighlightColor,
      );
    } catch (error) {
      console.error('Failed to build highlighted screenshot download:', error);
    }

    const extension = getDownloadExtension(urlToDownload);
    const a = document.createElement('a');
    a.href = urlToDownload;
    a.download = `step-${stepNumber}-capture.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [
    screenshotMode,
    redactEnabled,
    redactedScreenshotUrl,
    originalScreenshotUrl,
    fullScreenshotDataUrl,
    pageScreenshotDataUrl,
    displayedLegendItems,
    stepHighlightColor,
    stepNumber,
  ]);

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
      void handleSaveCaption();
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

  const handleScreenshotModeChange = useCallback(async (mode: ScreenshotMode) => {
    setScreenshotMode(mode);
    if (!onSaveScreenshotMode) {
      return;
    }
    await onSaveScreenshotMode(mode);
    
    // If redaction is enabled, re-apply it to get the redacted screenshot for the new mode
    if (redactEnabled && onToggleRedaction) {
      try {
        const newRedactedUrl = await onToggleRedaction(true);
        if (newRedactedUrl) {
          setRedactedScreenshotUrl(newRedactedUrl);
        }
      } catch (error) {
        console.error('Failed to get redacted screenshot for new mode:', error);
      }
    }
  }, [onSaveScreenshotMode, redactEnabled, onToggleRedaction]);

  const handleRemoveLegendItem = useCallback(async (bubbleNumber: number) => {
    if (!onSaveLegendItems) {
      return;
    }

    const removedItem = displayedLegendItems.find((item) => item.bubbleNumber === bubbleNumber);
    if (!removedItem) {
      return;
    }

    const removedKey = getLegendItemKey(removedItem);
    const nextPageItems = editablePageLegendItems
      .filter((item) => getLegendItemKey(item) !== removedKey)
      .map((item, index) => ({ ...item, bubbleNumber: index + 1 }));
    const nextViewportItems = editableLegendItems
      .filter((item) => getLegendItemKey(item) !== removedKey)
      .map((item, index) => ({ ...item, bubbleNumber: index + 1 }));
    const nextCaption = buildLegendCaption(nextViewportItems);

    setIsUpdatingLegend(true);
    try {
      await onSaveLegendItems(nextViewportItems, nextCaption, nextPageItems);
      setEditableLegendItems(nextViewportItems);
      setEditablePageLegendItems(nextPageItems);
      if (!isEditing) {
        setEditedCaption(nextCaption);
      }
    } finally {
      setIsUpdatingLegend(false);
    }
  }, [displayedLegendItems, editableLegendItems, editablePageLegendItems, onSaveLegendItems, isEditing]);

  const handleRemoveAllLegendItems = useCallback(async () => {
    if (!onSaveLegendItems) {
      return;
    }

    const nextViewportItems: StepLegendItem[] = [];
    const nextPageItems: StepLegendItem[] = [];
    const nextCaption = buildLegendCaption(nextViewportItems);

    setIsUpdatingLegend(true);
    try {
      await onSaveLegendItems(nextViewportItems, nextCaption, nextPageItems);
      setEditableLegendItems(nextViewportItems);
      setEditablePageLegendItems(nextPageItems);
      setHoveredLegendBubbleNumber(null);
      if (!isEditing) {
        setEditedCaption(nextCaption);
      }
    } finally {
      setIsUpdatingLegend(false);
    }
  }, [onSaveLegendItems, isEditing]);

  const screenshotToDisplay = (() => {
    // If redaction is enabled, use the redacted screenshot for the current mode
    // Note: The redactedScreenshotUrl from toggleRedaction is for the currently selected mode
    if (redactEnabled && redactedScreenshotUrl) {
      return redactedScreenshotUrl;
    }
    
    // Otherwise, use the appropriate screenshot based on mode
    if (screenshotMode === 'zoomed') {
      return originalScreenshotUrl;
    }
    if (screenshotMode === 'viewport') {
      return fullScreenshotDataUrl || originalScreenshotUrl;
    }
    // fullPage mode
    return pageScreenshotDataUrl || fullScreenshotDataUrl || originalScreenshotUrl;
  })();

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <button
        type="button"
        className="absolute inset-0 bg-[#2D241E]/20 backdrop-blur-md animate-in fade-in duration-500"
        onClick={() => onOpenChange(false)}
        aria-label="Close modal"
      />

      <div className="relative w-full max-w-5xl max-h-[calc(100dvh-2rem)] bg-white/90 backdrop-blur-3xl border border-white rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(45,36,30,0.15)] animate-in zoom-in-95 duration-500 flex flex-col">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#FAD7BD]/20 blur-3xl pointer-events-none" />

        <div className="p-6 md:p-8 space-y-6 relative overflow-y-auto min-h-0">
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
                onClick={() => void handleDownload()}
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
                  className="w-full bg-[#FDF2E9] border border-black/5 rounded-[24px] py-4 px-6 text-sm font-bold text-[#2D241E] resize-none outline-none focus:outline-2 focus:outline-[#E67E22]/40 focus:outline-offset-2 transition-all min-h-[80px]"
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
                    onClick={() => void handleSaveCaption()}
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
                      onClick={() => void handleToggleRedaction()}
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

          {(originalScreenshotUrl || fullScreenshotDataUrl || pageScreenshotDataUrl) && (
            <div className="space-y-3">
              <div className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest ml-4">
                Screenshot Mode
              </div>
              <div className="bg-[#FDF2E9] border border-black/5 rounded-[24px] p-2 inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleScreenshotModeChange('zoomed')}
                  className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-colors ${screenshotMode === 'zoomed' ? 'bg-[#E67E22] text-white' : 'bg-white text-[#2D241E] hover:bg-[#F5EBE0]'}`}
                >
                  Zoomed
                </button>
                <button
                  type="button"
                  onClick={() => handleScreenshotModeChange('viewport')}
                  disabled={!fullScreenshotDataUrl}
                  className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-colors ${screenshotMode === 'viewport' ? 'bg-[#E67E22] text-white' : 'bg-white text-[#2D241E] hover:bg-[#F5EBE0]'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Viewport
                </button>
                <button
                  type="button"
                  onClick={() => handleScreenshotModeChange('fullPage')}
                  disabled={!pageScreenshotDataUrl}
                  className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-colors ${screenshotMode === 'fullPage' ? 'bg-[#E67E22] text-white' : 'bg-white text-[#2D241E] hover:bg-[#F5EBE0]'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Full page
                </button>
              </div>
            </div>
          )}

          {displayedLegendItems.length > 0 && (
            <div className="space-y-3">
              <div className="bg-[#FDF2E9] border border-black/5 rounded-[24px] py-3 px-4">
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-widest">
                      Highlighted Elements
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-black"
                      style={{
                        color: stepHighlightColor,
                        backgroundColor: hexToRgba(stepHighlightColor, 0.14),
                      }}
                    >
                      {displayedLegendItems.length}
                    </span>
                  </div>
                  {onSaveLegendItems && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleRemoveAllLegendItems();
                      }}
                      disabled={isUpdatingLegend}
                      className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 disabled:opacity-50"
                    >
                      Remove all
                    </button>
                  )}
                </div>

                <ul
                  className="mt-3 max-h-56 overflow-y-auto space-y-2 pr-1 list-none"
                  onMouseLeave={() => setHoveredLegendBubbleNumber(null)}
                >
                  {displayedLegendItems.map((item) => (
                    <li
                      key={`${item.bubbleNumber}:${item.label}`}
                      className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 border border-black/5"
                      onMouseEnter={() => setHoveredLegendBubbleNumber(item.bubbleNumber)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center"
                          style={{ backgroundColor: hoveredLegendBubbleNumber === item.bubbleNumber ? '#E67E22' : stepHighlightColor }}
                        >
                          {item.bubbleNumber}
                        </div>
                        <div className="text-sm font-bold text-[#2D241E] truncate">{item.label}</div>
                      </div>
                      {onSaveLegendItems && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleRemoveLegendItem(item.bubbleNumber);
                          }}
                          disabled={isUpdatingLegend}
                          className="text-xs font-black uppercase tracking-wider text-red-500 hover:text-red-600 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="relative bg-[#FDF2E9] rounded-[32px] overflow-hidden border border-black/5 min-h-[300px]">
            {screenshotToDisplay ? (
              <div className="relative">
                <img
                  src={screenshotToDisplay}
                  alt={`Step ${stepNumber} screenshot`}
                  className="w-full h-auto"
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setImageNaturalSize({
                      width: image.naturalWidth,
                      height: image.naturalHeight,
                    });
                  }}
                />
                <StepLegendOverlay
                  legendItems={displayedLegendItems}
                  imageWidth={imageNaturalSize.width}
                  imageHeight={imageNaturalSize.height}
                  highlightColor={stepHighlightColor}
                  hoveredBubbleNumber={hoveredLegendBubbleNumber}
                  hoverHighlightColor="#E67E22"
                  onBubbleHoverChange={setHoveredLegendBubbleNumber}
                  onBubbleDelete={onSaveLegendItems
                    ? (bubbleNumber) => {
                      void handleRemoveLegendItem(bubbleNumber);
                    }
                    : undefined}
                  disableBubbleDelete={isUpdatingLegend}
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
