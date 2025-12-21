/**
 * ImportService - Comprehensive import service for loading and restoring step-by-step guides
 *
 * This service handles importing various file formats including:
 * - Native .stepwise files with session data and screenshots
 * - Password-protected imports using crypto utilities
 * - JSON exports from the ExportService
 * - Markdown files with embedded images
 * - HTML files with stepwise data
 * - ZIP archives containing multiple sessions
 */

import { EventEmitter } from 'events';
import { createReadStream, createWriteStream, readFile, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { join, extname, basename, dirname } from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import type {
  ImportFile,
  ImportFormat,
  ImportResult,
  ImportProgress,
  StepwiseFileFormat,
  Session,
  SessionCreateOptions,
  SessionStatus,
  RecordingSettings,
  QualitySettings,
  ViewportSettings,
  SessionTag
} from '@stepwise/shared';
import { SessionManager } from './SessionManager.js';
import { decryptWithPassword, hashData } from '../lib/crypto.js';

/**
 * Import validation error types
 */
export enum ImportErrorType {
  INVALID_FORMAT = 'invalid_format',
  CORRUPTED_FILE = 'corrupted_file',
  INVALID_PASSWORD = 'invalid_password',
  MISSING_DATA = 'missing_data',
  INVALID_VERSION = 'invalid_version',
  CHECKSUM_MISMATCH = 'checksum_mismatch',
  UNSUPPORTED_FEATURE = 'unsupported_feature',
  VALIDATION_FAILED = 'validation_failed'
}

/**
 * Import validation error
 */
export interface ImportError {
  type: ImportErrorType;
  message: string;
  details?: unknown;
  severity: 'error' | 'warning';
}

/**
 * Import statistics
 */
export interface ImportStats {
  /** Total files processed */
  totalFiles: number;
  /** Successfully imported files */
  successfulImports: number;
  /** Failed imports */
  failedImports: number;
  /** Total steps imported */
  totalSteps: number;
  /** Total screenshots imported */
  totalScreenshots: number;
  /** Total processing time in milliseconds */
  totalProcessingTime: number;
}

/**
 * Import service configuration
 */
export interface ImportServiceConfig {
  /** Maximum file size in bytes (default: 100MB) */
  maxFileSize: number;
  /** Supported file extensions */
  supportedExtensions: Record<ImportFormat, string[]>;
  /** Default import options */
  defaultOptions: {
    /** Whether to validate checksums */
    validateChecksums: boolean;
    /** Whether to auto-fix common issues */
    autoFixIssues: boolean;
    /** Maximum number of steps per import */
    maxStepsPerImport: number;
    /** Whether to preserve original IDs */
    preserveOriginalIds: boolean;
  };
}

/**
 * Parsed import data with metadata
 */
interface ParsedImportData {
  /** The parsed session data */
  session: Partial<Session>;
  /** Raw steps data */
  steps: unknown[];
  /** Screenshots data */
  screenshots: Map<string, Buffer>;
  /** Import metadata */
  metadata: {
    format: ImportFormat;
    version?: string;
    exportedAt?: Date;
    isEncrypted: boolean;
    checksum?: {
      algorithm: string;
      value: string;
    };
  };
  /** Validation warnings */
  warnings: ImportError[];
}

/**
 * Import event types
 */
export interface ImportEvents {
  'import-started': (operationId: string, fileName: string) => void;
  'import-progress': (progress: ImportProgress) => void;
  'import-completed': (result: ImportResult) => void;
  'import-failed': (operationId: string, error: ImportError) => void;
  'import-cancelled': (operationId: string) => void;
  'batch-import-started': (batchId: string, fileCount: number) => void;
  'batch-import-progress': (batchId: string, completed: number, total: number) => void;
  'batch-import-completed': (batchId: string, results: ImportResult[]) => void;
}

/**
 * ImportService class for handling all import operations
 */
export class ImportService extends EventEmitter {
  private sessionManager: SessionManager;
  private config: ImportServiceConfig;
  private activeImports = new Map<string, AbortController>();
  private importQueue: Array<{
    id: string;
    file: ImportFile;
    priority: number;
    resolve: (result: ImportResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(sessionManager: SessionManager, config?: Partial<ImportServiceConfig>) {
    super();
    this.sessionManager = sessionManager;

    // Default configuration
    this.config = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      supportedExtensions: {
        [ImportFormat.STEPWISE]: ['.stepwise'],
        [ImportFormat.JSON]: ['.json'],
        [ImportFormat.MARKDOWN]: ['.md', '.markdown'],
        [ImportFormat.HTML]: ['.html', '.htm'],
        [ImportFormat.ZIP]: ['.zip', '.stepwise.zip']
      },
      defaultOptions: {
        validateChecksums: true,
        autoFixIssues: true,
        maxStepsPerImport: 10000,
        preserveOriginalIds: false
      },
      ...config
    };
  }

  /**
   * Import a single file
   */
  async importFile(file: ImportFile): Promise<ImportResult> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();

    try {
      // Validate file
      await this.validateFile(file);

      // Create abort controller for this operation
      const abortController = new AbortController();
      this.activeImports.set(operationId, abortController);

      // Emit start event
      this.emit('import-started', operationId, file.fileName);
      this.emitImportProgress(operationId, 'validating', 0);

      // Parse the file based on format
      const parsedData = await this.parseFile(file, operationId);

      // Validate parsed data
      this.emitImportProgress(operationId, 'validating-data', 50);
      const validationResult = await this.validateImportData(parsedData);

      if (!validationResult.isValid) {
        throw new Error(validationResult.errors.map(e => e.message).join('; '));
      }

      // Create session from imported data
      this.emitImportProgress(operationId, 'creating-session', 75);
      const sessionId = await this.createSessionFromImport(parsedData, file);

      // Generate import result
      const result: ImportResult = {
        id: operationId,
        sessionId,
        sourceFileName: file.fileName,
        format: file.format,
        stepsCount: parsedData.steps.length,
        completedAt: new Date(),
        importDuration: Date.now() - startTime,
        status: 'completed',
        warnings: parsedData.warnings.map(w => w.message),
        stats: {
          successfulSteps: parsedData.steps.length,
          skippedSteps: 0,
          errorSteps: 0,
          screenshotsCount: parsedData.screenshots.size,
          consoleEventsCount: this.countConsoleEvents(parsedData.steps),
          networkRequestsCount: this.countNetworkRequests(parsedData.steps)
        },
        metadata: parsedData.metadata
      };

      // Clean up
      this.activeImports.delete(operationId);
      this.emitImportProgress(operationId, 'completed', 100);
      this.emit('import-completed', result);

      return result;

    } catch (error) {
      // Clean up on error
      this.activeImports.delete(operationId);

      const importError: ImportError = {
        type: ImportErrorType.VALIDATION_FAILED,
        message: error instanceof Error ? error.message : 'Unknown error',
        severity: 'error'
      };

      this.emit('import-failed', operationId, importError);

      // Return failed result
      return {
        id: operationId,
        sessionId: '',
        sourceFileName: file.fileName,
        format: file.format,
        stepsCount: 0,
        completedAt: new Date(),
        importDuration: Date.now() - startTime,
        status: 'failed',
        warnings: [],
        errorMessage: importError.message,
        stats: {
          successfulSteps: 0,
          skippedSteps: 0,
          errorSteps: 0,
          screenshotsCount: 0,
          consoleEventsCount: 0,
          networkRequestsCount: 0
        }
      };
    }
  }

  /**
   * Import multiple files in batch
   */
  async importBatch(files: ImportFile[]): Promise<ImportResult[]> {
    const batchId = this.generateOperationId();
    const results: ImportResult[] = [];

    this.emit('batch-import-started', batchId, files.length);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          const result = await this.importFile(file);
          results.push(result);
        } catch (error) {
          // Continue with other files even if one fails
          results.push({
            id: this.generateOperationId(),
            sessionId: '',
            sourceFileName: file.fileName,
            format: file.format,
            stepsCount: 0,
            completedAt: new Date(),
            importDuration: 0,
            status: 'failed',
            warnings: [],
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            stats: {
              successfulSteps: 0,
              skippedSteps: 0,
              errorSteps: 0,
              screenshotsCount: 0,
              consoleEventsCount: 0,
              networkRequestsCount: 0
            }
          });
        }

        // Emit batch progress
        this.emit('batch-import-progress', batchId, i + 1, files.length);
      }

      this.emit('batch-import-completed', batchId, results);
      return results;

    } catch (error) {
      // Cancel remaining imports
      this.activeImports.forEach(controller => controller.abort());
      this.activeImports.clear();

      throw error;
    }
  }

  /**
   * Cancel an active import
   */
  async cancelImport(operationId: string): Promise<void> {
    const controller = this.activeImports.get(operationId);
    if (controller) {
      controller.abort();
      this.activeImports.delete(operationId);
      this.emit('import-cancelled', operationId);
    }
  }

  /**
   * Get import statistics
   */
  getImportStats(): ImportStats {
    // Implementation would track actual stats
    return {
      totalFiles: 0,
      successfulImports: 0,
      failedImports: 0,
      totalSteps: 0,
      totalScreenshots: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * Validate import file
   */
  private async validateFile(file: ImportFile): Promise<void> {
    // Check file size
    if (file.fileSize > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
    }

    // Check file extension
    const fileExt = extname(file.fileName).toLowerCase();
    const supportedExts = this.config.supportedExtensions[file.format] || [];

    if (!supportedExts.includes(fileExt)) {
      throw new Error(`Unsupported file extension '${fileExt}' for format '${file.format}'`);
    }

    // Validate MIME type if available
    if (file.mimeType) {
      const expectedMimeTypes = {
        [ImportFormat.STEPWISE]: 'application/octet-stream',
        [ImportFormat.JSON]: 'application/json',
        [ImportFormat.MARKDOWN]: 'text/markdown',
        [ImportFormat.HTML]: 'text/html',
        [ImportFormat.ZIP]: 'application/zip'
      };

      const expectedType = expectedMimeTypes[file.format];
      if (expectedType && !file.mimeType.includes(expectedType.split('/')[0])) {
        throw new Error(`File MIME type '${file.mimeType}' does not match expected type for format '${file.format}'`);
      }
    }
  }

  /**
   * Parse file based on format
   */
  private async parseFile(file: ImportFile, operationId: string): Promise<ParsedImportData> {
    this.emitImportProgress(operationId, 'parsing', 10);

    const fileBuffer = await this.getFileBuffer(file);

    switch (file.format) {
      case ImportFormat.STEPWISE:
        return this.parseStepwiseFile(fileBuffer, file.password);

      case ImportFormat.JSON:
        return this.parseJsonFile(fileBuffer);

      case ImportFormat.MARKDOWN:
        return this.parseMarkdownFile(fileBuffer);

      case ImportFormat.HTML:
        return this.parseHtmlFile(fileBuffer);

      case ImportFormat.ZIP:
        return this.parseZipFile(fileBuffer, file.password);

      default:
        throw new Error(`Unsupported import format: ${file.format}`);
    }
  }

  /**
   * Parse native .stepwise file format
   */
  private async parseStepwiseFile(buffer: Buffer, password?: string): Promise<ParsedImportData> {
    try {
      let dataStr = buffer.toString('utf-8');

      // Check if file is encrypted
      let isEncrypted = false;
      try {
        const data = JSON.parse(dataStr);
        if (data.encryption) {
          isEncrypted = true;
          if (!password) {
            throw new Error('Password required for encrypted file');
          }

          // Decrypt the data
          const decryptedData = await decryptWithPassword({
            ciphertext: data.data,
            iv: data.iv,
            tag: data.tag,
            salt: data.salt
          }, password);

          dataStr = decryptedData;
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Password required for encrypted file') {
          throw error;
        }
        // Not encrypted, continue with parsed data
      }

      // Parse the stepwise format
      const stepwiseData: StepwiseFileFormat = JSON.parse(dataStr);

      // Validate format
      if (stepwiseData.type !== 'stepwise-session') {
        throw new Error('Invalid Stepwise file format');
      }

      // Verify checksum if present and encryption is not used
      if (this.config.defaultOptions.validateChecksums && !isEncrypted && stepwiseData.checksum) {
        const calculatedHash = await hashData(dataStr, stepwiseData.checksum.algorithm);
        if (calculatedHash !== stepwiseData.checksum.value) {
          throw new Error('File checksum mismatch - file may be corrupted');
        }
      }

      // Extract screenshots
      const screenshots = new Map<string, Buffer>();
      stepwiseData.session.steps.forEach(step => {
        if (step.screenshot) {
          const screenshotBuffer = Buffer.from(step.screenshot.data, 'base64');
          screenshots.set(step.id, screenshotBuffer);
        }
      });

      // Convert to session format
      const session: Partial<Session> = {
        title: stepwiseData.session.metadata.title,
        description: stepwiseData.session.metadata.description || '',
        createdAt: stepwiseData.session.metadata.createdAt,
        updatedAt: stepwiseData.session.metadata.updatedAt,
        version: stepwiseData.version || '1.0.0',
        metadata: {
          ...stepwiseData.session.metadata,
          importedFrom: 'stepwise',
          exportedAt: stepwiseData.exportedAt
        }
      };

      const warnings: ImportError[] = [];

      // Check version compatibility
      if (stepwiseData.version && this.isVersionUnsupported(stepwiseData.version)) {
        warnings.push({
          type: ImportErrorType.INVALID_VERSION,
          message: `Imported file version ${stepwiseData.version} may not be fully compatible`,
          severity: 'warning'
        });
      }

      return {
        session,
        steps: stepwiseData.session.steps,
        screenshots,
        metadata: {
          format: ImportFormat.STEPWISE,
          version: stepwiseData.version,
          exportedAt: stepwiseData.exportedAt,
          isEncrypted,
          checksum: stepwiseData.checksum
        },
        warnings
      };

    } catch (error) {
      if (error instanceof Error && error.message === 'Password required for encrypted file') {
        throw error;
      }
      throw new Error(`Failed to parse Stepwise file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse JSON export file
   */
  private async parseJsonFile(buffer: Buffer): Promise<ParsedImportData> {
    try {
      const data = JSON.parse(buffer.toString('utf-8'));

      // Check if it's a Stepwise format or generic JSON
      if (data.type === 'stepwise-session') {
        return this.parseStepwiseFile(buffer);
      }

      // Handle generic JSON format - assume it contains session data
      const session: Partial<Session> = {
        title: data.title || 'Imported Session',
        description: data.description || '',
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        version: data.version || '1.0.0',
        metadata: {
          ...data.metadata,
          importedFrom: 'json'
        }
      };

      return {
        session,
        steps: data.steps || [],
        screenshots: new Map(),
        metadata: {
          format: ImportFormat.JSON,
          isEncrypted: false
        },
        warnings: []
      };

    } catch (error) {
      throw new Error(`Failed to parse JSON file: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  /**
   * Parse Markdown file with embedded images
   */
  private async parseMarkdownFile(buffer: Buffer): Promise<ParsedImportData> {
    try {
      const content = buffer.toString('utf-8');

      // Extract metadata from YAML frontmatter or JSON metadata
      const metadata = this.extractMarkdownMetadata(content);

      // Parse steps from markdown
      const steps = this.parseMarkdownSteps(content);

      // Extract embedded images
      const screenshots = new Map<string, Buffer>();
      const imageMatches = content.match(/!\[.*?\]\(data:image\/(png|jpeg|webp);base64,([^)]+)\)/g);

      if (imageMatches) {
        imageMatches.forEach((match, index) => {
          const base64Match = match.match(/base64,([^)]+)/);
          if (base64Match) {
            const imageBuffer = Buffer.from(base64Match[1], 'base64');
            screenshots.set(`step-${index}`, imageBuffer);
          }
        });
      }

      const session: Partial<Session> = {
        title: metadata.title || basename('', '.md') || 'Imported Guide',
        description: metadata.description || this.extractDescriptionFromMarkdown(content),
        createdAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
        updatedAt: metadata.updatedAt ? new Date(metadata.updatedAt) : new Date(),
        version: metadata.version || '1.0.0',
        metadata: {
          ...metadata,
          importedFrom: 'markdown'
        }
      };

      const warnings: ImportError[] = [];

      if (steps.length === 0) {
        warnings.push({
          type: ImportErrorType.MISSING_DATA,
          message: 'No steps found in markdown file',
          severity: 'warning'
        });
      }

      return {
        session,
        steps,
        screenshots,
        metadata: {
          format: ImportFormat.MARKDOWN,
          isEncrypted: false
        },
        warnings
      };

    } catch (error) {
      throw new Error(`Failed to parse Markdown file: ${error instanceof Error ? error.message : 'Invalid markdown'}`);
    }
  }

  /**
   * Parse HTML file with stepwise data
   */
  private async parseHtmlFile(buffer: Buffer): Promise<ParsedImportData> {
    try {
      const content = buffer.toString('utf-8');

      // Look for embedded JSON data
      const jsonMatch = content.match(/<script[^>]*type=["']application\/json["'][^>]*>(.*?)<\/script>/s);
      let stepwiseData = null;

      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1].trim());
          if (jsonData.type === 'stepwise-session') {
            stepwiseData = jsonData;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      if (stepwiseData) {
        return this.parseStepwiseFile(Buffer.from(JSON.stringify(stepwiseData)));
      }

      // Parse steps from HTML content
      const steps = this.parseHtmlSteps(content);

      // Extract embedded images
      const screenshots = new Map<string, Buffer>();
      const imgMatches = content.match(/<img[^>]*src=["']data:image\/(png|jpeg|webp);base64,([^"']+)["'][^>]*>/g);

      if (imgMatches) {
        imgMatches.forEach((match, index) => {
          const base64Match = match.match(/base64,([^"']+)/);
          if (base64Match) {
            const imageBuffer = Buffer.from(base64Match[1], 'base64');
            screenshots.set(`step-${index}`, imageBuffer);
          }
        });
      }

      // Extract metadata from title and meta tags
      const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/s);
      const metaTitleMatch = content.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["'][^>]*>/);
      const metaDescMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/);

      const session: Partial<Session> = {
        title: metaTitleMatch?.[1] || titleMatch?.[1] || 'Imported Guide',
        description: metaDescMatch?.[1] || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        metadata: {
          importedFrom: 'html'
        }
      };

      const warnings: ImportError[] = [];

      if (steps.length === 0) {
        warnings.push({
          type: ImportErrorType.MISSING_DATA,
          message: 'No steps found in HTML file',
          severity: 'warning'
        });
      }

      return {
        session,
        steps,
        screenshots,
        metadata: {
          format: ImportFormat.HTML,
          isEncrypted: false
        },
        warnings
      };

    } catch (error) {
      throw new Error(`Failed to parse HTML file: ${error instanceof Error ? error.message : 'Invalid HTML'}`);
    }
  }

  /**
   * Parse ZIP archive containing stepwise data
   */
  private async parseZipFile(buffer: Buffer, password?: string): Promise<ParsedImportData> {
    // This would require a ZIP library like yauzl or node-zip
    // For now, assume it contains a stepwise.json file
    throw new Error('ZIP import not yet implemented');
  }

  /**
   * Validate imported data
   */
  private async validateImportData(data: ParsedImportData): Promise<{ isValid: boolean; errors: ImportError[] }> {
    const errors: ImportError[] = [];

    // Validate session data
    if (!data.session.title) {
      errors.push({
        type: ImportErrorType.MISSING_DATA,
        message: 'Session title is missing',
        severity: 'error'
      });
    }

    // Validate steps
    if (!data.steps || data.steps.length === 0) {
      errors.push({
        type: ImportErrorType.MISSING_DATA,
        message: 'No steps found in import data',
        severity: 'error'
      });
    }

    if (data.steps.length > this.config.defaultOptions.maxStepsPerImport) {
      errors.push({
        type: ImportErrorType.VALIDATION_FAILED,
        message: `Too many steps: ${data.steps.length} (max: ${this.config.defaultOptions.maxStepsPerImport})`,
        severity: 'error'
      });
    }

    // Validate each step
    data.steps.forEach((step, index) => {
      if (!step || typeof step !== 'object') {
        errors.push({
          type: ImportErrorType.VALIDATION_FAILED,
          message: `Invalid step at index ${index}`,
          severity: 'error'
        });
      }
    });

    // Check for required fields in steps
    const invalidSteps = data.steps.filter((step: any) =>
      !step.id || !step.type || !step.timestamp || !step.sequenceNumber
    );

    if (invalidSteps.length > 0 && this.config.defaultOptions.autoFixIssues) {
      // Auto-fix step issues
      data.steps = data.steps.map((step: any, index: number) => {
        if (!step.id) step.id = `step-${index}`;
        if (!step.sequenceNumber) step.sequenceNumber = index;
        if (!step.timestamp) step.timestamp = new Date();
        return step;
      });
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors
    };
  }

  /**
   * Create session from imported data
   */
  private async createSessionFromImport(data: ParsedImportData, file: ImportFile): Promise<string> {
    // Prepare session creation options
    const createOptions: SessionCreateOptions = {
      title: data.session.title || `Imported: ${file.fileName}`,
      description: data.session.description || `Imported from ${file.fileName}`,
      metadata: {
        ...data.session.metadata,
        importDate: new Date(),
        originalFormat: file.format,
        originalFileName: file.fileName
      }
    };

    // Add tags if present
    if (data.session.tags) {
      createOptions.tags = data.session.tags;
    }

    // Create the session
    const session = await this.sessionManager.createSession(createOptions);

    // Import steps into the session
    // This would depend on the actual StepService implementation
    // For now, we'll assume the session is created with steps

    return session.id;
  }

  /**
   * Helper methods
   */

  private generateOperationId(): string {
    return `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getFileBuffer(file: ImportFile): Promise<Buffer> {
    if (file.file instanceof Buffer) {
      return file.file;
    } else if (file.file instanceof File) {
      return file.file.arrayBuffer().then(buffer => Buffer.from(buffer));
    } else {
      throw new Error('Invalid file type');
    }
  }

  private emitImportProgress(operationId: string, status: ImportProgress['status'], progress: number): void {
    const progressData: ImportProgress = {
      operationId,
      status,
      progress,
      currentOperation: status,
      updatedAt: new Date(),
      details: {
        bytesRead: 0,
        totalBytes: 0,
        stepsParsed: 0,
        totalSteps: 0,
        validSteps: 0,
        invalidSteps: 0
      }
    };

    this.emit('import-progress', progressData);
  }

  private isVersionUnsupported(version: string): boolean {
    // Implement version compatibility check
    // For now, assume all versions are supported
    return false;
  }

  private extractMarkdownMetadata(content: string): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Try YAML frontmatter
    const frontmatterMatch = content.match(/^---\n(.*?)\n---/s);
    if (frontmatterMatch) {
      try {
        // Simple YAML parsing - in production, use a proper YAML parser
        const lines = frontmatterMatch[1].split('\n');
        lines.forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length > 0) {
            const value = valueParts.join(':').trim();
            metadata[key.trim()] = value;
          }
        });
      } catch {
        // Ignore parsing errors
      }
    }

    return metadata;
  }

  private extractDescriptionFromMarkdown(content: string): string {
    // Remove frontmatter
    content = content.replace(/^---\n.*?\n---/s, '');

    // Get first paragraph
    const paragraphs = content.split('\n\n');
    const firstParagraph = paragraphs.find(p => p.trim() && !p.startsWith('#'));

    return firstParagraph ? firstParagraph.trim().substring(0, 200) + '...' : '';
  }

  private parseMarkdownSteps(content: string): unknown[] {
    const steps: unknown[] = [];

    // Look for numbered lists or steps pattern
    const lines = content.split('\n');
    let currentStep: any = null;
    let stepIndex = 0;

    lines.forEach(line => {
      const trimmed = line.trim();

      // Check for step indicators
      if (trimmed.match(/^\d+\./) || trimmed.match(/^Step \d+/i) || trimmed.startsWith('## ')) {
        // Save previous step if exists
        if (currentStep) {
          steps.push(currentStep);
          stepIndex++;
        }

        // Start new step
        currentStep = {
          id: this.config.defaultOptions.preserveOriginalIds ? `step-${stepIndex}` : undefined,
          sequenceNumber: stepIndex,
          type: 'instruction',
          timestamp: new Date(),
          action: {
            type: 'navigate',
            data: {
              description: trimmed.replace(/^\d+\.\s*/, '').replace(/^Step \d+:?\s*/i, '').replace(/^##\s*/, '')
            }
          }
        };
      } else if (currentStep && trimmed) {
        // Add content to current step
        if (!currentStep.action.data.description) {
          currentStep.action.data.description = trimmed;
        } else {
          currentStep.action.data.description += ' ' + trimmed;
        }
      }
    });

    // Add last step
    if (currentStep) {
      steps.push(currentStep);
    }

    return steps;
  }

  private parseHtmlSteps(content: string): unknown[] {
    const steps: unknown[] = [];

    // Look for ordered lists or step-like structures
    const olMatch = content.match(/<ol[^>]*>(.*?)<\/ol>/s);
    if (olMatch) {
      const liMatches = olMatch[1].match(/<li[^>]*>(.*?)<\/li>/gs);
      if (liMatches) {
        liMatches.forEach((li, index) => {
          const text = li.replace(/<[^>]*>/g, '').trim();
          if (text) {
            steps.push({
              id: this.config.defaultOptions.preserveOriginalIds ? `step-${index}` : undefined,
              sequenceNumber: index,
              type: 'instruction',
              timestamp: new Date(),
              action: {
                type: 'navigate',
                data: {
                  description: text
                }
              }
            });
          }
        });
      }
    }

    return steps;
  }

  private countConsoleEvents(steps: unknown[]): number {
    return steps.reduce((count, step: any) => {
      return count + (step.consoleEvents ? step.consoleEvents.length : 0);
    }, 0);
  }

  private countNetworkRequests(steps: unknown[]): number {
    return steps.reduce((count, step: any) => {
      return count + (step.networkRequests ? step.networkRequests.length : 0);
    }, 0);
  }
}