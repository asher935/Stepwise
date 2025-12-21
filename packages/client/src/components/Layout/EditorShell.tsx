import { useState, useEffect } from 'react';
import { Download, Upload, LogOut, Menu } from 'lucide-react';
import { Toolbar } from '@/components/Browser/Toolbar';
import { Viewport } from '@/components/Browser/Viewport';
import { ExportModal } from '@/components/Export/ExportModal';
import { ImportModal } from '@/components/Import/ImportModal';
import { StepsList } from '@/components/Steps/StepsList';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/stores/sessionStore';

export function EditorShell() {
  const endSession = useSessionStore((s) => s.endSession);
  const initWebSocket = useSessionStore((s) => s.initWebSocket);
  const steps = useSessionStore((s) => s.steps);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const cleanup = initWebSocket();
    return cleanup;
  }, [initWebSocket]);

  const handleEndSession = async () => {
    if (confirm('Are you sure you want to end this session? All unsaved data will be lost.')) {
      await endSession();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b flex items-center justify-between px-4 bg-background shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold text-lg">Stepwise</h1>
          <span className="text-sm text-muted-foreground">
            {steps.length} step{steps.length !== 1 ? 's' : ''} recorded
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowExport(true)} disabled={steps.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEndSession}>
            <LogOut className="h-4 w-4 mr-2" />
            End Session
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <aside className="w-80 border-r flex flex-col bg-muted/30 shrink-0">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Recorded Steps</h2>
            </div>
            <StepsList />
          </aside>
        )}

        <main className="flex-1 flex flex-col overflow-hidden">
          <Toolbar />
          <Viewport />
        </main>
      </div>

      <ExportModal open={showExport} onOpenChange={setShowExport} />
      <ImportModal open={showImport} onOpenChange={setShowImport} />
    </div>
  );
}
