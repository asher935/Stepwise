import { describe, expect, it } from 'bun:test';
import type { TypeStep } from '@stepwise/shared';
import { Recorder } from './Recorder.js';
import { env } from '../lib/env.js';
import type { ServerSession } from '../types/session.js';

type ScreenshotClip = { x: number; y: number; width: number; height: number };
type ElementInfo = {
  tagName: string;
  boundingBox: ScreenshotClip;
  text?: string;
  labelText?: string;
};

type CDPBridgeMock = {
  getElementAtPoint?: (x: number, y: number) => Promise<ElementInfo | null>;
  getHighlightColor: () => string;
  takeScreenshot: (clip?: ScreenshotClip, fullPage?: boolean) => Promise<Buffer>;
  takeScreenshotWithHighlight: (
    boundingBox: ScreenshotClip,
    clip?: ScreenshotClip,
    fullPage?: boolean
  ) => Promise<Buffer>;
  takeSafeFullPageScreenshot?: () => Promise<Buffer | null>;
  takeSafeFullPageScreenshotWithHighlight?: (
    boundingBox: ScreenshotClip
  ) => Promise<Buffer | null>;
  waitForPageLoad?: () => Promise<void>;
};

type RecorderTestHarness = {
  detectInputRedactionRects: (clip?: ScreenshotClip) => Promise<Array<{ x: number; y: number; width: number; height: number }>>;
  getClipForTarget: (
    boundingBox: ScreenshotClip | null,
    point?: { x: number; y: number }
  ) => Promise<ScreenshotClip | null>;
  saveScreenshot: (screenshotData: Buffer) => Promise<string>;
};

