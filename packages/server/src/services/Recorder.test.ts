import { describe, expect, it } from 'bun:test';
import { Recorder } from './Recorder.js';
import { env } from '../lib/env.js';
import type { ServerSession } from '../types/session.js';
import type { Step } from '@stepwise/shared';
import type { PageSnapshot } from './CDPBridge.js';

type ScreenshotClip = { x: number; y: number; width: number; height: number };
type ElementInfo = {
  tagName: string;
  boundingBox: ScreenshotClip;
  text?: string;
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
  capturePageSnapshot?: () => Promise<PageSnapshot | null>;
  renderPageSnapshotFullPageScreenshot?: (
    snapshot: PageSnapshot,
    highlightBoundingBox?: ScreenshotClip
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
  it('stores distinct zoomed, viewport, and full-page screenshots for clipped click steps', async () => {
    const zoomedBuffer = Buffer.from('zoomed');
    const viewportBuffer = Buffer.from('viewport');
    const fullPageBuffer = Buffer.from('fullpage');
    const clip = { x: 10, y: 20, width: 300, height: 200 };
    const paths: string[] = [];
    const snapshot: PageSnapshot = {
      html: '<!DOCTYPE html><html><body><button>Submit</button></body></html>',
      viewport: { width: 1280, height: 800 },
    };

    const cdpBridge: CDPBridgeMock = {
      getElementAtPoint: async () => ({
        tagName: 'button',
        boundingBox: { x: 120, y: 140, width: 80, height: 24 },
        text: 'Submit',
      }),
      getHighlightColor: () => '#FF0000',
      takeScreenshot: async (_clip, fullPage) => fullPage ? fullPageBuffer : viewportBuffer,
      takeScreenshotWithHighlight: async (_boundingBox, currentClip, fullPage) => {
        if (fullPage) {
          return fullPageBuffer;
        }
        return currentClip ? zoomedBuffer : viewportBuffer;
      },
      capturePageSnapshot: async () => snapshot,
      renderPageSnapshotFullPageScreenshot: async (pageSnapshot) => {
        expect(pageSnapshot).toEqual(snapshot);
        return fullPageBuffer;
      },
      takeSafeFullPageScreenshotWithHighlight: async () => fullPageBuffer,
      takeSafeFullPageScreenshot: async () => fullPageBuffer,
      waitForPageLoad: async () => undefined,
    };

    const { recorder, session } = createRecorder(cdpBridge);
    Object.assign(recorder as unknown as { CLICK_FULL_PAGE_IDLE_MS: number }, {
      CLICK_FULL_PAGE_IDLE_MS: 50,
    });
    Object.assign(recorder as unknown as RecorderTestHarness, {
      getClipForTarget: async () => clip,
      saveScreenshot: async (screenshotData: Buffer) => {
        const path = `/tmp/${paths.length + 1}-${screenshotData.toString('utf8')}.png`;
        paths.push(path);
        return path;
      },
    });

    const updatedStepPromise = new Promise<Step>((resolve) => {
      const handler = (candidate: Step): void => {
        if (candidate.action !== 'click') {
          return;
        }
        recorder.off('step:updated', handler);
        resolve(candidate);
      };
      recorder.on('step:updated', handler);
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

    const updatedStep = await updatedStepPromise;

    expect(updatedStep.pageScreenshotDataUrl).toBe(toDataUrl(fullPageBuffer));
    expect(updatedStep.pageScreenshotPath).toBe('/tmp/3-fullpage.png');
  });

  it('keeps viewport and full-page captures distinct for navigation steps', async () => {
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
    expect(step?.pageScreenshotDataUrl).toBe(toDataUrl(fullPageBuffer));
    expect(savedBuffers.map((buffer) => buffer.toString('utf8'))).toEqual(['viewport', 'fullpage']);
  });
});
