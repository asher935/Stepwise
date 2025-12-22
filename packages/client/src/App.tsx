import { useEffect, useState } from 'react';
import { ImportModal } from '@/components/Import/ImportModal';
import { EditorShell } from '@/components/Layout/EditorShell';
import { Lobby } from '@/components/Layout/Lobby';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/sessionStore';

export default function App() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const token = useSessionStore((s) => s.token);
  const setGuideTitle = useSessionStore((s) => s.setGuideTitle);
  const [showImport, setShowImport] = useState(false);

  const isActive = sessionState?.status === 'active';

  useEffect(() => {
    if (token) {
      api.setToken(token);
    } else {
      api.clearToken();
    }
  }, [token]);

  return (
    <TooltipProvider>
      <div className="h-full">
        {isActive ? (
          <EditorShell />
        ) : (
          <>
            <Lobby onImportClick={() => setShowImport(true)} />
            <ImportModal open={showImport} onOpenChange={setShowImport} setGuideTitle={setGuideTitle} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
