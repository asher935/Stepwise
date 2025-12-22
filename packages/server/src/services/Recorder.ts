import { nanoid } from 'nanoid';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Step, ClickStep, TypeStep, NavigateStep, ScrollStep, StepHighlight } from '@stepwise/shared';
import type { ServerSession } from '../types/session.js';
import { CDPBridge } from './CDPBridge.js';
import { createHighlight, inferFieldName, truncateText } from '../lib/selectors.js';
import { env } from '../lib/env.js';

type StepEventType = 'step:created' | 'step:updated' | 'step:deleted';
type StepEventHandler = (step: Step) => void;

interface RecorderOptions {
  session: ServerSession;
  cdpBridge: CDPBridge;
}

/**
 * Recorder captures user actions and creates Step objects
 */
export class Recorder {
  private session: ServerSession;
  private cdpBridge: CDPBridge;
  private eventHandlers: Map<StepEventType, Set<StepEventHandler>> = new Map();
  private pendingTypeStep: TypeStep | null = null;
  private typeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScrollData: {
    totalDeltaX: number;
    totalDeltaY: number;
    lastScrollTime: number;
  } | null = null;
  private pendingClickScreenshot: {
    x: number;
    y: number;
    button: 'left' | 'right' | 'middle';
    screenshotData: Buffer;
    screenshotPath: string;
    screenshotDataUrl: string;
    elementInfo: any;
    clip: any;
  } | null = null;

  constructor(options: RecorderOptions) {
    this.session = options.session;
    this.cdpBridge = options.cdpBridge;
  }

  /**
   * Registers an event handler
   */
  on(event: StepEventType, handler: StepEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler
   */
  off(event: StepEventType, handler: StepEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emits an event
   */
  private emit(event: StepEventType, step: Step): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers === undefined) return;
    
    for (const handler of Array.from(handlers)) {
      try {
        handler(step);
      } catch (error) {
        console.error(`[Recorder] Event handler error:`, error);
      }
    }
  }

  /**
   * Checks if step limit is reached
   */
  private isStepLimitReached(): boolean {
    return this.session.steps.length >= env.MAX_STEPS_PER_SESSION;
  }

  /**
   * Saves a screenshot to disk
   */
  private async saveScreenshot(screenshotData: Buffer): Promise<string> {
    const filename = `${nanoid()}.jpg`;
    const sessionDir = join(env.TEMP_DIR, 'sessions', this.session.id, 'screenshots');
    const filepath = join(sessionDir, filename);
    
    await writeFile(filepath, screenshotData as any);
    
    return filepath;
  }

  /**
   * Captures current screenshot with optional delay for page settling
   */
  private async captureScreenshot(
    delay: number = 100,
    clip?: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    // Wait for page to settle
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    return await this.cdpBridge.takeScreenshot(clip);
  }

  /**
   * Creates a base step
   */
  private createBaseStep(screenshotPath: string, screenshotDataUrl: string): Omit<Step, 'action'> {
    const index = this.session.steps.length;
    return {
      id: nanoid(),
      index,
      timestamp: Date.now(),
      screenshotPath,
      screenshotDataUrl,
      caption: '',
      isEdited: false,
    };
  }

  private toScreenshotDataUrl(buffer: Buffer): string {
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }

  private async getViewportSize(): Promise<{ width: number; height: number } | null> {
    const page = this.session.page;
    if (!page) return null;
    const viewport = page.viewportSize();
    if (viewport) return viewport;
    try {
      return await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    } catch {
      return null;
    }
  }

