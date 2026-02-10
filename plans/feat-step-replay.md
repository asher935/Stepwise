# Plan: Step Replay Feature

**Status:** ✅ COMPLETED (2025-12-24)
**Orchestrator:** Claude Code (Anthropic)

## Overview

Enable users to replay their recorded steps with play/pause controls, allowing them to verify, edit, and add steps to their guides. The browser will automatically play back recorded actions with configurable speed and error recovery.

## Problem Statement

Currently, users can record browser actions into step-by-step guides, but they cannot:
- Replay their recordings to verify accuracy
- Pause execution to examine steps
- Insert new steps (replay runs through previous steps automatically)
- Control playback speed

This limits the usability of Stepwise for creating high-quality guides.

## Proposed Solution

Create a `ReplayService` that executes recorded steps with:
- Play/pause/stop controls
- Configurable playback speed
- Error recovery
- Real-time progress feedback via WebSocket

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Client)                         │
├─────────────────────────────────────────────────────────────────┤
│  ReplayStore (Zustand)                                          │
│    ├── replayState: 'idle' | 'playing' | 'paused' | 'error'     │
│    ├── currentStepIndex: number                                 │
│    ├── playbackSpeed: number                                    │
│    └── replayOptions: ReplayOptions                             │
│                                                                  │
│  ReplayControls Component                                       │
│    ├── Play/Pause/Stop buttons                                  │
│    ├── Speed selector (0.5x, 1x, 2x)                            │
│    └── Step progress indicator                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    WebSocket (JSON messages)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Server)                          │
├─────────────────────────────────────────────────────────────────┤
│  ReplayService                                                   │
│    ├── executeStep(step, options): Promise<void>                │
│    └── pause(), resume(), stop()                                │
│                                                                  │
│  CDPBridge (Enhanced)                                            │
│    ├── hover(x, y)                                              │
│    ├── selectOption(x, y, value)                                │
│    └── executeWithRetry(step, maxRetries)                       │
│                                                                  │
│  SessionManager                                                  │
│    └── replayState management                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Approach

### 1. Type Definitions

**File:** `packages/shared/src/session.ts` (additions)

```typescript
type ReplayState = 'idle' | 'playing' | 'paused' | 'error' | 'completed';

interface ReplayOptions {
  startStepIndex?: number;
  speed: number;        // Multiplier: 0.5 = half speed, 2 = double
  stopOnError: boolean; // Pause on element not found
}

interface ReplayStatus {
  state: ReplayState;
  currentStepIndex: number;
  totalSteps: number;
  error?: string;
}
```

**File:** `packages/shared/src/ws.ts` (additions)

```typescript
// Client -> Server messages
type ReplayMessageType = 'replay:start' | 'replay:pause' | 'replay:resume' |
                         'replay:stop';

interface ReplayStartMessage {
  type: 'replay:start';
  options?: ReplayOptions;
}

// Server -> Client messages
type ReplayServerMessageType = 'replay:status' | 'replay:step:start' |
                               'replay:step:complete' | 'replay:error';

interface ReplayStatusMessage {
  type: 'replay:status';
  status: ReplayStatus;
}

interface ReplayStepStartMessage {
  type: 'replay:step:start';
  stepIndex: number;
  stepId: string;
}
```

### 2. CDPBridge Enhancements

**File:** `packages/server/src/services/CDPBridge.ts`

```typescript
// Add hover method (lines ~551)
async hover(x: number, y: number): Promise<void> {
  await this.sendMouseInput('move', x, y, 'left');
}

// Add selectOption method
async selectOption(x: number, y: number, value: string): Promise<void> {
  await this.click(x, y, 'left');
  await new Promise(r => setTimeout(r, 100)); // Wait for dropdown
  await this.evaluate(`document.querySelector('select').value = '${value}'`);
}
```

### 3. ReplayService Implementation

**File:** `packages/server/src/services/ReplayService.ts`

