import { useState, useCallback } from 'react';
import { Trash2, Edit3 } from 'lucide-react';
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
  const hoveredStepId = useSessionStore((s) => s.hoveredStepId);
  const setHoveredStepId = useSessionStore((s) => s.setHoveredStepId);

  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);

  const isCollapsed = useSessionStore((s) => s.collapsedStepIds.has(step.id));
  const isHovered = hoveredStepId === step.id;
  const isLatest = step.index === steps.length - 1;
  // Expand if hovered, or if it's the latest card and nothing else is hovered
  const shouldExpand = isHovered || (isLatest && !hoveredStepId && !isCollapsed);

  const handleMouseEnter = useCallback(() => {
    setHoveredStepId(step.id);
  }, [setHoveredStepId, step.id]);

  const handleMouseLeave = useCallback(() => {
    // Only clear hover if this is the currently hovered card
    if (hoveredStepId === step.id) {
      setHoveredStepId(null);
    }
  }, [setHoveredStepId, hoveredStepId, step.id]);

  const handleToggleCollapse = useCallback(() => {
    toggleStepCollapsed(step.id);
  }, [toggleStepCollapsed, step.id]);

  const handleDelete = useCallback(async () => {
    await deleteStep(step.id);
  }, [deleteStep, step.id]);

  return (
    <div
      className={`group relative bg-white border border-white rounded-[40px] overflow-hidden shadow-[0_10px_30px_rgba(45,36,30,0.04)] hover:shadow-[0_15px_40px_rgba(45,36,30,0.08)] transition-all duration-500 ${shouldExpand ? 'hover:-translate-y-1' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Top Section with Icon and Info */}
      <div
        className={`p-6 flex items-start space-x-5 cursor-pointer`}
        onClick={handleToggleCollapse}
      >
        <div className={`shrink-0 rounded-[24px] bg-[#FAD7BD]/30 text-[#E67E22] flex items-center justify-center font-black transition-all duration-500 ${!shouldExpand ? 'w-10 h-10 text-base rounded-[14px]' : 'w-16 h-16 text-2xl'}`}>
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
                  setIsScreenshotModalOpen(true);
                }}
                className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#E67E22] transition-all rounded-full hover:bg-[#FDF2E9]"
                title="Edit step"
              >
                <Edit3 size={16} />
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

          <div className={`font-bold text-[#2D241E] leading-snug ${!shouldExpand ? 'text-sm truncate' : 'text-base'}`}>
            {step.caption || 'No caption'}
          </div>
        </div>
      </div>

      {/* Screenshot Preview with animated collapse */}
      <div className={`px-6 pb-6 transition-all duration-500 ease-in-out ${!shouldExpand ? 'max-h-0 opacity-0 overflow-hidden pb-0' : 'max-h-[500px] opacity-100'}`}>
        <button
          type="button"
          onClick={() => step.screenshotDataUrl && setIsScreenshotModalOpen(true)}
          className="relative aspect-video bg-[#FDF2E9] rounded-[32px] overflow-hidden group/img cursor-zoom-in border border-black/5 w-full text-left"
          disabled={!step.screenshotDataUrl}
        >
          {step.screenshotDataUrl ? (
            <>
              <img
                src={step.screenshotDataUrl}
                alt={`Step ${step.index + 1}`}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-1000"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#2D241E]/40 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500 flex items-center justify-center pointer-events-none">
                <span className="bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-[#2D241E] shadow-xl hover:bg-white transition-all flex items-center">
                  View Capture
                </span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#BBAFA7] text-sm font-bold">
              No screenshot
            </div>
          )}
        </button>
      </div>

      {step.screenshotDataUrl && (
        <ScreenshotModal
          open={isScreenshotModalOpen}
          onOpenChange={(open) => {
            setIsScreenshotModalOpen(open);
            // Clear hover state when modal opens or closes
            if (!open && hoveredStepId === step.id) {
              setHoveredStepId(null);
            }
          }}
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
