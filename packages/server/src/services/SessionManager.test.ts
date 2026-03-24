import { afterEach, describe, expect, it } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import type { ClickStep } from '@stepwise/shared';
import { sessionManager } from './SessionManager.js';
import { redactionService } from './RedactionService.js';

const createdSessionIds = new Set<string>();

function createInsertLikeClickStep(id: string, screenshotPath: string): ClickStep {
  return {
    id,
    index: 0,
    action: 'click',
    timestamp: Date.now(),
    screenshotPath,
    fullScreenshotPath: screenshotPath,
    screenshotDataUrl: 'data:image/png;base64,b3JpZ2luYWw=',
    fullScreenshotDataUrl: 'data:image/png;base64,b3JpZ2luYWw=',
    caption: 'Review the current view',
    isEdited: false,
    button: 'left',
    target: {
      selector: null,
      boundingBox: { x: 120, y: 140, width: 80, height: 24 },
      elementTag: 'input',
      elementText: 'IBMid',
    },
    redactionRects: [{ x: 120, y: 140, width: 80, height: 24 }],
    viewportRedactionRects: [{ x: 120, y: 140, width: 80, height: 24 }],
  };
}

afterEach(async () => {
  const ids = [...createdSessionIds];
  createdSessionIds.clear();
  for (const sessionId of ids) {
    await sessionManager.endSession(sessionId, 'error');
  }
});

describe('SessionManager redaction', () => {
  it('deduplicates identical zoomed and viewport redaction work for insert-style steps', async () => {
    const { sessionId } = await sessionManager.createSession();
    createdSessionIds.add(sessionId);

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found in test setup');
    }

    const screenshotPath = `/tmp/${sessionId}-insert.png`;
    await writeFile(screenshotPath, Buffer.from('source-image'));

    const step = createInsertLikeClickStep('insert-step', screenshotPath);
    session.steps = [step];

    const originalGenerate = redactionService.generateRedactedScreenshot.bind(redactionService);
    let generateCallCount = 0;

    redactionService.generateRedactedScreenshot = async (
      inputPath,
      rects,
      outputPath
    ) => {
      generateCallCount += 1;
      expect(inputPath).toBe(screenshotPath);
      expect(rects).toEqual(step.redactionRects ?? []);
      await writeFile(outputPath, Buffer.from('redacted-image'));
    };

    try {
      const result = await sessionManager.toggleRedaction(sessionId, step.id, true);

      expect(generateCallCount).toBe(1);
      expect(step.redactedScreenshotPath).toBe(step.redactedFullScreenshotPath);
      expect(step.redactedScreenshotPath).toBeDefined();
      expect(result.redactedScreenshotPath).toBe(step.redactedScreenshotPath ?? null);
      expect(result.screenshotDataUrl).toContain('cmVkYWN0ZWQtaW1hZ2U=');
    } finally {
      redactionService.generateRedactedScreenshot = originalGenerate;
    }
  });
});