  private async getClipForTarget(
    boundingBox: { x: number; y: number; width: number; height: number } | null,
    point?: { x: number; y: number }
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const viewport = await this.getViewportSize();
    if (!viewport) return null;

    // Minimum and maximum screenshot dimensions
    const minWidth = 400;
    const minHeight = 300;
    const maxWidth = viewport.width;
    const maxHeight = viewport.height;

    // Use element bounding box if available, otherwise fall back to cursor area
    const baseBox = boundingBox && boundingBox.width > 0 && boundingBox.height > 0
      ? boundingBox
      : point
        ? { x: point.x - 100, y: point.y - 100, width: 200, height: 200 }
        : null;

    if (!baseBox) return null;

    // Calculate center point of the element/click
    const centerX = baseBox.x + baseBox.width / 2;
    const centerY = baseBox.y + baseBox.height / 2;

    // Start with element bounds and add padding for context
    const padding = 40;
    let x = baseBox.x - padding;
    let y = baseBox.y - padding;
    let width = baseBox.width + padding * 2;
    let height = baseBox.height + padding * 2;

    // Ensure minimum dimensions by expanding from center
    if (width < minWidth) {
      const diff = minWidth - width;
      x -= diff / 2;
      width = minWidth;
    }
    if (height < minHeight) {
      const diff = minHeight - height;
      y -= diff / 2;
      height = minHeight;
    }

    // Ensure maximum dimensions
    width = Math.min(width, maxWidth);
    height = Math.min(height, maxHeight);

    // Clip to viewport boundaries
    x = Math.max(0, Math.min(x, viewport.width - width));
    y = Math.max(0, Math.min(y, viewport.height - height));

    if (width <= 1 || height <= 1) return null;

    return { x, y, width, height };
  }

  /**
   * Prepares screenshot data before a click action
   * This should be called before sending mouse down event to browser
   */
  async prepareClickScreenshot(
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    if (this.isStepLimitReached()) return;

    // Flush any pending type step (scroll will be flushed in recordClick)
    await this.flushPendingTypeStep();

    // Get element info at click point
    const elementInfo = await this.cdpBridge.getElementAtPoint(x, y);

    const clip = await this.getClipForTarget(
      elementInfo?.boundingBox ?? null,
      { x, y }
    );

    // Capture screenshot immediately (before any mouse events are sent)
    const screenshotData = await this.captureScreenshot(0, clip ?? undefined);
    const screenshotPath = await this.saveScreenshot(screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

    // Store for later use in recordClick
    this.pendingClickScreenshot = {
      x,
      y,
      button,
      screenshotData,
      screenshotPath,
      screenshotDataUrl,
      elementInfo,
      clip
    };
  }

  /**
   * Records a click action using previously captured screenshot
   */
  async recordClick(
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<Step | null> {
    if (this.isStepLimitReached()) return null;

    // Flush any pending scroll step first (in case prepareClickScreenshot wasn't called)
    await this.flushPendingScrollStep();

    let screenshotData: Buffer;
    let screenshotPath: string;
    let screenshotDataUrl: string;
    let elementInfo: any;

    // Use pre-captured screenshot if available and coordinates match
    if (this.pendingClickScreenshot &&
        this.pendingClickScreenshot.x === x &&
        this.pendingClickScreenshot.y === y &&
        this.pendingClickScreenshot.button === button) {

      const pending = this.pendingClickScreenshot;
      screenshotData = pending.screenshotData;
      screenshotPath = pending.screenshotPath;
      screenshotDataUrl = pending.screenshotDataUrl;
      elementInfo = pending.elementInfo;

      // Clear the pending screenshot
      this.pendingClickScreenshot = null;
    } else {
      // Fallback: capture screenshot now (this shouldn't normally happen)
      await this.flushPendingTypeStep();

      elementInfo = await this.cdpBridge.getElementAtPoint(x, y);

      const clip = await this.getClipForTarget(
        elementInfo?.boundingBox ?? null,
        { x, y }
      );
      screenshotData = await this.captureScreenshot(0, clip ?? undefined);
      screenshotPath = await this.saveScreenshot(screenshotData);
      screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);
    }

    // Create highlight
    const target: StepHighlight = elementInfo
      ? createHighlight(elementInfo)
      : {
          selector: null,
          boundingBox: { x, y, width: 10, height: 10 },
          elementTag: 'unknown',
          elementText: null,
        };

    // Generate caption
    const caption = this.generateClickCaption(target, button);

    const step: ClickStep = {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl),
      action: 'click',
      target,
      button,
      caption,
    };

    this.session.steps.push(step);
    this.emit('step:created', step);

    return step;
  }

