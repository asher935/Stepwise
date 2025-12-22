import type { Page, CDPSession } from 'playwright-core';
import type { ServerSession } from '../types/session.js';
import { env } from '../lib/env.js';
import { sessionManager } from './SessionManager.js';

type FrameHandler = (data: string, timestamp: number) => void;
type NavigationHandler = (url: string, title: string) => void;
type ErrorHandler = (error: CDPError) => void;

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
    modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }
  ): Promise<void> {
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
        }),
        'sendKeyboardInput-keyDown',
        { key, text, modifiers }
      );
      if (result === null) {
        throw new Error('CDP key down failed');
      }

      if (hasText) {
        const charResult = await this.executeWithHealthCheck(
          () => this.cdp.send('Input.dispatchKeyEvent', {
            type: 'char',
            key,
            text,
            modifiers: modifierFlags,
          }),
          'sendKeyboardInput-char',
          { key, text, modifiers }
        );
        if (charResult === null) {
          throw new Error('CDP char event failed');
        }
      }
    } else {
      const result = await this.executeWithHealthCheck(
        () => this.cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          modifiers: modifierFlags,
        }),
        'sendKeyboardInput-keyUp',
        { key, modifiers }
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
    name?: string;
    placeholder?: string;
    boundingBox: { x: number; y: number; width: number; height: number };
  } | null> {
    return await this.executeWithErrorHandling(
      () => this.page.evaluate(([px, py]) => {
        const element = document.elementFromPoint(px, py);
        if (!element) return null;

        const rect = element.getBoundingClientRect();
        
        return {
          tagName: element.tagName,
          id: element.id || undefined,
          className: element.className || undefined,
          testId: element.getAttribute('data-testid') ?? undefined,
          ariaLabel: element.getAttribute('aria-label') ?? undefined,
          role: element.getAttribute('role') ?? undefined,
          text: element.textContent?.trim().slice(0, 100) || undefined,
          name: (element as HTMLInputElement).name || undefined,
          placeholder: (element as HTMLInputElement).placeholder || undefined,
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

  async takeScreenshot(): Promise<Buffer> {
    return await this.page.screenshot({
      type: 'jpeg',
      quality: 80,
    });
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
