import { useState, useCallback } from 'react';
import { Trash2, Edit3, EyeOff } from 'lucide-react';
import type { Step } from '@stepwise/shared';
import { useSessionStore } from '@/stores/sessionStore';
import { EditStepModal } from './EditStepModal';

interface StepCardProps {
  step: Step;
}

export function StepCard({ step }: StepCardProps) {
  const updateStep = useSessionStore((s) => s.updateStep);
  const deleteStep = useSessionStore((s) => s.deleteStep);
  const toggleRedaction = useSessionStore((s) => s.toggleRedaction);
  const steps = useSessionStore((s) => s.steps);
  const toggleStepCollapsed = useSessionStore((s) => s.toggleStepCollapsed);
  const hoveredStepId = useSessionStore((s) => s.hoveredStepId);
  const setHoveredStepId = useSessionStore((s) => s.setHoveredStepId);

  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);

  const isCollapsed = useSessionStore((s) => s.collapsedStepIds.has(step.id));
  const isHovered = hoveredStepId === step.id;
  const isLatest = step.index === steps.length - 1;
  const canToggleRedaction = Boolean(step.redactionRects?.length) || step.action === 'type' || step.action === 'paste';
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
    <article
      className={`group relative bg-white border border-white rounded-[40px] overflow-hidden shadow-[0_10px_30px_rgba(45,36,30,0.04)] hover:shadow-[0_15px_40px_rgba(45,36,30,0.08)] transition-all duration-500 ${shouldExpand ? 'hover:-translate-y-1' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Top Section with Icon and Info */}
      <div
        role="button"
        tabIndex={0}
        className={`p-6 flex items-start space-x-5 w-full cursor-pointer bg-transparent border-0 text-left`}
        onClick={handleToggleCollapse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleCollapse();
          }
        }}
      >
        <div className={`shrink-0 rounded-[24px] bg-[#FAD7BD]/30 text-[#E67E22] flex items-center justify-center font-black transition-all duration-500 ${!shouldExpand ? 'w-10 h-10 text-base rounded-[14px]' : 'w-16 h-16 text-2xl'}`}>
          {step.index + 1}
        </div>

        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-[#BBAFA7] uppercase tracking-[0.2em]">
                ACTION LOG
              </span>
              
            </div>
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
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
                type="button"
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
          onClick={() => setIsScreenshotModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsScreenshotModalOpen(true);
            }
          }}
          className={`relative aspect-video rounded-[32px] overflow-hidden group/img border border-black/5 w-full text-left ${step.screenshotDataUrl ? 'bg-[#FDF2E9] cursor-zoom-in' : 'bg-[#FDF2E9]/50 cursor-pointer'}`}
        >
          {step.screenshotDataUrl ? (
            <>
              <img
                src={step.screenshotDataUrl}
                alt={`Step ${step.index + 1}`}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-1000"
              />
              {step.redactScreenshot && (
                <div className="absolute top-4 right-4 z-10">
                  <div className="bg-black/70 backdrop-blur-sm px-3 py-2 rounded-full text-white shadow-lg flex items-center space-x-2">
                    <EyeOff size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Redacted</span>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#2D241E]/40 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500 flex items-center justify-center pointer-events-none">
                <span className="bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-[#2D241E] shadow-xl hover:bg-white transition-all flex items-center">
                  View Capture
                </span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#BBAFA7]">
              <div className="text-sm font-bold">No screenshot</div>
              <div className="text-xs mt-1 opacity-75">Click to edit caption</div>
            </div>
          )}
        </button>
      </div>

      <EditStepModal
        open={isScreenshotModalOpen}
        onOpenChange={(open: boolean) => {
          setIsScreenshotModalOpen(open);
          if (!open && hoveredStepId === step.id) {
            setHoveredStepId(null);
          }
        }}
        screenshotDataUrl={step.screenshotDataUrl}
        fullScreenshotDataUrl={step.fullScreenshotDataUrl}
        originalScreenshotDataUrl={step.originalScreenshotDataUrl}
        stepNumber={step.index + 1}
        caption={step.caption}
        onSaveCaption={async (newCaption: string) => {
          await updateStep(step.id, { caption: newCaption });
        }}
        legendItems={step.legendItems}
        onSaveLegendItems={async (legendItems, nextCaption) => {
          await updateStep(step.id, { legendItems, caption: nextCaption });
        }}
        onToggleRedaction={async (redact: boolean) => {
          return await toggleRedaction(step.id, redact);
        }}
        canToggleRedaction={canToggleRedaction}
        isRedacted={Boolean(step.redactScreenshot)}
      />
    </article>
  );
}
