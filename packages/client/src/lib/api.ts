import type { 
  ExportFormat, 
  ExportResult,
  ImportResult,
  SessionState, 
  Step, 
  StepwiseManifest,
} from '@stepwise/shared';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = await response.json() as ApiResponse<T>;

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Request failed');
    }

    return result.data;
  }

  async createSession(): Promise<{ sessionId: string; token: string }> {
    return this.request('POST', '/sessions');
  }

  async getSession(sessionId: string): Promise<SessionState> {
    return this.request('GET', `/sessions/${sessionId}`);
  }

  async startSession(sessionId: string, startUrl?: string): Promise<SessionState> {
    return this.request('POST', `/sessions/${sessionId}/start`, { startUrl });
  }

  async endSession(sessionId: string): Promise<void> {
    await this.request('POST', `/sessions/${sessionId}/end`);
  }

  async getSteps(sessionId: string): Promise<Step[]> {
    return this.request('GET', `/sessions/${sessionId}/steps`);
  }

  async updateStep(
    sessionId: string,
    stepId: string,
    updates: { caption?: string }
  ): Promise<Step> {
    return this.request('PATCH', `/sessions/${sessionId}/steps/${stepId}`, updates);
  }

  async deleteStep(sessionId: string, stepId: string): Promise<void> {
    await this.request('DELETE', `/sessions/${sessionId}/steps/${stepId}`);
  }

  async exportSession(
    sessionId: string,
    options: {
      format: ExportFormat;
      title?: string;
      includeScreenshots?: boolean;
      password?: string;
      theme?: 'light' | 'dark';
    }
  ): Promise<ExportResult> {
    return this.request('POST', `/export/${sessionId}`, options);
  }

  async downloadExport(sessionId: string, filename: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(
      `${API_BASE}/export/${sessionId}/download/${filename}`,
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
    const formData = new FormData();
    formData.append('file', file);
    if (password) {
      formData.append('password', password);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}/import/${sessionId}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = await response.json() as ApiResponse<ImportResult>;

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Import failed');
    }

    return result.data;
  }

  async previewImport(
    sessionId: string,
    file: File,
    password?: string
  ): Promise<{ manifest: StepwiseManifest; stepCount: number; encrypted: boolean }> {
    const formData = new FormData();
    formData.append('file', file);
    if (password) {
      formData.append('password', password);
    }

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}/import/${sessionId}/preview`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = await response.json() as ApiResponse<{ manifest: StepwiseManifest; stepCount: number; encrypted: boolean }>;

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Preview failed');
    }

    return result.data;
  }
}

export const api = new ApiClient();
