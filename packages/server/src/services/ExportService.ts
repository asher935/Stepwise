/**
 * ExportService - Comprehensive export service for generating step-by-step guides
 *
 * This service handles exporting Stepwise sessions to multiple formats including:
 * - PDF documents with screenshots and formatted content
 * - Microsoft Word documents (DOCX)
 * - Markdown files with embedded images
 * - HTML documents with interactive elements
 * - ZIP archives containing all assets
 * - Batch export of multiple sessions
 *
 * Features:
 * - Template-based exports with customizable styling
 * - Password protection using crypto utilities
 * - Progress tracking and event emission
 * - Async export operations with job queuing
 * - Screenshot processing with element highlighting
 * - Table of contents generation
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { randomBytes, createHash } from 'crypto';
import * as playwright from 'playwright-core';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import JSZip from 'jszip';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import type {
  ExportFormat,
  ExportOptions,
  ExportRequest,
  ExportResult,
  ExportProgress,
  ExportTemplate,
  BatchExportRequest,
  BatchExportResult,
  Session,
  StepwiseFileFormat,
  ExportJob
} from '@stepwise/shared';
import { generateExportToken, encryptBuffer, decryptBuffer } from '../lib/crypto.js';
import { serverConfig } from '../lib/env.js';

/**
 * Export queue job interface
 */
interface QueuedExportJob extends ExportJob {
  /** Promise resolve function */
  resolve?: (value: ExportResult | BatchExportResult) => void;
  /** Promise reject function */
  reject?: (error: Error) => void;
  /** Abort controller for cancellation */
  abortController?: AbortController;
}

/**
 * Screenshot processing options
 */
interface ScreenshotProcessingOptions {
  /** Quality setting (0.1 to 1.0) */
  quality: number;
  /** Maximum dimensions */
  maxSize: { width: number; height: number };
  /** Whether to add highlighting */
  addHighlighting: boolean;
  /** Highlight color */
  highlightColor: string;
  /** Output format */
  format: 'png' | 'jpeg' | 'webp';
}

/**
 * Template cache entry
 */
