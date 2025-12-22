import { useState, useCallback } from 'react';
import { Trash2, Edit2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { Step } from '@stepwise/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSessionStore } from '@/stores/sessionStore';

interface StepCardProps {
  step: Step;
}

export function StepCard({ step }: StepCardProps) {
  const updateStep = useSessionStore((s) => s.updateStep);
  const deleteStep = useSessionStore((s) => s.deleteStep);
  const collapsedStepIds = useSessionStore((s) => s.collapsedStepIds);
  const toggleStepCollapsed = useSessionStore((s) => s.toggleStepCollapsed);
  const [isEditing, setIsEditing] = useState(false);
  const [caption, setCaption] = useState(step.caption);

  const isCollapsed = collapsedStepIds.has(step.id);

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
    <Card className="overflow-hidden group">
      {!isCollapsed && (
        <div className="relative aspect-video bg-muted">
        {step.screenshotDataUrl ? (
          <img
            src={step.screenshotDataUrl}
            alt={`Step ${step.index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            No screenshot
          </div>
        )}
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
          {step.index + 1}
        </div>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 bg-background/80 backdrop-blur"
            onClick={handleToggleCollapse}
            aria-label={isCollapsed ? 'Expand step' : 'Collapse step'}
          >
            {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-6 w-6"
            onClick={handleDelete}
            aria-label="Delete step"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      )}

      <div className={`p-3 ${isCollapsed ? 'hidden' : ''}`}>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm truncate flex-1">{step.caption || 'No caption'}</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setIsEditing(true)}
              aria-label="Edit caption"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {isCollapsed && (
        <div className="p-3 flex items-center justify-between border-t">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {step.index + 1}
            </div>
            <p className="text-sm truncate">{step.caption || 'No caption'}</p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              className="h-6 w-6 bg-background/80 backdrop-blur"
              onClick={handleToggleCollapse}
              aria-label="Expand step"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsEditing(true)}
              aria-label="Edit caption"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="h-6 w-6"
              onClick={handleDelete}
              aria-label="Delete step"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