function createSession(): ServerSession {
  return {
    id: 'test-session',
    token: 'token',
    status: 'active',
    mode: 'record',
    recordingPaused: false,
    browser: null,
    page: null,
    cdp: null,
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

function toDataUrl(buffer: Buffer): string {
  const mimeType = env.SCREENSHOT_FORMAT === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function createRecorder(cdpBridge: CDPBridgeMock, session: ServerSession = createSession()): {
  recorder: Recorder;
  session: ServerSession;
} {
  const recorder = new Recorder({
    session,
    cdpBridge: cdpBridge as never,
  });

  Object.assign(recorder as unknown as RecorderTestHarness, {
    detectInputRedactionRects: async () => [],
  });

  return { recorder, session };
}

describe('Recorder screenshot variants', () => {
  it('stores distinct zoomed and viewport screenshots for clipped click steps', async () => {
    const zoomedBuffer = Buffer.from('zoomed');
    const viewportBuffer = Buffer.from('viewport');
    const clip = { x: 10, y: 20, width: 300, height: 200 };
    const paths: string[] = [];
    const viewportRedactionRect = { x: 120, y: 140, width: 80, height: 24 };

    const cdpBridge: CDPBridgeMock = {
      getElementAtPoint: async () => ({
        tagName: 'button',
        boundingBox: { x: 120, y: 140, width: 80, height: 24 },
        text: 'Submit',
      }),
      getHighlightColor: () => '#FF0000',
      takeScreenshot: async () => viewportBuffer,
      takeScreenshotWithHighlight: async (_boundingBox, currentClip, fullPage) => {
        if (fullPage) {
          return viewportBuffer;
        }
        return currentClip ? zoomedBuffer : viewportBuffer;
      },
      takeSafeFullPageScreenshotWithHighlight: async () => viewportBuffer,
      takeSafeFullPageScreenshot: async () => viewportBuffer,
      waitForPageLoad: async () => undefined,
    };

    const { recorder, session } = createRecorder(cdpBridge);
    Object.assign(recorder as unknown as RecorderTestHarness, {
      detectInputRedactionRects: async (currentClip?: ScreenshotClip) => {
        if (currentClip) {
          return [{
            x: viewportRedactionRect.x - currentClip.x,
            y: viewportRedactionRect.y - currentClip.y,
            width: viewportRedactionRect.width,
            height: viewportRedactionRect.height,
          }];
        }
        return [viewportRedactionRect];
      },
      getClipForTarget: async () => clip,
      saveScreenshot: async (screenshotData: Buffer) => {
        const path = `/tmp/${paths.length + 1}-${screenshotData.toString('utf8')}.png`;
        paths.push(path);
        return path;
      },
    });

    await recorder.prepareClickScreenshot(150, 180);
    const step = await recorder.recordClick(150, 180);

    expect(step?.action).toBe('click');
    expect(session.steps).toHaveLength(1);
    expect(step?.screenshotDataUrl).toBe(toDataUrl(zoomedBuffer));
    expect(step?.fullScreenshotDataUrl).toBe(toDataUrl(viewportBuffer));
    expect(step?.pageScreenshotDataUrl).toBeUndefined();
    expect(step?.screenshotPath).toBe('/tmp/1-zoomed.png');
    expect(step?.fullScreenshotPath).toBe('/tmp/2-viewport.png');
    expect(step?.pageScreenshotPath).toBeUndefined();
    expect(step?.redactionRects).toEqual([{
      x: 110,
      y: 120,
      width: 80,
      height: 24,
    }]);
    expect(step?.viewportRedactionRects).toEqual([viewportRedactionRect]);
  });

  it('keeps viewport capture only for navigation steps', async () => {
    const viewportBuffer = Buffer.from('viewport');

    const cdpBridge: CDPBridgeMock = {
      getHighlightColor: () => '#FF0000',
      takeScreenshot: async () => viewportBuffer,
      takeScreenshotWithHighlight: async () => viewportBuffer,
      takeSafeFullPageScreenshot: async () => viewportBuffer,
      takeSafeFullPageScreenshotWithHighlight: async () => viewportBuffer,
      waitForPageLoad: async () => undefined,
    };

    const { recorder, session } = createRecorder(cdpBridge);
    const savedBuffers: Buffer[] = [];
    Object.assign(recorder as unknown as RecorderTestHarness, {
      saveScreenshot: async (screenshotData: Buffer) => {
        savedBuffers.push(screenshotData);
        return `/tmp/${savedBuffers.length}.png`;
      },
    });

    const step = await recorder.recordNavigation('https://example.com/login', 'https://example.com/dashboard');

    expect(step?.action).toBe('navigate');
    expect(session.steps).toHaveLength(1);
    expect(step?.screenshotDataUrl).toBe(toDataUrl(viewportBuffer));
    expect(step?.fullScreenshotDataUrl).toBe(toDataUrl(viewportBuffer));
    expect(step?.pageScreenshotDataUrl).toBeUndefined();
    expect(savedBuffers.map((buffer) => buffer.toString('utf8'))).toEqual(['viewport']);
  });

  it('captures full-page screenshot for insert steps', async () => {
    const viewportBuffer = Buffer.from('viewport');
    const fullPageBuffer = Buffer.from('fullpage');

    const cdpBridge: CDPBridgeMock = {
      getHighlightColor: () => '#FF0000',
      takeScreenshot: async (_clip, fullPage) => fullPage ? fullPageBuffer : viewportBuffer,
      takeScreenshotWithHighlight: async (_boundingBox, _clip, fullPage) => fullPage ? fullPageBuffer : viewportBuffer,
      takeSafeFullPageScreenshot: async () => fullPageBuffer,
      takeSafeFullPageScreenshotWithHighlight: async () => fullPageBuffer,
      waitForPageLoad: async () => undefined,
    };

    const { recorder } = createRecorder(cdpBridge);
    const savedBuffers: Buffer[] = [];
    Object.assign(recorder as unknown as RecorderTestHarness & {
      detectInteractiveElementsOnPage: () => Promise<unknown[]>;
    }, {
      detectInteractiveElementsOnPage: async () => [],
      saveScreenshot: async (screenshotData: Buffer) => {
        savedBuffers.push(screenshotData);
        return `/tmp/${savedBuffers.length}.png`;
      },
    });

    const step = await recorder.createInsertStepFromCurrentView();

    expect(step?.action).toBe('click');
    expect(step?.screenshotDataUrl).toBe(toDataUrl(viewportBuffer));
    expect(step?.fullScreenshotDataUrl).toBe(toDataUrl(viewportBuffer));
    expect(step?.pageScreenshotDataUrl).toBe(toDataUrl(fullPageBuffer));
    expect(savedBuffers.map((buffer) => buffer.toString('utf8'))).toEqual(['viewport', 'fullpage']);
  });
});

describe('Recorder typing flush behavior', () => {
  it('does not finalize typing until the next non-typing action', async () => {
    const typeBuffer = Buffer.from('type-shot');
    const clickBuffer = Buffer.from('click-shot');
    const screenshotCalls: Array<string> = [];
    const savedPaths: string[] = [];

    const cdpBridge: CDPBridgeMock = {
      getElementAtPoint: async () => ({
        tagName: 'button',
        boundingBox: { x: 120, y: 140, width: 80, height: 24 },
        text: 'Submit',
      }),
      getHighlightColor: () => '#FF0000',
      takeScreenshot: async () => clickBuffer,
      takeScreenshotWithHighlight: async (boundingBox) => {
        const marker = boundingBox.x === 20 ? 'type' : 'click';
        screenshotCalls.push(marker);
        return marker === 'type' ? typeBuffer : clickBuffer;
      },
      waitForPageLoad: async () => undefined,
    };

    const { recorder, session } = createRecorder(cdpBridge);
    Object.assign(recorder as unknown as RecorderTestHarness & {
      getFocusedElementInfo: () => Promise<ElementInfo | null>;
    }, {
      getFocusedElementInfo: async () => ({
        tagName: 'input',
        labelText: 'Username',
        boundingBox: { x: 20, y: 40, width: 220, height: 36 },
      }),
      getClipForTarget: async () => null,
      saveScreenshot: async (screenshotData: Buffer) => {
        const path = `/tmp/${savedPaths.length + 1}-${screenshotData.toString('utf8')}.png`;
        savedPaths.push(path);
        return path;
      },
    });

    await recorder.recordKeyInput('a', 'a');
    await new Promise((resolve) => setTimeout(resolve, env.TYPING_DEBOUNCE_MS + 100));

    expect(session.steps).toHaveLength(0);
    expect(screenshotCalls).toHaveLength(0);

    await recorder.prepareClickScreenshot(150, 180);

    expect(session.steps).toHaveLength(1);
    const typeStep = session.steps[0] as TypeStep | undefined;
    expect(typeStep?.action).toBe('type');
    expect(typeStep?.rawValue).toBe('a');
    expect(typeStep?.screenshotDataUrl).toBe(toDataUrl(typeBuffer));
    expect(screenshotCalls).toEqual(['type', 'click']);
  });

  it('flushes the previous pending type step when typing moves to a different field', async () => {
    const typeBuffer = Buffer.from('type-shot');
    const screenshotCalls: Array<string> = [];
    const focusedElements: Array<ElementInfo> = [
      {
        tagName: 'input',
        labelText: 'Username',
        boundingBox: { x: 20, y: 40, width: 220, height: 36 },
      },
      {
        tagName: 'input',
        labelText: 'Password',
        boundingBox: { x: 20, y: 90, width: 220, height: 36 },
      },
    ];

    const cdpBridge: CDPBridgeMock = {
      getHighlightColor: () => '#FF0000',
      takeScreenshot: async () => typeBuffer,
      takeScreenshotWithHighlight: async () => {
        screenshotCalls.push('type');
        return typeBuffer;
      },
      waitForPageLoad: async () => undefined,
    };

    const { recorder, session } = createRecorder(cdpBridge);
    Object.assign(recorder as unknown as RecorderTestHarness & {
      getFocusedElementInfo: () => Promise<ElementInfo | null>;
    }, {
      getFocusedElementInfo: async () => focusedElements.shift() ?? null,
      getClipForTarget: async () => null,
      saveScreenshot: async () => '/tmp/type-shot.png',
    });

    await recorder.recordKeyInput('a', 'a');
    expect(session.steps).toHaveLength(0);

    await recorder.recordKeyInput('b', 'b');

    expect(session.steps).toHaveLength(1);
    const firstTypeStep = session.steps[0] as TypeStep | undefined;
    expect(firstTypeStep?.action).toBe('type');
    expect(firstTypeStep?.fieldName).toBe('Username');
    expect(firstTypeStep?.rawValue).toBe('a');
    expect(screenshotCalls).toEqual(['type']);

    await new Promise((resolve) => setTimeout(resolve, env.TYPING_DEBOUNCE_MS + 100));
    expect(session.steps).toHaveLength(1);
  });
});
