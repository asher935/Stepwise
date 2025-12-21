/**
 * Export and Import type definitions for the Stepwise application
 *
 * This file contains comprehensive TypeScript interfaces and types for managing
 * export and import operations, including format specifications, options,
 * templates, and progress tracking.
 */

/**
 * Supported export formats for Stepwise sessions
 */
export enum ExportFormat {
  /** Portable Document Format */
  PDF = 'pdf',
  /** Microsoft Word document */
  DOCX = 'docx',
  /** Markdown format with embedded images */
  MARKDOWN = 'markdown',
  /** HTML document with embedded assets */
  HTML = 'html',
  /** Compressed archive containing all assets */
  ZIP = 'zip'
}

/**
 * Supported import file formats
 */
export enum ImportFormat {
  /** Native Stepwise file format */
  STEPWISE = 'stepwise',
  /** JSON export from Stepwise */
  JSON = 'json',
  /** Markdown with stepwise metadata */
  MARKDOWN = 'markdown',
  /** HTML with stepwise data */
  HTML = 'html',
  /** ZIP archive containing stepwise data */
  ZIP = 'zip'
}

/**
 * Template configuration for different export formats
 */
export interface ExportTemplate {
  /** Unique template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Export format this template applies to */
  format: ExportFormat;
  /** Template type */
  type: 'built-in' | 'custom' | 'user-defined';
  /** Template metadata and configuration */
  config: {
    /** CSS styles for HTML/PDF exports */
    styles?: string;
    /** Header template */
    header?: string;
    /** Footer template */
    footer?: string;
    /** Step rendering template */
    stepTemplate?: string;
    /** Page layout configuration */
    layout?: {
      pageSize?: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';
      orientation?: 'portrait' | 'landscape';
      margins?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
      };
    };
    /** Custom fonts */
    fonts?: Array<{
      name: string;
      source: string; // URL or file path
      weight?: string;
      style?: string;
    }>;
    /** Color scheme */
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: string;
      text?: string;
    };
  };
  /** Template creation date */
  createdAt: Date;
  /** Last update date */
  updatedAt: Date;
}

/**
 * Options for customizing export behavior
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Whether to include screenshots in the export */
  includeScreenshots: boolean;
  /** Quality settings for included screenshots */
  screenshotQuality?: number; // 0.1 to 1.0
  /** Maximum dimensions for screenshots */
  screenshotMaxSize?: {
    width: number;
    height: number;
  };
  /** Export template to use */
  template?: string; // Template ID
  /** Custom template overrides */
  templateOverrides?: Partial<ExportTemplate['config']>;
  /** Password protection for exported files */
  password?: string;
  /** Whether to include console logs */
  includeConsoleLogs: boolean;
  /** Whether to include network requests */
  includeNetworkRequests: boolean;
  /** Whether to include DOM change history */
  includeDomChanges: boolean;
  /** Whether to include user input data */
  includeUserInputs: boolean;
  /** Whether to include session metadata */
  includeMetadata: boolean;
  /** Whether to include timestamps */
  includeTimestamps: boolean;
  /** Timestamp format */
  timestampFormat?: 'ISO' | 'relative' | 'custom';
  /** Custom timestamp format string (for custom format) */
  customTimestampFormat?: string;
  /** Whether to group steps by pages */
  groupByPages: boolean;
  /** Language/locale for export */
  locale?: string;
  /** Custom CSS for HTML/PDF exports */
  customCss?: string;
  /** Whether to minify output (for HTML) */
  minify?: boolean;
  /** Whether to generate a table of contents */
  includeTableOfContents: boolean;
  /** Maximum depth for table of contents */
  tocMaxDepth?: number;
  /** Whether to include step annotations */
  includeAnnotations: boolean;
  /** Filter steps by type */
  stepFilter?: {
    includeTypes?: string[];
    excludeTypes?: string[];
  };
  /** Filter steps by time range */
  timeRange?: {
    start: Date;
    end: Date;
  };
  /** Batch export options */
  batch?: {
    /** Whether this is a batch export */
    isBatch: boolean;
    /** Session IDs to export in batch */
    sessionIds?: string[];
    /** How to combine multiple sessions */
    combineMethod?: 'separate-files' | 'single-file' | 'chapters';
    /** Naming pattern for batch exports */
    namingPattern?: string;
  };
  /** Export compression options */
  compression?: {
    /** Whether to compress the export */
    enabled: boolean;
    /** Compression level (0-9) */
    level?: number;
    /** Compression format */
    format?: 'gzip' | 'zip' | 'brotli';
  };
  /** Watermark options */
  watermark?: {
    /** Whether to add watermark */
    enabled: boolean;
    /** Watermark text */
    text?: string;
    /** Watermark image URL */
    imageUrl?: string;
    /** Watermark position */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    /** Watermark opacity */
    opacity?: number; // 0.0 to 1.0
  };
  /** Custom headers and metadata */
  customMetadata?: Record<string, string | number | boolean>;
}