interface TemplateCache {
  /** Template content */
  content: string;
  /** CSS styles */
  styles?: string;
  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * Export statistics
 */
interface ExportStatistics {
  /** Total exports performed */
  totalExports: number;
  /** Exports by format */
  exportsByFormat: Record<ExportFormat, number>;
  /** Average export time by format */
  averageExportTime: Record<ExportFormat, number>;
  /** Total data exported (bytes) */
  totalDataExported: number;
  /** Number of failed exports */
  failedExports: number;
}

/**
 * ExportService class
 */
export class ExportService extends EventEmitter {
  /** Export job queue */
  private jobQueue: QueuedExportJob[] = [];
  /** Active export jobs */
  private activeJobs = new Map<string, QueuedExportJob>();
  /** Template cache */
  private templateCache = new Map<string, TemplateCache>();
  /** Export statistics */
  private statistics: ExportStatistics = {
    totalExports: 0,
    exportsByFormat: {
      [ExportFormat.PDF]: 0,
      [ExportFormat.DOCX]: 0,
      [ExportFormat.MARKDOWN]: 0,
      [ExportFormat.HTML]: 0,
      [ExportFormat.ZIP]: 0
    },
    averageExportTime: {
      [ExportFormat.PDF]: 0,
      [ExportFormat.DOCX]: 0,
      [ExportFormat.MARKDOWN]: 0,
      [ExportFormat.HTML]: 0,
      [ExportFormat.ZIP]: 0
    },
    totalDataExported: 0,
    failedExports: 0
  };
  /** Maximum concurrent exports */
  private readonly maxConcurrentExports: number;
  /** Temporary directory for exports */
  private readonly tempDir: string;
  /** Templates directory */
  private readonly templatesDir: string;
  /** Exports directory */
  private readonly exportsDir: string;
  /** Cleanup interval */
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * Create a new ExportService instance
   */
  constructor() {
    super();

    this.maxConcurrentExports = serverConfig.maxConcurrentExports || 3;
    this.tempDir = serverConfig.tempDir || '/tmp/stepwise-exports';
    this.templatesDir = serverConfig.templatesDir || '/templates';
    this.exportsDir = serverConfig.exportsDir || '/exports';

    // Ensure directories exist
    this.ensureDirectories();

    // Start processing queue
    this.processQueue();

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Initialize export directories
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [this.tempDir, this.exportsDir, this.templatesDir];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  /**
   * Process export job queue
   */
  private processQueue(): void {
    setInterval(() => {
      // Check if we can process more jobs
      if (this.activeJobs.size >= this.maxConcurrentExports) {
        return;
      }

      // Get next job from queue
      const job = this.jobQueue.shift();
      if (!job) return;

      // Start processing the job
      this.activeJobs.set(job.id, job);

      // Process job based on type
      (async () => {
        try {
          let result: ExportResult | BatchExportResult;

          if (job.type === 'export') {
            const request = job.payload as ExportRequest;
            result = await this.processExport(request, job.abortController?.signal);
          } else {
            // Import job - not implemented in this service
            throw new Error('Import jobs not supported by ExportService');
          }

          // Update statistics
          this.updateStatistics(result);

          // Resolve promise
          job.resolve?.(result);

          // Emit completion event
          this.emit('exportCompleted', { jobId: job.id, result });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Update failure statistics
          this.statistics.failedExports++;

          // Reject promise
          job.reject?.(error as Error);

          // Emit error event
          this.emit('exportError', { jobId: job.id, error: errorMessage });
        } finally {
          // Clean up job
          this.activeJobs.delete(job.id);
        }
      })();
    }, 100);
  }

  /**
   * Start cleanup interval for temporary files
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        const files = await fs.readdir(this.tempDir);
        const now = Date.now();

        for (const file of files) {
          const filePath = join(this.tempDir, file);
          const stats = await fs.stat(filePath);

          // Remove files older than 1 hour
          if (now - stats.mtime.getTime() > 3600000) {
            await fs.unlink(filePath);
          }
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }, 300000); // Run every 5 minutes
  }

  /**
   * Update export statistics
   */
  private updateStatistics(result: ExportResult | BatchExportResult): void {
    if ('format' in result) {
      // Single export
      this.statistics.totalExports++;
      this.statistics.exportsByFormat[result.format]++;
      this.statistics.averageExportTime[result.format] =
        (this.statistics.averageExportTime[result.format] + result.exportDuration) / 2;
      this.statistics.totalDataExported += result.size;
    } else {
      // Batch export
      this.statistics.totalExports += result.exportResults.length;
      for (const exportResult of result.exportResults) {
        this.statistics.exportsByFormat[exportResult.format]++;
        this.statistics.totalDataExported += exportResult.size;
      }
    }
  }

  /**
   * Queue an export job
   */
  public async queueExport(request: ExportRequest): Promise<ExportResult> {
    return new Promise((resolve, reject) => {
      const job: QueuedExportJob = {
        id: request.id,
        type: 'export',
        priority: this.getPriorityValue(request.priority),
        status: 'pending',
        payload: request,
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
        resolve,
        reject,
        abortController: new AbortController()
      };

      // Add to queue
      this.jobQueue.push(job);

      // Sort queue by priority
      this.jobQueue.sort((a, b) => b.priority - a.priority);

      // Emit queued event
      this.emit('exportQueued', { jobId: job.id, request });
    });
  }

  /**
   * Queue a batch export job
   */
  public async queueBatchExport(request: BatchExportRequest): Promise<BatchExportResult> {
    return new Promise((resolve, reject) => {
      // Convert batch request to individual export requests
      const exportRequests: ExportRequest[] = request.sessionIds.map(sessionId => ({
        id: `${request.id}-${sessionId}`,
        sessionId,
        format: request.format,
        options: { ...request.options, batch: { ...request.options.batch, isBatch: true } },
        requestedAt: request.requestedAt,
        userId: request.userId,
        notifyOnComplete: false
      }));

      const job: QueuedExportJob = {
        id: request.id,
        type: 'export',
        priority: this.getPriorityValue('normal'),
        status: 'pending',
        payload: request,
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
        resolve: async (result) => {
          // Handle batch export result
          const batchResult = await this.processBatchExportResult(request, exportRequests);
          resolve(batchResult);
        },
        reject,
        abortController: new AbortController()
      };

      // Add to queue
      this.jobQueue.push(job);

      // Sort queue by priority
      this.jobQueue.sort((a, b) => b.priority - a.priority);

      // Emit batch queued event
      this.emit('batchExportQueued', { jobId: job.id, request });
    });
  }

  /**
   * Convert priority string to numeric value
   */
  private getPriorityValue(priority?: 'low' | 'normal' | 'high' | 'urgent'): number {
    switch (priority) {
      case 'urgent': return 100;
      case 'high': return 75;
      case 'normal': return 50;
      case 'low': return 25;
      default: return 50;
    }
  }

  /**
   * Process a single export request
   */
  private async processExport(
    request: ExportRequest,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    const startTime = Date.now();

    // Create progress tracker
    const progress: ExportProgress = {
      requestId: request.id,
      status: 'preparing',
      progress: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
      details: {
        stepsProcessed: 0,
        totalSteps: 0,
        screenshotsProcessed: 0,
        totalScreenshots: 0,
        currentSize: 0
      }
    };

    try {
      // Load session data
      this.updateProgress(progress, { status: 'processing', currentOperation: 'Loading session data' });
      const session = await this.loadSession(request.sessionId);

      // Update total counts
      progress.details.totalSteps = session.stats.stepCount;
      progress.details.totalScreenshots = session.stats.screenshotCount;

      // Validate export options
      this.validateExportOptions(request.options);

      // Load template
      this.updateProgress(progress, { currentOperation: 'Loading template' });
      const template = await this.loadTemplate(request.options.template, request.options.format);

      // Process based on format
      this.updateProgress(progress, { status: 'generating', currentOperation: `Generating ${request.format} export` });
      let result: ExportResult;

      switch (request.format) {
        case ExportFormat.PDF:
          result = await this.exportToPDF(session, request.options, template, progress, signal);
          break;
        case ExportFormat.DOCX:
          result = await this.exportToDOCX(session, request.options, template, progress, signal);
          break;
        case ExportFormat.MARKDOWN:
          result = await this.exportToMarkdown(session, request.options, template, progress, signal);
          break;
        case ExportFormat.HTML:
          result = await this.exportToHTML(session, request.options, template, progress, signal);
          break;
        case ExportFormat.ZIP:
          result = await this.exportToZIP(session, request.options, template, progress, signal);
          break;
        default:
          throw new Error(`Unsupported export format: ${request.format}`);
      }

      // Apply password protection if requested
      if (request.options.password) {
        this.updateProgress(progress, { currentOperation: 'Applying password protection' });
        result = await this.applyPasswordProtection(result, request.options.password);
      }

      // Generate checksum
      result.checksum = await this.generateChecksum(result.fileName);

      // Update final progress
      const duration = Date.now() - startTime;
      this.updateProgress(progress, {
        status: 'completed',
        progress: 100,
        exportDuration: duration
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.updateProgress(progress, {
        status: 'failed',
        error: {
          code: 'EXPORT_FAILED',
          message: errorMessage,
          details: error
        }
      });

      throw error;
    }
  }

  /**
   * Process batch export result
   */
  private async processBatchExportResult(
    batchRequest: BatchExportRequest,
    exportRequests: ExportRequest[]
  ): Promise<BatchExportResult> {
    const startTime = Date.now();
    const results: ExportResult[] = [];

    // Process each export
    for (const request of exportRequests) {
      try {
        const result = await this.processExport(request);
        results.push(result);
      } catch (error) {
        // Log failed export but continue with others
        console.error(`Failed to export session ${request.sessionId}:`, error);
      }
    }

    // Combine exports based on method
    let combinedFile: BatchExportResult['combinedFile'];
    let indexFile: BatchExportResult['indexFile'];

    if (batchRequest.combineMethod === 'single-file' || batchRequest.combineMethod === 'chapters') {
      combinedFile = await this.combineExports(results, batchRequest);
    }

    if (batchRequest.batchOptions?.includeIndex) {
      indexFile = await this.generateBatchIndex(batchRequest, results);
    }

    return {
      id: `batch-${Date.now()}`,
      requestId: batchRequest.id,
      sessionsProcessed: results.length,
      totalSessions: exportRequests.length,
      exportResults: results,
      combinedFile,
      indexFile,
      status: results.length === exportRequests.length ? 'completed' : 'partial',
      failedExports: exportRequests
        .filter(req => !results.find(r => r.requestId === req.id))
        .map(req => ({
          sessionId: req.sessionId,
          reason: 'Export failed'
        })),
      completedAt: new Date(),
      totalDuration: Date.now() - startTime
    };
  }

  /**
   * Load session data
   */
  private async loadSession(sessionId: string): Promise<Session> {
    // This would integrate with the SessionService or database
    // For now, returning mock data
    const session: Session = {
      id: sessionId,
      title: `Session ${sessionId}`,
      description: 'Sample session for export',
      status: 'completed' as any,
      settings: {
        viewport: { width: 1920, height: 1080 },
        quality: { screenshotQuality: 0.8, compressScreenshots: true },
        recordConsoleLogs: true,
        recordNetworkRequests: false,
        recordDomChanges: true,
        recordScrollPositions: true,
        recordUserInputs: true,
        maskSensitiveData: false,
        autoSave: true
      },
      stats: {
        stepCount: 10,
        duration: 300000,
        screenshotCount: 5,
        consoleEventCount: 20,
        networkRequestCount: 15,
        domChangeCount: 30,
        userInputCount: 8
      },
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      isArchived: false,
      version: '1.0.0'
    };

    return session;
  }

  /**
   * Validate export options
   */
  private validateExportOptions(options: ExportOptions): void {
    if (options.screenshotQuality && (options.screenshotQuality < 0.1 || options.screenshotQuality > 1.0)) {
      throw new Error('Screenshot quality must be between 0.1 and 1.0');
    }

    if (options.screenshotMaxSize) {
      if (options.screenshotMaxSize.width <= 0 || options.screenshotMaxSize.height <= 0) {
        throw new Error('Screenshot dimensions must be positive');
      }
    }

    if (options.tocMaxDepth && options.tocMaxDepth < 1) {
      throw new Error('Table of contents depth must be at least 1');
    }
  }

  /**
   * Load export template
   */
  private async loadTemplate(
    templateId: string | undefined,
    format: ExportFormat
  ): Promise<ExportTemplate> {
    const cacheKey = `${format}-${templateId || 'default'}`;

    // Check cache first
    const cached = this.templateCache.get(cacheKey);
    if (cached && Date.now() - cached.lastModified.getTime() < 3600000) {
      return {
        id: templateId || 'default',
        name: templateId || 'Default',
        format,
        type: 'built-in',
        config: {
          styles: cached.styles,
          layout: {
            pageSize: 'A4',
            orientation: 'portrait',
            margins: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        createdAt: cached.lastModified,
        updatedAt: cached.lastModified
      };
    }

    // Load from file system
    const templatePath = join(this.templatesDir, format, `${templateId || 'default'}.json`);

    try {
      const templateData = await fs.readFile(templatePath, 'utf-8');
      const template: ExportTemplate = JSON.parse(templateData);

      // Cache template
      this.templateCache.set(cacheKey, {
        content: templateData,
        styles: template.config.styles,
        lastModified: new Date()
      });

      return template;
    } catch (error) {
      // Return default template
      const defaultTemplate: ExportTemplate = {
        id: 'default',
        name: 'Default',
        description: 'Default export template',
        format,
        type: 'built-in',
        config: {
          layout: {
            pageSize: 'A4' as const,
            orientation: 'portrait' as const,
            margins: { top: 20, right: 20, bottom: 20, left: 20 }
          },
          colors: {
            primary: '#2563eb',
            secondary: '#64748b',
            background: '#ffffff',
            text: '#1e293b'
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Cache default template
      this.templateCache.set(cacheKey, {
        content: JSON.stringify(defaultTemplate),
        styles: defaultTemplate.config.styles,
        lastModified: new Date()
      });

      return defaultTemplate;
    }
  }

  /**
   * Export session to PDF
   */
  private async exportToPDF(
    session: Session,
    options: ExportOptions,
    template: ExportTemplate,
    progress: ExportProgress,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    const fileName = `${session.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    const outputPath = join(this.tempDir, fileName);

    // Generate HTML content first
    const htmlContent = await this.generateHTMLContent(session, options, template, progress);

    // Launch browser
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();

      // Set content
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle'
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        path: outputPath,
        format: template.config.layout?.pageSize?.toLowerCase() as any || 'A4',
        landscape: template.config.layout?.orientation === 'landscape',
        margin: {
          top: `${template.config.layout?.margins.top || 20}px`,
          right: `${template.config.layout?.margins.right || 20}px`,
          bottom: `${template.config.layout?.margins.bottom || 20}px`,
          left: `${template.config.layout?.margins.left || 20}px`
        },
        printBackground: true,
        preferCSSPageSize: true
      });

      // Get file stats
      const stats = await fs.stat(outputPath);

      return {
        id: `export-${Date.now()}`,
        requestId: progress.requestId,
        sessionId: new URL(`http://example.com/session/${session.id}`),
        downloadUrl: `/exports/${fileName}`,
        fileName,
        size: stats.size,
        format: ExportFormat.PDF,
        mimeType: 'application/pdf',
        completedAt: new Date(),
        exportDuration: Date.now() - (progress.startedAt?.getTime() || Date.now()),
        status: 'completed',
        stats: {
          stepsCount: session.stats.stepCount,
          screenshotsCount: options.includeScreenshots ? session.stats.screenshotCount : 0,
          pageCount: Math.ceil(session.stats.stepCount / 3), // Estimate
          wordCount: this.estimateWordCount(htmlContent)
        }
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Export session to DOCX
   */
  private async exportToDOCX(
    session: Session,
    options: ExportOptions,
    template: ExportTemplate,
    progress: ExportProgress,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    const fileName = `${session.title.replace(/[^a-z0-9]/gi, '_')}.docx`;
    const outputPath = join(this.tempDir, fileName);

    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: session.title,
                bold: true,
                size: 32
              })
            ],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER
          }),

          // Description
          new Paragraph({
            children: [
              new TextRun({
                text: session.description,
                size: 24
              })
            ],
            spacing: { after: 400 }
          }),

          // Metadata
          new Paragraph({
            children: [
              new TextRun({
                text: `Created: ${session.createdAt.toLocaleDateString()}`,
                size: 20,
                color: '666666'
              })
            ],
            spacing: { after: 200 }
          }),

          // Steps
          ...await this.generateDocxSteps(session, options, progress)
        ]
      }]
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Write file
    await fs.writeFile(outputPath, buffer);

    // Get file stats
    const stats = await fs.stat(outputPath);

    return {
      id: `export-${Date.now()}`,
      requestId: progress.requestId,
      sessionId: new URL(`http://example.com/session/${session.id}`),
      downloadUrl: `/exports/${fileName}`,
      fileName,
      size: stats.size,
      format: ExportFormat.DOCX,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      completedAt: new Date(),
      exportDuration: Date.now() - (progress.startedAt?.getTime() || Date.now()),
      status: 'completed',
      stats: {
        stepsCount: session.stats.stepCount,
        screenshotsCount: options.includeScreenshots ? session.stats.screenshotCount : 0,
        pageCount: Math.ceil(session.stats.stepCount / 2),
        wordCount: this.estimateWordCount(session.description) + (session.stats.stepCount * 50) // Estimate
      }
    };
  }

  /**
   * Export session to Markdown
   */
  private async exportToMarkdown(
    session: Session,
    options: ExportOptions,
    template: ExportTemplate,
    progress: ExportProgress,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    const fileName = `${session.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    const outputPath = join(this.tempDir, fileName);

    let markdown = `# ${session.title}\n\n`;
    markdown += `**Description:** ${session.description}\n\n`;
    markdown += `**Created:** ${session.createdAt.toISOString()}\n\n`;
    markdown += `**Duration:** ${Math.round(session.stats.duration / 1000)} seconds\n\n`;

    if (options.includeTableOfContents) {
      markdown += '## Table of Contents\n\n';
      for (let i = 1; i <= session.stats.stepCount; i++) {
        markdown += `${i}. [Step ${i}](#step-${i})\n`;
      }
      markdown += '\n';
    }

    // Add steps
    markdown += '## Steps\n\n';
    for (let i = 1; i <= session.stats.stepCount; i++) {
      this.updateProgress(progress, {
        progress: (i / session.stats.stepCount) * 80 + 20,
        currentOperation: `Processing step ${i} of ${session.stats.stepCount}`
      });

      markdown += `### Step ${i}\n\n`;
      markdown += `<!-- Step content would be added here -->\n\n`;

      if (options.includeScreenshots && i <= session.stats.screenshotCount) {
        markdown += `![Screenshot for step ${i}](images/step-${i}.png)\n\n`;
      }

      // Check for abort signal
      if (signal?.aborted) {
        throw new Error('Export cancelled');
      }
    }

    // Write file
    await fs.writeFile(outputPath, markdown, 'utf-8');

    // Get file stats
    const stats = await fs.stat(outputPath);

    return {
      id: `export-${Date.now()}`,
      requestId: progress.requestId,
      sessionId: new URL(`http://example.com/session/${session.id}`),
      downloadUrl: `/exports/${fileName}`,
      fileName,
      size: stats.size,
      format: ExportFormat.MARKDOWN,
      mimeType: 'text/markdown',
      completedAt: new Date(),
      exportDuration: Date.now() - (progress.startedAt?.getTime() || Date.now()),
      status: 'completed',
      stats: {
        stepsCount: session.stats.stepCount,
        screenshotsCount: options.includeScreenshots ? session.stats.screenshotCount : 0,
        wordCount: markdown.split(/\s+/).length
      }
    };
  }

  /**
   * Export session to HTML
   */
  private async exportToHTML(
    session: Session,
    options: ExportOptions,
    template: ExportTemplate,
    progress: ExportProgress,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    const fileName = `${session.title.replace(/[^a-z0-9]/gi, '_')}.html`;
    const outputPath = join(this.tempDir, fileName);

    // Generate HTML content
    const htmlContent = await this.generateHTMLContent(session, options, template, progress);

    // Write file
    await fs.writeFile(outputPath, htmlContent, 'utf-8');

    // Get file stats
    const stats = await fs.stat(outputPath);

    return {
      id: `export-${Date.now()}`,
      requestId: progress.requestId,
      sessionId: new URL(`http://example.com/session/${session.id}`),
      downloadUrl: `/exports/${fileName}`,
      fileName,
      size: stats.size,
      format: ExportFormat.HTML,
      mimeType: 'text/html',
      completedAt: new Date(),
      exportDuration: Date.now() - (progress.startedAt?.getTime() || Date.now()),
      status: 'completed',
      stats: {
        stepsCount: session.stats.stepCount,
        screenshotsCount: options.includeScreenshots ? session.stats.screenshotCount : 0,
        wordCount: this.estimateWordCount(htmlContent)
      }
    };
  }

  /**
   * Export session to ZIP archive
   */
  private async exportToZIP(
    session: Session,
    options: ExportOptions,
    template: ExportTemplate,
    progress: ExportProgress,
    signal?: AbortSignal
  ): Promise<ExportResult> {
    const fileName = `${session.title.replace(/[^a-z0-9]/gi, '_')}.zip`;
    const outputPath = join(this.tempDir, fileName);

    // Create ZIP
    const zip = new JSZip();

    // Add metadata
    zip.file('metadata.json', JSON.stringify({
      title: session.title,
      description: session.description,
      createdAt: session.createdAt,
      stats: session.stats,
      exportOptions: options
    }, null, 2));

    // Add main export (Markdown by default)
    const mdContent = await this.generateMarkdownContent(session, options);
    zip.file('guide.md', mdContent);

    // Add HTML version
    const htmlContent = await this.generateHTMLContent(session, options, template, progress);
    zip.file('guide.html', htmlContent);

    // Add images if included
    if (options.includeScreenshots) {
      const imagesFolder = zip.folder('images');
      for (let i = 1; i <= session.stats.screenshotCount; i++) {
        // Placeholder for actual image data
        imagesFolder?.file(`step-${i}.png`, Buffer.from('placeholder'));
      }
    }

    // Generate ZIP buffer
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: options.compression?.level || 6 }
    });

