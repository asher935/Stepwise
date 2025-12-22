
import React, { useState, useEffect } from 'react';
import { Step } from '../types';
import { useApp } from '../store';
import { Trash2, Edit3, Check, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

const StepCard: React.FC<{ step: Step }> = ({ step }) => {
  const { session, removeStep, updateStep } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(step.action);
  
  // Initialize: collapse if it's not the latest step in the list
  const isLatest = step.number === session.steps.length;
  const [isCollapsed, setIsCollapsed] = useState(!isLatest);

  // Auto-collapse logic: when a new step is added (making this one no longer latest)
  useEffect(() => {
    if (!isLatest) {
      setIsCollapsed(true);
    }
  }, [session.steps.length, isLatest]);

  const handleSave = () => {
    updateStep(step.id, { action: editText });
    setIsEditing(false);
  };

  return (
    <div className={`group relative bg-white border border-white rounded-[40px] overflow-hidden shadow-[0_10px_30px_rgba(45,36,30,0.04)] hover:shadow-[0_15px_40px_rgba(45,36,30,0.08)] transition-all duration-500 ${!isCollapsed ? 'hover:-translate-y-1' : ''}`}>
      {/* Top Section with Icon and Info */}
      <div 
        className={`p-6 flex items-start space-x-5 cursor-pointer`} 
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className={`shrink-0 rounded-[24px] bg-[#FAD7BD]/30 text-[#E67E22] flex items-center justify-center font-black transition-all duration-500 ${isCollapsed ? 'w-10 h-10 text-base rounded-[14px]' : 'w-16 h-16 text-2xl'}`}>
          {step.number}
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
                  setIsCollapsed(!isCollapsed);
                }}
                className="w-8 h-8 flex items-center justify-center text-[#BBAFA7] hover:text-[#2D241E] transition-all rounded-full hover:bg-[#FDF2E9]"
              >
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  removeStep(step.id);
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
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-[#FDF2E9] border-none rounded-2xl p-4 text-sm font-bold text-[#2D241E] resize-none outline-none ring-2 ring-[#E67E22]/20"
                rows={2}
              />
              <div className="flex justify-end space-x-2">
                <button onClick={() => setIsEditing(false)} className="p-2 text-[#BBAFA7] hover:text-[#2D241E] transition">
                  <X size={18} />
                </button>
                <button onClick={handleSave} className="p-2 text-emerald-600 hover:text-emerald-700 transition">
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
              {step.action}
              {!isCollapsed && <Edit3 size={12} className="absolute right-0 top-1 opacity-0 group-hover:opacity-40" />}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Preview with animated collapse */}
      <div className={`px-6 pb-6 transition-all duration-500 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0 overflow-hidden pb-0' : 'max-h-[500px] opacity-100'}`}>
        <div className="relative aspect-video bg-[#FDF2E9] rounded-[32px] overflow-hidden group/img cursor-zoom-in border border-black/5">
          <img 
            src={step.screenshot} 
            alt={`Step ${step.number}`}
            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#2D241E]/40 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500 flex items-center justify-center">
            <a 
              href={step.screenshot} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-[#2D241E] shadow-xl hover:bg-white transition-all flex items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={14} className="mr-2" />
              View Capture
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepCard;
