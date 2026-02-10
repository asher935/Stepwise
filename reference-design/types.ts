
export interface Step {
  id: string;
  number: number;
  action: string;
  url: string;
  timestamp: number;
  screenshot: string;
  aiDescription?: string;
  status?: 'pending' | 'playing' | 'success' | 'error';
  errorMessage?: string;
}

export interface Session {
  id: string;
  title: string;
  initialUrl: string;
  steps: Step[];
  status: 'idle' | 'recording' | 'finished';
  connected: boolean;
  playbackStatus: 'idle' | 'playing' | 'paused' | 'error';
  currentStepIndex: number;
}

export interface DebugLog {
  timestamp: number;
  type: string;
  data: any;
}