  /**
   * Records keyboard input (debounced into type steps)
   */
  async recordKeyInput(key: string, _text?: string): Promise<void> {
    if (this.isStepLimitReached()) return;

    // Clear existing debounce timer
    if (this.typeDebounceTimer) {
      clearTimeout(this.typeDebounceTimer);
    }

    // If no pending type step, create one
    if (!this.pendingTypeStep) {
      // Flush any pending scroll step before starting typing
      await this.flushPendingScrollStep();
      // Get focused element
      const focusedElement = await this.getFocusedElementInfo();
      
      const target: StepHighlight = focusedElement
        ? createHighlight(focusedElement)
        : {
            selector: null,
            boundingBox: { x: 0, y: 0, width: 0, height: 0 },
            elementTag: 'input',
            elementText: null,
          };

      const fieldName = focusedElement
        ? inferFieldName(focusedElement)
        : 'field';

      const clip = await this.getClipForTarget(
        focusedElement?.boundingBox ?? null
      );
      const screenshotData = await this.captureScreenshot(0, clip ?? undefined);
      const screenshotPath = await this.saveScreenshot(screenshotData);
      const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

      this.pendingTypeStep = {
        ...this.createBaseStep(screenshotPath, screenshotDataUrl),
        action: 'type',
        target,
        fieldName,
        redacted: true,
        displayText: `Typed in ${fieldName}`,
        caption: `Type in "${fieldName}"`,
      };
    }

    // Set debounce timer to flush after 1 second of inactivity
    this.typeDebounceTimer = setTimeout(() => {
      this.flushPendingTypeStep();
    }, 1000);
  }

  /**
   * Flushes pending type step
   */
  private async flushPendingTypeStep(): Promise<void> {
    if (this.typeDebounceTimer) {
      clearTimeout(this.typeDebounceTimer);
      this.typeDebounceTimer = null;
    }

    if (this.pendingTypeStep) {
      const step = this.pendingTypeStep;
      this.pendingTypeStep = null;
      
      this.session.steps.push(step);
      this.emit('step:created', step);
    }
  }

  /**
   * Records navigation
   */
  async recordNavigation(fromUrl: string, toUrl: string): Promise<Step | null> {
    if (this.isStepLimitReached()) return null;

    // Flush any pending type or scroll steps
    await this.flushPendingTypeStep();
    await this.flushPendingScrollStep();

    // Capture screenshot after navigation settles
    const screenshotData = await this.captureScreenshot(500);
    const screenshotPath = await this.saveScreenshot(screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

    const step: NavigateStep = {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl),
      action: 'navigate',
      fromUrl,
      toUrl,
      caption: `Navigate to ${this.formatUrl(toUrl)}`,
    };

    this.session.steps.push(step);
    this.emit('step:created', step);
    
    return step;
  }

  /**
   * Records scroll action (tracked until next action)
   */
  async recordScroll(deltaX: number, deltaY: number): Promise<void> {
    if (this.isStepLimitReached()) return;

    const now = Date.now();

    // Initialize or update pending scroll data
    if (!this.pendingScrollData) {
      this.pendingScrollData = {
        totalDeltaX: 0,
        totalDeltaY: 0,
        lastScrollTime: now,
      };
    }

    // Accumulate scroll deltas
    this.pendingScrollData.totalDeltaX += deltaX;
    this.pendingScrollData.totalDeltaY += deltaY;
    this.pendingScrollData.lastScrollTime = now;
  }

  /**
   * Flushes pending scroll step (creates one scroll step if scrolling occurred)
   */
  private async flushPendingScrollStep(): Promise<void> {
    if (!this.pendingScrollData) return;

    // Only create a step if there was meaningful scroll distance
    const { totalDeltaX, totalDeltaY } = this.pendingScrollData;
    const distance = Math.max(Math.abs(totalDeltaX), Math.abs(totalDeltaY));

    // Minimum scroll distance to record (10 pixels)
    if (distance < 10) {
      this.pendingScrollData = null;
      return;
    }

    const direction = Math.abs(totalDeltaY) > Math.abs(totalDeltaX)
      ? (totalDeltaY > 0 ? 'down' : 'up')
      : (totalDeltaX > 0 ? 'right' : 'left');

    const screenshotData = await this.captureScreenshot(100);
    const screenshotPath = await this.saveScreenshot(screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

    const step: ScrollStep = {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl),
      action: 'scroll',
      direction,
      distance,
      caption: `Scroll ${direction}`,
    };

    this.pendingScrollData = null;
    this.session.steps.push(step);
    this.emit('step:created', step);
  }