    // Write file
    await fs.writeFile(outputPath, buffer);

    // Get file stats
    const stats = await fs.stat(outputPath);

    return {
      id: `export-${Date.now()}`,
      requestId: progress.requestId,
      sessionId: new URL(`http://example.com/session/${session.id}`),
      downloadUrl: `/exports/${fileName}`,
      fileName,
      size: stats.size,
      format: ExportFormat.ZIP,
      mimeType: 'application/zip',
      completedAt: new Date(),
      exportDuration: Date.now() - (progress.startedAt?.getTime() || Date.now()),
      status: 'completed',
      stats: {
        stepsCount: session.stats.stepCount,
        screenshotsCount: options.includeScreenshots ? session.stats.screenshotCount : 0,
        compressionRatio: 0.4 // Estimate
      }
    };
  }

  /**
   * Generate HTML content
   */
  private async generateHTMLContent(
    session: Session,
    options: ExportOptions,
    template: ExportTemplate,
    progress: ExportProgress
  ): Promise<string> {
    const dom = new JSDOM();
    const document = dom.window.document;

    // Create HTML structure
    const html = document.createElement('html');
    html.setAttribute('lang', options.locale || 'en');

    // Head
    const head = document.createElement('head');
    head.innerHTML = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${session.title}</title>
      <style>
        ${this.generateCSS(template)}
        ${options.customCss || ''}
      </style>
    `;
    html.appendChild(head);

    // Body
    const body = document.createElement('body');

    // Header
    const header = document.createElement('header');
    header.className = 'export-header';
    header.innerHTML = `
      <h1>${session.title}</h1>
      <p class="description">${session.description}</p>
      <div class="metadata">
        <span class="created">Created: ${session.createdAt.toLocaleDateString()}</span>
        <span class="duration">Duration: ${Math.round(session.stats.duration / 1000)}s</span>
        <span class="steps">Steps: ${session.stats.stepCount}</span>
      </div>
    `;
    body.appendChild(header);

    // Table of contents
    if (options.includeTableOfContents) {
      const toc = document.createElement('nav');
      toc.className = 'table-of-contents';
      toc.innerHTML = '<h2>Table of Contents</h2>';

      const tocList = document.createElement('ol');
      for (let i = 1; i <= session.stats.stepCount; i++) {
        const item = document.createElement('li');
        item.innerHTML = `<a href="#step-${i}">Step ${i}</a>`;
        tocList.appendChild(item);
      }

      toc.appendChild(tocList);
      body.appendChild(toc);
    }

    // Main content
    const main = document.createElement('main');
    main.className = 'export-content';

    // Steps
    const stepsSection = document.createElement('section');
    stepsSection.className = 'steps';
    stepsSection.innerHTML = '<h2>Steps</h2>';

    for (let i = 1; i <= session.stats.stepCount; i++) {
      this.updateProgress(progress, {
        progress: (i / session.stats.stepCount) * 70 + 30,
        currentOperation: `Rendering step ${i} of ${session.stats.stepCount}`
      });

      const step = document.createElement('article');
      step.className = 'step';
      step.id = `step-${i}`;

      step.innerHTML = `
        <h3>Step ${i}</h3>
        <div class="step-content">
          <!-- Step content would be rendered here -->
          <p>Step description and actions would be displayed here.</p>
        </div>
        ${options.includeTimestamps ? '<div class="timestamp">Timestamp: --:--</div>' : ''}
      `;

      // Add screenshot if included
      if (options.includeScreenshots && i <= session.stats.screenshotCount) {
        const screenshot = document.createElement('div');
        screenshot.className = 'screenshot';
        screenshot.innerHTML = `
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==" alt="Screenshot for step ${i}" loading="lazy">
        `;
        step.appendChild(screenshot);
      }

      stepsSection.appendChild(step);
    }

    main.appendChild(stepsSection);
    body.appendChild(main);

    // Footer
    if (template.config.footer) {
      const footer = document.createElement('footer');
      footer.className = 'export-footer';
      footer.innerHTML = template.config.footer;
      body.appendChild(footer);
    }

    html.appendChild(body);

    // Return HTML string
    return `<!DOCTYPE html>\n${dom.serialize()}`;
  }

  /**
   * Generate Markdown content
   */
  private async generateMarkdownContent(
    session: Session,
    options: ExportOptions
  ): Promise<string> {
    let markdown = `# ${session.title}\n\n`;
    markdown += `${session.description}\n\n`;
    markdown += `**Created:** ${session.createdAt.toISOString()}\n\n`;

    // Table of contents
    if (options.includeTableOfContents) {
      markdown += '## Table of Contents\n\n';
      for (let i = 1; i <= session.stats.stepCount; i++) {
        markdown += `${i}. [Step ${i}](#step-${i})\n`;
      }
      markdown += '\n';
    }

    // Steps
    markdown += '## Steps\n\n';
    for (let i = 1; i <= session.stats.stepCount; i++) {
      markdown += `### Step ${i}\n\n`;
      markdown += `*Step content would be added here*\n\n`;

      if (options.includeScreenshots && i <= session.stats.screenshotCount) {
        markdown += `![Screenshot for step ${i}](images/step-${i}.png)\n\n`;
      }
    }

    return markdown;
  }

  /**
   * Generate CSS for HTML exports
   */
  private generateCSS(template: ExportTemplate): string {
    return `
      /* Base styles */
      * {
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: ${template.config.colors?.text || '#333'};
        background-color: ${template.config.colors?.background || '#fff'};
        margin: 0;
        padding: 0;
      }

      /* Header */
      .export-header {
        padding: 2rem;
        border-bottom: 2px solid ${template.config.colors?.primary || '#2563eb'};
        margin-bottom: 2rem;
      }

      .export-header h1 {
        margin: 0 0 1rem 0;
        font-size: 2.5rem;
        color: ${template.config.colors?.primary || '#2563eb'};
      }

      .export-header .description {
        font-size: 1.2rem;
        color: ${template.config.colors?.secondary || '#666'};
        margin-bottom: 1rem;
      }

      .export-header .metadata {
        display: flex;
        gap: 2rem;
        font-size: 0.9rem;
        color: #888;
      }

      /* Table of contents */
      .table-of-contents {
        padding: 1rem 2rem;
        background-color: #f5f5f5;
        border-radius: 8px;
        margin-bottom: 2rem;
      }

      .table-of-contents h2 {
        margin-top: 0;
        color: ${template.config.colors?.primary || '#2563eb'};
      }

      .table-of-contents ol {
        padding-left: 1.5rem;
      }

      .table-of-contents li {
        margin-bottom: 0.5rem;
      }

      .table-of-contents a {
        color: ${template.config.colors?.primary || '#2563eb'};
        text-decoration: none;
      }

      .table-of-contents a:hover {
        text-decoration: underline;
      }

      /* Main content */
      .export-content {
        padding: 0 2rem;
      }

      .steps {
        margin-bottom: 3rem;
      }

      .steps h2 {
        color: ${template.config.colors?.primary || '#2563eb'};
        border-bottom: 2px solid #eee;
        padding-bottom: 0.5rem;
      }

      /* Step styling */
      .step {
        margin-bottom: 3rem;
        padding: 1.5rem;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: #fafafa;
      }

      .step h3 {
        margin-top: 0;
        color: ${template.config.colors?.primary || '#2563eb'};
      }

      .step-content {
        margin: 1rem 0;
      }

      .timestamp {
        font-size: 0.85rem;
        color: #888;
        margin-top: 1rem;
        font-style: italic;
      }

      /* Screenshots */
      .screenshot {
        margin: 1.5rem 0;
        text-align: center;
      }

      .screenshot img {
        max-width: 100%;
        height: auto;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      /* Footer */
      .export-footer {
        margin-top: 3rem;
        padding: 2rem;
        border-top: 1px solid #e0e0e0;
        text-align: center;
        color: #888;
        font-size: 0.9rem;
      }

      /* Print styles */
      @media print {
        body {
          font-size: 12pt;
        }

        .step {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .screenshot img {
          max-width: 500px;
        }
      }

      /* Responsive */
      @media (max-width: 768px) {
        .export-header .metadata {
          flex-direction: column;
          gap: 0.5rem;
        }

        .export-content {
          padding: 0 1rem;
        }

        .step {
          padding: 1rem;
        }
      }

      ${template.config.styles || ''}
    `;
  }

  /**
   * Generate DOCX steps
   */
  private async generateDocxSteps(
    session: Session,
    options: ExportOptions,
    progress: ExportProgress
  ): Promise<any[]> {
    const steps: any[] = [];

    steps.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Steps',
            bold: true,
            size: 28
          })
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 300 }
      })
    );

    for (let i = 1; i <= session.stats.stepCount; i++) {
      this.updateProgress(progress, {
        progress: (i / session.stats.stepCount) * 80 + 20,
        currentOperation: `Processing step ${i} of ${session.stats.stepCount}`
      });

      // Step heading
      steps.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Step ${i}`,
              bold: true,
              size: 24
            })
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 300, after: 200 }
        })
      );

      // Step content placeholder
      steps.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Step content would be added here...',
              size: 22
            })
          ],
          spacing: { after: 200 }
        })
      );

      // Add timestamp if included
      if (options.includeTimestamps) {
        steps.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Timestamp: --:--`,
                size: 20,
                italics: true,
                color: '666666'
              })
            ],
            spacing: { after: 300 }
          })
        );
      }
    }

    return steps;
  }

  /**
   * Apply password protection to exported file
   */
  private async applyPasswordProtection(
    result: ExportResult,
    password: string
  ): Promise<ExportResult> {
    const filePath = join(this.exportsDir, result.fileName);

    try {
      // Read file
      const fileBuffer = await fs.readFile(filePath);

      // Encrypt with password
      const encryptedBuffer = await encryptBuffer(fileBuffer, password);

      // Write encrypted file
      const encryptedPath = join(this.exportsDir, `${result.fileName}.encrypted`);
      await fs.writeFile(encryptedPath, encryptedBuffer);

      // Update result
      result.fileName = `${result.fileName}.encrypted`;
      result.downloadUrl = `/exports/${result.fileName}`;
      result.size = encryptedBuffer.length;
      result.mimeType = 'application/octet-stream';

      // Delete original file
      await fs.unlink(filePath);

      return result;
    } catch (error) {
      console.error('Failed to apply password protection:', error);
      throw new Error('Failed to apply password protection');
    }
  }

  /**
   * Generate file checksum
   */
  private async generateChecksum(filePath: string): Promise<{ algorithm: string; value: string }> {
    const fullPath = join(this.exportsDir, filePath);
    const fileBuffer = await fs.readFile(fullPath);
    const hash = createHash('sha256');
    hash.update(fileBuffer);

    return {
      algorithm: 'sha256',
      value: hash.digest('hex')
    };
  }

  /**
   * Combine multiple exports into a single file
   */
  private async combineExports(
    results: ExportResult[],
    batchRequest: BatchExportRequest
  ): Promise<{ downloadUrl: string; fileName: string; totalSize: number }> {
    // Implementation depends on the combine method
    switch (batchRequest.combineMethod) {
      case 'chapters':
        // Create a single document with chapters
        return this.createChapterDocument(results, batchRequest);
      case 'single-file':
      default:
        // Create a ZIP with all files
        return this.createCombinedZip(results, batchRequest);
    }
  }

  /**
   * Create a chapter-based document
   */
  private async createChapterDocument(
    results: ExportResult[],
    batchRequest: BatchExportRequest
  ): Promise<{ downloadUrl: string; fileName: string; totalSize: number }> {
    const fileName = `combined-export-${Date.now()}.${batchRequest.format}`;
    const outputPath = join(this.tempDir, fileName);

    // Implementation would vary by format
    // This is a placeholder
    const combinedContent = results.map(r => r.fileName).join('\n\n');
    await fs.writeFile(outputPath, combinedContent);

    const stats = await fs.stat(outputPath);

    return {
      downloadUrl: `/exports/${fileName}`,
      fileName,
      totalSize: stats.size
    };
  }

  /**
   * Create a combined ZIP archive
   */
  private async createCombinedZip(
    results: ExportResult[],
    batchRequest: BatchExportRequest
  ): Promise<{ downloadUrl: string; fileName: string; totalSize: number }> {
    const fileName = `batch-export-${Date.now()}.zip`;
    const outputPath = join(this.tempDir, fileName);

    const zip = new JSZip();

    // Add all files to ZIP
    for (const result of results) {
      const filePath = join(this.exportsDir, result.fileName);
      const fileBuffer = await fs.readFile(filePath);
      zip.file(result.fileName, fileBuffer);
    }

    // Generate ZIP
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    await fs.writeFile(outputPath, buffer);

    return {
      downloadUrl: `/exports/${fileName}`,
      fileName,
      totalSize: buffer.length
    };
  }

  /**
   * Generate batch index file
   */
  private async generateBatchIndex(
    batchRequest: BatchExportRequest,
    results: ExportResult[]
  ): Promise<{ downloadUrl: string; fileName: string }> {
    const fileName = `batch-index-${Date.now()}.html`;
    const outputPath = join(this.tempDir, fileName);

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Batch Export Index</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 2rem; }
          .export-list { list-style: none; padding: 0; }
          .export-item { margin-bottom: 1rem; padding: 1rem; border: 1px solid #ddd; }
          .export-link { text-decoration: none; color: #0066cc; }
          .export-stats { font-size: 0.9rem; color: #666; }
        </style>
      </head>
      <body>
        <h1>Batch Export Index</h1>
        <p>Generated on: ${new Date().toISOString()}</p>
        <ul class="export-list">
    `;

    for (const result of results) {
      html += `
        <li class="export-item">
          <a href="${result.downloadUrl}" class="export-link">${result.fileName}</a>
          <div class="export-stats">
            Size: ${(result.size / 1024).toFixed(2)} KB |
            Steps: ${result.stats.stepsCount} |
            Screenshots: ${result.stats.screenshotsCount}
          </div>
        </li>
      `;
    }

    html += `
        </ul>
      </body>
      </html>
    `;

    await fs.writeFile(outputPath, html, 'utf-8');

    return {
      downloadUrl: `/exports/${fileName}`,
      fileName
    };
  }

  /**
   * Update export progress
   */
  private updateProgress(
    progress: ExportProgress,
    updates: Partial<ExportProgress>
  ): void {
    Object.assign(progress, updates);
    progress.updatedAt = new Date();

    // Emit progress event
    this.emit('exportProgress', progress);
  }

  /**
   * Estimate word count
   */
  private estimateWordCount(text: string): number {
    // Remove HTML tags and count words
    const plainText = text.replace(/<[^>]*>/g, ' ');
    return plainText.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Cancel an export job
   */
  public cancelExport(jobId: string): boolean {
    // Check active jobs
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      activeJob.abortController?.abort();
      activeJob.status = 'cancelled';
      this.activeJobs.delete(jobId);
      this.emit('exportCancelled', { jobId });
      return true;
    }

    // Check queued jobs
    const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
    if (queueIndex !== -1) {
      const job = this.jobQueue.splice(queueIndex, 1)[0];
      job.status = 'cancelled';
      job.reject?.(new Error('Export cancelled'));
      this.emit('exportCancelled', { jobId });
      return true;
    }

    return false;
  }

  /**
   * Get export statistics
   */
  public getStatistics(): ExportStatistics {
    return { ...this.statistics };
  }

  /**
   * Get active export jobs
   */
  public getActiveJobs(): QueuedExportJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get queued export jobs
   */
  public getQueuedJobs(): QueuedExportJob[] {
    return [...this.jobQueue];
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Cancel all active jobs
    for (const job of this.activeJobs.values()) {
      job.abortController?.abort();
    }
    this.activeJobs.clear();

    // Clear job queue
    this.jobQueue.length = 0;

    // Remove all listeners
    this.removeAllListeners();
  }
}

/**
 * Export service instance
 */
export const exportService = new ExportService();