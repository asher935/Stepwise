
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../store';

interface StepInsertionPointProps {
  index: number;
}

const StepInsertionPoint: React.FC<StepInsertionPointProps> = ({ index }) => {
  const { insertStep, addDebugLog } = useApp();
  const [isHovered, setIsHovered] = useState(false);

  const handleInsert = () => {
    const id = Math.random().toString(36).substr(2, 9);
    addDebugLog('manual_step_insert', { index, id });
    
    insertStep(index, {
      id,
      action: "New custom step instruction",
      url: "Custom interaction",
      timestamp: Date.now(),
      screenshot: `https://picsum.photos/seed/${id}/1280/720`,
    });
  };

  return (
    <div 
      className="relative flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
      style={{ 
        height: isHovered ? '80px' : '12px',
        margin: isHovered ? '8px 0' : '0'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Invisible broad hit area */}
      <div className="absolute inset-x-0 -top-4 -bottom-4 z-10 cursor-pointer" />

      {/* The visible line and button */}
      <div className={`
        w-full h-[2px] rounded-full transition-all duration-500
        ${isHovered ? 'bg-[#E67E22]/20' : 'bg-transparent'}
      `} />

      <button
        onClick={handleInsert}
        className={`
          absolute z-20 w-10 h-10 bg-white border border-[#E67E22]/10 rounded-full flex items-center justify-center text-[#E67E22] shadow-[0_10px_25px_rgba(230,126,34,0.15)] transition-all duration-500 scale-0 opacity-0
          ${isHovered ? 'scale-100 opacity-100 hover:scale-110 active:scale-95 hover:bg-[#E67E22] hover:text-white' : ''}
        `}
      >
        <Plus size={20} />
      </button>

      {/* Decorative tooltip */}
      <div className={`
        absolute -right-4 bg-[#2D241E] text-white text-[9px] font-black px-3 py-1 rounded-full tracking-widest uppercase transition-all duration-700 pointer-events-none
        ${isHovered ? 'opacity-40 translate-x-0' : 'opacity-0 translate-x-4'}
      `}>
        Insert
      </div>
    </div>
  );
};

export default StepInsertionPoint;
