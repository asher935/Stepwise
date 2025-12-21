import { useCallback, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import type { ExportFormat } from '@stepwise/shared';

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
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'pdf', label: 'PDF', description: 'Best for sharing and printing' },
  { value: 'docx', label: 'Word Document', description: 'Editable document format' },
  { value: 'markdown', label: 'Markdown', description: 'Plain text with images' },
  { value: 'html', label: 'HTML', description: 'Web-ready format' },
  { value: 'stepwise', label: 'Stepwise', description: 'Re-importable format' },
];

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [title, setTitle] = useState('My Guide');
  const [password, setPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!sessionId) return;

    setIsExporting(true);
    try {
      const result = await api.exportSession(sessionId, {
        format,
        title,
        password: format === 'stepwise' && password ? password : undefined,
        includeScreenshots: true,
      });

      const blob = await api.downloadExport(sessionId, result.filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, format, title, password, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Guide</DialogTitle>
          <DialogDescription>
            Choose a format to export your step-by-step guide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="export-title" className="text-sm font-medium">Title</label>
            <Input
              id="export-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter guide title"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Format</div>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    format === f.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium text-sm">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.description}</div>
                </button>
              ))}
            </div>
          </div>

          {format === 'stepwise' && (
            <div className="space-y-2">
              <label htmlFor="export-password" className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password (optional)
              </label>
              <Input
                id="export-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to encrypt"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              'Exporting...'
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
