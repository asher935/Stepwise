import type { Step, ClickStep, TypeStep, NavigateStep, ScrollStep, SelectStep, HoverStep } from '@stepwise/shared';
import type { ReplayState, ReplayStatus } from '@stepwise/shared';
import type { ServerSession } from '../types/session.js';
import type { CDPBridge } from './CDPBridge.js';
import type { SessionManager } from './SessionManager.js';
import { nanoid } from 'nanoid';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../lib/env.js';

interface ReplayServiceOptions {
  speed: number;
  stopOnError: boolean;
}

type StatusCallback = (status: ReplayStatus) => void;
type StepStartCallback = (stepIndex: number, stepId: string) => void;
type StepCompleteCallback = (stepIndex: number, stepId: string) => void;
type ErrorCallback = (stepId: string | undefined, error: string) => void;

export class ReplayService {
  private currentStepIndex = 0;
  private state: ReplayState = 'idle';
  private paused = false;
  private cancelled = false;
  private replaySteps: Step[] = [];
  private screenshotPaths: Map<string, string> = new Map();

  constructor(
    private cdp: CDPBridge,
    private session: ServerSession,
    private options: ReplayServiceOptions,
    private sessionManager: SessionManager,
    private onStatus: StatusCallback,
    private onStepStart: StepStartCallback,
    private onStepComplete: StepCompleteCallback,
    private onError: ErrorCallback
  ) {}

  async play(startIndex: number = 0): Promise<void> {
    this.currentStepIndex = startIndex;
    this.paused = false;
    this.cancelled = false;
    this.state = 'playing';
    this.replaySteps = [...this.session.steps];

    // Set mode to replay - don't record during replay
    this.sessionManager.setMode(this.session.id, 'replay');

    await this.notifyStatus();

    try {
      while (this.currentStepIndex < this.replaySteps.length && !this.cancelled) {
        if (this.paused) {
          await this.waitWhilePaused();
          if (this.cancelled) break;
          continue;
        }

        const step = this.replaySteps[this.currentStepIndex];
        if (!step) break;

        let hadError = false;
        try {
          await this.executeStep(step);
        } catch {
          hadError = true;
        }

        // Check if we had an error and should stop
        if (hadError && this.options.stopOnError) {
          break;
        }

        // Clear error state and continue if not stopping on error
        if (hadError && !this.options.stopOnError) {
          this.state = 'playing';
        }

        this.currentStepIndex++;
        await this.notifyStepProgress();

        // Delay between steps (adjusted by speed)
        const delay = this.calculateStepDelay();
        await this.waitWithCancellation(delay);
      }
    } finally {
      // Always restore record mode when replay ends
      this.sessionManager.setMode(this.session.id, 'record');
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
      throw error; // Re-throw so caller knows there was an error
    }
  }

  private async executeClick(step: ClickStep): Promise<void> {
    const { target, button } = step;
    const { x, y, width, height } = target.boundingBox;
    await this.cdp.click(x + width / 2, y + height / 2, button);
  }

  private async executeType(step: TypeStep): Promise<void> {
    // Use rawValue if available (redaction is only for screenshots/export)
    const value = step.rawValue ?? '';
    if (!value) {
      throw new Error('Type step has no value to type');
    }

    const { x, y, width, height } = step.target.boundingBox;
    await this.cdp.click(x + width / 2, y + height / 2);
    await this.cdp.type(value);
  }

  private async executeNavigate(step: NavigateStep): Promise<void> {
    // Navigate to the URL
    await this.cdp.navigate(step.toUrl);

    // Wait for page to settle
    await this.waitForPageSettle();
  }

  private async executeScroll(step: ScrollStep): Promise<void> {
    // ScrollStep doesn't have a target - use viewport center
    const viewportWidth = env.BROWSER_VIEWPORT_WIDTH;
    const viewportHeight = env.BROWSER_VIEWPORT_HEIGHT;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    const deltaX = step.direction === 'left' ? -step.distance :
                   step.direction === 'right' ? step.distance : 0;
    const deltaY = step.direction === 'up' ? -step.distance :
                   step.direction === 'down' ? step.distance : 0;

    await this.cdp.scroll(centerX, centerY, deltaX, deltaY);
  }

  private async executeSelect(step: SelectStep): Promise<void> {
    const { x, y, width, height } = step.target.boundingBox;
    await this.cdp.selectOption(x + width / 2, y + height / 2, step.selectedValue);
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
    // Restore record mode immediately when stopped
    this.sessionManager.setMode(this.session.id, 'record');
    this.notifyStatus();
  }

  skipToStep(index: number): void {
    this.currentStepIndex = Math.max(0, Math.min(index, this.replaySteps.length - 1));
  }

  private async waitWhilePaused(): Promise<void> {
    return new Promise<void>(resolve => {
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
      await new Promise<void>(r => setTimeout(r, 50));
    }
  }

  private calculateStepDelay(): number {
    const baseDelay = 300; // Base delay between steps in ms
    return baseDelay / this.options.speed;
  }

  private async waitForPageSettle(): Promise<void> {
    await new Promise<void>(r => setTimeout(r, 1000));
  }

  private async captureStepScreenshot(step: Step): Promise<void> {
    const screenshotData = await this.cdp.takeScreenshot();

    // Save screenshot
    const extension = env.SCREENSHOT_FORMAT === 'png' ? 'png' : 'jpg';
    const filename = `${nanoid()}.${extension}`;
    const sessionDir = join(env.TEMP_DIR, 'sessions', this.session.id, 'screenshots');
    const filepath = join(sessionDir, filename);

    // Convert Buffer to Uint8Array for writeFile
    await writeFile(filepath, new Uint8Array(screenshotData));

    // Store the path - we don't modify the original step
    this.screenshotPaths.set(step.id, filepath);
  }

  private async handleStepError(step: Step, error: unknown): Promise<void> {
    this.state = 'error';
    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.emitError(step.id, errorMessage);
  }

  private notifyStatus(): void {
    const status: ReplayStatus = {
      state: this.state,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.replaySteps.length,
    };
    this.onStatus(status);
  }

  private async notifyStepProgress(): Promise<void> {
    this.notifyStatus();
  }

  private async emitStepStart(stepId: string, stepIndex: number): Promise<void> {
    this.onStepStart(stepIndex, stepId);
  }

  private async emitStepComplete(stepId: string): Promise<void> {
    this.onStepComplete(this.currentStepIndex, stepId);
  }

  private async emitError(stepId: string, error: string): Promise<void> {
    this.onError(stepId, error);
  }

  getScreenshotPath(stepId: string): string | undefined {
    return this.screenshotPaths.get(stepId);
  }

  getAllScreenshotPaths(): Map<string, string> {
    return new Map(this.screenshotPaths);
  }
}