  /**
   * Updates a step
   */
  updateStep(stepId: string, updates: { caption?: string }): Step | null {
    const step = this.session.steps.find(s => s.id === stepId);
    if (!step) return null;

    if (updates.caption !== undefined) {
      step.caption = updates.caption;
      step.isEdited = true;
    }

    this.emit('step:updated', step);
    return step;
  }

  /**
   * Deletes a step
   */
  deleteStep(stepId: string): boolean {
    const index = this.session.steps.findIndex(s => s.id === stepId);
    if (index === -1) return false;

    const [deleted] = this.session.steps.splice(index, 1);
    
    // Re-index remaining steps
    for (let i = index; i < this.session.steps.length; i++) {
      const step = this.session.steps[i];
      if (step) {
        step.index = i;
      }
    }

    if (deleted) {
      this.emit('step:deleted', deleted);
    }
    
    return true;
  }

  /**
   * Gets all steps
   */
  getSteps(): Step[] {
    return [...this.session.steps];
  }

  /**
   * Gets focused element info
   */
  private async getFocusedElementInfo(): Promise<{
    tagName: string;
    id?: string;
    className?: string;
    testId?: string;
    ariaLabel?: string;
    name?: string;
    placeholder?: string;
    labelText?: string;
    boundingBox: { x: number; y: number; width: number; height: number };
  } | null> {
    try {
      const page = this.session.page;
      if (!page) return null;

      return await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;

        const getLabelText = (el: Element): string | undefined => {
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return ariaLabel.trim();

          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const combined = ariaLabelledBy
              .split(/\s+/)
              .map(id => document.getElementById(id)?.textContent ?? '')
              .join(' ')
              .trim();
            if (combined) return combined;
          }

          if ('labels' in el) {
            const labels = (el as HTMLInputElement).labels;
            const labelText = labels?.[0]?.textContent?.trim();
            if (labelText) return labelText;
          }

          const labelAncestor = el.closest('label');
          const labelAncestorText = labelAncestor?.textContent?.trim();
          if (labelAncestorText) return labelAncestorText;

          const placeholder = (el as HTMLInputElement).placeholder;
          if (placeholder) return placeholder.trim();

          const title = el.getAttribute('title');
          if (title) return title.trim();

          const value = (el as HTMLInputElement).value;
          const type = (el as HTMLInputElement).type;
          if (value && ['submit', 'button', 'reset'].includes(type)) return value.trim();

          const alt = el.getAttribute('alt');
          if (alt) return alt.trim();

          const textContent = el.textContent?.trim();
          if (textContent) return textContent;

          return undefined;
        };

        const rect = element.getBoundingClientRect();
        const labelText = getLabelText(element);
        
        return {
          tagName: element.tagName,
          id: element.id || undefined,
          className: element.className || undefined,
          testId: element.getAttribute('data-testid') ?? undefined,
          ariaLabel: element.getAttribute('aria-label') ?? undefined,
          name: (element as HTMLInputElement).name || undefined,
          placeholder: (element as HTMLInputElement).placeholder || undefined,
          labelText,
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Generates caption for click step
   */
  private generateClickCaption(target: StepHighlight, button: string): string {
    const action = button === 'right' ? 'Right-click' : 'Click';
    
    if (target.elementText) {
      const label = truncateText(target.elementText, 30);
      if (target.elementTag === 'button') {
        return `${action} "${label}" button`;
      }
      if (target.elementTag === 'a') {
        return `${action} "${label}" link`;
      }
      if (target.elementTag === 'input' || target.elementTag === 'textarea' || target.elementTag === 'select') {
        return `${action} "${label}" field`;
      }
      return `${action} "${label}"`;
    }
    
    if (target.elementTag === 'button') {
      return `${action} button`;
    }
    
    if (target.elementTag === 'a') {
      return `${action} link`;
    }
    
    if (target.elementTag === 'input') {
      return `${action} input field`;
    }
    
    return `${action} on page`;
  }

  /**
   * Formats URL for display
   */
  private formatUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
    } catch {
      return url.slice(0, 50);
    }
  }

  /**
   * Cleans up resources
   */
  async cleanup(): Promise<void> {
    if (this.typeDebounceTimer) {
      clearTimeout(this.typeDebounceTimer);
    }
    this.pendingClickScreenshot = null;
    this.pendingScrollData = null;
    await this.flushPendingTypeStep();
  }
}
