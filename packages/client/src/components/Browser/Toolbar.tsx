import { useCallback, useState } from 'react';

import { ArrowLeft, ArrowRight, Globe, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { wsClient } from '@/lib/ws';
import { useSessionStore } from '@/stores/sessionStore';

export function Toolbar() {
  const sessionState = useSessionStore((s) => s.sessionState);
  const isConnected = useSessionStore((s) => s.isConnected);
  const [urlInput, setUrlInput] = useState(sessionState?.url ?? '');

  const handleNavigate = useCallback(() => {
    if (urlInput.trim()) {
      let url = urlInput.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      wsClient.navigate(url);
    }
  }, [urlInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  }, [handleNavigate]);

  const handleBack = useCallback(() => {
    wsClient.goBack();
  }, []);

  const handleForward = useCallback(() => {
    wsClient.goForward();
  }, []);

  const handleReload = useCallback(() => {
    wsClient.reload();
  }, []);

  return (
    <div className="flex items-center gap-2 p-2 border-b bg-background">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          disabled={!isConnected}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleForward}
          disabled={!isConnected}
          aria-label="Go forward"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleReload}
          disabled={!isConnected}
          aria-label="Reload page"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
            className="pl-9"
            disabled={!isConnected}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-muted-foreground">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
