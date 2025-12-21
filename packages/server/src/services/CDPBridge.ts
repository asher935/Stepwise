import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright-core';
import { EventEmitter } from 'events';
import { browserConfig } from '../lib/env.js';

// CDP Message Types
export interface CDPRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CDPResponse {
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface CDPEvent {
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

// Browser Configuration
export interface BrowserLaunchOptions {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  args?: string[];
}

// Screencast Configuration
export interface ScreencastOptions {
  quality?: number;
  maxFps?: number;
  maxWidth?: number;
  maxHeight?: number;
}

// Input Event Types
export interface ClickEvent {
  type: 'click';
  selector?: string;
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  modifiers?: string[];
}

export interface TypeEvent {
  type: 'type';
  selector?: string;
  text: string;
  clear?: boolean;
  submit?: boolean;
}

export interface ScrollEvent {
  type: 'scroll';
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface NavigateEvent {
  type: 'navigate';
  url: string;
  referrer?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

export interface BrowserAction {
  type: 'click' | 'type' | 'scroll' | 'hover' | 'drag' | 'keypress' | 'screenshot';
  selector?: string;
  data?: {
    button?: 'left' | 'right' | 'middle';
    modifiers?: string[];
    text?: string;
    clear?: boolean;
    submit?: boolean;
    x?: number;
    y?: number;
    deltaX?: number;
    deltaY?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    key?: string;
    code?: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  };
  coordinates?: {
    x: number;
    y: number;
  };
}

// Browser Status
export interface BrowserStatus {
  isLaunched: boolean;
  isConnected: boolean;
  contextCount: number;
  pageCount: number;
  screencastActive: boolean;
  lastActivity: Date;
}

// Browser Instance Info
export interface BrowserInstance {
  id: string;
  type: 'chromium' | 'firefox' | 'webkit';
  version: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  initialUrl?: string;
}

// CDP Bridge Configuration
export interface CDPBridgeConfig {
  maxBrowserInstances: number;
  defaultViewport: {
    width: number;
    height: number;
  };
  headless: boolean;
  screencastOptions?: ScreencastOptions;
}

/**
 * Chrome DevTools Protocol Bridge Service
 * Manages browser instances and CDP connections for automation and recording
 */
export class CDPBridge extends EventEmitter {
  private static instances: Map<string, CDPBridge> = new Map();
  private static globalInstance: CDPBridge | null = null;

  private browsers: Map<string, Browser> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private cdpSessions: Map<string, CDPSession> = new Map();
  private screencastIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: CDPBridgeConfig;

  constructor(config: CDPBridgeConfig) {
    super();
    this.config = config;
  }

  /**
   * Get or create the global CDPBridge instance
   */
  public static getInstance(config?: CDPBridgeConfig): CDPBridge {
    if (!CDPBridge.globalInstance) {
      CDPBridge.globalInstance = new CDPBridge(config || {
        maxBrowserInstances: 5,
        defaultViewport: { width: 1280, height: 800 },
        headless: false
      });
    }
    return CDPBridge.globalInstance;
  }

  /**
   * Get or create a CDPBridge instance for a session
   */
  public static getSessionInstance(sessionId: string): CDPBridge {
    if (!CDPBridge.instances.has(sessionId)) {
      CDPBridge.instances.set(sessionId, CDPBridge.getInstance());
    }
    return CDPBridge.instances.get(sessionId)!;
  }

  /**
   * Remove a CDPBridge instance
   */
  public static removeInstance(sessionId: string): void {
    CDPBridge.instances.delete(sessionId);
  }

  /**
   * Launch a browser instance for a session
   */
  public async launchBrowser(options: {
    sessionId: string;
    viewport?: { width: number; height: number };
    headless?: boolean;
    userAgent?: string;
  }): Promise<BrowserInstance> {
    const browserId = `browser-${options.sessionId}-${Date.now()}`;

    try {
      if (this.browsers.has(browserId)) {
        throw new Error(`Browser instance already exists: ${browserId}`);
      }

      const launchOptions: any = {
        headless: options.headless ?? this.config.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-field-trial-config',
          '--disable-back-forward-cache',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      };

      const browser = await chromium.launch(launchOptions);
      this.browsers.set(browserId, browser);

      // Create context with viewport
      const context = await browser.newContext({
        viewport: options.viewport || this.config.defaultViewport,
        userAgent: options.userAgent
      });
      this.contexts.set(browserId, context);

      // Create initial page
      const page = await context.newPage();
      const pageId = `page-${browserId}-1`;
      this.pages.set(pageId, page);

      // Create CDP session
      const cdpSession = await context.newCDPSession(page);
      this.cdpSessions.set(pageId, cdpSession);

      // Setup event handlers
      browser.on('disconnected', () => {
        this.emit('browser:closed', options.sessionId, browserId, 'session_end');
        this.cleanupBrowser(browserId);
      });

      const browserInstance: BrowserInstance = {
        id: browserId,
        type: 'chromium',
        version: browser.version(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        viewport: options.viewport || this.config.defaultViewport
      };

      this.emit('browser:launched', options.sessionId, browserInstance);

      return browserInstance;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Close a browser instance
   */
  public async closeBrowser(browserId: string): Promise<void> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      return;
    }

    try {
      await browser.close();
      this.cleanupBrowser(browserId);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Close all browser instances
   */
  public async closeAllBrowsers(): Promise<void> {
    const closePromises = Array.from(this.browsers.keys()).map(id =>
      this.closeBrowser(id).catch(() => {})
    );

    await Promise.allSettled(closePromises);
    this.browsers.clear();
    this.contexts.clear();
    this.pages.clear();
    this.cdpSessions.clear();
    this.screencastIntervals.forEach(interval => clearInterval(interval));
    this.screencastIntervals.clear();
  }

  /**
   * Navigate browser to a URL
   */
  public async navigate(
    browserId: string,
    url: string,
    options?: {
      referrer?: string;
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    }
  ): Promise<void> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser not found: ${browserId}`);
    }

    // Find the first page for this browser
    const pageId = Array.from(this.pages.keys()).find(id => id.includes(browserId));
    if (!pageId) {
      throw new Error(`No page found for browser: ${browserId}`);
    }

    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    await page.goto(url, {
      waitUntil: options?.waitUntil || 'load',
      referrer: options?.referrer
    });
  }

  /**
   * Execute a browser action
   */
  public async executeAction(
    browserId: string,
    action: BrowserAction
  ): Promise<any> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser not found: ${browserId}`);
    }

    // Find the first page for this browser
    const pageId = Array.from(this.pages.keys()).find(id => id.includes(browserId));
    if (!pageId) {
      throw new Error(`No page found for browser: ${browserId}`);
    }

    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    switch (action.type) {
      case 'click':
        const shouldTrace = process.env['STEPWISE_TRACE_INPUT'] === '1';
        if (shouldTrace) {
          const { x, y } = action.coordinates || { x: 0, y: 0 };
          console.log('[CDP] Input.dispatchMouseEvent', { x, y, type: 'click' });
        }
        
        if (action.selector) {
          await page.click(action.selector, {
            button: action.data?.button || 'left',
            modifiers: action.data?.modifiers || []
          });
        } else if (action.coordinates) {
          await page.mouse.click(action.coordinates.x, action.coordinates.y, {
            button: action.data?.button || 'left',
            modifiers: action.data?.modifiers || []
          });
        }
        break;

      case 'type':
        if (action.selector) {
          const element = page.locator(action.selector);
          if (action.data?.clear) {
            await element.clear();
          }
          await element.fill(action.data?.text || '');
          if (action.data?.submit) {
            await element.press('Enter');
          }
        }
        break;

      case 'scroll':
        if (action.data?.x !== undefined || action.data?.y !== undefined) {
          await page.evaluate(({ x, y }) => {
            window.scrollTo(x || 0, y || 0);
          }, { x: action.data?.x, y: action.data?.y });
        } else if (action.data?.deltaX || action.data?.deltaY) {
          await page.evaluate(({ deltaX, deltaY }) => {
            window.scrollBy(deltaX || 0, deltaY || 0);
          }, { deltaX: action.data?.deltaX, deltaY: action.data?.deltaY });
        }
        break;

      case 'hover':
        if (action.selector) {
          await page.hover(action.selector);
        } else if (action.coordinates) {
          await page.mouse.move(action.coordinates.x, action.coordinates.y);
        }
        break;

      case 'drag':
        if (action.coordinates && action.data?.startX !== undefined && action.data?.startY !== undefined) {
          await page.mouse.move(action.data.startX, action.data.startY);
          await page.mouse.down();
          await page.mouse.move(action.coordinates.x, action.coordinates.y);
          await page.mouse.up();
        }
        break;

      case 'keypress':
        if (action.data?.key) {
          await page.keyboard.press(action.data.key, {
            ctrlKey: action.data?.ctrlKey || false,
            shiftKey: action.data?.shiftKey || false,
            altKey: action.data?.altKey || false,
            metaKey: action.data?.metaKey || false
          });
        }
        break;

      case 'screenshot':
        const screenshot = await page.screenshot({
          type: 'png',
          fullPage: false
        });
        return screenshot;
    }

    return null;
  }

  /**
   * Take a screenshot
   */
  public async takeScreenshot(
    browserId: string,
    options?: {
      fullPage?: boolean;
      quality?: number;
    }
  ): Promise<Buffer> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser not found: ${browserId}`);
    }

    const pageId = Array.from(this.pages.keys()).find(id => id.includes(browserId));
    if (!pageId) {
      throw new Error(`No page found for browser: ${browserId}`);
    }

    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    return await page.screenshot({
      type: 'png',
      fullPage: options?.fullPage || false,
      quality: options?.quality
    }) as Buffer;
  }

  /**
   * Start screencast for a browser
   */
  public async startScreencast(
    browserId: string,
    options?: ScreencastOptions
  ): Promise<void> {
    const pageId = Array.from(this.pages.keys()).find(id => id.includes(browserId));
    if (!pageId) {
      throw new Error(`No page found for browser: ${browserId}`);
    }

    const cdpSession = this.cdpSessions.get(pageId);
    if (!cdpSession) {
      throw new Error(`No CDP session for browser: ${browserId}`);
    }

    const screencastOptions = {
      format: 'jpeg' as const,
      quality: options?.quality || 80,
      maxWidth: options?.maxWidth || 1280,
      maxHeight: options?.maxHeight || 720,
      everyNthFrame: Math.floor(60 / (options?.maxFps || 15))
    };

    await cdpSession.send('Page.startScreencast', screencastOptions);

    // Handle screencast frames
    cdpSession.on('Page.screencastFrame', async (params: any) => {
      // Emit the frame data
      this.emit('screenshotCaptured', browserId.split('-')[1], {
        data: params.data,
        dimensions: {
          width: params.metadata!.pageWidth,
          height: params.metadata!.pageHeight
        },
        format: 'jpeg'
      });

      // Acknowledge the frame
      await cdpSession.send('Page.screencastFrameAck', {
        sessionId: params.sessionId
      });
    });

    this.emit('screencastStarted', browserId);
  }

  /**
   * Stop screencast for a browser
   */
  public async stopScreencast(browserId: string): Promise<void> {
    const pageId = Array.from(this.pages.keys()).find(id => id.includes(browserId));
    if (!pageId) {
      return;
    }

    const cdpSession = this.cdpSessions.get(pageId);
    if (!cdpSession) {
      return;
    }

    await cdpSession.send('Page.stopScreencast');
    this.emit('screencastStopped', browserId);
  }

  /**
   * Get browser status
   */
  public getBrowserStatus(browserId: string): BrowserStatus | null {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      return null;
    }

    return {
      isLaunched: browser.isConnected(),
      isConnected: browser.isConnected(),
      contextCount: Array.from(this.contexts.keys()).filter(id => id.includes(browserId)).length,
      pageCount: Array.from(this.pages.keys()).filter(id => id.includes(browserId)).length,
      screencastActive: this.screencastIntervals.has(browserId),
      lastActivity: new Date()
    };
  }

  /**
   * Check if the CDP Bridge is healthy
   */
  public isHealthy(): boolean {
    try {
      // Check if we haven't exceeded the max browser instances
      const activeBrowsers = this.getActiveBrowserCount();
      if (activeBrowsers > this.config.maxBrowserInstances) {
        return false;
      }

      // Check if all browsers are properly connected
      for (const [browserId, browser] of this.browsers.entries()) {
        if (!browser.isConnected()) {
          // Cleanup disconnected browsers
          this.cleanupBrowser(browserId);
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the count of active browser instances
   */
  public getActiveBrowserCount(): number {
    let count = 0;
    for (const [browserId, browser] of this.browsers.entries()) {
      if (browser.isConnected()) {
        count++;
      } else {
        // Cleanup disconnected browsers
        this.cleanupBrowser(browserId);
      }
    }
    return count;
  }

  /**
   * Cleanup browser resources
   */
  private cleanupBrowser(browserId: string): void {
    this.browsers.delete(browserId);

    // Clean up associated contexts, pages, and sessions
    for (const [id, resource] of this.contexts.entries()) {
      if (id.includes(browserId)) {
        resource.close().catch(() => {});
        this.contexts.delete(id);
      }
    }

    for (const [id, resource] of this.pages.entries()) {
      if (id.includes(browserId)) {
        resource.close().catch(() => {});
        this.pages.delete(id);
      }
    }

    for (const [id, resource] of this.cdpSessions.entries()) {
      if (id.includes(browserId)) {
        resource.detach().catch(() => {});
        this.cdpSessions.delete(id);
      }
    }

    const interval = this.screencastIntervals.get(browserId);
    if (interval) {
      clearInterval(interval);
      this.screencastIntervals.delete(browserId);
    }
  }

  /**
   * Check if the CDP bridge is healthy
   */
  public isHealthy(): boolean {
    return this.browsers.size >= 0 &&
           this.contexts.size >= 0 &&
           this.pages.size >= 0;
  }

  /**
   * Get the count of active browsers
   */
  public getActiveBrowserCount(): number {
    return this.browsers.size;
  }
}

// Export singleton instance
export const cdpBridge = CDPBridge.getInstance;