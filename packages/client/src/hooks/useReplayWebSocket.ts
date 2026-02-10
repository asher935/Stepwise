import { useEffect } from 'react';
import { wsClient } from '../lib/ws';
import { useReplayStore } from '../stores/replayStore';

/**
 * Hook to initialize WebSocket message handlers for replay functionality.
 * This should be called once in the EditorShell component.
 */
export function useReplayWebSocket() {
  const handleReplayStatus = useReplayStore((s) => s.handleReplayStatus);
  const handleStepStart = useReplayStore((s) => s.handleStepStart);
  const handleStepComplete = useReplayStore((s) => s.handleStepComplete);
  const handleReplayError = useReplayStore((s) => s.handleReplayError);

  useEffect(() => {
    const unsubMessage = wsClient.onMessage((message) => {
      switch (message.type) {
        case 'replay:status':
          handleReplayStatus(message.status);
          break;
        case 'replay:step:start':
          handleStepStart(message.stepIndex, message.stepId);
          break;
        case 'replay:step:complete':
          handleStepComplete(message.stepIndex, message.stepId);
          break;
        case 'replay:error':
          handleReplayError(message.stepId, message.error);
          break;
      }
    });

    return unsubMessage;
  }, [handleReplayStatus, handleStepStart, handleStepComplete, handleReplayError]);
}
