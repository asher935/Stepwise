import * as unzipper from 'unzipper';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { 
  Step, 
  ImportPreviewResult,
  ImportOptions, 
  ImportResult, 
  StepwiseManifest,
  ImportValidationError,
  PasteStep,
  TypeStep,
} from '@stepwise/shared';
import type { ServerSession } from '../types/session.js';
import { decrypt } from '../lib/crypto.js';
import { env } from '../lib/env.js';
import { toScreenshotDataUrl } from '../lib/screenshots.js';

interface ParsedStepwiseFile {
  manifest: StepwiseManifest;
  steps: Step[];
  screenshots: Map<string, Buffer>;
}

interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ImportService handles importing .stepwise files
 */
export class ImportService {
  private session: ServerSession;

  constructor(session: ServerSession) {
    this.session = session;
  }

  /**
   * Imports a .stepwise file
   */
  async import(fileBuffer: Buffer, options: ImportOptions = {}): Promise<ImportResult> {
    // Check if file is encrypted (first byte pattern)
    let dataBuffer = fileBuffer;
    
    // Try to decrypt if password provided
    if (options.password) {
      try {
        dataBuffer = Buffer.from(await decrypt(new Uint8Array(fileBuffer), options.password));
      } catch {
        throw new Error('IMPORT_DECRYPT_FAILED');
      }
    }

    // Parse the ZIP file
    const parsed = await this.parseStepwiseFile(dataBuffer);

    // Validate the parsed data
    const errors = this.validate(parsed);
    if (errors.length > 0) {
      throw new Error(`IMPORT_INVALID: ${errors.map(e => e.message).join(', ')}`);
    }

    // Save screenshots to session directory
    const sessionDir = join(env.TEMP_DIR, 'sessions', this.session.id, 'screenshots');
    await mkdir(sessionDir, { recursive: true });

    const updatedSteps: Step[] = [];
    for (const step of parsed.steps) {
      const originalPath = step.screenshotPath;
      const filename = originalPath.split('/').pop() ?? `${step.id}.jpg`;
      const newPath = join(sessionDir, filename);

      // Find matching screenshot
      const screenshotBuffer = parsed.screenshots.get(originalPath) 
        ?? parsed.screenshots.get(`screenshots/${filename}`)
        ?? parsed.screenshots.get(filename);

      if (screenshotBuffer) {
        await writeFile(newPath, new Uint8Array(screenshotBuffer));
      }

      const screenshotDataUrl = screenshotBuffer
        ? toScreenshotDataUrl(screenshotBuffer, this.getScreenshotFormat(filename))
        : undefined;

      updatedSteps.push(this.normalizeImportedStep(step, newPath, screenshotDataUrl));
    }

    this.session.steps = updatedSteps;

    return {
      title: parsed.manifest.title,
      steps: updatedSteps,
      createdAt: parsed.manifest.createdAt,
    };
  }

  private normalizeImportedStep(
    step: Step,
    screenshotPath: string,
    screenshotDataUrl?: string
  ): Step {
    const selectedScreenshotMode = step.selectedScreenshotMode ?? 'zoomed';
    const legacyRects = this.getLegacyRedactionRects(step);

    return {
      ...step,
      screenshotPath,
      fullScreenshotPath: screenshotPath,
      pageScreenshotPath: screenshotPath,
      screenshotDataUrl,
      fullScreenshotDataUrl: screenshotDataUrl,
      pageScreenshotDataUrl: screenshotDataUrl,
      originalScreenshotDataUrl: undefined,
      redactedScreenshotPath: undefined,
      redactedFullScreenshotPath: undefined,
      redactedPageScreenshotPath: undefined,
      selectedScreenshotMode,
      redactionRects: step.redactionRects ?? legacyRects.redactionRects,
      viewportRedactionRects: step.viewportRedactionRects
        ?? step.redactionRects
        ?? legacyRects.viewportRedactionRects,
      pageRedactionRects: step.pageRedactionRects ?? legacyRects.pageRedactionRects,
      redactScreenshot: step.redactScreenshot ?? false,
    };
  }

  private getLegacyRedactionRects(step: Step): {
    redactionRects: RedactionRect[];
    viewportRedactionRects: RedactionRect[];
    pageRedactionRects: RedactionRect[] | undefined;
  } {
    if (step.action !== 'type' && step.action !== 'paste') {
      return {
        redactionRects: [],
        viewportRedactionRects: [],
        pageRedactionRects: undefined,
      };
    }

    const inputStep = step as TypeStep | PasteStep;
    const pageRect = inputStep.target.boundingBox;
    const zoomedRect = this.clipRectToScreenshotSpace(pageRect, inputStep.screenshotClip);

    return {
      redactionRects: zoomedRect ? [zoomedRect] : [],
      viewportRedactionRects: [pageRect],
      pageRedactionRects: [pageRect],
    };
  }