/**
 * Request structure for initiating an export
 */
export interface ExportRequest {
  /** Unique request identifier */
  id: string;
  /** Session ID to export */
  sessionId: string;
  /** Export format */
  format: ExportFormat;
  /** Export options */
  options: ExportOptions;
  /** Request timestamp */
  requestedAt: Date;
  /** User ID making the request */
  userId?: string;
  /** Whether to notify when complete */
  notifyOnComplete: boolean;
  /** Notification email (if different from user email) */
  notificationEmail?: string;
  /** Export destination */
  destination?: {
    /** Destination type */
    type: 'download' | 'email' | 'cloud-storage' | 'api';
    /** Destination URL or identifier */
    url?: string;
    /** Cloud storage configuration */
    cloudStorage?: {
      provider: 'aws-s3' | 'google-cloud' | 'azure-blob' | 'dropbox';
      bucket?: string;
      path?: string;
      credentials?: Record<string, string>;
    };
    /** API endpoint configuration */
    api?: {
      endpoint: string;
      method: 'POST' | 'PUT';
      headers?: Record<string, string>;
      auth?: {
        type: 'bearer' | 'basic' | 'api-key';
        token?: string;
        username?: string;
        password?: string;
        apiKey?: string;
      };
    };
  };
  /** Priority of the export request */
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  /** Expiration time for the export */
  expiresAt?: Date;
}

/**
 * Result structure for completed exports
 */