```typescript
import { Step, ClickStep, TypeStep, NavigateStep, ScrollStep, SelectStep, HoverStep } from '@stepwise/shared/step';
import { CDPBridge } from './CDPBridge';

interface ReplayServiceOptions {
  speed: number;
  stopOnError: boolean;
}

export class ReplayService {
  private currentStepIndex = 0;
  private state: ReplayState = 'idle';
  private paused = false;
  private cancelled = false;

  constructor(
    private cdp: CDPBridge,
    private session: ServerSession,
    private options: ReplayServiceOptions
  ) {}

  async play(startIndex: number = 0): Promise<void> {
    this.currentStepIndex = startIndex;
    this.paused = false;
    this.cancelled = false;
    this.state = 'playing';

    await this.notifyStatus();

    while (this.currentStepIndex < this.session.steps.length && !this.cancelled) {
      if (this.paused) {
        await this.waitWhilePaused();
        continue;
      }

      const step = this.session.steps[this.currentStepIndex];

      await this.executeStep(step);

      if (this.state === 'error' && this.options.stopOnError) {
        break;
      }

      this.currentStepIndex++;
      await this.notifyStepProgress();

      // Delay between steps (adjusted by speed)
      const delay = this.calculateStepDelay();
      await this.waitWithCancellation(delay);
    }

    this.state = this.cancelled ? 'idle' : 'completed';
    await this.notifyStatus();
  }

  async executeStep(step: Step): Promise<void> {
    await this.emitStepStart(step.id, this.currentStepIndex);

    try {
      switch (step.action) {
        case 'click':
          await this.executeClick(step);
          break;
        case 'type':
          await this.executeType(step);
          break;
        case 'navigate':
          await this.executeNavigate(step);
          break;
        case 'scroll':
          await this.executeScroll(step);
          break;
        case 'select':
          await this.executeSelect(step);
          break;
        case 'hover':
          await this.executeHover(step);
          break;
      }

      // Capture screenshot after step execution
      await this.captureStepScreenshot(step);
      await this.emitStepComplete(step.id);

    } catch (error) {
      await this.handleStepError(step, error);
    }
  }

  private async executeClick(step: ClickStep): Promise<void> {
    const { target, button } = step;
    const { x, y, width, height } = target.boundingBox;
    await this.cdp.click(x + width / 2, y + height / 2, button);
  }

  private async executeType(step: TypeStep): Promise<void> {
    // Use rawValue if available (redaction is only for screenshots/export)
    const value = step.rawValue ?? step.value;

    const { x, y, width, height } = step.target.boundingBox;
    await this.cdp.click(x + width / 2, y + height / 2);
    await this.cdp.type(value);
  }

  private async executeNavigate(step: NavigateStep): Promise<void> {
    switch (step.action) {
      case 'goto':
        await this.cdp.navigate(step.toUrl);
        break;
      case 'back':
        await this.cdp.goBack();
        break;
      case 'forward':
        await this.cdp.goForward();
        break;
      case 'reload':
        await this.cdp.reload();
        break;
    }

    // Wait for page to settle
    await this.waitForPageSettle();
  }

  private async executeScroll(step: ScrollStep): Promise<void> {
    const { boundingBox } = step.target;
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;

    const deltaX = step.direction === 'left' ? -step.distance :
                   step.direction === 'right' ? step.distance : 0;
    const deltaY = step.direction === 'up' ? -step.distance :
                   step.direction === 'down' ? step.distance : 0;

    await this.cdp.scroll(centerX, centerY, deltaX, deltaY);
  }

  private async executeSelect(step: SelectStep): Promise<void> {
    const { x, y, width, height } = step.target.boundingBox;
    await this.cdp.selectOption(x + width / 2, y + height / 2, step.value);
  }

  private async executeHover(step: HoverStep): Promise<void> {
    const { x, y, width, height } = step.target.boundingBox;
    await this.cdp.hover(x + width / 2, y + height / 2);
  }

  // Control methods
  pause(): void {
    this.paused = true;
    this.state = 'paused';
    this.notifyStatus();
  }

  resume(): void {
    this.paused = false;
    this.state = 'playing';
    this.notifyStatus();
  }

  stop(): void {
    this.cancelled = true;
    this.paused = false;
    this.state = 'idle';
    this.notifyStatus();
  }

  skipToStep(index: number): void {
    this.currentStepIndex = index;
  }

  private async waitWhilePaused(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (!this.paused || this.cancelled) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  private async waitWithCancellation(ms: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < ms && !this.cancelled && !this.paused) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  private calculateStepDelay(): number {
    const baseDelay = 300; // Base delay between steps in ms
    return baseDelay / this.options.speed;
  }

  private async waitForPageSettle(): Promise<void> {
    await new Promise(r => setTimeout(r, 1000));
  }

  private async captureStepScreenshot(step: Step): Promise<void> {
    const screenshotPath = await this.cdp.takeScreenshot();
    // Update step with new screenshot (don't overwrite original if in verify mode)
    step.screenshotPath = screenshotPath;
  }

  private async handleStepError(step: Step, error: Error): Promise<void> {
    this.state = 'error';
    await this.emitError(step.id, error.message);
  }
}
```

