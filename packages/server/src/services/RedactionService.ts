import sharp from 'sharp';

/**
 * Redaction rectangle coordinates
 */
export interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * RedactionService handles image redaction using Sharp library
 */
export class RedactionService {
  private inProgressRedactions = new Map<string, Promise<void>>();

  /**
   * Generates a redacted screenshot by drawing a solid black rectangle
   * over the specified region
   */
  async generateRedactedScreenshot(
    screenshotPath: string,
    redactionRect: RedactionRect,
    outputPath: string
  ): Promise<void> {
    const redactionKey = `${screenshotPath}-${JSON.stringify(redactionRect)}`;

    if (this.inProgressRedactions.has(redactionKey)) {
      throw new Error('Redaction already in progress for this step');
    }

    const redactionPromise = this.doGenerateRedactedScreenshot(
      screenshotPath,
      redactionRect,
      outputPath
    );

    this.inProgressRedactions.set(redactionKey, redactionPromise);

    try {
      await redactionPromise;
    } finally {
      this.inProgressRedactions.delete(redactionKey);
    }
  }

  /**
   * Internal implementation of redaction generation
   */
  private async doGenerateRedactedScreenshot(
    screenshotPath: string,
    redactionRect: RedactionRect,
    outputPath: string
  ): Promise<void> {
    try {
      const imageMetadata = await sharp(screenshotPath).metadata();

      if (!imageMetadata.width || !imageMetadata.height) {
        throw new Error('Could not read image dimensions');
      }

      const clampedRect = this.clampRedactionRect(
        redactionRect,
        imageMetadata.width,
        imageMetadata.height
      );

      if (clampedRect.width <= 0 || clampedRect.height <= 0) {
        throw new Error('Invalid redaction rectangle (zero or negative size)');
      }

      await sharp(screenshotPath)
        .composite([
          {
            input: {
              create: {
                width: clampedRect.width,
                height: clampedRect.height,
                channels: 3,
                background: '#000000',
              },
            },
            left: clampedRect.x,
            top: clampedRect.y,
          },
        ])
        .toFile(outputPath);
    } catch (error) {
      console.error('[RedactionService] Error generating redacted screenshot:', error);
      throw error;
    }
  }

  /**
   * Clamps redaction rectangle to image bounds
   */
  private clampRedactionRect(
    rect: RedactionRect,
    imageWidth: number,
    imageHeight: number
  ): RedactionRect {
    return {
      x: Math.max(0, Math.min(rect.x, imageWidth)),
      y: Math.max(0, Math.min(rect.y, imageHeight)),
      width: Math.max(0, Math.min(rect.width, imageWidth - Math.max(0, rect.x))),
      height: Math.max(0, Math.min(rect.height, imageHeight - Math.max(0, rect.y))),
    };
  }

  /**
   * Calculates redaction rectangle from TypeStep, accounting for screenshot clips
   */
  getRedactionRect(step: {
    target: { boundingBox: RedactionRect };
    screenshotClip?: RedactionRect;
  }): RedactionRect | null {
    const box = step.target.boundingBox;
    const clip = step.screenshotClip;

    if (!clip) {
      return box;
    }

    // Convert box coordinates to screenshot-local space
    const x = box.x - clip.x;
    const y = box.y - clip.y;

    // Calculate intersection with clip bounds (in screenshot-local space)
    // The clip itself is [0, 0, clip.width, clip.height] in screenshot-local space
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(clip.width, x + box.width);
    const bottom = Math.min(clip.height, y + box.height);

    // If no intersection, return null
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

  /**
   * Redacts a screenshot buffer by drawing a black rectangle over the specified region
   * @param screenshotData - The screenshot buffer to redact
   * @param redactionRect - The rectangle to redact (in screenshot coordinates)
   * @returns Redacted screenshot buffer
   */
  async redact(
    screenshotData: Buffer,
    redactionRect: RedactionRect
  ): Promise<Buffer> {
    const image = sharp(screenshotData);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not read image dimensions');
    }

    // Clamp rectangle to image bounds
    const clampedRect = this.clampRedactionRect(
      redactionRect,
      metadata.width,
      metadata.height
    );

    if (clampedRect.width <= 0 || clampedRect.height <= 0) {
      throw new Error('Invalid redaction rectangle (zero or negative size)');
    }

    return await image
      .composite([
        {
          input: {
            create: {
              width: clampedRect.width,
              height: clampedRect.height,
              channels: 3,
              background: '#000000',
            },
          },
          left: clampedRect.x,
          top: clampedRect.y,
        },
      ])
      .toBuffer();
  }

  /**
   * Checks if a redaction is currently in progress
   */
  isRedactionInProgress(screenshotPath: string, redactionRect: RedactionRect): boolean {
    const redactionKey = `${screenshotPath}-${JSON.stringify(redactionRect)}`;
    return this.inProgressRedactions.has(redactionKey);
  }
}

export const redactionService = new RedactionService();
