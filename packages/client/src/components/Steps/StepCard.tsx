import { useState, useCallback } from 'react';
import { Trash2, Edit3, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { Step } from '@stepwise/shared';
import { useSessionStore } from '@/stores/sessionStore';
import { ScreenshotModal } from './ScreenshotModal';

interface StepCardProps {
  step: Step;
}

export function StepCard({ step }: StepCardProps) {
  const updateStep = useSessionStore((s) => s.updateStep);
  const deleteStep = useSessionStore((s) => s.deleteStep);
  const steps = useSessionStore((s) => s.steps);
  const toggleStepCollapsed = useSessionStore((s) => s.toggleStepCollapsed);

  const [isEditing, setIsEditing] = useState(false);
  const [caption, setCaption] = useState(step.caption);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);

  const isCollapsed = useSessionStore((s) => s.collapsedStepIds.has(step.id));
  const isLatest = step.index === steps.length - 1;

  const handleToggleCollapse = useCallback(() => {
    toggleStepCollapsed(step.id);
  }, [toggleStepCollapsed, step.id]);

  const handleSave = useCallback(async () => {
    await updateStep(step.id, { caption });
    setIsEditing(false);
  }, [updateStep, step.id, caption]);

  const handleCancel = useCallback(() => {
    setCaption(step.caption);
    setIsEditing(false);
  }, [step.caption]);

  const handleDelete = useCallback(async () => {
    await deleteStep(step.id);
  }, [deleteStep, step.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  return (
    <div className={`group relative bg-white border border-white rounded-[40px] overflow-hidden shadow-[0_10px_30px_rgba(45,36,30,0.04)] hover:shadow-[0_15px_40px_rgba(45,36,30,0.08)] transition-all duration-500 ${!isCollapsed ? 'hover:-translate-y-1' : ''}`}>
      {/* Top Section with Icon and Info */}
      <div
        className={`p-6 flex items-start space-x-5 cursor-pointer`}
        onClick={handleToggleCollapse}
      >
        <div className={`shrink-0 rounded-[24px] bg-[#FAD7BD]/30 text-[#E67E22] flex items-center justify-center font-black transition-all duration-500 ${isCollapsed ? 'w-10 h-10 text-base rounded-[14px]' : 'w-16 h-16 text-2xl'}`}>
          {step.index + 1}
        </div>

        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-[0.2em]">
              ACTION LOG
            </span>
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCollapse();
                }}
                className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-[#FDF2E9]"
              >
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-red-500 transition-all rounded-full hover:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="flex flex-col space-y-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                autoFocus
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSave}
                className="w-full bg-[#FDF2E9] border-none rounded-2xl p-4 text-sm font-bold text-[#2D241E] resize-none outline-none ring-2 ring-[#E67E22]/20"
                rows={2}
              />
              <div className="flex justify-end space-x-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleCancel}
                  className="p-2 text-[#BBAFA7] hover:text-[#2D241E] transition"
                >
                  <X size={18} />
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSave}
                  className="p-2 text-emerald-600 hover:text-emerald-700 transition"
                >
                  <Check size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className={`font-bold text-[#2D241E] leading-snug cursor-text hover:text-[#E67E22] transition-colors pr-8 relative ${isCollapsed ? 'text-sm truncate' : 'text-base'}`}
            >
              {caption || 'No caption'}
              {!isCollapsed && <Edit3 size={12} className="absolute right-0 top-1 opacity-0 group-hover:opacity-40" />}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Preview with animated collapse */}
      <div className={`px-6 pb-6 transition-all duration-500 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0 overflow-hidden pb-0' : 'max-h-[500px] opacity-100'}`}>
        <div className="relative aspect-video bg-[#FDF2E9] rounded-[32px] overflow-hidden group/img cursor-zoom-in border border-black/5">
          {step.screenshotDataUrl ? (
            <>
              <img
                src={step.screenshotDataUrl}
                alt={`Step ${step.index + 1}`}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-1000"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#2D241E]/40 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                <button
                  onClick={() => setIsScreenshotModalOpen(true)}
                  className="bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-[#2D241E] shadow-xl hover:bg-white transition-all flex items-center"
                >
                  View Capture
                </button>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#BBAFA7] text-sm font-bold">
              No screenshot
            </div>
          )}
        </div>
      </div>

      {step.screenshotDataUrl && (
        <ScreenshotModal
          open={isScreenshotModalOpen}
          onOpenChange={setIsScreenshotModalOpen}
          screenshotDataUrl={step.screenshotDataUrl}
          stepNumber={step.index + 1}
          caption={step.caption}
          onSaveCaption={async (newCaption) => {
            await updateStep(step.id, { caption: newCaption });
          }}
        />
      )}
    </div>
  );
}
