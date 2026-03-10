import type { Page, CDPSession, FileChooser, JSHandle, ElementHandle } from 'playwright-core';
import sharp from 'sharp';
import type { ServerSession } from '../types/session.js';
import { env } from '../lib/env.js';
import { sessionManager } from './SessionManager.js';

type FrameHandler = (data: string, timestamp: number) => void;
type NavigationHandler = (url: string, title: string) => void;
type ErrorHandler = (error: CDPError) => void;
type FileChooserHandler = (x: number, y: number) => void;

type ResolvedKeyInfo = {
  code?: string;
  keyCode?: number;
};

const keyCodeMap: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Pause: 19,
  CapsLock: 20,
  Escape: 27,
  Esc: 27,
  Space: 32,
  ' ': 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
  Del: 46,
  Meta: 91,
  ContextMenu: 93,
};

const codeMap: Record<string, string> = {
  Backspace: 'Backspace',
  Tab: 'Tab',
  Enter: 'Enter',
  Shift: 'ShiftLeft',
  Control: 'ControlLeft',
  Alt: 'AltLeft',
  Pause: 'Pause',
  CapsLock: 'CapsLock',
  Escape: 'Escape',
  Esc: 'Escape',
  Space: 'Space',
  ' ': 'Space',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  End: 'End',
  Home: 'Home',
  ArrowLeft: 'ArrowLeft',
  ArrowUp: 'ArrowUp',
  ArrowRight: 'ArrowRight',
  ArrowDown: 'ArrowDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Del: 'Delete',
  Meta: 'MetaLeft',
  ContextMenu: 'ContextMenu',
};

const functionKeyMatch = /^F([1-9]|1[0-9]|2[0-4])$/;

function resolveKeyInfo(key: string, code?: string, keyCode?: number): ResolvedKeyInfo {
  let resolvedCode = code;
  let resolvedKeyCode = keyCode;

  if (resolvedKeyCode === undefined || Number.isNaN(resolvedKeyCode)) {
    const mapped = keyCodeMap[key];
    if (mapped !== undefined) {
      resolvedKeyCode = mapped;
    } else if (functionKeyMatch.test(key)) {
      const match = functionKeyMatch.exec(key);
      const index = match ? Number(match[1]) : 0;
      if (index > 0) {
        resolvedKeyCode = 111 + index;
      }
    } else if (key.length === 1) {
      const upper = key.toUpperCase();
      const charCode = upper.charCodeAt(0);
      if (!Number.isNaN(charCode)) {
        resolvedKeyCode = charCode;
      }
    }
  }

  if (resolvedCode === undefined) {
    const mappedCode = codeMap[key];
    if (mappedCode !== undefined) {
      resolvedCode = mappedCode;
    } else if (functionKeyMatch.test(key)) {
      resolvedCode = key;
    } else if (key.length === 1) {
      const upper = key.toUpperCase();
      if (upper >= 'A' && upper <= 'Z') {
        resolvedCode = `Key${upper}`;
      } else if (upper >= '0' && upper <= '9') {
        resolvedCode = `Digit${upper}`;
      } else if (key === ' ') {
        resolvedCode = 'Space';
      }
    }
  }

  return { code: resolvedCode, keyCode: resolvedKeyCode };
}

interface CDPError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  originalError?: Error;
}

interface CDPBridgeOptions {
  session: ServerSession;
  onFrame: FrameHandler;
  onNavigation: NavigationHandler;
  onError?: ErrorHandler;
  onFileChooser?: FileChooserHandler;
}

interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

interface FullPageMetrics {
  viewportHeight: number;
  pageHeight: number;
  hasNestedScrollableContent: boolean;
}

export interface PageSnapshot {
  html: string;
  viewport: { width: number; height: number };
}

