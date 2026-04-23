import type { ExportOptions, ExportResult, ImportResult, StepwiseManifest } from './export.js';
import type { CreateSessionResponse, SessionState } from './session.js';
import type { Step, UpdateStepRequest } from './step.js';

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ToggleRedactionResult {
  redactedScreenshotPath: string | null;
  screenshotDataUrl: string | null;
}

export interface UploadFileResult {
  fileName: string;
  size: number;
}

export interface ImportPreviewResult {
  manifest: StepwiseManifest;
  stepCount: number;
  encrypted: boolean;
}

export type CreateSessionApiResponse = ApiResponse<CreateSessionResponse>;
export type SessionStateApiResponse = ApiResponse<SessionState | null>;
export type StepsApiResponse = ApiResponse<Step[]>;
export type StepApiResponse = ApiResponse<Step>;
export type DeleteStepApiResponse = ApiResponse<boolean>;
export type UpdateStepPayload = UpdateStepRequest;
export type ToggleRedactionApiResponse = ApiResponse<ToggleRedactionResult>;
export type UploadFileApiResponse = ApiResponse<UploadFileResult>;
export type ExportSessionPayload = ExportOptions;
export type ExportSessionApiResponse = ApiResponse<ExportResult>;
export type ImportSessionApiResponse = ApiResponse<ImportResult>;
export type ImportPreviewApiResponse = ApiResponse<ImportPreviewResult>;
