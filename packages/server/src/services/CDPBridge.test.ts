import { afterEach, describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { CDPBridge } from './CDPBridge.js';
import type { ServerSession } from '../types/session.js';

type ScreenshotOptions = {
  fullPage?: boolean;
};

type FullPageMetrics = {
  viewportHeight: number;
  pageHeight: number;
  hasNestedScrollableContent: boolean;
};

type CdpLayoutMetrics = {
  contentSize: {
    width: number;
    height: number;
  };
};

type CdpScreenshotResult = {
  data: string;
};

type MockPage = {
  screenshot: (options: ScreenshotOptions) => Promise<Buffer>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: () => Promise<FullPageMetrics | boolean | undefined>;
};

type MockCDP = {
  send: (method: string) => Promise<CdpLayoutMetrics | CdpScreenshotResult | undefined>;
};

const bridges: CDPBridge[] = [];

function createSession(page: MockPage, cdp: MockCDP): ServerSession {
  return {
    id: 'test-session',
    token: 'token',
    status: 'active',
    mode: 'record',
    recordingPaused: false,
    browser: null,
    page: page as never,
    cdp: cdp as never,
    steps: [],
    url: 'https://example.com',
    title: 'Example',
    startUrl: 'https://example.com',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    lastExpiryWarningAt: null,
    healthStatus: 'healthy',
    lastHealthCheck: Date.now(),
    initialNavigationRecorded: true,
  };
}

function createBridge(page: MockPage, cdp: MockCDP): CDPBridge {
  const bridge = new CDPBridge({
    session: createSession(page, cdp),
    onFrame: () => undefined,
    onNavigation: () => undefined,
  });
  bridges.push(bridge);
  return bridge;
}

async function createPng(height: number): Promise<Buffer> {
  return await sharp({
    create: {
      width: 8,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toBuffer();
}

afterEach(async () => {
  while (bridges.length > 0) {
    const bridge = bridges.pop();
    if (bridge) {
      await bridge.cleanup();
    }
  }
});

describe('CDPBridge screenshots', () => {
  it('captures viewport screenshots by default', async () => {
    const screenshotBuffer = await createPng(40);
    const screenshotCalls: ScreenshotOptions[] = [];

    const page: MockPage = {
      screenshot: async (options) => {
        screenshotCalls.push(options);
        return screenshotBuffer;
      },
      setViewportSize: async () => undefined,
      waitForTimeout: async () => undefined,
      evaluate: async () => {
        throw new Error('not used');
      },
    };

    const cdp: MockCDP = {
      send: async () => undefined,
    };

    const bridge = createBridge(page, cdp);
    const result = await bridge.takeScreenshot();

    expect(result).toEqual(screenshotBuffer);
    expect(screenshotCalls).toHaveLength(1);
    expect(screenshotCalls[0]?.['fullPage']).toBeUndefined();
  });

  it('falls back to Playwright full-page screenshots when CDP capture fails', async () => {
    const screenshotBuffer = await createPng(120);
    const screenshotCalls: ScreenshotOptions[] = [];

    const page: MockPage = {
      screenshot: async (options) => {
        screenshotCalls.push(options);
        return screenshotBuffer;
      },
      setViewportSize: async () => undefined,
      waitForTimeout: async () => undefined,
      evaluate: async () => {
        throw new Error('metrics unavailable');
      },
    };

    const cdp: MockCDP = {
      send: async (method) => {
        if (method === 'Page.captureScreenshot' || method === 'Page.getLayoutMetrics') {
          throw new Error('capture failed');
        }
        return undefined;
      },
    };

    const bridge = createBridge(page, cdp);
    const result = await bridge.takeScreenshot(undefined, true);

    expect(result).toEqual(screenshotBuffer);
    expect(screenshotCalls).toHaveLength(1);
    expect(screenshotCalls[0]?.['fullPage']).toBe(true);
  });

  it('retries full-page capture when the initial result is only viewport-sized', async () => {
    const viewportBuffer = await createPng(600);
    const fullPageBuffer = await createPng(1200);
    const screenshotCalls: ScreenshotOptions[] = [];
    let evaluateCalls = 0;

    const page: MockPage = {
      screenshot: async (options) => {
        screenshotCalls.push(options);
        return fullPageBuffer;
      },
      setViewportSize: async () => undefined,
      waitForTimeout: async () => undefined,
      evaluate: async () => {
        evaluateCalls += 1;
        if (evaluateCalls === 1) {
          return {
            viewportHeight: 600,
            pageHeight: 1200,
            hasNestedScrollableContent: false,
          };
        }
        if (evaluateCalls === 2) {
          return true;
        }
        return undefined;
      },
    };

    const cdp: MockCDP = {
      send: async (method) => {
        if (method === 'Page.getLayoutMetrics') {
          return {
            contentSize: {
              width: 800,
              height: 1200,
            },
          };
        }
        if (method === 'Page.captureScreenshot') {
          return {
            data: viewportBuffer.toString('base64'),
          };
        }
        return undefined;
      },
    };

    const bridge = createBridge(page, cdp);
    const result = await bridge.takeScreenshot(undefined, true);

    expect(result).toEqual(fullPageBuffer);
    expect(screenshotCalls).toHaveLength(1);
    expect(screenshotCalls[0]?.['fullPage']).toBe(true);
  });

  it('falls back to Playwright full-page screenshots when CDP would downscale the page', async () => {
    const screenshotBuffer = await createPng(1200);
    const screenshotCalls: ScreenshotOptions[] = [];
    const captureCalls: string[] = [];

    const page: MockPage = {
      screenshot: async (options) => {
        screenshotCalls.push(options);
        return screenshotBuffer;
      },
      setViewportSize: async () => undefined,
      waitForTimeout: async () => undefined,
      evaluate: async () => ({
        viewportHeight: 600,
        pageHeight: 20000,
        hasNestedScrollableContent: false,
      }),
    };

    const cdp: MockCDP = {
      send: async (method) => {
        if (method === 'Page.getLayoutMetrics') {
          return {
            contentSize: {
              width: 1280,
              height: 20000,
            },
          };
        }
        if (method === 'Page.captureScreenshot') {
          captureCalls.push(method);
          return {
            data: screenshotBuffer.toString('base64'),
          };
        }
        return undefined;
      },
    };

    const bridge = createBridge(page, cdp);
    const result = await bridge.takeScreenshot(undefined, true);

    expect(result).toEqual(screenshotBuffer);
    expect(captureCalls).toHaveLength(0);
    expect(screenshotCalls).toHaveLength(1);
    expect(screenshotCalls[0]?.['fullPage']).toBe(true);
  });
});
