import { Zap } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { StepCard } from './StepCard';

export function StepsList() {
  const steps = useSessionStore((s) => s.steps);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
        <div className="w-20 h-20 bg-white/60 rounded-[32px] flex items-center justify-center shadow-inner">
          <Zap className="text-[#BBAFA7]" size={32} />
        </div>
        <p className="text-sm text-[#6B5E55] font-semibold leading-relaxed">
          Start interacting with the browser <br/>to record your first step.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2">
      {steps.map((step) => (
        <StepCard key={step.id} step={step} />
      ))}
    </div>
  );
}
