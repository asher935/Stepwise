import type { SessionState, Step, ElementInfo, ScreenshotMode, StepLegendItem } from '@stepwise/shared';
import { create } from 'zustand';
import { api } from '../lib/api';
import { wsClient } from '../lib/ws';
import { useReplayStore } from './replayStore';

const DEFAULT_STEP_HIGHLIGHT_COLOR = '#FF0000';
const STEP_HIGHLIGHT_COLOR_STORAGE_KEY = 'stepwise.stepHighlightColor';

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function getInitialHighlightColor(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_STEP_HIGHLIGHT_COLOR;
  }

  const stored = window.localStorage.getItem(STEP_HIGHLIGHT_COLOR_STORAGE_KEY);
  if (stored && isHexColor(stored)) {
    return stored;
  }

  return DEFAULT_STEP_HIGHLIGHT_COLOR;
}

interface SessionStore {
  sessionId: string | null;
  token: string | null;
  sessionState: SessionState | null;
  steps: Step[];
  currentFrame: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  expiryWarningMs: number | null;
  hoveredElement: ElementInfo | null;
  pendingUploadRequest: { x: number; y: number } | null;
  collapsedStepIds: Set<string>;
  guideTitle: string;
  hoveredStepId: string | null;
  localStepIds: Set<string>;
  stepHighlightColor: string;

  createSession: () => Promise<void>;
  startSession: (startUrl?: string) => Promise<void>;
  endSession: () => Promise<void>;
  setRecordingPaused: (paused: boolean) => Promise<void>;
  updateStep: (stepId: string, updates: {
    caption?: string;
    redactScreenshot?: boolean;
    redactedScreenshotPath?: string;
    legendItems?: StepLegendItem[];
    pageLegendItems?: StepLegendItem[];
    selectedScreenshotMode?: ScreenshotMode;
  }) => Promise<void>;
  toggleRedaction: (stepId: string, redact: boolean) => Promise<string | undefined>;
  deleteStep: (stepId: string) => Promise<void>;
  insertStep: (index: number, step: Omit<Step, 'index'>) => Promise<void>;
  insertDetectedStep: (index: number) => Promise<void>;
  setSteps: (steps: Step[]) => void;
  setFrame: (frame: string) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setSessionState: (state: SessionState | null) => void;
  extendSession: () => void;
  clearExpiryWarning: () => void;
  setHoveredElement: (element: ElementInfo | null) => void;
  setPendingUploadRequest: (request: { x: number; y: number } | null) => void;
  setGuideTitle: (title: string) => void;
  toggleStepCollapsed: (stepId: string) => void;
  setHoveredStepId: (stepId: string | null) => void;
  setStepHighlightColor: (color: string) => void;
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
  expiryWarningMs: null,
  hoveredElement: null,
  pendingUploadRequest: null,
  collapsedStepIds: new Set<string>(),
  guideTitle: 'Untitled Guide',
  hoveredStepId: null,
  localStepIds: new Set<string>(),
  stepHighlightColor: getInitialHighlightColor(),

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

