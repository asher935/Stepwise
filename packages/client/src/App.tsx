import { useState } from 'react';
import { ImportModal } from '@/components/Import/ImportModal';
import { EditorShell } from '@/components/Layout/EditorShell';
import { Lobby } from '@/components/Layout/Lobby';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSessionStore } from '@/stores/sessionStore';

export default function App() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const [showImport, setShowImport] = useState(false);

  const isActive = sessionState?.status === 'active';

  return (
    <TooltipProvider>
      <div className="h-full">
        {isActive ? (
          <EditorShell />
        ) : (
          <>
            <Lobby onImportClick={() => setShowImport(true)} />
            <ImportModal open={showImport} onOpenChange={setShowImport} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
