import type { Step } from './step.js';

/** Supported export formats */
export type ExportFormat = 'pdf' | 'docx' | 'markdown' | 'html' | 'stepwise';

/** Export request options */
export interface ExportOptions {
  format: ExportFormat;
  title?: string;
  includeScreenshots?: boolean;
  password?: string;
  theme?: 'light' | 'dark';
}

/** Export result */
export interface ExportResult {
  filename: string;
  mimeType: string;
  size: number;
}

/** .stepwise file manifest */
export interface StepwiseManifest {
  version: string;
  createdAt: number;
  title: string;
  stepCount: number;
  encrypted: boolean;
}

/** Import request options */
export interface ImportOptions {
  password?: string;
}

/** Import result */
export interface ImportResult {
  title: string;
  steps: Step[];
  createdAt: number;
}

/** Import validation errors */
export interface ImportValidationError {
  field: string;
  message: string;
}