  setRecordingPaused: async (paused: boolean) => {
    const { sessionId, sessionState } = get();
    if (!sessionId || !sessionState) return;

    try {
      const nextState = await api.setRecordingPaused(sessionId, paused);
      set({ sessionState: nextState, error: null });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update recording state'
      });
    }
  },

  updateStep: async (stepId: string, updates: {
    caption?: string;
    redactScreenshot?: boolean;
    redactedScreenshotPath?: string;
    legendItems?: StepLegendItem[];
    pageLegendItems?: StepLegendItem[];
    selectedScreenshotMode?: ScreenshotMode;
  }) => {
    const { sessionId, steps, localStepIds } = get();
    if (!sessionId) return;

    if (localStepIds.has(stepId)) {
      set({
        steps: steps.map(s => s.id === stepId ? { ...s, ...updates } : s)
      });
      return;
    }

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

  toggleRedaction: async (stepId: string, redact: boolean) => {
    const { sessionId, steps, localStepIds } = get();
    if (!sessionId) return;

    if (localStepIds.has(stepId)) {
      set({
        steps: steps.map(s => s.id === stepId ? { ...s, redactScreenshot: redact } : s)
      });
      return;
    }

    try {
      const result = await api.toggleRedaction(sessionId, stepId, redact);
      set({
        steps: steps.map(s => s.id === stepId ? {
          ...s,
          redactScreenshot: redact,
          redactedScreenshotPath: result.redactedScreenshotPath ?? undefined,
          // When enabling redaction, save original and use redacted URL
          // When disabling, restore the original URL
          ...(redact
            ? {
                originalScreenshotDataUrl: s.screenshotDataUrl,
                screenshotDataUrl: result.screenshotDataUrl ?? s.screenshotDataUrl,
              }
            : {
                screenshotDataUrl: s.originalScreenshotDataUrl ?? s.screenshotDataUrl,
              }
          ),
        } : s)
      });
      // Return the appropriate URL for the modal
      return redact && result.screenshotDataUrl ? result.screenshotDataUrl : undefined;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle redaction'
      });
    }
  },

  deleteStep: async (stepId: string) => {
    const { sessionId, localStepIds } = get();
    if (!sessionId) return;

    if (localStepIds.has(stepId)) {
      const newLocalStepIds = new Set(localStepIds);
      newLocalStepIds.delete(stepId);
      set((state) => ({
        steps: state.steps
          .filter(s => s.id !== stepId)
          .map((s, i) => ({ ...s, index: i })),
        localStepIds: newLocalStepIds
      }));
      return;
    }

    try {
      await api.deleteStep(sessionId, stepId);
      set((state) => ({
        steps: state.steps
          .filter(s => s.id !== stepId)
          .map((s, i) => ({ ...s, index: i }))
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete step'
      });
    }
  },

  insertStep: async (index: number, stepData: Omit<Step, 'index'>) => {
    const { steps, sessionId, localStepIds } = get();
    const newStep: Step = {
      ...stepData,
      index,
    } as Step;

    const newSteps = [
      ...steps.slice(0, index),
      newStep,
      ...steps.slice(index).map(s => ({ ...s, index: s.index + 1 })),
    ];

    const nextLocalStepIds = new Set(localStepIds);
    nextLocalStepIds.add(newStep.id);

    set({
      steps: newSteps,
      localStepIds: nextLocalStepIds,
    });

    if (!sessionId) {
      return;
    }

    try {
      const syncedSteps = await api.insertStep(sessionId, index, { step: newStep });
      const syncedLocalStepIds = new Set(get().localStepIds);
      syncedLocalStepIds.delete(newStep.id);
      set({
        steps: syncedSteps,
        localStepIds: syncedLocalStepIds,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to insert step',
      });
    }
  },

  insertDetectedStep: async (index: number) => {
    const { sessionId } = get();
    if (!sessionId) {
      return;
    }

    try {
      const syncedSteps = await api.insertStep(sessionId, index, { autoDetect: true });
      set({
        steps: syncedSteps,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to insert detected step',
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

  extendSession: () => {
    wsClient.extendSession();
    set({ expiryWarningMs: null, error: null });
  },

  clearExpiryWarning: () => {
    set({ expiryWarningMs: null });
  },

  setHoveredElement: (element: ElementInfo | null) => {
    set({ hoveredElement: element });
  },

  setPendingUploadRequest: (request: { x: number; y: number } | null) => {
    set({ pendingUploadRequest: request });
  },

  setGuideTitle: (title: string) => {
    set({ guideTitle: title });
  },

  setHoveredStepId: (stepId: string | null) => {
    set({ hoveredStepId: stepId });
  },

  setStepHighlightColor: (color: string) => {
    if (!isHexColor(color)) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STEP_HIGHLIGHT_COLOR_STORAGE_KEY, color);
    }

    set({ stepHighlightColor: color });
    wsClient.setHighlightColor(color);
  },

  toggleStepCollapsed: (stepId: string) => {
    set(state => {
      const newCollapsed = new Set(state.collapsedStepIds);
      if (newCollapsed.has(stepId)) {
        newCollapsed.delete(stepId);
      } else {
        newCollapsed.add(stepId);
      }
      return { collapsedStepIds: newCollapsed };
    });
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
      expiryWarningMs: null,
      hoveredElement: null,
      pendingUploadRequest: null,
      collapsedStepIds: new Set<string>(),
      guideTitle: 'Untitled Guide',
      hoveredStepId: null,
      localStepIds: new Set<string>(),
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
          set(state => {
            const previousStepIds = state.steps.map(s => s.id);
            return {
              steps: [...state.steps, message.step],
              collapsedStepIds: new Set(previousStepIds)
            };
          });
          break;
        case 'step:updated':
          set(state => ({
            steps: state.steps.map(s =>
              s.id === message.step.id ? message.step : s
            )
          }));
          break;
        case 'step:deleted':
          set(state => {
            const newLocalStepIds = new Set(state.localStepIds);
            newLocalStepIds.delete(message.stepId);
            return {
              steps: state.steps
                .filter(s => s.id !== message.stepId)
                .map((s, i) => ({ ...s, index: i })),
              localStepIds: newLocalStepIds
            };
          });
          break;
        case 'session:state':
          set({ sessionState: message.state, expiryWarningMs: null });
          break;
        case 'session:expiring':
          set({ expiryWarningMs: message.remainingMs });
          break;
        case 'element:hover':
          set({ hoveredElement: message.element });
          break;
        case 'upload:requested':
          set({ pendingUploadRequest: { x: message.x, y: message.y }, error: null });
          break;
        case 'error':
          set({ error: message.message, expiryWarningMs: null });
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
        case 'replay:status':
          useReplayStore.getState().handleReplayStatus(message.status);
          break;
        case 'replay:step:start':
          useReplayStore.getState().handleStepStart(message.stepIndex, message.stepId);
          break;
        case 'replay:step:complete':
          useReplayStore.getState().handleStepComplete(message.stepIndex, message.stepId);
          break;
        case 'replay:error':
          useReplayStore.getState().handleReplayError(message.stepId, message.error);
          break;
      }
    });

    const unsubConnect = wsClient.onConnect(() => {
      set({ isConnected: true });
      wsClient.setHighlightColor(get().stepHighlightColor);
    });

    const unsubDisconnect = wsClient.onDisconnect(() => {
      set({ isConnected: false, hoveredElement: null });
    });

    return () => {
      unsubMessage();
      unsubConnect();
      unsubDisconnect();
      wsClient.disconnect();
    };
  },
}));
