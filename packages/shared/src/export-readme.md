# Stepwise Export/Import Types

This document provides an overview of the export and import type definitions available in the Stepwise shared package.

## Overview

The export/import system provides comprehensive support for:
- Multiple export formats (PDF, DOCX, Markdown, HTML, ZIP)
- Password protection for exported files
- Custom template support
- Batch export capabilities
- Progress tracking
- Import from various formats
- File integrity verification

## Key Types

### Enums

#### ExportFormat
Defines the supported export formats:
- `PDF` - Portable Document Format
- `DOCX` - Microsoft Word document
- `MARKDOWN` - Markdown format with embedded images
- `HTML` - HTML document with embedded assets
- `ZIP` - Compressed archive containing all assets

#### ImportFormat
Defines the supported import formats:
- `STEPWISE` - Native Stepwise file format
- `JSON` - JSON export from Stepwise
- `MARKDOWN` - Markdown with stepwise metadata
- `HTML` - HTML with stepwise data
- `ZIP` - ZIP archive containing stepwise data

### Core Interfaces

#### ExportOptions
Configuration options for customizing export behavior:
```typescript
interface ExportOptions {
  format: ExportFormat;
  includeScreenshots: boolean;
  screenshotQuality?: number;
  screenshotMaxSize?: { width: number; height: number; };
  template?: string;
  templateOverrides?: Partial<ExportTemplate['config']>;
  password?: string;
  includeConsoleLogs: boolean;
  includeNetworkRequests: boolean;
  includeDomChanges: boolean;
  includeUserInputs: boolean;
  includeMetadata: boolean;
  includeTimestamps: boolean;
  timestampFormat?: 'ISO' | 'relative' | 'custom';
  customTimestampFormat?: string;
  groupByPages: boolean;
  locale?: string;
  customCss?: string;
  minify?: boolean;
  includeTableOfContents: boolean;
  tocMaxDepth?: number;
  includeAnnotations: boolean;
  stepFilter?: {
    includeTypes?: string[];
    excludeTypes?: string[];
  };
  timeRange?: {
    start: Date;
    end: Date;
  };
  batch?: {
    isBatch: boolean;
    sessionIds?: string[];
    combineMethod?: 'separate-files' | 'single-file' | 'chapters';
    namingPattern?: string;
  };
  compression?: {
    enabled: boolean;
    level?: number;
    format?: 'gzip' | 'zip' | 'brotli';
  };
  watermark?: {
    enabled: boolean;
    text?: string;
    imageUrl?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    opacity?: number;
  };
  customMetadata?: Record<string, string | number | boolean>;
}
```

#### ExportRequest
Request structure for initiating an export:
```typescript
interface ExportRequest {
  id: string;
  sessionId: string;
  format: ExportFormat;
  options: ExportOptions;
  requestedAt: Date;
  userId?: string;
  notifyOnComplete: boolean;
  notificationEmail?: string;
  destination?: {
    type: 'download' | 'email' | 'cloud-storage' | 'api';
    url?: string;
    cloudStorage?: { /* ... */ };
    api?: { /* ... */ };
  };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  expiresAt?: Date;
}
```

#### ExportResult
Result structure for completed exports:
```typescript
interface ExportResult {
  id: string;
  requestId: string;
  sessionId: URL;
  downloadUrl: string;
  fileName: string;
  size: number;
  format: ExportFormat;
  mimeType: string;
  completedAt: Date;
  exportDuration: number;
  status: 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  stats: {
    stepsCount: number;
    screenshotsCount: number;
    pageCount?: number;
    wordCount?: number;
    compressionRatio?: number;
  };
  previewUrl?: string;
  thumbnailUrl?: string;
  checksum?: {
    algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512';
    value: string;
  };
  metadata?: Record<string, unknown>;
}
```

#### ImportFile
Interface for files being imported:
```typescript
interface ImportFile {
  file: File | Buffer;
  format: ImportFormat;
  password?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  lastModified?: Date;
  metadata?: Record<string, unknown>;
}
```

