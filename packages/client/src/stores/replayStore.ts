import { create } from 'zustand';
import type { ReplayStatus, ReplayOptions } from '@stepwise/shared';
import { wsClient } from '../lib/ws';

interface ReplayState {
  status: ReplayStatus['state'];
  currentStepIndex: number;
  totalSteps: number;
  speed: number;
  stopOnError: boolean;
  error: string | undefined;
  activeStepId: string | null;
}

interface ReplayStore extends ReplayState {
  startReplay: (options?: Partial<ReplayOptions>) => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  stopReplay: () => void;
  setSpeed: (speed: number) => void;
  setStopOnError: (stopOnError: boolean) => void;
  setPlaybackIndex: (index: number) => void;

  handleReplayStatus: (status: ReplayStatus) => void;
  handleStepStart: (stepIndex: number, stepId: string) => void;
  handleStepComplete: (stepIndex: number, stepId: string) => void;
  handleReplayError: (stepId: string | undefined, error: string) => void;

  reset: () => void;
}

export const useReplayStore = create<ReplayStore>((set, get) => ({
  status: 'idle',
  currentStepIndex: 0,
  totalSteps: 0,
  speed: 1,
  stopOnError: false,
  error: undefined,
  activeStepId: null,

  startReplay: (options) => {
    const state = get();
    const mergedOptions: ReplayOptions = {
      speed: options?.speed ?? state.speed,
      stopOnError: options?.stopOnError ?? state.stopOnError,
    };

    wsClient.send({
      type: 'replay:start',
      options: mergedOptions,
    });

    set({
      speed: mergedOptions.speed,
      stopOnError: mergedOptions.stopOnError,
      status: 'playing',
      error: undefined,
    });
  },

  pauseReplay: () => {
    wsClient.send({ type: 'replay:pause' });
    set({ status: 'paused' });
  },

  resumeReplay: () => {
    wsClient.send({ type: 'replay:resume' });
    set({ status: 'playing' });
  },

  stopReplay: () => {
    wsClient.send({ type: 'replay:stop' });
    set({
      status: 'idle',
      currentStepIndex: 0,
      activeStepId: null,
      error: undefined,
    });
  },

  setSpeed: (speed) => {
    set({ speed });
  },

  setStopOnError: (stopOnError) => {
    set({ stopOnError });
  },

  setPlaybackIndex: (index: number) => {
    set({ currentStepIndex: index });
  },

  handleReplayStatus: (status) => {
    set({
      status: status.state,
      currentStepIndex: status.currentStepIndex,
      totalSteps: status.totalSteps,
      error: status.error,
    });
  },

  handleStepStart: (stepIndex, stepId) => {
    set({
      currentStepIndex: stepIndex,
      activeStepId: stepId,
    });
  },

  handleStepComplete: (_stepIndex, stepId) => {
    if (get().activeStepId !== stepId) {
      return;
    }
  },

  handleReplayError: (_stepId, error) => {
    set({
      status: 'error',
      error,
    });
  },

  reset: () => {
    set({
      status: 'idle',
      currentStepIndex: 0,
      totalSteps: 0,
      speed: 1,
      stopOnError: false,
      error: undefined,
      activeStepId: null,
    });
  },
}));
