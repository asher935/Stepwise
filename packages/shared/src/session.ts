/** Session lifecycle states */
export type SessionStatus = 
  | 'lobby'
  | 'starting'
  | 'active'
  | 'ending'
  | 'closed'
  | 'failed';

/** Client-facing session state */
export interface SessionState {
  id: string;
  status: SessionStatus;
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