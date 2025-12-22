import { useCallback, useRef, useState } from 'react';
import { FileUp, Lock, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { NavigateStep, Step } from '@stepwise/shared';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportModal({ open, onOpenChange }: ImportModalProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const startSession = useSessionStore((s) => s.startSession);
  const setSteps = useSessionStore((s) => s.setSteps);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStartUrl = useCallback((steps: Step[]) => {
    const navigateSteps = steps
      .filter((step): step is NavigateStep => step.action === 'navigate')
      .sort((a, b) => a.index - b.index);
    return navigateSteps[0]?.toUrl;
  }, []);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    await createSession();
    const nextSessionId = useSessionStore.getState().sessionId;
    if (!nextSessionId) {
      throw new Error('Failed to create session');
    }
    return nextSessionId;
  }, [sessionId, createSession]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setNeedsPassword(false);
    setPassword('');

    try {
      const activeSessionId = await ensureSession();
      const preview = await api.previewImport(activeSessionId, selectedFile);
      setNeedsPassword(preview.encrypted);
    } catch {
      setError('Failed to preview file');
    }
  }, [ensureSession]);

  const handleImport = useCallback(async () => {
    if (!file) return;

    setIsImporting(true);
    setError(null);

    try {
      const activeSessionId = await ensureSession();
      const result = await api.importFile(activeSessionId, file, needsPassword ? password : undefined);
      setSteps(result.steps);
      const startUrl = getStartUrl(result.steps);
      await startSession(startUrl);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  }, [file, password, needsPassword, onOpenChange, ensureSession, getStartUrl, startSession, setSteps]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith('.stepwise')) {
      const fakeEvent = {
        target: { files: [droppedFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(fakeEvent);
    }
  }, [handleFileChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Guide</DialogTitle>
          <DialogDescription>
            Import a previously exported .stepwise file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".stepwise"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            className="w-full border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileUp className="h-8 w-8 text-primary" />
                <span className="font-medium">{file.name}</span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Drop a .stepwise file here or click to browse
                </p>
              </div>
            )}
          </button>

          {needsPassword && (
            <div className="space-y-2">
              <label htmlFor="import-password" className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password
              </label>
              <Input
                id="import-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter file password"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || isImporting}>
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