  private clipRectToScreenshotSpace(
    rect: RedactionRect,
    clip?: RedactionRect
  ): RedactionRect | null {
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

  private getScreenshotFormat(filename: string): 'png' | 'jpeg' {
    return filename.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  }

  /**
   * Parses a .stepwise ZIP file
   */
  private async parseStepwiseFile(buffer: Buffer): Promise<ParsedStepwiseFile> {
    const manifest: StepwiseManifest = {
      version: '1.0.0',
      createdAt: Date.now(),
      title: 'Imported Guide',
      stepCount: 0,
      encrypted: false,
    };
    let steps: Step[] = [];
    const screenshots = new Map<string, Buffer>();

    return new Promise((resolve, reject) => {
      const readable = Readable.from(buffer);
      
      readable
        .pipe(unzipper.Parse())
        .on('entry', (entry: unzipper.Entry) => {
          const path = entry.path;
          const type = entry.type;

          if (type === 'File') {
            const chunks: Uint8Array[] = [];

            entry.on('data', (chunk: Uint8Array) => chunks.push(chunk));
            entry.on('end', () => {
              const content = Buffer.concat(chunks);

              if (path === 'manifest.json') {
                try {
                  const parsed = JSON.parse(content.toString()) as StepwiseManifest;
                  Object.assign(manifest, parsed);
                } catch {
                  // Use default manifest
                }
              } else if (path === 'steps.json') {
                try {
                  steps = JSON.parse(content.toString()) as Step[];
                } catch {
                  reject(new Error('Invalid steps.json'));
                }
              } else if (path.startsWith('screenshots/') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png')) {
                screenshots.set(path, content);
              }
            });
          } else {
            entry.autodrain();
          }
        })
        .on('close', () => {
          manifest.stepCount = steps.length;
          resolve({ manifest, steps, screenshots });
        })
        .on('error', reject);
    });
  }

  /**
   * Validates parsed stepwise data
   */
  private validate(parsed: ParsedStepwiseFile): ImportValidationError[] {
    const errors: ImportValidationError[] = [];

    // Validate manifest
    if (!parsed.manifest.version) {
      errors.push({ field: 'manifest.version', message: 'Missing version' });
    }

    // Validate steps
    if (!Array.isArray(parsed.steps)) {
      errors.push({ field: 'steps', message: 'Steps must be an array' });
      return errors;
    }

    if (parsed.steps.length === 0) {
      errors.push({ field: 'steps', message: 'No steps found' });
      return errors;
    }

    // Validate each step
    for (let i = 0; i < parsed.steps.length; i++) {
      const step = parsed.steps[i];
      if (!step) continue;

      if (!step.id) {
        errors.push({ field: `steps[${i}].id`, message: 'Missing step ID' });
      }

      if (!step.action) {
        errors.push({ field: `steps[${i}].action`, message: 'Missing step action' });
      }

      if (typeof step.index !== 'number') {
        errors.push({ field: `steps[${i}].index`, message: 'Missing step index' });
      }
    }

    // Check step limit
    if (parsed.steps.length > env.MAX_STEPS_PER_SESSION) {
      errors.push({ 
        field: 'steps', 
        message: `Too many steps (${parsed.steps.length}). Maximum is ${env.MAX_STEPS_PER_SESSION}` 
      });
    }

    return errors;
  }

  /**
   * Checks if a buffer looks like an encrypted .stepwise file
   */
  static isEncrypted(buffer: Buffer): boolean {
    // Check if it starts with PK (ZIP magic bytes)
    // If not, it's likely encrypted
    return buffer[0] !== 0x50 || buffer[1] !== 0x4B;
  }

  /**
   * Previews a .stepwise file without fully importing
   */
  async preview(fileBuffer: Buffer, options: ImportOptions = {}): Promise<ImportPreviewResult> {
    const isEncrypted = ImportService.isEncrypted(fileBuffer);
    
    let dataBuffer = fileBuffer;
    if (isEncrypted && options.password) {
      try {
        dataBuffer = Buffer.from(await decrypt(new Uint8Array(fileBuffer), options.password));
      } catch {
        throw new Error('IMPORT_DECRYPT_FAILED');
      }
    } else if (isEncrypted) {
      // Return info indicating encryption
      return {
        manifest: {
          version: 'unknown',
          createdAt: 0,
          title: 'Encrypted Guide',
          stepCount: 0,
          encrypted: true,
        },
        stepCount: 0,
        encrypted: true,
      };
    }

    const parsed = await this.parseStepwiseFile(dataBuffer);

    return {
      manifest: parsed.manifest,
      stepCount: parsed.steps.length,
      encrypted: isEncrypted,
    };
  }
}
