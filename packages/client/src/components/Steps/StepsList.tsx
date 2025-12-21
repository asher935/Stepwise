import { FileText } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { StepCard } from './StepCard';

export function StepsList() {
  const steps = useSessionStore((s) => s.steps);

  if (steps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-medium text-muted-foreground">No steps recorded</h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Start interacting with the browser to record steps
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {steps.map((step) => (
        <StepCard key={step.id} step={step} />
      ))}
    </div>
  );
}
