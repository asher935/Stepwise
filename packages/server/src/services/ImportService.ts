import * as unzipper from 'unzipper';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { 
  Step, 
  ImportOptions, 
  ImportResult, 
  StepwiseManifest,
  ImportValidationError 
} from '@stepwise/shared';
import type { ServerSession } from '../types/session.js';
import { decrypt } from '../lib/crypto.js';
import { env } from '../lib/env.js';

interface ParsedStepwiseFile {
  manifest: StepwiseManifest;
  steps: Step[];
  screenshots: Map<string, Buffer>;
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
        await writeFile(newPath, screenshotBuffer as any);
      }

      updatedSteps.push({
        ...step,
        screenshotPath: newPath,
      });
    }

    this.session.steps = updatedSteps;

    return {
      title: parsed.manifest.title,
      steps: updatedSteps,
      createdAt: parsed.manifest.createdAt,
    };
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
        .on('entry', async (entry: unzipper.Entry) => {
          const path = entry.path;
          const type = entry.type;

          if (type === 'File') {
            const chunks: any[] = [];
            
            entry.on('data', (chunk: Buffer) => chunks.push(chunk));
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
  async preview(fileBuffer: Buffer, options: ImportOptions = {}): Promise<{
    manifest: StepwiseManifest;
    stepCount: number;
    encrypted: boolean;
  }> {
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