function createCDPError(code: string, message: string, context?: Record<string, unknown>, originalError?: Error): CDPError {
  return {
    code,
    message,
    context,
    originalError,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

function isExecutionContextDestroyedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('Execution context was destroyed');
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class CDPBridge {
  private session: ServerSession;
  private onFrame: FrameHandler;
  private onNavigation: NavigationHandler;
  private onError?: ErrorHandler;
  private onFileChooser?: FileChooserHandler;
  private isScreencasting: boolean = false;
  private lastFrameTime: number = 0;
  private minFrameInterval: number;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000;
  private isHealthy: boolean = true;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private pressedButtons: number = 0;
  private highlightColor: string = '#FF0000';
  private readonly screenshotTimeoutMs: number = 7000;
  private readonly fullPageScreenshotTimeoutMs: number = 12000;
  private pendingFileChooser: {
    chooser: FileChooser;
    x: number;
    y: number;
    createdAt: number;
  } | null = null;
  private lastFileChooserTrigger: {
    x: number;
    y: number;
    createdAt: number;
  } | null = null;

  constructor(options: CDPBridgeOptions) {
    this.session = options.session;
    this.onFrame = options.onFrame;
    this.onNavigation = options.onNavigation;
    this.onError = options.onError;
    this.onFileChooser = options.onFileChooser;
    this.minFrameInterval = 1000 / env.SCREENCAST_MAX_FPS;
    this.startHealthMonitoring();
  }

  private reportError(error: CDPError): void {
    const context = {
      sessionId: this.session.id,
      url: this.session.url,
      isScreencasting: this.isScreencasting,
      ...error.context,
    };

    console.error(`[CDP:${this.session.id}] ${error.code}: ${error.message}`, context);

    if (this.onError) {
      this.onError(error);
    }
  }

  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>
  ): Promise<T | null> {
    try {
      return await withTimeout(operation(), 30000);
    } catch (originalError) {
      if (operationName === 'getElementAtPoint' && isExecutionContextDestroyedError(originalError)) {
        return null;
      }

      const error = createCDPError(
        `CDP_${operationName.toUpperCase()}_FAILED`,
        `${operationName} failed: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
        { operationName, ...context },
        originalError instanceof Error ? originalError : new Error(String(originalError))
      );
      this.reportError(error);
      return null;
    }
  }

  private get cdp(): CDPSession {
    if (!this.session.cdp) {
      throw new Error('CDP session not available');
    }
    return this.session.cdp;
  }

  private get page(): Page {
    if (!this.session.page) {
      throw new Error('Page not available');
    }
    return this.session.page;
  }

  async capturePageSnapshot(): Promise<PageSnapshot | null> {
    return await this.executeWithErrorHandling(
      () => this.page.evaluate(() => {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        const liveElements = Array.from(document.documentElement.querySelectorAll('*'));
        const clonedElements = Array.from(clone.querySelectorAll('*'));

        for (let i = 0; i < liveElements.length; i += 1) {
          const liveElement = liveElements[i];
          const clonedElement = clonedElements[i];
          if (!liveElement || !clonedElement) {
            continue;
          }

          if (liveElement instanceof HTMLInputElement && clonedElement instanceof HTMLInputElement) {
            clonedElement.value = liveElement.value;
            if (liveElement.value.length > 0) {
              clonedElement.setAttribute('value', liveElement.value);
            } else {
              clonedElement.removeAttribute('value');
            }

            if (liveElement.checked) {
              clonedElement.setAttribute('checked', '');
            } else {
              clonedElement.removeAttribute('checked');
            }
          } else if (liveElement instanceof HTMLTextAreaElement && clonedElement instanceof HTMLTextAreaElement) {
            clonedElement.value = liveElement.value;
            clonedElement.textContent = liveElement.value;
          } else if (liveElement instanceof HTMLSelectElement && clonedElement instanceof HTMLSelectElement) {
            clonedElement.value = liveElement.value;
            const liveOptions = Array.from(liveElement.options);
            const clonedOptions = Array.from(clonedElement.options);
            for (let optionIndex = 0; optionIndex < liveOptions.length; optionIndex += 1) {
              const liveOption = liveOptions[optionIndex];
              const clonedOption = clonedOptions[optionIndex];
              if (!liveOption || !clonedOption) {
                continue;
              }

              clonedOption.selected = liveOption.selected;
              if (liveOption.selected) {
                clonedOption.setAttribute('selected', '');
              } else {
                clonedOption.removeAttribute('selected');
              }
            }
          } else if (liveElement instanceof HTMLDetailsElement && clonedElement instanceof HTMLDetailsElement) {
            clonedElement.open = liveElement.open;
            if (liveElement.open) {
              clonedElement.setAttribute('open', '');
            } else {
              clonedElement.removeAttribute('open');
            }
          }
        }

        clone.querySelectorAll('script').forEach((element) => element.remove());

        const head = clone.querySelector('head') ?? clone.insertBefore(document.createElement('head'), clone.firstChild);
        const base = document.createElement('base');
        base.href = window.location.href;
        head.prepend(base);

        const style = document.createElement('style');
        style.textContent = `
          * { animation: none !important; transition: none !important; caret-color: transparent !important; }
          html, body { scroll-behavior: auto !important; }
        `;
        head.append(style);

        return {
          html: `<!DOCTYPE html>\n${clone.outerHTML}`,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };
      }),
      'capturePageSnapshot'
    );
  }

  private setLastFileChooserTrigger(x: number, y: number): void {
    this.lastFileChooserTrigger = {
      x,
      y,
      createdAt: Date.now(),
    };
  }

  private consumeLastFileChooserTrigger(): { x: number; y: number } | null {
    if (!this.lastFileChooserTrigger) {
      return null;
    }

    const maxAgeMs = 5000;
    if (Date.now() - this.lastFileChooserTrigger.createdAt > maxAgeMs) {
      this.lastFileChooserTrigger = null;
      return null;
    }

    const trigger = this.lastFileChooserTrigger;
    this.lastFileChooserTrigger = null;
    return trigger;
  }

  private setPendingFileChooser(chooser: FileChooser, x: number, y: number): void {
    this.pendingFileChooser = {
      chooser,
      x,
      y,
      createdAt: Date.now(),
    };
  }

  private takePendingFileChooser(x: number, y: number): FileChooser | null {
    if (!this.pendingFileChooser) {
      return null;
    }

    const maxAgeMs = 60000;
    const maxDistancePx = 24;
    const ageMs = Date.now() - this.pendingFileChooser.createdAt;
    const distance = Math.hypot(this.pendingFileChooser.x - x, this.pendingFileChooser.y - y);

    if (ageMs > maxAgeMs || distance > maxDistancePx) {
      this.pendingFileChooser = null;
      return null;
    }

    const { chooser } = this.pendingFileChooser;
    this.pendingFileChooser = null;
    return chooser;
  }

  hasPendingFileChooserAt(x: number, y: number): boolean {
    if (!this.pendingFileChooser) {
      return false;
    }

    const maxAgeMs = 60000;
    const maxDistancePx = 24;
    const ageMs = Date.now() - this.pendingFileChooser.createdAt;
    const distance = Math.hypot(this.pendingFileChooser.x - x, this.pendingFileChooser.y - y);

    if (ageMs > maxAgeMs || distance > maxDistancePx) {
      this.pendingFileChooser = null;
      return false;
    }

    return true;
  }

  async startScreencast(): Promise<void> {
    if (this.isScreencasting) return;

    await this.executeWithErrorHandling(
      () => this.cdp.send('Page.enable'),
      'pageEnable'
    );
    await this.executeWithErrorHandling(
      () => this.cdp.send('Runtime.enable'),
      'runtimeEnable'
    );
    await this.executeWithErrorHandling(
      () => this.cdp.send('Input.setIgnoreInputEvents', { ignore: false }),
      'setIgnoreInputEvents'
    );

    this.cdp.on('Page.screencastFrame', (frame) => {
      const now = Date.now();

      if (now - this.lastFrameTime >= this.minFrameInterval) {
        this.lastFrameTime = now;
        this.onFrame(frame.data, now);
      }

      this.executeWithErrorHandling(
        () => this.cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }),
        'screencastFrameAck',
        { sessionId: frame.sessionId }
      ).catch(() => {
        console.warn('[CDP] Frame acknowledgment failed');
      });
    });

    // Set up navigation handlers
    this.page.on('framenavigated', async (frame) => {
      try {
        if (frame === this.page.mainFrame()) {
          const url = frame.url();
          const title = await this.page.title();
          this.session.url = url;
          this.session.title = title;
          this.onNavigation(url, title);
        }
      } catch (originalError) {
        const error = createCDPError(
          'CDP_NAVIGATION_HANDLER_FAILED',
          `Navigation handler failed: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
          undefined,
          originalError instanceof Error ? originalError : new Error(String(originalError))
        );
        this.reportError(error);
      }
    });

    this.page.on('filechooser', (chooser) => {
      const trigger = this.consumeLastFileChooserTrigger();
      if (!trigger) {
        return;
      }

      this.setPendingFileChooser(chooser, trigger.x, trigger.y);
      this.onFileChooser?.(trigger.x, trigger.y);
    });

    // Start screencast
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: env.SCREENCAST_QUALITY,
      maxWidth: env.BROWSER_VIEWPORT_WIDTH,
      maxHeight: env.BROWSER_VIEWPORT_HEIGHT,
      everyNthFrame: 1,
    });

    this.isScreencasting = true;
  }

  async stopScreencast(): Promise<void> {
    if (!this.isScreencasting) return;

    await this.executeWithErrorHandling(
      () => this.cdp.send('Page.stopScreencast'),
      'stopScreencast'
    );

    this.isScreencasting = false;
  }

  async sendMouseInput(
    action: 'move' | 'down' | 'up',
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    const buttonMask = button === 'left' ? 1 : button === 'right' ? 2 : 4;
    if (action === 'down') {
      this.pressedButtons |= buttonMask;
    } else if (action === 'up') {
      this.pressedButtons &= ~buttonMask;
    }

    const result = await this.executeWithHealthCheck(
      () => this.cdp.send('Input.dispatchMouseEvent', {
        type: action === 'move' ? 'mouseMoved' : action === 'down' ? 'mousePressed' : 'mouseReleased',
        x,
        y,
        button: action === 'move' ? 'none' : button,
        buttons: this.pressedButtons,
        clickCount: action === 'down' ? 1 : 0,
      }),
      'sendMouseInput',
      { action, x, y, button }
    );
    if (result === null) {
      throw new Error('CDP mouse event failed');
    }
  }

  async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.sendMouseInput('down', x, y, button);
    await this.sendMouseInput('up', x, y, button);
  }

  async sendMouseUpAndDetectFileChooser(
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<boolean> {
    if (button === 'left') {
      this.setLastFileChooserTrigger(x, y);
    }

    await this.sendMouseInput('up', x, y, button);

    if (button !== 'left') {
      return false;
    }

    await this.page.waitForTimeout(150);
    return this.hasPendingFileChooserAt(x, y);
  }

  async hover(x: number, y: number): Promise<void> {
    const result = await this.executeWithHealthCheck(
      () => this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
      }),
      'hover',
      { x, y }
    );
    if (result === null) {
      throw new Error('CDP hover event failed');
    }
  }

  async selectOption(x: number, y: number, value: string): Promise<void> {
    // First click on the select element to open dropdown
    await this.click(x, y);

    // Wait for dropdown to render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Set the select value via JavaScript
    const result = await this.executeWithHealthCheck(
      () => this.page.evaluate(([val]) => {
        const select = document.querySelector('select') as HTMLSelectElement | null;
        if (select) {
          select.value = val;
          // Trigger change event
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, [value] as const),
      'selectOption',
      { x, y, value }
    );

    if (result === null) {
      throw new Error('CDP select option failed');
    }
  }

  async sendKeyboardInput(
    action: 'down' | 'up',
    key: string,
    text?: string,
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean },
    code?: string,
    keyCode?: number
  ): Promise<void> {
    const resolved = resolveKeyInfo(key, code, keyCode);
    const resolvedCode = resolved.code;
    const resolvedKeyCode = resolved.keyCode;

    let modifierFlags = 0;
    if (modifiers?.alt) modifierFlags |= 1;
    if (modifiers?.ctrl) modifierFlags |= 2;
    if (modifiers?.meta) modifierFlags |= 4;
    if (modifiers?.shift) modifierFlags |= 8;

    if (action === 'down') {
      const hasText = text !== undefined && text.length > 0;
      const result = await this.executeWithHealthCheck(
        () => this.cdp.send('Input.dispatchKeyEvent', {
          type: hasText ? 'keyDown' : 'rawKeyDown',
          key,
          text: hasText ? text : undefined,
          modifiers: modifierFlags,
          code: resolvedCode ?? undefined,
          windowsVirtualKeyCode: resolvedKeyCode ?? undefined,
          nativeVirtualKeyCode: resolvedKeyCode ?? undefined,
        }),
        'sendKeyboardInput-keyDown',
        { key, text, modifiers, code: resolvedCode, keyCode: resolvedKeyCode }
      );
      if (result === null) {
        throw new Error('CDP key down failed');
      }
    } else {
      const result = await this.executeWithHealthCheck(
        () => this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          modifiers: modifierFlags,
          code: resolvedCode ?? undefined,
          windowsVirtualKeyCode: resolvedKeyCode ?? undefined,
          nativeVirtualKeyCode: resolvedKeyCode ?? undefined,
        }),
        'sendKeyboardInput-keyUp',
        { key, modifiers, code: resolvedCode, keyCode: resolvedKeyCode }
      );
      if (result === null) {
        throw new Error('CDP key up failed');
      }
    }
  }

  async type(text: string): Promise<void> {
    for (const char of text) {
      await this.sendKeyboardInput('down', char, char);
      await this.sendKeyboardInput('up', char);
    }
  }

  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    const result = await this.executeWithHealthCheck(
      () => this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX,
        deltaY,
      }),
      'scroll',
      { x, y, deltaX, deltaY }
    );
    if (result === null) {
      throw new Error('CDP scroll event failed');
    }
  }

  async navigate(url: string): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.goto(url, { waitUntil: 'domcontentloaded' }),
      'navigate',
      { url }
    );
    await this.waitForPageLoad();
  }

  async goBack(): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.goBack({ waitUntil: 'domcontentloaded' }),
      'goBack'
    );
    await this.waitForPageLoad();
  }

  async goForward(): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.goForward({ waitUntil: 'domcontentloaded' }),
      'goForward'
    );
    await this.waitForPageLoad();
  }

  async reload(): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.reload({ waitUntil: 'domcontentloaded' }),
      'reload'
    );
    await this.waitForPageLoad();
  }

  async waitForPageLoad(timeoutMs: number = 15000, settleMs: number = 200): Promise<void> {
    await this.executeWithErrorHandling(
      async () => {
        await this.page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
        await this.page.waitForLoadState('load', { timeout: timeoutMs });
        if (settleMs > 0) {
          await this.page.waitForTimeout(settleMs);
        }
      },
      'waitForPageLoad',
      { timeoutMs, settleMs }
    );
  }

  async getElementAtPoint(x: number, y: number): Promise<{
    tagName: string;
    inputType?: string;
    fileUploadTarget?: boolean;
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
  } | null> {
    return await this.executeWithErrorHandling(
      () => this.page.evaluate(([px, py]) => {
        const element = document.elementFromPoint(px, py);
        if (!element) return null;

        const target = element.closest('button, a, input, select, textarea, label, [role="button"], [role="link"]') ?? element;
        const resolveUploadInput = (el: Element): HTMLInputElement | null => {
          const isHeuristicCandidate = (node: Element): boolean => {
            if (node instanceof HTMLInputElement) {
              return node.type === 'file';
            }
            if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
              return false;
            }

            const htmlElement = node as HTMLElement;
            if (htmlElement.isContentEditable) {
              return false;
            }
            if (node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement) {
              return false;
            }

            const role = node.getAttribute('role');
            if (role === 'button' || role === 'link') {
              return false;
            }

            return window.getComputedStyle(htmlElement).cursor === 'pointer';
          };

          const directInput = el.closest('input[type="file"]');
          if (directInput instanceof HTMLInputElement) {
            return directInput;
          }

          const label = el.closest('label');
          if (label instanceof HTMLLabelElement) {
            if (label.control instanceof HTMLInputElement && label.control.type === 'file') {
              return label.control;
            }

            const nestedLabelInput = label.querySelector('input[type="file"]');
            if (nestedLabelInput instanceof HTMLInputElement) {
              return nestedLabelInput;
            }
          }

          const nestedInput = el.querySelector('input[type="file"]');
          if (nestedInput instanceof HTMLInputElement) {
            return nestedInput;
          }

          if (!isHeuristicCandidate(el)) {
            return null;
          }

          let scope: Element | null = el;
          for (let depth = 0; depth < 4 && scope; depth += 1) {
            const parentElement: Element | null = scope.parentElement;
            if (!parentElement) {
              break;
            }

            const directSiblingInputs = Array.from(parentElement.querySelectorAll(':scope > input[type="file"]'));
            if (directSiblingInputs.length === 1 && directSiblingInputs[0] instanceof HTMLInputElement) {
              return directSiblingInputs[0];
            }
            if (directSiblingInputs.length > 1) {
              return null;
            }

            const subtreeInputs = Array.from(parentElement.querySelectorAll('input[type="file"]'));
            if (subtreeInputs.length === 1 && subtreeInputs[0] instanceof HTMLInputElement) {
              return subtreeInputs[0];
            }
            if (subtreeInputs.length > 1) {
              return null;
            }

            scope = parentElement;
          }

          return null;
        };

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

        const role = target.getAttribute('role') ?? undefined;
        const tagName = role === 'button'
          ? 'button'
          : role === 'link'
            ? 'a'
            : target.tagName;
        const rect = target.getBoundingClientRect();
        const labelText = getLabelText(target);
        const fileUploadInput = resolveUploadInput(target);

        return {
          tagName,
          inputType: target instanceof HTMLInputElement ? target.type : fileUploadInput?.type,
          fileUploadTarget: fileUploadInput !== null,
          id: (target as HTMLElement).id || undefined,
          className: (target as HTMLElement).className || undefined,
          testId: target.getAttribute('data-testid') ?? undefined,
          ariaLabel: target.getAttribute('aria-label') ?? undefined,
          role,
          text: (labelText ?? target.textContent?.trim().slice(0, 100)) || undefined,
          labelText,
          name: (target as HTMLInputElement).name || undefined,
          placeholder: (target as HTMLInputElement).placeholder || undefined,
          boundingBox: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
          },
        };
      }, [x, y] as const),
      'getElementAtPoint',
      { x, y }
    ) ?? null;
  }

  async uploadFileAtPoint(x: number, y: number, file: UploadFile): Promise<void> {
    const pendingFileChooser = this.takePendingFileChooser(x, y);
    if (pendingFileChooser) {
      await pendingFileChooser.setFiles({
        name: file.name,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
      return;
    }

    const setFilesOnHandle = async (handle: JSHandle<HTMLInputElement | null> | null): Promise<boolean> => {
      if (handle === null) {
        return false;
      }

      const elementHandle = handle.asElement() as ElementHandle<HTMLInputElement> | null;
      if (!elementHandle) {
        await handle.dispose();
        return false;
      }

      try {
        await elementHandle.setInputFiles({
          name: file.name,
          mimeType: file.mimeType,
          buffer: file.buffer,
        });
        return true;
      } finally {
        await handle.dispose();
      }
    };

    const handle = await this.executeWithHealthCheck(
      () => this.page.evaluateHandle(([px, py]) => {
        const element = document.elementFromPoint(px, py);
        if (!element) return null;

        const resolveUploadInput = (el: Element): HTMLInputElement | null => {
          const isHeuristicCandidate = (node: Element): boolean => {
            if (node instanceof HTMLInputElement) {
              return node.type === 'file';
            }
            if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
              return false;
            }

            const htmlElement = node as HTMLElement;
            if (htmlElement.isContentEditable) {
              return false;
            }
            if (node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement) {
              return false;
            }

            const role = node.getAttribute('role');
            if (role === 'button' || role === 'link') {
              return false;
            }

            return window.getComputedStyle(htmlElement).cursor === 'pointer';
          };

          const directInput = el.closest('input[type="file"]');
          if (directInput instanceof HTMLInputElement) {
            return directInput;
          }

          const label = el.closest('label');
          if (label instanceof HTMLLabelElement) {
            if (label.control instanceof HTMLInputElement && label.control.type === 'file') {
              return label.control;
            }

            const nestedLabelInput = label.querySelector('input[type="file"]');
            if (nestedLabelInput instanceof HTMLInputElement) {
              return nestedLabelInput;
            }
          }

          const nestedInput = el.querySelector('input[type="file"]');
          if (nestedInput instanceof HTMLInputElement) {
            return nestedInput;
          }

          if (!isHeuristicCandidate(el)) {
            return null;
          }

          let scope: Element | null = el;
          for (let depth = 0; depth < 4 && scope; depth += 1) {
            const parentElement: Element | null = scope.parentElement;
            if (!parentElement) {
              break;
            }

            const directSiblingInputs = Array.from(parentElement.querySelectorAll(':scope > input[type="file"]'));
            if (directSiblingInputs.length === 1 && directSiblingInputs[0] instanceof HTMLInputElement) {
              return directSiblingInputs[0];
            }
            if (directSiblingInputs.length > 1) {
              return null;
            }

            const subtreeInputs = Array.from(parentElement.querySelectorAll('input[type="file"]'));
            if (subtreeInputs.length === 1 && subtreeInputs[0] instanceof HTMLInputElement) {
              return subtreeInputs[0];
            }
            if (subtreeInputs.length > 1) {
              return null;
            }

            scope = parentElement;
          }

          return null;
        };

        return resolveUploadInput(element);
      }, [x, y] as const),
      'resolveFileInput',
      { x, y }
    );

    if (await setFilesOnHandle(handle)) {
      return;
    }

    throw new Error('No pending file chooser or file input found at selected location');
  }

  async takeScreenshot(
    clip?: { x: number; y: number; width: number; height: number },
    fullPage: boolean = false
  ): Promise<Buffer> {
    if (!clip && fullPage) {
      return await this.takeFullPageScreenshot();
    }

    const options: {
      type: 'png' | 'jpeg';
      quality?: number;
      clip?: { x: number; y: number; width: number; height: number };
      fullPage?: boolean;
    } = {
      type: env.SCREENSHOT_FORMAT,
    };

    if (clip) {
      options.clip = clip;
    }

    // JPEG quality setting only applies to JPEG format
    if (env.SCREENSHOT_FORMAT === 'jpeg') {
      options.quality = env.SCREENSHOT_QUALITY;
    }

    return await withTimeout(this.page.screenshot(options), this.screenshotTimeoutMs);
  }

  private async takeFullPageScreenshot(): Promise<Buffer> {
    let metrics: FullPageMetrics | null = null;

    try {
      metrics = await this.getFullPageMetrics();
    } catch {
      metrics = null;
    }

    try {
      let screenshot = await this.takeFullPageScreenshotWithCDP();
      if (!screenshot) {
        screenshot = await withTimeout(
          this.page.screenshot(this.getFullPageScreenshotOptions()),
          this.fullPageScreenshotTimeoutMs
        );
      }

      if (metrics && await this.shouldRetryFullPageCapture(screenshot, metrics)) {
        const expandedScreenshot = await this.takeExpandedFullPageScreenshot();
        if (expandedScreenshot) {
          screenshot = expandedScreenshot;
        }
      }

      return screenshot;
    } finally {
      await this.restoreViewportAfterFullPageCapture();
    }
  }

  private async restoreViewportAfterFullPageCapture(): Promise<void> {
    await this.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }).catch(() => undefined);
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: env.BROWSER_VIEWPORT_WIDTH,
      height: env.BROWSER_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
      scale: 1,
      screenWidth: env.BROWSER_VIEWPORT_WIDTH,
      screenHeight: env.BROWSER_VIEWPORT_HEIGHT,
      screenOrientation: {
        type: 'portraitPrimary',
        angle: 0,
      },
    }).catch(() => undefined);
    await this.page.setViewportSize({
      width: env.BROWSER_VIEWPORT_WIDTH,
      height: env.BROWSER_VIEWPORT_HEIGHT,
    }).catch(() => undefined);
  }

  private async takeFullPageScreenshotWithCDP(): Promise<Buffer | null> {
    try {
      const metrics = await this.cdp.send('Page.getLayoutMetrics') as {
        contentSize?: { width?: number; height?: number };
      };
      const width = Math.max(1, Math.ceil(metrics.contentSize?.width ?? 0));
      const height = Math.max(1, Math.ceil(metrics.contentSize?.height ?? 0));
      if (width <= 1 || height <= 1) {
        return null;
      }

      const maxDimension = 16000;
      const scale = Math.min(1, maxDimension / Math.max(width, height));

      const result = await this.cdp.send('Page.captureScreenshot', {
        format: env.SCREENSHOT_FORMAT === 'jpeg' ? 'jpeg' : 'png',
        ...(env.SCREENSHOT_FORMAT === 'jpeg' ? { quality: env.SCREENSHOT_QUALITY } : {}),
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale },
      }) as { data?: string };

      if (!result.data) {
        return null;
      }

      return Buffer.from(result.data, 'base64');
    } catch {
      try {
        const retry = await this.cdp.send('Page.captureScreenshot', {
          format: env.SCREENSHOT_FORMAT === 'jpeg' ? 'jpeg' : 'png',
          ...(env.SCREENSHOT_FORMAT === 'jpeg' ? { quality: env.SCREENSHOT_QUALITY } : {}),
          fromSurface: true,
          captureBeyondViewport: true,
        }) as { data?: string };
        if (!retry.data) {
          return null;
        }
        return Buffer.from(retry.data, 'base64');
      } catch {
        return null;
      }
    }
  }

  async takeSafeFullPageScreenshot(): Promise<Buffer | null> {
    return await this.takeFullPageScreenshotWithCDP();
  }

  async takeSafeFullPageScreenshotWithHighlight(
    boundingBox: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer | null> {
    await this.injectHighlightOverlay(boundingBox, true);

    try {
      await this.page.waitForTimeout(50);
      return await this.takeFullPageScreenshotWithCDP();
    } finally {
      try {
        await this.removeHighlightOverlay();
      } catch {
        void 0;
      }
    }
  }

  async renderPageSnapshotFullPageScreenshot(
    snapshot: PageSnapshot,
    highlightBoundingBox?: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer | null> {
    let mirrorPage: Page | null = null;

    try {
      mirrorPage = await this.page.context().newPage();
      await mirrorPage.setViewportSize(snapshot.viewport);
      await mirrorPage.setContent(snapshot.html, { waitUntil: 'load' });
      await mirrorPage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);

      if (highlightBoundingBox) {
        const borderColor = hexToRgba(this.highlightColor, 0.95);
        const fillColor = hexToRgba(this.highlightColor, 0.14);
        await mirrorPage.evaluate(([box, lineColor, overlayColor]) => {
          const overlay = document.createElement('div');
          overlay.id = 'stepwise-highlight-overlay';
          overlay.style.position = 'absolute';
          overlay.style.left = `${box.x}px`;
          overlay.style.top = `${box.y}px`;
          overlay.style.width = `${box.width}px`;
          overlay.style.height = `${box.height}px`;
          overlay.style.border = `3px solid ${lineColor}`;
          overlay.style.borderRadius = '4px';
          overlay.style.background = overlayColor;
          overlay.style.boxShadow = `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 6px ${overlayColor}`;
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '2147483647';
          overlay.style.boxSizing = 'border-box';
          (document.body ?? document.documentElement).appendChild(overlay);
        }, [highlightBoundingBox, borderColor, fillColor] as const);
      }

      return await withTimeout(
        mirrorPage.screenshot(this.getFullPageScreenshotOptions()),
        this.fullPageScreenshotTimeoutMs
      );
    } catch {
      return null;
    } finally {
      if (mirrorPage) {
        await mirrorPage.close().catch(() => undefined);
      }
    }
  }

  private getFullPageScreenshotOptions(): { type: 'png' | 'jpeg'; quality?: number; fullPage: true } {
    if (env.SCREENSHOT_FORMAT === 'jpeg') {
      return {
        type: 'jpeg',
        quality: env.SCREENSHOT_QUALITY,
        fullPage: true,
      };
    }

    return {
      type: 'png',
      fullPage: true,
    };
  }

  private async getFullPageMetrics(): Promise<FullPageMetrics> {
    return await this.page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const pageHeight = Math.max(
        doc.scrollHeight,
        doc.offsetHeight,
        doc.clientHeight,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        body?.clientHeight ?? 0,
      );

      let hasNestedScrollableContent = false;
      const elements = document.body?.querySelectorAll<HTMLElement>('*') ?? [];
      for (const element of elements) {
        const style = window.getComputedStyle(element);
        const overflowY = style.overflowY;
        if (!['auto', 'scroll', 'overlay'].includes(overflowY)) {
          continue;
        }
        if (element.scrollHeight <= element.clientHeight + 32) {
          continue;
        }
        if (element.clientHeight < 160 || element.clientWidth < 160) {
          continue;
        }
        hasNestedScrollableContent = true;
        break;
      }

      return {
        viewportHeight: window.innerHeight,
        pageHeight,
        hasNestedScrollableContent,
      };
    });
  }

  private async shouldRetryFullPageCapture(
    screenshot: Buffer,
    metrics: FullPageMetrics
  ): Promise<boolean> {
    const metadata = await sharp(screenshot).metadata();
    const screenshotHeight = metadata.height ?? 0;
    if (screenshotHeight <= 0) {
      return false;
    }

    const tolerance = 32;
    const isViewportSized = screenshotHeight <= metrics.viewportHeight + tolerance;
    const pageContinuesBelowViewport = metrics.pageHeight > metrics.viewportHeight + tolerance;

    return isViewportSized && (pageContinuesBelowViewport || metrics.hasNestedScrollableContent);
  }

  private async takeExpandedFullPageScreenshot(): Promise<Buffer | null> {
    const prepared = await this.page.evaluate(() => {
      const state = globalThis as typeof globalThis & {
        __stepwiseFullPageRestore__?: Array<{ element: HTMLElement; style: string | null }>;
      };

      if (state.__stepwiseFullPageRestore__) {
        return false;
      }

      const restore: Array<{ element: HTMLElement; style: string | null }> = [];
      const remember = (element: HTMLElement | null): void => {
        if (!element || restore.some((entry) => entry.element === element)) {
          return;
        }
        restore.push({
          element,
          style: element.getAttribute('style'),
        });
      };

      const doc = document.documentElement;
      const body = document.body;

      remember(doc);
      if (body) {
        remember(body);
      }

      doc.style.setProperty('height', 'auto', 'important');
      doc.style.setProperty('max-height', 'none', 'important');
      doc.style.setProperty('overflow-y', 'visible', 'important');

      if (body) {
        body.style.setProperty('height', 'auto', 'important');
        body.style.setProperty('max-height', 'none', 'important');
        body.style.setProperty('overflow-y', 'visible', 'important');
      }

      const candidates: HTMLElement[] = [];
      const elements = document.body?.querySelectorAll<HTMLElement>('*') ?? [];
      for (const element of elements) {
        const style = window.getComputedStyle(element);
        const overflowY = style.overflowY;
        if (!['auto', 'scroll', 'overlay'].includes(overflowY)) {
          continue;
        }
        if (element.scrollHeight <= element.clientHeight + 32) {
          continue;
        }
        if (element.clientHeight < 160 || element.clientWidth < 160) {
          continue;
        }
        candidates.push(element);
      }

      candidates
        .sort((left, right) => (right.scrollHeight * right.clientWidth) - (left.scrollHeight * left.clientWidth))
        .slice(0, 6)
        .forEach((element) => {
          remember(element);
          element.style.setProperty('height', 'auto', 'important');
          element.style.setProperty('max-height', 'none', 'important');
          element.style.setProperty('overflow-y', 'visible', 'important');
          element.style.setProperty('overflow', 'visible', 'important');
        });

      state.__stepwiseFullPageRestore__ = restore;
      return restore.length > 0;
    });

    if (!prepared) {
      return null;
    }

    try {
      await this.page.waitForTimeout(100);
      return await withTimeout(
        this.page.screenshot(this.getFullPageScreenshotOptions()),
        this.fullPageScreenshotTimeoutMs
      );
    } finally {
      await this.page.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          __stepwiseFullPageRestore__?: Array<{ element: HTMLElement; style: string | null }>;
        };

        const restore = state.__stepwiseFullPageRestore__ ?? [];
        for (const entry of restore) {
          if (entry.style === null) {
            entry.element.removeAttribute('style');
          } else {
            entry.element.setAttribute('style', entry.style);
          }
        }
        delete state.__stepwiseFullPageRestore__;
      });
    }
  }

  /**
   * Injects a highlight overlay for an element on the page
   */
  async injectHighlightOverlay(
    boundingBox: { x: number; y: number; width: number; height: number },
    fullPage: boolean = false
  ): Promise<void> {
    await this.page.evaluate(([box, borderColor, isFullPage]) => {
      // Create highlight overlay element
      const overlay = document.createElement('div');
      overlay.id = 'stepwise-highlight-overlay';
      const x = isFullPage ? box.x : box.x - window.scrollX;
      const y = isFullPage ? box.y : box.y - window.scrollY;
      overlay.style.position = isFullPage ? 'absolute' : 'fixed';
      overlay.style.left = `${x}px`;
      overlay.style.top = `${y}px`;
      overlay.style.width = `${box.width}px`;
      overlay.style.height = `${box.height}px`;
      overlay.style.border = `3px solid ${borderColor}`;
      overlay.style.borderRadius = '4px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '999999';
      document.body.appendChild(overlay);
    }, [boundingBox, hexToRgba(this.highlightColor, 0.9), fullPage] as const);
  }

  setHighlightColor(color: string): void {
    if (!isHexColor(color)) {
      return;
    }
    this.highlightColor = color;
  }

  getHighlightColor(): string {
    return this.highlightColor;
  }

  /**
   * Removes the highlight overlay from the page
   */
  async removeHighlightOverlay(): Promise<void> {
    await this.page.evaluate(() => {
      const overlay = document.getElementById('stepwise-highlight-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
  }

  /**
   * Takes a screenshot with a highlight overlay around the specified element
   */
  async takeScreenshotWithHighlight(
    boundingBox: { x: number; y: number; width: number; height: number },
    clip?: { x: number; y: number; width: number; height: number },
    fullPage: boolean = false
  ): Promise<Buffer> {
    await this.injectHighlightOverlay(boundingBox, fullPage);

    try {
      await this.page.waitForTimeout(50);
      return await this.takeScreenshot(clip, fullPage);
    } finally {
      try {
        await this.removeHighlightOverlay();
      } catch {
        void 0;
      }
    }
  }

  async cleanup(): Promise<void> {
    await this.stopScreencast();
    this.stopHealthMonitoring();
    this.pendingFileChooser = null;
    this.lastFileChooserTrigger = null;
  }

  async isCDPHealthy(): Promise<boolean> {
    try {
      await this.validateCDPSession();
      return true;
    } catch {
      return false;
    }
  }

  async validateCDPSession(): Promise<void> {
    const now = Date.now();

    if (now - this.lastHealthCheck < 10000) {
      return;
    }

    this.lastHealthCheck = now;

    try {
      await withTimeout(
        this.cdp.send('Runtime.evaluate', {
          expression: '1 + 1'
        }),
        3000
      );
      this.isHealthy = true;
      sessionManager.updateHealthStatus(this.session.id, 'healthy', now);
    } catch (error) {
      this.isHealthy = false;
      sessionManager.updateHealthStatus(this.session.id, 'unhealthy', now);
      const cdpError = createCDPError(
        'HEALTH_CHECK_FAILED',
        'CDP session health check failed',
        { error: error instanceof Error ? error.message : String(error) },
        error instanceof Error ? error : new Error(String(error))
      );
      this.reportError(cdpError);
      throw cdpError;
    }
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      if (this.session.status !== 'active') {
        return;
      }

      void this.validateCDPSession().catch((error: unknown) => {
        console.warn(`[CDP:${this.session.id}] Health check failed:`, error);
      });
    }, this.healthCheckInterval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async executeWithHealthCheck<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>
  ): Promise<T | null> {
    try {
      await this.validateCDPSession();
      return await this.executeWithErrorHandling(operation, operationName, context);
    } catch (error) {
      const healthError = createCDPError(
        'SESSION_UNHEALTHY',
        'Cannot execute operation - CDP session is unhealthy',
        { operationName, ...context },
        error instanceof Error ? error : new Error(String(error))
      );
      this.reportError(healthError);
      return null;
    }
  }
}
