# ExportService Documentation

## Overview

The ExportService is a comprehensive service for generating step-by-step guides in multiple formats from Stepwise sessions. It supports exporting to PDF, DOCX, Markdown, HTML, and ZIP formats with customizable templates and advanced features.

## Features

- **Multiple Export Formats**: PDF, DOCX, Markdown, HTML, and ZIP
- **Template System**: Customizable templates for each export format
- **Password Protection**: Secure exported files with password encryption
- **Batch Export**: Export multiple sessions at once
- **Progress Tracking**: Real-time progress updates via event emission
- **Job Queue**: Async export operations with configurable concurrency
- **Screenshot Processing**: Include screenshots with optional highlighting
- **Table of Contents**: Auto-generated navigation for longer documents
- **Custom Styling**: CSS customization for HTML/PDF exports

## Usage

### Basic Export

```typescript
import { exportService } from './services/ExportService.js';
import { ExportFormat, ExportOptions } from '@stepwise/shared';

// Create export request
const request = {
  id: 'export-123',
  sessionId: 'session-456',
  format: ExportFormat.PDF,
  options: {
    format: ExportFormat.PDF,
    includeScreenshots: true,
    screenshotQuality: 0.8,
    includeConsoleLogs: true,
    includeMetadata: true,
    includeTableOfContents: true,
    template: 'default'
  },
  requestedAt: new Date(),
  notifyOnComplete: true
};

// Queue export
const result = await exportService.queueExport(request);
console.log('Export completed:', result.downloadUrl);
```

### Batch Export

```typescript
import { exportService } from './services/ExportService.js';

// Create batch export request
const batchRequest = {
  id: 'batch-789',
  sessionIds: ['session-1', 'session-2', 'session-3'],
  format: ExportFormat.HTML,
  options: {
    format: ExportFormat.HTML,
    includeScreenshots: true,
    template: 'modern'
  },
  combineMethod: 'separate-files',
  batchOptions: {
    includeIndex: true,
    fileNaming: 'session-title'
  },
  requestedAt: new Date()
};

// Queue batch export
const batchResult = await exportService.queueBatchExport(batchRequest);
console.log(`Exported ${batchResult.sessionsProcessed} sessions`);
```

### Event Listeners

```typescript
import { exportService } from './services/ExportService.js';

// Listen for progress updates
exportService.on('exportProgress', (progress) => {
  console.log(`Export ${progress.requestId}: ${progress.progress}%`);
  console.log(`Current operation: ${progress.currentOperation}`);
});

// Listen for completion
exportService.on('exportCompleted', ({ jobId, result }) => {
  console.log(`Export ${jobId} completed:`, result.fileName);
});

// Listen for errors
exportService.on('exportError', ({ jobId, error }) => {
  console.error(`Export ${jobId} failed:`, error);
});
```

## Templates

### Template Structure

Templates are JSON files located in `/templates/{format}/` with the following structure:

```json
{
  "id": "template-id",
  "name": "Template Name",
  "description": "Template description",
  "format": "html",
  "type": "built-in",
  "config": {
    "styles": "/* CSS styles */",
    "header": "<!-- Header content -->",
    "footer": "<!-- Footer content -->",
    "stepTemplate": "<!-- Step rendering template -->",
    "layout": {
      "pageSize": "A4",
      "orientation": "portrait",
      "margins": { "top": 20, "right": 20, "bottom": 20, "left": 20 }
    },
    "colors": {
      "primary": "#2563eb",
      "secondary": "#64748b",
      "background": "#ffffff",
      "text": "#1e293b"
    },
    "fonts": [
      {
        "name": "Font Name",
        "source": "font-source-url",
        "weight": "400",
        "style": "normal"
      }
    ]
  }
}
```

### Available Templates

#### HTML Templates
- `default` - Clean, professional design
- `modern` - Contemporary with gradients and cards
- `minimal` - Distraction-free, content-focused
- `story` - Narrative style with cinematic elements

#### PDF Templates
- `default` - Professional with headers and footers
- `presentation` - Landscape format for slides
- `technical` - Optimized for technical documentation

#### DOCX Templates
- `default` - Standard Word document format
- `report` - Formal report with cover page

#### Markdown Templates
- `default` - Clean markdown with image references
- `documentation` - Technical documentation format

#### ZIP Templates
- `comprehensive` - Complete package with all formats

## Configuration

The ExportService can be configured through environment variables:

```bash
# Maximum concurrent exports
MAX_CONCURRENT_EXPORTS=3

# Temporary directory for exports
TEMP_DIR=/tmp/stepwise-exports

# Templates directory
TEMPLATES_DIR=/templates

# Final exports directory
EXPORTS_DIR=/exports
```

## API Reference

### Methods

#### `queueExport(request: ExportRequest): Promise<ExportResult>`
Queue a single export job.

#### `queueBatchExport(request: BatchExportRequest): Promise<BatchExportResult>`
Queue a batch export job for multiple sessions.

#### `cancelExport(jobId: string): boolean`
Cancel an active or queued export job.

#### `getStatistics(): ExportStatistics`
Get export statistics including total exports, format distribution, and failure rates.

#### `getActiveJobs(): QueuedExportJob[]`
Get list of currently active export jobs.

#### `getQueuedJobs(): QueuedExportJob[]`
Get list of jobs waiting in the queue.

#### `cleanup(): Promise<void>`
Clean up resources and stop processing.

### Events

- `exportQueued` - Fired when an export is added to the queue
- `batchExportQueued` - Fired when a batch export is queued
- `exportProgress` - Fired with progress updates during export
- `exportCompleted` - Fired when an export completes successfully
- `exportError` - Fired when an export fails
- `exportCancelled` - Fired when an export is cancelled

## Error Handling

The ExportService implements comprehensive error handling:

1. **Validation Errors**: Invalid export options are caught early
2. **Processing Errors**: File system and generation errors are caught
3. **Retry Logic**: Failed jobs are retried up to 3 times
4. **Cancellation Support**: Jobs can be cancelled at any time
5. **Resource Cleanup**: Temporary files are automatically cleaned up

## Performance Considerations

- Export jobs are processed asynchronously with configurable concurrency
- Templates are cached to improve performance
- Large files are streamed when possible
- Temporary files are automatically cleaned up every 5 minutes
- Memory usage is optimized for large session exports

## Security

- Password protection uses strong encryption algorithms
- File paths are validated to prevent directory traversal
- User input is sanitized to prevent injection attacks
- Export tokens are generated for secure file access

## Examples

See the `examples/export-usage.ts` file for comprehensive usage examples.

## Dependencies

- `playwright-core` - PDF generation
- `docx` - DOCX document creation
- `jszip` - ZIP archive generation
- `sharp` - Image processing
- `jsdom` - HTML manipulation
- `uuid` - Unique identifier generation