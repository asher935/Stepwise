/**
 * Example usage of export/import types for the Stepwise application
 *
 * This file demonstrates how to use the export and import types defined in export.ts
 */

import {
  ExportFormat,
  ImportFormat,
  isValidExportFormat,
  isExportOptions,
  getDefaultExportOptions,
  estimateExportFileSize
} from '../export';
import type {
  ExportOptions,
  ExportRequest,
  ExportResult,
  ImportFile,
  ImportResult,
  StepwiseFileFormat,
  ExportProgress,
  ImportProgress,
  BatchExportRequest,
  BatchExportResult,
  ExportTemplate,
  TemplateCreateRequest
} from '../export';

/**
 * Example: Create a PDF export request with custom options
 */
export function createPdfExportRequest(sessionId: string, userId?: string): ExportRequest {
  const options: ExportOptions = {
    format: ExportFormat.PDF,
    includeScreenshots: true,
    screenshotQuality: 0.9,
    template: 'professional-pdf-template',
    password: 'secure-password-123',
    includeConsoleLogs: false,
    includeNetworkRequests: false,
    includeDomChanges: false,
    includeUserInputs: true,
    includeMetadata: true,
    includeTimestamps: true,
    timestampFormat: 'ISO',
    groupByPages: true,
    includeTableOfContents: true,
    tocMaxDepth: 3,
    includeAnnotations: true,
    watermark: {
      enabled: true,
      text: 'Confidential - Stepwise Recording',
      position: 'bottom-right',
      opacity: 0.3
    },
    customMetadata: {
      'Exported By': 'Stepwise System',
      'Export Purpose': 'Documentation'
    }
  };

  return {
    id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sessionId,
    format: ExportFormat.PDF,
    options,
    requestedAt: new Date(),
    userId,
    notifyOnComplete: true,
    priority: 'normal',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  };
}

/**
 * Example: Create a batch export request for multiple sessions
 */
export function createBatchExportRequest(
  sessionIds: string[],
  userId?: string
): BatchExportRequest {
  const options: ExportOptions = {
    format: ExportFormat.HTML,
    includeScreenshots: true,
    screenshotQuality: 0.8,
    includeConsoleLogs: true,
    includeNetworkRequests: false,
    includeDomChanges: false,
    includeUserInputs: true,
    includeMetadata: true,
    includeTimestamps: true,
    timestampFormat: 'ISO',
    groupByPages: false,
    includeTableOfContents: false,
    includeAnnotations: true,
    customCss: `
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
      .step { margin-bottom: 2rem; padding: 1rem; border: 1px solid #e0e0e0; border-radius: 8px; }
      .screenshot { max-width: 100%; height: auto; border-radius: 4px; }
      .timestamp { color: #666; font-size: 0.9em; }
    `,
    minify: false
  };

  return {
    id: `batch-export-${Date.now()}`,
    sessionIds,
    format: ExportFormat.HTML,
    options,
    combineMethod: 'separate-files',
    batchOptions: {
      includeIndex: true,
      fileNaming: 'session-title',
      includeMetadataInFilename: true
    },
    requestedAt: new Date(),
    userId
  };
}

/**
 * Example: Create an import file object
 */
export function createImportFile(
  file: File,
  password?: string
): ImportFile {
  // Determine format from file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  let format: ImportFormat;

  switch (extension) {
    case 'stepwise':
      format = ImportFormat.STEPWISE;
      break;
    case 'json':
      format = ImportFormat.JSON;
      break;
    case 'md':
    case 'markdown':
      format = ImportFormat.MARKDOWN;
      break;
    case 'html':
    case 'htm':
      format = ImportFormat.HTML;
      break;
    case 'zip':
      format = ImportFormat.ZIP;
      break;
    default:
      throw new Error(`Unsupported file format: ${extension}`);
  }

  return {
    file,
    format,
    password,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    lastModified: new Date(file.lastModified)
  };
}

/**
 * Example: Create a custom export template
 */
export function createCustomTemplate(): TemplateCreateRequest {
  return {
    name: 'Technical Documentation Template',
    description: 'Template optimized for technical documentation with code highlighting',
    format: ExportFormat.HTML,
    config: {
      styles: `
        body {
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          line-height: 1.6;
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          background-color: #f8f9fa;
        }
        .step {
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .step-number {
          background: #007bff;
          color: white;
          border-radius: 50%;
          width: 2rem;
          height: 2rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }
        .screenshot {
          border: 1px solid #dee2e6;
          border-radius: 4px;
          max-width: 100%;
          height: auto;
          margin: 1rem 0;
        }
        .code-block {
          background: #f1f3f4;
          border-left: 4px solid #007bff;
          padding: 1rem;
          margin: 1rem 0;
          overflow-x: auto;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 0.9em;
        }
        .console-log {
          background: #000;
          color: #00ff00;
          padding: 0.5rem;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 0.85em;
          overflow-x: auto;
          margin: 0.5rem 0;
        }
      `,
      header: `
        <header style="text-align: center; margin-bottom: 3rem; padding: 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px;">
          <h1 style="margin: 0; font-size: 2.5rem;">{{sessionTitle}}</h1>
          <p style="margin: 1rem 0 0 0; opacity: 0.9;">{{sessionDescription}}</p>
          <p style="margin: 0.5rem 0 0 0; opacity: 0.8;">Generated on {{exportDate}}</p>
        </header>
      `,
      footer: `
        <footer style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 0.9em;">
          <p>Generated by <strong>Stepwise</strong> - Browser Recording & Documentation Tool</p>
          <p>Total Steps: {{stepCount}} | Duration: {{sessionDuration}}</p>
        </footer>
      `,
      stepTemplate: `
        <div class="step" id="step-{{stepNumber}}">
          <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span class="step-number">{{stepNumber}}</span>
            <h3 style="margin: 0 0 0 1rem;">{{stepTitle}}</h3>
            <span style="margin-left: auto; color: #6c757d;">{{stepTimestamp}}</span>
          </div>
          {{stepDescription}}
          {{stepScreenshot}}
          {{stepConsoleLogs}}
          {{stepNetworkRequests}}
          {{stepAnnotations}}
        </div>
      `,
      layout: {
        pageSize: 'A4',
        orientation: 'portrait',
        margins: { top: 20, right: 20, bottom: 20, left: 20 }
      },
      colors: {
        primary: '#007bff',
        secondary: '#6c757d',
        accent: '#28a745',
        background: '#f8f9fa',
        text: '#212529'
      }
    },
    isPublic: false,
    category: 'Technical Documentation',
    tags: ['technical', 'documentation', 'code', 'developer']
  };
}