#### ImportResult
Result structure for completed imports:
```typescript
interface ImportResult {
  id: string;
  sessionId: string;
  sourceFileName: string;
  format: ImportFormat;
  stepsCount: number;
  completedAt: Date;
  importDuration: number;
  status: 'completed' | 'failed' | 'partial' | 'cancelled';
  warnings: string[];
  errorMessage?: string;
  stats: {
    successfulSteps: number;
    skippedSteps: number;
    errorSteps: number;
    screenshotsCount: number;
    consoleEventsCount: number;
    networkRequestsCount: number;
  };
  stepIdMapping?: Record<string, string>;
  transformations?: Array<{
    type: string;
    description: string;
    appliedAt: Date;
  }>;
  metadata?: Record<string, unknown>;
}
```

### Advanced Features

#### StepwiseFileFormat
Native Stepwise file format specification that includes:
- Session metadata and settings
- Complete step history with timestamps
- Screenshot data with compression options
- Console events and network requests
- DOM change tracking
- Step annotations
- File integrity verification
- Optional encryption support

#### ExportTemplate
Template configuration for different export formats:
```typescript
interface ExportTemplate {
  id: string;
  name: string;
  description?: string;
  format: ExportFormat;
  type: 'built-in' | 'custom' | 'user-defined';
  config: {
    styles?: string;
    header?: string;
    footer?: string;
    stepTemplate?: string;
    layout?: {
      pageSize?: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';
      orientation?: 'portrait' | 'landscape';
      margins?: { /* ... */ };
    };
    fonts?: Array<{ /* ... */ }>;
    colors?: { /* ... */ };
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### Progress Tracking
- `ExportProgress` - Real-time export progress tracking
- `ImportProgress` - Real-time import progress tracking
- Includes current operation, percentage complete, estimated time remaining
- Detailed processing statistics (steps processed, screenshots processed, etc.)

#### Batch Operations
- `BatchExportRequest` - Export multiple sessions in one operation
- `BatchExportResult` - Results from batch export operations
- Supports various combination methods (separate files, single file, chapters)
- Optional index file generation

### Utility Functions

#### Type Guards
- `isValidExportFormat(value: unknown)` - Check if value is a valid ExportFormat
- `isValidImportFormat(value: unknown)` - Check if value is a valid ImportFormat
- `isExportOptions(obj: unknown)` - Check if object implements ExportOptions
- `isImportFile(obj: unknown)` - Check if object implements ImportFile

#### Helper Functions
- `getDefaultExportOptions(format: ExportFormat)` - Get default options for a format
- `estimateExportFileSize(stepsCount, screenshotsCount, format, options)` - Estimate file size

## Usage Examples

See `/packages/shared/src/examples/export-usage.ts` for comprehensive usage examples including:
- Creating export requests
- Setting up batch exports
- Creating custom templates
- Processing progress updates
- Validating options
- Estimating file sizes

## Best Practices

1. **Always validate export options** before processing
2. **Use password protection** for sensitive exports
3. **Consider file size** when including screenshots
4. **Use templates** for consistent formatting
5. **Monitor progress** for long-running operations
6. **Handle errors gracefully** with proper error messages
7. **Verify checksums** for imported files
8. **Use appropriate formats** based on use case:
   - PDF: Final documentation, sharing
   - DOCX: Editable documents
   - HTML: Web viewing, interactive
   - Markdown: Version control, editing
   - ZIP: Archiving, full backup

## Security Considerations

1. **Password protection**: Use strong passwords for sensitive exports
2. **File validation**: Always validate imported files
3. **Checksum verification**: Verify file integrity
4. **Sanitization**: Sanitize imported data to prevent injection
5. **Access control**: Implement proper access controls for export/import operations
6. **Temporary files**: Clean up temporary files after processing
7. **Metadata filtering**: Remove sensitive metadata from exports