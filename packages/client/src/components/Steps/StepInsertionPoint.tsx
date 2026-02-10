import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import type { ClickStep } from '@stepwise/shared';

interface StepInsertionPointProps {
  index: number;
}

export function StepInsertionPoint({ index }: StepInsertionPointProps) {
  const insertStep = useSessionStore((s) => s.insertStep);
  const [isHovered, setIsHovered] = useState(false);

  const handleInsert = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const id = crypto.randomUUID();
    
    const newStep: ClickStep = {
      id,
      index,
      action: 'click',
      target: {
        selector: null,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        elementTag: 'div',
        elementText: null,
      },
      button: 'left',
      timestamp: Date.now(),
      screenshotPath: '',
      caption: '',
      isEdited: false,
    };
    
    insertStep(index, newStep);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleInsert(e);
    }
  };

  return (
    <button
      type="button"
      className="relative flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group/insert cursor-pointer active:scale-[0.98] bg-transparent border-0 p-0"
      style={{ 
        height: isHovered ? '64px' : '32px',
        margin: '4px 0',
        width: '100%'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleInsert}
      onKeyDown={handleKeyDown}
      aria-label="Insert step at this position"
    >
      <div className={`
        absolute left-4 right-4 h-[1.5px] rounded-full transition-all duration-500 pointer-events-none
        ${isHovered ? 'bg-[#E67E22] scale-x-100 opacity-100' : 'bg-[#E67E22]/10 scale-x-[0.98] opacity-50'}
      `} />

      <div
        className={`
          relative z-20 flex items-center justify-center rounded-full bg-white border transition-all duration-500 pointer-events-none
          ${isHovered 
            ? 'w-9 h-9 border-[#E67E22] text-[#E67E22] shadow-[0_8px_20px_rgba(230,126,34,0.2)] scale-110' 
            : 'w-6 h-6 border-black/5 text-[#BBAFA7] scale-100'}
        `}
      >
        <Plus size={isHovered ? 18 : 12} strokeWidth={3} className="transition-all duration-500" />
      </div>

      <div className={`
        absolute right-8 bg-[#2D241E] text-white text-[8px] font-black px-3 py-1.5 rounded-full tracking-widest uppercase transition-all duration-700 pointer-events-none z-30
        ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
      `}>
        Insert Step
      </div>

      {isHovered && (
        <div className="absolute inset-0 bg-[#E67E22]/5 rounded-3xl animate-in fade-in zoom-in-95 duration-500 pointer-events-none" />
      )}
    </button>
  );
}
