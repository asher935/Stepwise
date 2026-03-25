export interface RuntimeConfig {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  isDesktop?: boolean;
}

export interface DesktopSaveFileOptions {
  filename: string;
  data: Uint8Array;
}

export interface DesktopSaveFileResult {
  canceled: boolean;
  path?: string;
}

export interface DesktopBridge {
  saveFile: (options: DesktopSaveFileOptions) => Promise<DesktopSaveFileResult>;
}