### 4. WebSocket Handler Extensions

**File:** `packages/server/src/ws/handler.ts`

```typescript
// Add replay message handling
case 'replay:start':
  await this.handleReplayStart(message.options);
  break;
case 'replay:pause':
  this.replayService?.pause();
  break;
case 'replay:resume':
  this.replayService?.resume();
  break;
case 'replay:stop':
  this.replayService?.stop();
  break;
```

### 5. Frontend ReplayStore

**File:** `packages/client/src/stores/replayStore.ts`

```typescript
import { create } from 'zustand';
import { Step, ReplayOptions } from '@stepwise/shared/types';

interface ReplayState {
  status: 'idle' | 'playing' | 'paused' | 'error' | 'completed';
  currentStepIndex: number;
  totalSteps: number;
  speed: number;
  error?: string;
}

interface ReplayStore extends ReplayState {
  // Actions
  startReplay: (options?: ReplayOptions) => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  stopReplay: () => void;
  setSpeed: (speed: number) => void;

  // WebSocket handlers
  handleReplayStatus: (status: ReplayStatus) => void;
  handleStepStart: (stepIndex: number, stepId: string) => void;
  handleReplayError: (error: string) => void;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  status: 'idle',
  currentStepIndex: 0,
  totalSteps: 0,
  speed: 1,

  startReplay: (options) => {
    // Send WebSocket message
    ws.send({ type: 'replay:start', options });
  },

  pauseReplay: () => {
    ws.send({ type: 'replay:pause' });
    set({ status: 'paused' });
  },

  resumeReplay: () => {
    ws.send({ type: 'replay:resume' });
    set({ status: 'playing' });
  },

  stopReplay: () => {
    ws.send({ type: 'replay:stop' });
    set({ status: 'idle', currentStepIndex: 0 });
  },

  setSpeed: (speed) => set({ speed }),

  handleReplayStatus: (status) => set({
    status: status.state,
    currentStepIndex: status.currentStepIndex,
    totalSteps: status.totalSteps,
    error: status.error
  }),

  handleStepStart: (stepIndex, stepId) => set({
    currentStepIndex: stepIndex
  }),

  handleReplayError: (error) => set({
    status: 'error',
    error
  })
}));
```

### 6. ReplayControls Component

**File:** `packages/client/src/components/Replay/ReplayControls.tsx`

```typescript
import React from 'react';
import { useReplayStore } from '../../stores/replayStore';
import { useSessionStore } from '../../stores/sessionStore';
import { Play, Pause, Square, Clock, AlertCircle } from 'lucide-react';

export function ReplayControls() {
  const {
    status,
    currentStepIndex,
    totalSteps,
    speed,
    startReplay,
    pauseReplay,
    resumeReplay,
    stopReplay,
    setSpeed
  } = useReplayStore();

  const { steps } = useSessionStore();

  const handlePlay = () => {
    startReplay({ speed, stopOnError: false });
  };

  const handlePause = () => {
    if (status === 'playing') pauseReplay();
    else if (status === 'paused') resumeReplay();
  };

  const handleStop = () => stopReplay();

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-100 rounded-lg">
      {/* Play/Pause/Stop */}
      <div className="flex gap-2">
        <button
          onClick={handlePlay}
          disabled={status === 'playing'}
          className="p-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          <Play size={20} />
        </button>

        <button
          onClick={handlePause}
          disabled={status === 'idle'}
          className="p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
        >
          {status === 'playing' ? <Pause size={20} /> : <Play size={20} />}
        </button>

        <button
          onClick={handleStop}
          disabled={status === 'idle'}
          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          <Square size={20} />
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">
          Step {currentStepIndex + 1} of {totalSteps || steps.length}
        </span>
        <div className="w-32 h-2 bg-gray-300 rounded overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{
              width: `${totalSteps ? (currentStepIndex / totalSteps) * 100 : 0}%`
            }}
          />
        </div>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-gray-500" />
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="p-1 border rounded"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
        </select>
      </div>

      {/* Error indicator */}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle size={20} />
          <span className="text-sm">Step failed</span>
        </div>
      )}
    </div>
  );
}
```

## Implementation Phases

