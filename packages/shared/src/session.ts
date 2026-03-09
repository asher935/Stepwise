/** Session lifecycle states */
export type SessionStatus =
  | 'lobby'
  | 'starting'
  | 'active'
  | 'ending'
  | 'closed'
  | 'failed';

/** Session operation mode */
export type SessionMode = 'record' | 'replay';

/** Client-facing session state */
export interface SessionState {
  id: string;
  status: SessionStatus;
  recordingPaused: boolean;
  url: string | null;
  title: string | null;
  stepCount: number;
  createdAt: number;
  lastActivityAt: number;
  error?: string;
}

/** Session creation request */
export interface CreateSessionRequest {
  startUrl?: string;
}

/** Session creation response */
export interface CreateSessionResponse {
  sessionId: string;
  token: string;
}

/** Replay lifecycle states */
export type ReplayState =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'error'
  | 'completed';

/** Options for controlling replay behavior */
export interface ReplayOptions {
  /** Step index to start replay from (default: 0) */
  startStepIndex?: number;
  /** Playback speed multiplier (default: 1) */
  speed: number;
  /** Whether to pause on errors (default: false) */
  stopOnError: boolean;
}

/** Current replay status */
export interface ReplayStatus {
  state: ReplayState;
  currentStepIndex: number;
  totalSteps: number;
  error?: string;
}
