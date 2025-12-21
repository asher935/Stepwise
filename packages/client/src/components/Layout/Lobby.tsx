import { useState, useCallback } from 'react';
import { Play, Upload, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSessionStore } from '@/stores/sessionStore';

interface LobbyProps {
  onImportClick: () => void;
}

export function Lobby({ onImportClick }: LobbyProps) {
  const createSession = useSessionStore((s) => s.createSession);
  const startSession = useSessionStore((s) => s.startSession);
  const isLoading = useSessionStore((s) => s.isLoading);
  const error = useSessionStore((s) => s.error);
  const [startUrl, setStartUrl] = useState('https://');

  const handleStart = useCallback(async () => {
    await createSession();
    const url = startUrl.trim() || undefined;
    await startSession(url);
  }, [createSession, startSession, startUrl]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleStart();
    }
  }, [handleStart, isLoading]);

  return (
    <div className="h-full flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Stepwise</CardTitle>
          <CardDescription>
            Record browser actions into step-by-step guides with screenshots
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="startUrl" className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Start URL
            </label>
            <Input
              id="startUrl"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive text-center">{error}</div>
          )}

          <div className="flex flex-col gap-2">
            <Button onClick={handleStart} disabled={isLoading} className="w-full">
              {isLoading ? (
                'Starting...'
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start New Session
                </>
              )}
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button variant="outline" onClick={onImportClick} disabled={isLoading}>
              <Upload className="h-4 w-4 mr-2" />
              Import Existing Guide
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
