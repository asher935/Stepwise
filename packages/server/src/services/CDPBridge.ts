import type { Page, CDPSession } from 'playwright-core';
import type { ServerSession } from '../types/session.js';
import { env } from '../lib/env.js';
import { sessionManager } from './SessionManager.js';

type FrameHandler = (data: string, timestamp: number) => void;
type NavigationHandler = (url: string, title: string) => void;
type ErrorHandler = (error: CDPError) => void;

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
  context?: Record<string, any>;
  originalError?: Error;
}

interface CDPBridgeOptions {
  session: ServerSession;
  onFrame: FrameHandler;
  onNavigation: NavigationHandler;
  onError?: ErrorHandler;
}

interface CDPBridgeOptions {
  session: ServerSession;
  onFrame: FrameHandler;
  onNavigation: NavigationHandler;
  onError?: ErrorHandler;
}

function createCDPError(code: string, message: string, context?: Record<string, any>, originalError?: Error): CDPError {
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

export class CDPBridge {
  private session: ServerSession;
  private onFrame: FrameHandler;
  private onNavigation: NavigationHandler;
  private onError?: ErrorHandler;
  private isScreencasting: boolean = false;
  private lastFrameTime: number = 0;
  private minFrameInterval: number;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000;
  private isHealthy: boolean = true;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private pressedButtons: number = 0;

  constructor(options: CDPBridgeOptions) {
    this.session = options.session;
    this.onFrame = options.onFrame;
    this.onNavigation = options.onNavigation;
    this.onError = options.onError;
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
    context?: Record<string, any>
  ): Promise<T | null> {
    try {
      return await withTimeout(operation(), 30000);
    } catch (originalError) {
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
      if (frame === this.page.mainFrame()) {
        const url = frame.url();
        const title = await this.page.title();
        this.session.url = url;
        this.session.title = title;
        this.onNavigation(url, title);
      }
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
  }

  async goBack(): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.goBack({ waitUntil: 'domcontentloaded' }),
      'goBack'
    );
  }

  async goForward(): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.goForward({ waitUntil: 'domcontentloaded' }),
      'goForward'
    );
  }

  async reload(): Promise<void> {
    await this.executeWithErrorHandling(
      () => this.page.reload({ waitUntil: 'domcontentloaded' }),
      'reload'
    );
  }

  async getElementAtPoint(x: number, y: number): Promise<{
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
  } | null> {
    return await this.executeWithErrorHandling(
      () => this.page.evaluate(([px, py]) => {
        const element = document.elementFromPoint(px, py);
        if (!element) return null;

        const target = element.closest('button, a, input, select, textarea, label, [role="button"], [role="link"]') ?? element;

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

        return {
          tagName,
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
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      }, [x, y] as const),
      'getElementAtPoint',
      { x, y }
    ) ?? null;
  }

  async takeScreenshot(clip?: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
    const options: {
      type: 'png' | 'jpeg';
      quality?: number;
      clip?: { x: number; y: number; width: number; height: number };
    } = {
      type: env.SCREENSHOT_FORMAT,
      clip,
    };

    // JPEG quality setting only applies to JPEG format
    if (env.SCREENSHOT_FORMAT === 'jpeg') {
      options.quality = env.SCREENSHOT_QUALITY;
    }

    return await this.page.screenshot(options);
  }

  /**
   * Injects a highlight overlay for an element on the page
   */
  async injectHighlightOverlay(boundingBox: { x: number; y: number; width: number; height: number }): Promise<void> {
    await this.page.evaluate(([box]) => {
      // Create highlight overlay element
      const overlay = document.createElement('div');
      overlay.id = 'stepwise-highlight-overlay';
      overlay.style.position = 'fixed';
      overlay.style.left = `${box.x}px`;
      overlay.style.top = `${box.y}px`;
      overlay.style.width = `${box.width}px`;
      overlay.style.height = `${box.height}px`;
      overlay.style.border = '3px solid rgba(230, 126, 34, 0.9)';
      overlay.style.borderRadius = '4px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '999999';
      document.body.appendChild(overlay);
    }, [boundingBox] as const);
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
    clip?: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    await this.injectHighlightOverlay(boundingBox);

    // Small delay to ensure the overlay is rendered
    await new Promise(resolve => setTimeout(resolve, 50));

    const screenshot = await this.takeScreenshot(clip);

    await this.removeHighlightOverlay();

    return screenshot;
  }

  async cleanup(): Promise<void> {
    await this.stopScreencast();
    this.stopHealthMonitoring();
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

    this.healthCheckTimer = setInterval(async () => {
      if (this.session.status === 'active') {
        try {
          await this.validateCDPSession();
        } catch (error) {
          console.warn(`[CDP:${this.session.id}] Health check failed:`, error);
        }
      }
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
    context?: Record<string, any>
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