export interface ExportResult {
  /** Unique result identifier */
  id: string;
  /** Associated export request ID */
  requestId: string;
  /** Session ID that was exported */
  sessionId: URL;
  /** Download URL for the exported file */
  downloadUrl: string;
  /** Filename of the exported file */
  fileName: string;
  /** File size in bytes */
  size: number;
  /** Export format */
  format: ExportFormat;
  /** MIME type of the exported file */
  mimeType: string;
  /** Export completion timestamp */
  completedAt: Date;
  /** How long the export took in milliseconds */
  exportDuration: number;
  /** Export status */
  status: 'completed' | 'failed' | 'cancelled';
  /** Error message (if failed) */
  errorMessage?: string;
  /** Export statistics */
  stats: {
    /** Number of steps exported */
    stepsCount: number;
    /** Number of screenshots included */
    screenshotsCount: number;
    /** Number of pages (for PDF/DOCX) */
    pageCount?: number;
    /** Number of words (for text formats) */
    wordCount?: number;
    /** Compression ratio (if compressed) */
    compressionRatio?: number;
  };
  /** Preview URL (if available) */
  previewUrl?: string;
  /** Thumbnail URL (if available) */
  thumbnailUrl?: string;
  /** Checksum for file integrity */
  checksum?: {
    algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512';
    value: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for files being imported
 */
export interface ImportFile {
  /** File object or buffer */
  file: File | Buffer;
  /** File format */
  format: ImportFormat;
  /** Password for encrypted files */
  password?: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Last modified date */
  lastModified?: Date;
  /** Additional file metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result structure for completed imports
 */
export interface ImportResult {
  /** Unique result identifier */
  id: string;
  /** Newly created session ID */
  sessionId: string;
  /** Original file name */
  sourceFileName: string;
  /** Import format */
  format: ImportFormat;
  /** Number of steps imported */
  stepsCount: number;
  /** Import completion timestamp */
  completedAt: Date;
  /** How long the import took in milliseconds */
  importDuration: number;
  /** Import status */
  status: 'completed' | 'failed' | 'partial' | 'cancelled';
  /** Warnings and informational messages */
  warnings: string[];
  /** Error message (if failed) */
  errorMessage?: string;
  /** Import statistics */
  stats: {
    /** Number of steps successfully imported */
    successfulSteps: number;
    /** Number of steps skipped */
    skippedSteps: number;
    /** Number of steps with errors */
    errorSteps: number;
    /** Number of screenshots imported */
    screenshotsCount: number;
    /** Number of console events imported */
    consoleEventsCount: number;
    /** Number of network requests imported */
    networkRequestsCount: number;
  };
  /** Mapping from original step IDs to new step IDs */
  stepIdMapping?: Record<string, string>;
  /** Any data transformations applied during import */
  transformations?: Array<{
    type: string;
    description: string;
    appliedAt: Date;
  }>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Native Stepwise file format specification
 */
export interface StepwiseFileFormat {
  /** File format version for compatibility */
  version: string;
  /** File type identifier */
  type: 'stepwise-session';
  /** Export timestamp */
  exportedAt: Date;
  /** Session data */
  session: {
    /** Session metadata */
    metadata: {
      title: string;
      description?: string;
      tags?: string[];
      createdAt: Date;
      updatedAt: Date;
      version?: string;
    };
    /** Session settings */
    settings?: {
      viewport?: {
        width: number;
        height: number;
        deviceScaleFactor?: number;
        isMobile?: boolean;
      };
      quality?: {
        screenshotQuality: number;
        compressScreenshots: boolean;
      };
    };
    /** All recorded steps */
    steps: Array<{
      /** Step identifier */
      id: string;
      /** Step sequence number */
      sequenceNumber: number;
      /** Step timestamp */
      timestamp: Date;
      /** Step type */
      type: string;
      /** Step action */
      action: {
        /** Action type */
        type: string;
        /** Target element selector */
        target?: string;
        /** Action data */
        data?: Record<string, unknown>;
      };
      /** Screenshot data (if included) */
      screenshot?: {
        /** Image data (base64 or reference) */
        data: string;
        /** Image format */
        format: 'png' | 'jpeg' | 'webp';
        /** Image dimensions */
        dimensions: {
          width: number;
          height: number;
        };
        /** File size */
        size: number;
      };
      /** Console events at this step */
      consoleEvents?: Array<{
        /** Event timestamp */
        timestamp: Date;
        /** Log level */
        level: 'info' | 'warning' | 'error' | 'debug';
        /** Log message */
        message: string;
        /** Additional data */
        data?: unknown;
      }>;
      /** Network requests at this step */
      networkRequests?: Array<{
        /** Request timestamp */
        timestamp: Date;
        /** Request URL */
        url: string;
        /** HTTP method */
        method: string;
        /** Request headers */
        headers?: Record<string, string>;
        /** Response status */
        status?: number;
        /** Response headers */
        responseHeaders?: Record<string, string>;
        /** Request/response body size */
        size?: number;
      }>;
      /** DOM changes at this step */
      domChanges?: Array<{
        /** Change timestamp */
        timestamp: Date;
        /** Change type */
        type: 'add' | 'remove' | 'modify' | 'move';
        /** Target selector */
        target: string;
        /** Change details */
        details?: Record<string, unknown>;
      }>;
      /** Step annotations */
      annotations?: Array<{
        /** Annotation ID */
        id: string;
        /** Annotation type */
        type: 'note' | 'highlight' | 'bookmark';
        /** Annotation content */
        content: string;
        /** Annotation position */
        position?: {
          x: number;
          y: number;
        };
        /** Annotation author */
        author?: string;
        /** Creation timestamp */
        createdAt: Date;
      }>;
    }>;
  };
  /** File checksum for integrity verification */
  checksum?: {
    algorithm: 'sha256' | 'md5';
    value: string;
  };
  /** Encryption information (if encrypted) */
  encryption?: {
    algorithm: string;
    keyDerivation: {
      algorithm: string;
      iterations: number;
      salt: string;
    };
  };
}

/**
 * Progress tracking for export operations
 */
export interface ExportProgress {
  /** Export request ID */
  requestId: string;
  /** Current progress status */
  status: 'queued' | 'preparing' | 'processing' | 'generating' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current operation being performed */
  currentOperation?: string;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  /** Started timestamp */
  startedAt?: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Processing details */
  details?: {
    /** Number of steps processed */
    stepsProcessed: number;
    /** Total number of steps */
    totalSteps: number;
    /** Number of screenshots processed */
    screenshotsProcessed: number;
    /** Total number of screenshots */
    totalScreenshots: number;
    /** Current file size in bytes */
    currentSize: number;
    /** Processing speed in bytes per second */
    processingSpeed?: number;
  };
  /** Any warnings encountered */
  warnings?: string[];
  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Progress tracking for import operations
 */
export interface ImportProgress {
  /** Import operation ID */
  operationId: string;
  /** Current progress status */
  status: 'queued' | 'validating' | 'parsing' | 'processing' | 'validating-data' | 'creating-session' | 'completed' | 'failed' | 'cancelled';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current operation being performed */
  currentOperation?: string;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  /** Started timestamp */
  startedAt?: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Processing details */
  details?: {
    /** Number of bytes read */
    bytesRead: number;
    /** Total file size in bytes */
    totalBytes: number;
    /** Number of steps parsed */
    stepsParsed: number;
    /** Total number of steps found */
    totalSteps: number;
    /** Number of valid steps */
    validSteps: number;
    /** Number of invalid steps */
    invalidSteps: number;
    /** Parsing speed in bytes per second */
    parsingSpeed?: number;
  };
  /** Validation results */
  validation?: {
    /** File format validation result */
    formatValid: boolean;
    /** Checksum validation result */
    checksumValid?: boolean;
    /** Schema validation errors */
    schemaErrors?: string[];
  };
  /** Any warnings encountered */
  warnings?: string[];
  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Batch export request for multiple sessions
 */
export interface BatchExportRequest {
  /** Unique batch request identifier */
  id: string;
  /** List of session IDs to export */
  sessionIds: string[];
  /** Export format (same for all sessions) */
  format: ExportFormat;
  /** Export options (applied to all sessions) */
  options: ExportOptions;
  /** How to combine the exports */
  combineMethod: 'separate-files' | 'single-file' | 'chapters';
  /** Batch-specific options */
  batchOptions?: {
    /** Include index file */
    includeIndex: boolean;
    /** Index template */
    indexTemplate?: string;
    /** How to name files in batch */
    fileNaming: 'session-id' | 'session-title' | 'timestamp' | 'custom';
    /** Custom naming pattern */
    customNamingPattern?: string;
    /** Whether to add session metadata to filename */
    includeMetadataInFilename: boolean;
  };
  /** Request timestamp */
  requestedAt: Date;
  /** User ID making the request */
  userId?: string;
}

/**
 * Result for batch export operations
 */
export interface BatchExportResult {
  /** Unique result identifier */
  id: string;
  /** Associated batch request ID */
  requestId: string;
  /** Number of sessions processed */
  sessionsProcessed: number;
  /** Total number of sessions in batch */
  totalSessions: number;
  /** List of individual export results */
  exportResults: ExportResult[];
  /** Combined file information (if applicable) */
  combinedFile?: {
    /** Download URL */
    downloadUrl: string;
    /** File name */
    fileName: string;
    /** Total size in bytes */
    totalSize: number;
  };
  /** Index file information (if generated) */
  indexFile?: {
    /** Download URL */
    downloadUrl: string;
    /** File name */
    fileName: string;
  };
  /** Overall batch status */
  status: 'completed' | 'partial' | 'failed';
  /** Failed exports with reasons */
  failedExports?: Array<{
    sessionId: string;
    reason: string;
  }>;
  /** Batch completion timestamp */
  completedAt: Date;
  /** Total duration in milliseconds */
  totalDuration: number;
}

/**
 * Template management types
 */
export interface TemplateCreateRequest {
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Export format */
  format: ExportFormat;
  /** Template configuration */
  config: ExportTemplate['config'];
  /** Whether this is a public template */
  isPublic?: boolean;
  /** Template category */
  category?: string;
  /** Tags for the template */
  tags?: string[];
}

export interface TemplateUpdateRequest {
  /** Template ID */
  id: string;
  /** Updated template name */
  name?: string;
  /** Updated description */
  description?: string;
  /** Updated configuration */
  config?: Partial<ExportTemplate['config']>;
  /** Updated category */
  category?: string;
  /** Updated tags */
  tags?: string[];
}

/**
 * Export/Import job queue types
 */
export interface ExportJob {
  /** Job identifier */
  id: string;
  /** Job type */
  type: 'export' | 'import';
  /** Job priority */
  priority: number;
  /** Job status */
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  /** Job payload */
  payload: ExportRequest | ImportFile;
  /** Creation timestamp */
  createdAt: Date;
  /** Start timestamp */
  startedAt?: Date;
  /** Completion timestamp */
  completedAt?: Date;
  /** Worker ID processing this job */
  workerId?: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Last error */
  lastError?: string;
}

/**
 * Type guards for export/import types
 */

/**
 * Check if a value is a valid ExportFormat
 */
export function isValidExportFormat(value: unknown): value is ExportFormat {
  return Object.values(ExportFormat).includes(value as ExportFormat);
}

/**
 * Check if a value is a valid ImportFormat
 */
export function isValidImportFormat(value: unknown): value is ImportFormat {
  return Object.values(ImportFormat).includes(value as ImportFormat);
}

/**
 * Check if an object implements ExportOptions interface
 */
export function isExportOptions(obj: unknown): obj is ExportOptions {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const options = obj as ExportOptions;
  return (
    isValidExportFormat(options.format) &&
    typeof options.includeScreenshots === 'boolean' &&
    typeof options.includeConsoleLogs === 'boolean' &&
    typeof options.includeNetworkRequests === 'boolean'
  );
}

/**
 * Check if an object implements ImportFile interface
 */
export function isImportFile(obj: unknown): obj is ImportFile {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const file = obj as ImportFile;
  return (
    (file.file instanceof File || file.file instanceof Buffer) &&
    isValidImportFormat(file.format) &&
    typeof file.fileName === 'string' &&
    typeof file.fileSize === 'number' &&
    typeof file.mimeType === 'string'
  );
}

/**
 * Utility functions for export/import operations
 */

/**
 * Get default export options for a given format
 */
export function getDefaultExportOptions(format: ExportFormat): Partial<ExportOptions> {
  const baseOptions: Partial<ExportOptions> = {
    includeScreenshots: true,
    screenshotQuality: 0.8,
    includeConsoleLogs: false,
    includeNetworkRequests: false,
    includeDomChanges: false,
    includeUserInputs: true,
    includeMetadata: true,
    includeTimestamps: true,
    timestampFormat: 'ISO',
    groupByPages: false,
    includeTableOfContents: false,
    includeAnnotations: true,
    minify: false,
    compression: {
      enabled: format === ExportFormat.ZIP,
      level: 6,
      format: 'zip'
    }
  };

  switch (format) {
    case ExportFormat.PDF:
    case ExportFormat.DOCX:
      return {
        ...baseOptions,
        templateOverrides: {
          layout: {
            pageSize: 'A4',
            orientation: 'portrait',
            margins: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        }
      };
    case ExportFormat.HTML:
      return {
        ...baseOptions,
        minify: true
      };
    case ExportFormat.MARKDOWN:
      return {
        ...baseOptions,
        templateOverrides: {
          styles: undefined
        }
      };
    case ExportFormat.ZIP:
      return {
        ...baseOptions,
        compression: {
          enabled: true,
          level: 9,
          format: 'zip'
        }
      };
    default:
      return baseOptions;
  }
}

/**
 * Calculate estimated file size for export
 */
export function estimateExportFileSize(
  stepsCount: number,
  screenshotsCount: number,
  format: ExportFormat,
  options: ExportOptions
): number {
  let estimatedSize = 0;

  // Base size for step data
  estimatedSize += stepsCount * 1024; // ~1KB per step

  // Add screenshot sizes
  if (options.includeScreenshots) {
    const avgScreenshotSize = (200 * 200 * 3 * (options.screenshotQuality || 0.8)) / 8; // Rough estimate
    estimatedSize += screenshotsCount * avgScreenshotSize;
  }

  // Add console logs
  if (options.includeConsoleLogs) {
    estimatedSize += stepsCount * 100; // ~100 bytes per console event
  }

  // Add network requests
  if (options.includeNetworkRequests) {
    estimatedSize += stepsCount * 500; // ~500 bytes per network request
  }

  // Apply format-specific multipliers
  switch (format) {
    case ExportFormat.PDF:
      estimatedSize *= 1.5;
      break;
    case ExportFormat.DOCX:
      estimatedSize *= 2;
      break;
    case ExportFormat.HTML:
      estimatedSize *= 1.2;
      break;
    case ExportFormat.MARKDOWN:
      estimatedSize *= 0.8;
      break;
    case ExportFormat.ZIP:
      estimatedSize *= 0.3; // Compressed
      break;
  }

  return Math.ceil(estimatedSize);
}