### Phase 1: Foundation
- Add ReplayState types to `packages/shared/src/session.ts`
- Extend WebSocket protocol in `packages/shared/src/ws.ts`
- Add CDPBridge `hover()` and `selectOption()` methods
- Add `executeWithRetry()` helper method

### Phase 2: Core Playback Engine
- Create `ReplayService` class
- Implement `play()`, `pause()`, `resume()`, `stop()`
- Implement step execution for all step types
- Add error handling with fallback selectors

### Phase 3: WebSocket Integration
- Extend WebSocket handler for replay messages
- Implement server-to-client status updates
- Add step progress notifications

### Phase 4: Frontend Implementation
- Create `replayStore.ts` Zustand store
- Build `ReplayControls` component
- Integrate with `StepsList` for current step highlighting
- Add speed selector

### Phase 5: Polish & Testing
- Add unit tests for ReplayService
- Test with various step types and error scenarios
- Document feature in README
- Performance optimization for large step counts

## Alternative Approaches Considered

### Option A: Playwright-based Replay
Use Playwright's built-in `page.perform()` API to replay actions.

**Pros:** Less code, leverages existing test framework
**Cons:** Requires converting Step format to Playwright actions, less control over low-level CDP, added dependency

**Rejected:** The existing CDPBridge already has all necessary methods, and using it directly provides more control over timing and error handling.

### Option B: Client-side Replay
Execute replay logic entirely in the browser using JavaScript.

**Pros:** Simpler server architecture, WebSocket messages not needed
**Cons:** Cannot control browser from client, security risks exposing CDP access

**Rejected:** Security concern - browser cannot directly execute CDP commands without server.

### Option C: External Replay Service
Create a separate microservice for replay.

**Pros:** Clean separation of concerns
**Cons:** Over-engineering for this feature, added infrastructure complexity

**Rejected:** YAGNI - current architecture can handle replay within existing services.

## Acceptance Criteria

### Functional Requirements
- [ ] User can initiate replay from the first step
- [ ] User can initiate replay from any selected step
- [ ] User can pause and resume replay at any time
- [ ] User can stop replay and return to editing
- [ ] Each step executes correctly and captures a new screenshot
- [ ] Playback speed is configurable (0.5x, 1x, 2x)
- [ ] Element not found errors are handled gracefully
- [ ] Redacted type steps replay with their actual values (rawValue)
- [ ] User can continue recording from the current replay position

### Non-Functional Requirements
- [ ] Replay does not interfere with user input when paused
- [ ] Original screenshots are preserved during initial replay
- [ ] Replay state is synchronized between server and client via WebSocket
- [ ] Step indices remain consistent after edits during replay
- [ ] Replay fails gracefully if browser session becomes unhealthy
- [ ] Replay can be cancelled at any time

### Edge Case Requirements
- [ ] Replay handles pages that 404 or have network errors
- [ ] Replay handles form fields with different values than recorded
- [ ] Replay handles dynamic content that loads after initial page load

## Dependencies & Risks

### Dependencies
- CDPBridge methods for all step types (hover, selectOption)
- WebSocket message handling for replay control
- Screenshot capture after each step

### Risks
- **Medium:** Replay may fail if page structure changed since recording
- **Low:** Performance impact on large guides with many steps

### Mitigation
- Show clear error when replay fails
- Allow user to skip failed steps and continue
- Add step execution timeout to prevent hangs

## Success Metrics

- Replay completes successfully for 90% of recorded guides
- Error recovery triggers in under 2 seconds
- UI responds to pause/resume within 100ms
- Memory usage stable during long replay sessions

## References

### Internal Code References
- Step types: `packages/shared/src/step.ts`
- WebSocket types: `packages/shared/src/ws.ts`
- CDPBridge: `packages/server/src/services/CDPBridge.ts`
- Recorder: `packages/server/src/services/Recorder.ts`
- Session store: `packages/client/src/stores/sessionStore.ts`

### External Documentation
- [Playwright Locators](https://playwright.dev/docs/locators)
- [Playwright Input](https://playwright.dev/docs/input)
- [Cypress Test Replay](https://docs.cypress.io/cloud/features/test-replay)
- [Selenium IDE Playback Controls](https://www.geeksforgeeks.org/software-testing/how-to-control-the-speed-and-pause-test-execution-in-selenium-ide/)

### Related Work
- Test scenario: `test-scenarios/step-recording-tests.md` (lines 140-173)
