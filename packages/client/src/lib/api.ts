import type {
  ApiResponse,
  CreateSessionResponse,
  ExportOptions,
  ExportResult,
  ImportPreviewResult,
  ImportResult,
  SessionState,
  Step,
  ToggleRedactionResult,
  UpdateStepRequest,
  UploadFileResult,
} from '@stepwise/shared';
import { getRuntimeConfig } from './runtime';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseApiResponse<T>(
  raw: string,
  fallbackSuccess: boolean,
  context: { method: string; path: string; status: number }
): ApiResponse<T> {
  if (raw.length === 0) {
    return { success: fallbackSuccess };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isJsonObject(parsed)) {
      return { success: fallbackSuccess };
    }

    const success = parsed['success'];
    const error = parsed['error'];

    return {
      success: typeof success === 'boolean' ? success : fallbackSuccess,
      data: parsed['data'] as T | undefined,
      error: isJsonObject(error)
        && typeof error['code'] === 'string'
        && typeof error['message'] === 'string'
        ? {
            code: error['code'],
            message: error['message'],
          }
        : undefined,
    };
  } catch (error) {
    console.error('[API] Invalid JSON response', {
      ...context,
      body: raw.slice(0, 200),
      error,
    });
    throw new Error(`Invalid response from ${context.path}`);
  }
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<TResponse, TRequest = never>(
    method: string,
    path: string,
    body?: TRequest
  ): Promise<TResponse> {
    const runtimeConfig = getRuntimeConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = parseApiResponse<TResponse>(
      await response.text(),
      response.ok,
      { method, path, status: response.status }
    );

    if (!response.ok) {
      throw new Error(result.error?.message ?? `Request failed (${response.status})`);
    }

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Request failed');
    }

    if (result.data === undefined) {
      throw new Error('Request succeeded without response data');
    }

    return result.data;
  }

  private async requestVoid<TRequest = never>(
    method: string,
    path: string,
    body?: TRequest
  ): Promise<void> {
    const runtimeConfig = getRuntimeConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = parseApiResponse<never>(
      await response.text(),
      response.ok,
      { method, path, status: response.status }
    );

    if (!response.ok) {
      throw new Error(result.error?.message ?? `Request failed (${response.status})`);
    }

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Request failed');
    }
  }

  async createSession(): Promise<CreateSessionResponse> {
    return this.request('POST', '/sessions');
  }

  async getSession(sessionId: string): Promise<SessionState> {
    return this.request('GET', `/sessions/${sessionId}`);
  }

  async startSession(sessionId: string, startUrl?: string): Promise<SessionState> {
    return this.request('POST', `/sessions/${sessionId}/start`, { startUrl });
  }

  async endSession(sessionId: string): Promise<void> {
    await this.requestVoid('POST', `/sessions/${sessionId}/end`);
  }

  async setRecordingPaused(sessionId: string, paused: boolean): Promise<SessionState> {
    return this.request('POST', `/sessions/${sessionId}/recording`, { paused });
  }

  async getSteps(sessionId: string): Promise<Step[]> {
    return this.request('GET', `/sessions/${sessionId}/steps`);
  }

  async updateStep(
    sessionId: string,
    stepId: string,
    updates: UpdateStepRequest
  ): Promise<Step> {
    return this.request('PATCH', `/sessions/${sessionId}/steps/${stepId}`, updates);
  }

  async toggleRedaction(
    sessionId: string,
    stepId: string,
    redact: boolean
  ): Promise<ToggleRedactionResult> {
    return this.request('POST', `/sessions/${sessionId}/steps/${stepId}/redact`, { redact });
  }

  async deleteStep(sessionId: string, stepId: string): Promise<void> {
    await this.requestVoid('DELETE', `/sessions/${sessionId}/steps/${stepId}`);
  }

  async insertStep(
    sessionId: string,
    index: number,
    options: { step?: Step; autoDetect?: boolean }
  ): Promise<Step[]> {
    return this.request('POST', `/sessions/${sessionId}/steps`, {
      index,
      step: options.step,
      autoDetect: options.autoDetect,
    });
  }

  async uploadSiteFile(
    sessionId: string,
    file: File,
    x: number,
    y: number
  ): Promise<UploadFileResult> {
    const runtimeConfig = getRuntimeConfig();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('x', String(x));
    formData.append('y', String(y));

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${runtimeConfig.apiBaseUrl}/sessions/${sessionId}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = parseApiResponse<UploadFileResult>(
      await response.text(),
      response.ok,
      { method: 'POST', path: `/sessions/${sessionId}/upload`, status: response.status }
    );

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'File upload failed');
    }

    return result.data;
  }

  async exportSession(
    sessionId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    return this.request('POST', `/export/${sessionId}`, options);
  }

  async downloadExport(sessionId: string, filename: string): Promise<Blob> {
    const runtimeConfig = getRuntimeConfig();
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(
      `${runtimeConfig.apiBaseUrl}/export/${sessionId}/download/${filename}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error('Download failed');
    }

    return response.blob();
  }

  async importFile(
    sessionId: string,
    file: File,
    password?: string
  ): Promise<ImportResult> {
    const runtimeConfig = getRuntimeConfig();
    const formData = new FormData();
    formData.append('file', file);
    if (password) {
      formData.append('password', password);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${runtimeConfig.apiBaseUrl}/import/${sessionId}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = parseApiResponse<ImportResult>(
      await response.text(),
      response.ok,
      { method: 'POST', path: `/import/${sessionId}`, status: response.status }
    );

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Import failed');
    }

    return result.data;
  }

  async previewImport(
    sessionId: string,
    file: File,
    password?: string
  ): Promise<ImportPreviewResult> {
    const runtimeConfig = getRuntimeConfig();
    const formData = new FormData();
    formData.append('file', file);
    if (password) {
      formData.append('password', password);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${runtimeConfig.apiBaseUrl}/import/${sessionId}/preview`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = parseApiResponse<ImportPreviewResult>(
      await response.text(),
      response.ok,
      { method: 'POST', path: `/import/${sessionId}/preview`, status: response.status }
    );

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Preview failed');
    }

    return result.data;
  }
}

export const api = new ApiClient();