/**
 * Example: Process export progress updates
 */
export function handleExportProgress(progress: ExportProgress): void {
  console.log(`Export ${progress.requestId} progress: ${progress.progress}%`);

  if (progress.currentOperation) {
    console.log(`Current operation: ${progress.currentOperation}`);
  }

  if (progress.estimatedTimeRemaining) {
    const minutes = Math.round(progress.estimatedTimeRemaining / 60000);
    console.log(`Estimated time remaining: ${minutes} minutes`);
  }

  if (progress.details) {
    console.log(`Processed ${progress.details.stepsProcessed}/${progress.details.totalSteps} steps`);
    console.log(`Processed ${progress.details.screenshotsProcessed}/${progress.details.totalScreenshots} screenshots`);

    if (progress.details.processingSpeed) {
      const mbps = (progress.details.processingSpeed / (1024 * 1024)).toFixed(2);
      console.log(`Processing speed: ${mbps} MB/s`);
    }
  }

  if (progress.warnings && progress.warnings.length > 0) {
    console.warn('Warnings:', progress.warnings);
  }

  if (progress.error) {
    console.error(`Export failed: ${progress.error.message}`, progress.error.details);
  }
}

/**
 * Example: Validate export options
 */
export function validateAndPrepareExportOptions(
  format: string,
  customOptions?: Partial<ExportOptions>
): ExportOptions {
  // Validate format
  if (!isValidExportFormat(format)) {
    throw new Error(`Invalid export format: ${format}`);
  }

  // Get default options for the format
  const defaultOptions = getDefaultExportOptions(format as ExportFormat);

  // Merge with custom options
  const options: ExportOptions = {
    ...defaultOptions,
    format: format as ExportFormat,
    ...customOptions
  } as ExportOptions;

  // Validate the complete options
  if (!isExportOptions(options)) {
    throw new Error('Invalid export options configuration');
  }

  return options;
}

/**
 * Example: Estimate export file size
 */
export function calculateEstimatedExportSize(
  stepsCount: number,
  screenshotsCount: number,
  format: ExportFormat,
  options: ExportOptions
): { estimatedBytes: number; estimatedMB: number } {
  const estimatedBytes = estimateExportFileSize(
    stepsCount,
    screenshotsCount,
    format,
    options
  );

  const estimatedMB = estimatedBytes / (1024 * 1024);

  return {
    estimatedBytes,
    estimatedMB
  };
}

/**
 * Example usage demonstration
 */
export function demonstrateExportUsage(): void {
  // Create export request
  const exportRequest = createPdfExportRequest('session-123', 'user-456');
  console.log('Created export request:', exportRequest.id);

  // Validate options
  const validatedOptions = validateAndPrepareExportOptions('pdf', {
    includeScreenshots: true,
    password: 'my-secret'
  });
  console.log('Validated options:', validatedOptions.format);

  // Estimate file size
  const sizeEstimate = calculateEstimatedExportSize(
    50, // 50 steps
    25, // 25 screenshots
    ExportFormat.PDF,
    validatedOptions
  );
  console.log(`Estimated file size: ${sizeEstimate.estimatedMB.toFixed(2)} MB`);

  // Create batch export
  const batchExport = createBatchExportRequest(
    ['session-1', 'session-2', 'session-3'],
    'user-456'
  );
  console.log('Created batch export for', batchExport.sessionIds.length, 'sessions');

  // Create custom template
  const template = createCustomTemplate();
  console.log('Created template:', template.name);

  // Process mock progress
  const mockProgress: ExportProgress = {
    requestId: exportRequest.id,
    status: 'processing',
    progress: 45,
    currentOperation: 'Generating PDF document',
    estimatedTimeRemaining: 120000, // 2 minutes
    startedAt: new Date(Date.now() - 60000),
    updatedAt: new Date(),
    details: {
      stepsProcessed: 22,
      totalSteps: 50,
      screenshotsProcessed: 10,
      totalScreenshots: 25,
      currentSize: 1024 * 1024, // 1MB
      processingSpeed: 1024 * 1024 // 1MB/s
    }
  };
  handleExportProgress(mockProgress);
}