import type { SessionState, Step } from '@stepwise/shared';
import { create } from 'zustand';
import { api } from '../lib/api';
import { wsClient } from '../lib/ws';

interface SessionStore {
  sessionId: string | null;
  token: string | null;
  sessionState: SessionState | null;
  steps: Step[];
  currentFrame: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  createSession: () => Promise<void>;
  startSession: (startUrl?: string) => Promise<void>;
  endSession: () => Promise<void>;
  updateStep: (stepId: string, updates: { caption?: string }) => Promise<void>;
  deleteStep: (stepId: string) => Promise<void>;
  setSteps: (steps: Step[]) => void;
  setFrame: (frame: string) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setSessionState: (state: SessionState | null) => void;
  reset: () => void;

  initWebSocket: () => () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: null,
  token: null,
  sessionState: null,
  steps: [],
  currentFrame: null,
  isConnected: false,
  isLoading: false,
  error: null,

  createSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const { sessionId, token } = await api.createSession();
      api.setToken(token);
      set({ sessionId, token, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create session',
        isLoading: false 
      });
    }
  },

  startSession: async (startUrl?: string) => {
    const { sessionId } = get();
    if (!sessionId) return;

    set({ isLoading: true, error: null });
    try {
      const sessionState = await api.startSession(sessionId, startUrl);
      set({ sessionState, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to start session',
        isLoading: false 
      });
    }
  },

  endSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    let endError: string | null = null;
    try {
      await api.endSession(sessionId);
    } catch (error) {
      endError = error instanceof Error ? error.message : 'Failed to end session';
    } finally {
      wsClient.disconnect();
      get().reset();
      if (endError) {
        set({ error: endError });
      }
    }
  },

  updateStep: async (stepId: string, updates: { caption?: string }) => {
    const { sessionId, steps } = get();
    if (!sessionId) return;

    try {
      const updatedStep = await api.updateStep(sessionId, stepId, updates);
      set({
        steps: steps.map(s => s.id === stepId ? updatedStep : s)
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update step' 
      });
    }
  },

  deleteStep: async (stepId: string) => {
    const { sessionId, steps } = get();
    if (!sessionId) return;

    try {
      await api.deleteStep(sessionId, stepId);
      const newSteps = steps
        .filter(s => s.id !== stepId)
        .map((s, i) => ({ ...s, index: i }));
      set({ steps: newSteps });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete step' 
      });
    }
  },

  setSteps: (steps: Step[]) => {
    set({ steps });
  },

  setFrame: (frame: string) => {
    set({ currentFrame: frame });
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setSessionState: (state: SessionState | null) => {
    set({ sessionState: state });
  },

  reset: () => {
    api.clearToken();
    set({
      sessionId: null,
      token: null,
      sessionState: null,
      steps: [],
      currentFrame: null,
      isConnected: false,
      isLoading: false,
      error: null,
    });
  },

  initWebSocket: () => {
    const { sessionId, token } = get();
    if (!sessionId || !token) return () => {};

    wsClient.connect(sessionId, token);

    const unsubMessage = wsClient.onMessage((message) => {
      switch (message.type) {
        case 'frame':
          set({ currentFrame: `data:image/jpeg;base64,${message.data}` });
          break;
        case 'step:new':
          set(state => ({ steps: [...state.steps, message.step] }));
          break;
        case 'step:updated':
          set(state => ({
            steps: state.steps.map(s => 
              s.id === message.step.id ? message.step : s
            )
          }));
          break;
        case 'step:deleted':
          set(state => ({
            steps: state.steps.filter(s => s.id !== message.stepId)
          }));
          break;
        case 'session:state':
          set({ sessionState: message.state });
          break;
        case 'error':
          set({ error: message.message });
          break;
        case 'cdp:error':
          console.error('[CDP] Error:', message);
          set({ error: message.message });
          break;
        case 'input:error':
          console.error('[Input] Error:', message);
          set({ error: message.reason });
          break;
        case 'rate:limited':
          console.warn('[Input] Rate limited:', message);
          break;
        case 'session:unhealthy':
          console.warn('[Session] Unhealthy:', message);
          break;
      }
    });

    const unsubConnect = wsClient.onConnect(() => {
      set({ isConnected: true });
    });

    const unsubDisconnect = wsClient.onDisconnect(() => {
      set({ isConnected: false });
    });

    return () => {
      unsubMessage();
      unsubConnect();
      unsubDisconnect();
      wsClient.disconnect();
    };
  },
}));
