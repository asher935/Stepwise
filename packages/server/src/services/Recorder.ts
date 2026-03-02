import { nanoid } from 'nanoid';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Step, ClickStep, TypeStep, NavigateStep, ScrollStep, PasteStep, StepHighlight, StepLegendItem } from '@stepwise/shared';
import type { ServerSession } from '../types/session.js';
import { CDPBridge } from './CDPBridge.js';
import { redactionService } from './RedactionService.js';
import { createHighlight, inferFieldName, truncateText } from '../lib/selectors.js';
import { env } from '../lib/env.js';

type StepEventType = 'step:created' | 'step:updated' | 'step:deleted';
type StepEventHandler = (step: Step) => void;

type ElementInfo = {
  tagName: string;
  id?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  role?: string;
  text?: string;
  labelText?: string;
  name?: string;
  placeholder?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
};

type Rect = { x: number; y: number; width: number; height: number };
type InteractiveKind = 'field' | 'button';
type SemanticKey = 'username' | 'password';

type DetectedInteractiveElement = {
  kind: InteractiveKind;
  label: string;
  semanticKey?: SemanticKey;
  boundingBox: Rect;
};

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
  private pendingTypeStep: (TypeStep & { accumulatedText: string }) | null = null;
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
    elementInfo: ElementInfo | null;
    redactionRects: Rect[];
    clip?: { x: number; y: number; width: number; height: number } | null;
  } | null = null;
  private typeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isFinalizing: boolean = false;
  private readonly TYPING_DEBOUNCE_MS = env.TYPING_DEBOUNCE_MS;
  private readonly UPDATE_WINDOW_MS = 5000; // 5 seconds to allow updates to last type step
  private lastTypeStep: { step: TypeStep; timestamp: number; fieldName: string } | null = null;

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
    const extension = env.SCREENSHOT_FORMAT === 'png' ? 'png' : 'jpg';
    const filename = `${nanoid()}.${extension}`;
    const sessionDir = join(env.TEMP_DIR, 'sessions', this.session.id, 'screenshots');
    const filepath = join(sessionDir, filename);

    await writeFile(filepath, new Uint8Array(screenshotData));

    return filepath;
  }

  /**
   * Captures current screenshot with optional delay for page settling
   */
  private async captureScreenshot(
    delay: number = 100,
    clip?: { x: number; y: number; width: number; height: number },
    highlightBoundingBox?: { x: number; y: number; width: number; height: number }
  ): Promise<{ screenshotData: Buffer; redactionRects: Rect[] }> {
    // Wait for page to settle
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const redactionRects = await this.detectInputRedactionRects(clip);

    // Use highlighted screenshot if bounding box is provided
    if (highlightBoundingBox) {
      const screenshotData = await this.cdpBridge.takeScreenshotWithHighlight(highlightBoundingBox, clip);
      return { screenshotData, redactionRects };
    }

    const screenshotData = await this.cdpBridge.takeScreenshot(clip);
    return { screenshotData, redactionRects };
  }

  /**
   * Creates a base step
   */
  private createBaseStep(
    screenshotPath: string,
    screenshotDataUrl: string,
    screenshotClip?: { x: number; y: number; width: number; height: number }
  ): Omit<Step, 'action'> {
    const index = this.session.steps.length;
    return {
      id: nanoid(),
      index,
      timestamp: Date.now(),
      screenshotPath,
      screenshotDataUrl,
      caption: '',
      isEdited: false,
      redactScreenshot: false,
      highlightColor: this.cdpBridge.getHighlightColor(),
      screenshotClip,
    };
  }

  private toScreenshotDataUrl(buffer: Buffer): string {
    const mimeType = env.SCREENSHOT_FORMAT === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  async createInsertStepFromCurrentView(): Promise<ClickStep | null> {
    const elements = await this.detectInteractiveElementsInView();
    const legendItems = this.buildLegendItems(elements);
    const capture = await this.captureScreenshot(0);
    const screenshotPath = await this.saveScreenshot(capture.screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(capture.screenshotData);
    const targetLegendItem = legendItems.find((item) => item.semanticKey === 'username')
      ?? legendItems.find((item) => item.semanticKey === 'password')
      ?? legendItems[0];

    const target: StepHighlight = targetLegendItem
      ? {
          selector: null,
          boundingBox: targetLegendItem.boundingBox,
          elementTag: targetLegendItem.kind === 'button' ? 'button' : 'input',
          elementText: targetLegendItem.label,
        }
      : {
          selector: null,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          elementTag: 'div',
          elementText: null,
        };

    return {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl),
      action: 'click',
      target,
      button: 'left',
      redactionRects: capture.redactionRects,
      legendItems,
      caption: this.buildLegendCaption(legendItems),
    };
  }

  private clipRectToScreenshotSpace(
    rect: Rect,
    clip?: Rect
  ): Rect | null {
    if (!clip) {
      return rect.width > 0 && rect.height > 0 ? rect : null;
    }

    const localX = rect.x - clip.x;
    const localY = rect.y - clip.y;
    const left = Math.max(0, localX);
    const top = Math.max(0, localY);
    const right = Math.min(clip.width, localX + rect.width);
    const bottom = Math.min(clip.height, localY + rect.height);

    if (left >= right || top >= bottom) {
      return null;
    }

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  private normalizeLegendLabel(label: string): string {
    const normalized = label.trim().replace(/\s+/g, ' ');
    if (!normalized) return 'Unlabeled';
    if (normalized.length <= 60) return normalized;
    return `${normalized.slice(0, 57)}...`;
  }

  private detectSemanticKey(label: string): SemanticKey | undefined {
    const normalized = label.toLowerCase();
    if (normalized.includes('username') || normalized.includes('user name') || normalized.includes('email')) {
      return 'username';
    }
    if (normalized.includes('password') || normalized.includes('passcode') || normalized.includes('pwd')) {
      return 'password';
    }
    return undefined;
  }

  private toLegendItem(
    element: DetectedInteractiveElement,
    bubbleNumber: number
  ): StepLegendItem {
    return {
      bubbleNumber,
      label: element.label,
      kind: element.kind,
      semanticKey: element.semanticKey,
      boundingBox: element.boundingBox,
    };
  }

  private buildLegendItems(elements: DetectedInteractiveElement[]): StepLegendItem[] {
    const username = elements.find((element) => element.semanticKey === 'username');
    const password = elements.find((element) => element.semanticKey === 'password');
    const prioritized: DetectedInteractiveElement[] = [];

    if (username) prioritized.push(username);
    if (password && password !== username) prioritized.push(password);

    for (const element of elements) {
      if (prioritized.includes(element)) {
        continue;
      }
      prioritized.push(element);
    }

    return prioritized.slice(0, 12).map((element, index) => this.toLegendItem(element, index + 1));
  }

  private buildLegendCaption(legendItems: StepLegendItem[]): string {
    if (legendItems.length === 0) {
      return 'Review the current view';
    }
    const lines = legendItems.map((item) => `(${item.bubbleNumber}) ${item.label.toLowerCase()}`);
    return ['On this page:', ...lines].join('\n');
  }

  private async detectInteractiveElementsInView(): Promise<DetectedInteractiveElement[]> {
    const page = this.session.page;
    if (!page) return [];

    try {
      const rawElements = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll(
          'input, textarea, select, button, a[href], [role="button"], [role="link"], [role="textbox"], [role="searchbox"], [role="combobox"]'
        ));
        const seen = new Set<string>();
        const result: Array<{
          kind: 'field' | 'button';
          label: string;
          boundingBox: { x: number; y: number; width: number; height: number };
        }> = [];

        const getLabelText = (el: Element): string => {
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

          const labelledBy = el.getAttribute('aria-labelledby');
          if (labelledBy) {
            const value = labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
              .filter(Boolean)
              .join(' ')
              .trim();
            if (value) return value;
          }

          if ('labels' in el) {
            const labels = (el as HTMLInputElement).labels;
            const firstLabel = labels?.[0]?.textContent?.trim();
            if (firstLabel) return firstLabel;
          }

          const ancestorLabel = el.closest('label')?.textContent?.trim();
          if (ancestorLabel) return ancestorLabel;

          const input = el as HTMLInputElement;
          if (typeof input.placeholder === 'string' && input.placeholder.trim()) return input.placeholder.trim();
          if (typeof input.name === 'string' && input.name.trim()) return input.name.trim();
          if (typeof input.id === 'string' && input.id.trim()) return input.id.trim();

          const title = el.getAttribute('title');
          if (title && title.trim()) return title.trim();

          const text = el.textContent?.trim();
          if (text) return text;

          return '';
        };

        const isFieldElement = (el: Element): boolean => {
          const tagName = el.tagName.toLowerCase();
          if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
          const role = (el.getAttribute('role') || '').toLowerCase();
          return role === 'textbox' || role === 'searchbox' || role === 'combobox';
        };

        const shouldSkipInput = (el: HTMLInputElement): boolean => {
          const type = (el.type || 'text').toLowerCase();
          return ['hidden', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(type);
        };

        for (const element of candidates) {
          if (element instanceof HTMLInputElement && shouldSkipInput(element)) {
            continue;
          }

          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) {
            continue;
          }

          const style = window.getComputedStyle(element as HTMLElement);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            continue;
          }

          if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
            continue;
          }

          const rounded = {
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };

          const label = getLabelText(element);
          const kind = isFieldElement(element) ? 'field' : 'button';
          const key = `${kind}:${label.toLowerCase()}:${rounded.x}:${rounded.y}:${rounded.width}:${rounded.height}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);

          result.push({
            kind,
            label: label || (kind === 'field' ? 'Field' : 'Button'),
            boundingBox: rounded,
          });
        }

        return result;
      });

      return rawElements
        .map((element) => {
          const normalizedLabel = this.normalizeLegendLabel(element.label);
          return {
            kind: element.kind,
            label: normalizedLabel,
            semanticKey: this.detectSemanticKey(normalizedLabel),
            boundingBox: element.boundingBox,
          };
        })
        .sort((a, b) => {
          if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
          return a.boundingBox.x - b.boundingBox.x;
        });
    } catch {
      return [];
    }
  }

  private async detectInputRedactionRects(clip?: Rect): Promise<Rect[]> {
    const page = this.session.page;
    if (!page) return [];

    try {
      const pageRects = await page.evaluate(() => {
        const candidates = new Set<Element>();
        for (const element of document.querySelectorAll('input, textarea, select, [contenteditable], [role="textbox"], [role="searchbox"], [role="combobox"]')) {
          candidates.add(element);
        }

        const shouldSkipInput = (el: HTMLInputElement): boolean => {
          const type = (el.type || 'text').toLowerCase();
          return ['hidden', 'checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image'].includes(type);
        };

        const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
        const seen = new Set<string>();

        for (const element of candidates) {
          if (element instanceof HTMLInputElement && shouldSkipInput(element)) {
            continue;
          }

          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) {
            continue;
          }

          const style = window.getComputedStyle(element as HTMLElement);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            continue;
          }

          if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
            continue;
          }

          const rounded = {
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };

          const key = `${rounded.x}:${rounded.y}:${rounded.width}:${rounded.height}`;
          if (!seen.has(key)) {
            seen.add(key);
            rects.push(rounded);
          }
        }

        return rects;
      });

      return pageRects
        .map((rect) => this.clipRectToScreenshotSpace(rect, clip))
        .filter((rect): rect is Rect => rect !== null);
    } catch {
      return [];
    }
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

    // Flush any pending type step first (before preparing click)
    await this.flushPendingTypeStep();

    // Get element info at click point
    const elementInfo = await this.cdpBridge.getElementAtPoint(x, y);

    const clip = await this.getClipForTarget(
      elementInfo?.boundingBox ?? null,
      { x, y }
    );

    // Capture screenshot with highlight if element has bounding box
    const { screenshotData, redactionRects } = await this.captureScreenshot(
      0,
      clip ?? undefined,
      elementInfo?.boundingBox && elementInfo.boundingBox.width > 0 && elementInfo.boundingBox.height > 0
        ? elementInfo.boundingBox
        : undefined
    );
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
      redactionRects,
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

    // Clear last type step on click (user is clicking a different element)
    this.clearLastTypeStep();

    let screenshotData: Buffer;
    let screenshotPath: string;
    let screenshotDataUrl: string;
    let elementInfo: ElementInfo | null;
    let redactionRects: Rect[] = [];
    let clip: { x: number; y: number; width: number; height: number } | null = null;

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
      redactionRects = pending.redactionRects;
      clip = pending.clip ?? null;

      // Clear the pending screenshot
      this.pendingClickScreenshot = null;
    } else {
      // Fallback: capture screenshot now (this shouldn't normally happen)
      await this.flushPendingTypeStep();

      elementInfo = await this.cdpBridge.getElementAtPoint(x, y);

      clip = await this.getClipForTarget(
        elementInfo?.boundingBox ?? null,
        { x, y }
      );

      // Capture screenshot with highlight if element has bounding box
      const capture = await this.captureScreenshot(
        0,
        clip ?? undefined,
        elementInfo?.boundingBox && elementInfo.boundingBox.width > 0 && elementInfo.boundingBox.height > 0
          ? elementInfo.boundingBox
          : undefined
      );
      screenshotData = capture.screenshotData;
      redactionRects = capture.redactionRects;
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
      ...this.createBaseStep(screenshotPath, screenshotDataUrl, clip ?? undefined),
      action: 'click',
      target,
      button,
      redactionRects,
      caption,
    };

    this.session.steps.push(step);
    this.emit('step:created', step);

    return step;
  }

  /**
   * Records keyboard input (accumulated with debounce timer)
   */
  async recordKeyInput(key: string, text?: string): Promise<void> {
    if (this.isStepLimitReached()) return;

    // If finalizing, skip this keystroke to avoid race conditions
    if (this.isFinalizing) {
      return;
    }

    // Flush any pending scroll step before starting typing
    await this.flushPendingScrollStep();

    // Get focused element info first
    const focusedElement = await this.getFocusedElementInfo();
    if (!focusedElement) return;

    const fieldName = focusedElement
      ? inferFieldName(focusedElement)
      : 'field';

    // Check if we should update the last type step instead of creating a new one
    const now = Date.now();

    if (this.lastTypeStep &&
        this.lastTypeStep.fieldName === fieldName &&
        (now - this.lastTypeStep.timestamp) < this.UPDATE_WINDOW_MS) {
      // Update existing step instead of creating new one
      this.lastTypeStep.step.rawValue = (this.lastTypeStep.step.rawValue || '') + (text || '');

      // Clear debounce timer if running
      if (this.typeDebounceTimer) {
        clearTimeout(this.typeDebounceTimer);
      }

      // Start new debounce timer to update screenshot
      this.typeDebounceTimer = setTimeout(() => {
        void this.updateLastTypeStepScreenshot().catch((error: unknown) => {
          console.error('[Recorder] Failed to update type step screenshot:', error);
        });
      }, this.TYPING_DEBOUNCE_MS);

      // Emit step:updated event
      this.emit('step:updated', this.lastTypeStep.step);
      return;
    }

    // If no pending type step, create one WITHOUT screenshot
    if (!this.pendingTypeStep) {
      const target: StepHighlight = focusedElement
        ? createHighlight(focusedElement)
        : {
            selector: null,
            boundingBox: { x: 0, y: 0, width: 0, height: 0 },
            elementTag: 'input',
            elementText: null,
          };

      const clip = await this.getClipForTarget(
        focusedElement?.boundingBox ?? null
      );

      // Create base step WITHOUT screenshot for now
      // Screenshot will be captured later in finalizePendingTypeStep()
      this.pendingTypeStep = {
        ...this.createBaseStep('', '', clip ?? undefined),
        action: 'type',
        target,
        fieldName,
        redactScreenshot: false,
        displayText: `Typed in ${fieldName}`,
        caption: `Type in "${fieldName}"`,
        accumulatedText: '',
      };
    }

    // Accumulate the typed text
    if (text && this.pendingTypeStep) {
      this.pendingTypeStep.accumulatedText += text;
    }

    // Reset debounce timer on each keystroke
    if (this.typeDebounceTimer) {
      clearTimeout(this.typeDebounceTimer);
    }

    this.typeDebounceTimer = setTimeout(() => {
      void this.finalizePendingTypeStep().catch((error: unknown) => {
        console.error('[Recorder] Failed to finalize type step:', error);
      });
    }, this.TYPING_DEBOUNCE_MS);
  }

  /**
   * Finalizes pending type step when debounce timer expires
   * Captures screenshot and emits the step
   */
  private async finalizePendingTypeStep(): Promise<void> {
    if (!this.pendingTypeStep) return;

    // Set finalizing flag to prevent race conditions
    this.isFinalizing = true;

    try {
      const step = this.pendingTypeStep;

      // Clear debounce timer
      if (this.typeDebounceTimer) {
        clearTimeout(this.typeDebounceTimer);
        this.typeDebounceTimer = null;
      }

      // Capture screenshot now that typing has paused
      const capture = await this.captureScreenshot(
        0,
        step.screenshotClip ?? undefined,
        step.target.boundingBox && step.target.boundingBox.width > 0 && step.target.boundingBox.height > 0
          ? step.target.boundingBox
          : undefined
      );
      const screenshotData = capture.screenshotData;
      const screenshotPath = await this.saveScreenshot(screenshotData);

      // Redact if needed
      let finalScreenshotData = screenshotData;
      if (step.redactScreenshot && capture.redactionRects.length > 0) {
        finalScreenshotData = await redactionService.redact(screenshotData, capture.redactionRects);
      }

      const screenshotDataUrl = this.toScreenshotDataUrl(finalScreenshotData);

      // Update step with screenshot
      step.screenshotPath = screenshotPath;
      step.screenshotDataUrl = screenshotDataUrl;
      step.redactionRects = capture.redactionRects;

      // Move accumulated text to rawValue
      const { accumulatedText, ...stepWithoutAccumulated } = step;

      // Only include rawValue if there was actual text typed
      const finalStep: TypeStep = accumulatedText
        ? { ...stepWithoutAccumulated, rawValue: accumulatedText }
        : stepWithoutAccumulated;

      this.pendingTypeStep = null;

      // Store as last type step for potential updates
      this.lastTypeStep = {
        step: finalStep,
        timestamp: Date.now(),
        fieldName: step.fieldName,
      };

      this.session.steps.push(finalStep);
      this.emit('step:created', finalStep);
    } finally {
      // Clear finalizing flag
      this.isFinalizing = false;
    }
  }

  /**
   * Flushes pending type step (called when another action occurs)
   */
  private async flushPendingTypeStep(): Promise<void> {
    if (!this.pendingTypeStep) return;

    // Clear debounce timer if running
    if (this.typeDebounceTimer) {
      clearTimeout(this.typeDebounceTimer);
      this.typeDebounceTimer = null;
    }

    // Use the same finalization logic
    await this.finalizePendingTypeStep();
  }

  /**
   * Updates the screenshot of the last type step
   * Called when user continues typing after debounce expires
   */
  private async updateLastTypeStepScreenshot(): Promise<void> {
    if (!this.lastTypeStep) return;

    this.isFinalizing = true;
    const step = this.lastTypeStep.step;

    try {
      // Get fresh element info
      const focusedElement = await this.getFocusedElementInfo();
      if (!focusedElement) {
        this.isFinalizing = false;
        return;
      }

      // Get clip region
      const clip = await this.getClipForTarget(focusedElement?.boundingBox ?? null);

      // Capture new screenshot
      const capture = await this.captureScreenshot(
        50,
        clip ?? undefined,
        focusedElement?.boundingBox && focusedElement.boundingBox.width > 0 && focusedElement.boundingBox.height > 0
          ? focusedElement.boundingBox
          : undefined
      );
      const screenshotData = capture.screenshotData;

      const screenshotPath = await this.saveScreenshot(screenshotData);

      // Redact if needed
      let finalScreenshotData = screenshotData;
      if (step.redactScreenshot && capture.redactionRects.length > 0) {
        finalScreenshotData = await redactionService.redact(screenshotData, capture.redactionRects);
      }

      // Update step with new screenshot
      step.screenshotPath = screenshotPath;
      step.screenshotDataUrl = this.toScreenshotDataUrl(finalScreenshotData);
      step.redactionRects = capture.redactionRects;
      if (step.redactScreenshot) {
        step.originalScreenshotDataUrl = this.toScreenshotDataUrl(screenshotData);
      }

      // Update timestamp
      this.lastTypeStep.timestamp = Date.now();

      // Emit step:updated event
      this.emit('step:updated', step);
    } finally {
      this.isFinalizing = false;
    }
  }

  /**
   * Clears the last type step reference
   * Called when user navigates, clicks a different element, or performs other actions
   */
  private clearLastTypeStep(): void {
    this.lastTypeStep = null;
  }

  /**
   * Records navigation
   */
  async recordNavigation(fromUrl: string, toUrl: string): Promise<Step | null> {
    if (this.isStepLimitReached()) return null;

    // Flush any pending type or scroll steps
    await this.flushPendingTypeStep();
    await this.flushPendingScrollStep();

    // Clear last type step on navigation
    this.clearLastTypeStep();

    await this.cdpBridge.waitForPageLoad();
    const { screenshotData, redactionRects } = await this.captureScreenshot();
    const screenshotPath = await this.saveScreenshot(screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

    const step: NavigateStep = {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl),
      action: 'navigate',
      fromUrl,
      toUrl,
      redactionRects,
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

    // Flush any pending type step before starting scroll
    await this.flushPendingTypeStep();

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

    const { screenshotData, redactionRects } = await this.captureScreenshot(100);
    const screenshotPath = await this.saveScreenshot(screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

    const step: ScrollStep = {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl),
      action: 'scroll',
      direction,
      distance,
      redactionRects,
      caption: `Scroll ${direction}`,
    };

    this.pendingScrollData = null;
    this.session.steps.push(step);
    this.emit('step:created', step);
  }

  /**
   * Records a paste action (Cmd+V / Ctrl+V)
   */
  async recordPaste(text: string): Promise<void> {
    if (this.isStepLimitReached()) return;

    // Flush any pending type or scroll steps
    await this.flushPendingTypeStep();
    await this.flushPendingScrollStep();

    // Clear last type step on paste (paste creates its own step)
    this.clearLastTypeStep();

    // Get focused element
    const focusedElement = await this.getFocusedElementInfo();
    if (!focusedElement) return;

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

    // Capture screenshot with highlight
    const capture = await this.captureScreenshot(
      50, // Small buffer to ensure paste is complete
      clip ?? undefined,
      focusedElement?.boundingBox && focusedElement.boundingBox.width > 0 && focusedElement.boundingBox.height > 0
        ? focusedElement.boundingBox
        : undefined
    );
    const screenshotData = capture.screenshotData;
    const screenshotPath = await this.saveScreenshot(screenshotData);
    const screenshotDataUrl = this.toScreenshotDataUrl(screenshotData);

    // Check if should redact
    const redactScreenshot = this.shouldRedactPaste(text, fieldName);

    let finalScreenshotData = screenshotData;
    if (redactScreenshot && capture.redactionRects.length > 0) {
      finalScreenshotData = await redactionService.redact(screenshotData, capture.redactionRects);
    }

    // Create paste step
    const step: PasteStep = {
      ...this.createBaseStep(screenshotPath, screenshotDataUrl, clip ?? undefined),
      action: 'paste',
      target,
      fieldName,
      redactScreenshot,
      redactionRects: capture.redactionRects,
      displayText: `Paste in ${fieldName}`,
      caption: `Paste in "${fieldName}"`,
      rawValue: text,
      screenshotDataUrl: this.toScreenshotDataUrl(finalScreenshotData),
    };

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
   * Determines if paste content should be redacted based on heuristics
   */
  private shouldRedactPaste(text: string, fieldName: string): boolean {
    const sensitiveFields = ['password', 'secret', 'token', 'api', 'key', 'credit', 'ssn'];
    const isSensitiveField = sensitiveFields.some((keyword) =>
      fieldName.toLowerCase().includes(keyword)
    );
    if (isSensitiveField) return true;

    const sensitivePatterns = [
      /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/, // Credit card
      /^\d{3}-\d{2}-\d{4}$/, // SSN
      /^Bearer\s+/i, // Bearer token
      /^sk-/, // API key pattern
    ];
    return sensitivePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Cleans up resources
   */
  async cleanup(): Promise<void> {
    this.pendingClickScreenshot = null;
    this.pendingScrollData = null;
    this.lastTypeStep = null;

    // Clear debounce timer
    if (this.typeDebounceTimer) {
      clearTimeout(this.typeDebounceTimer);
      this.typeDebounceTimer = null;
    }

    await this.flushPendingTypeStep();
  }
}
