import type { DesktopBridge, RuntimeConfig } from '@stepwise/shared';

declare global {
  interface Window {
    __STEPWISE_RUNTIME_CONFIG__?: RuntimeConfig;
    __STEPWISE_DESKTOP_API__?: DesktopBridge;
  }
}

function getWindowConfig(): RuntimeConfig {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__STEPWISE_RUNTIME_CONFIG__ ?? {};
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getWebSocketProtocol(): 'ws:' | 'wss:' {
  if (typeof window === 'undefined') {
    return 'ws:';
  }

  return window.location.protocol === 'https:' ? 'wss:' : 'ws:';
}

function getDefaultWsBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/ws';
  }

  if (window.location.port === '5173') {
    return `${getWebSocketProtocol()}//localhost:3000/ws`;
  }

  return `${getWebSocketProtocol()}//${window.location.host}/ws`;
}

export function getRuntimeConfig(): Required<RuntimeConfig> {
  const config = getWindowConfig();

  return {
    apiBaseUrl: trimTrailingSlash(config.apiBaseUrl ?? '/api'),
    wsBaseUrl: trimTrailingSlash(config.wsBaseUrl ?? getDefaultWsBaseUrl()),
    isDesktop: config.isDesktop ?? false,
  };
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.__STEPWISE_DESKTOP_API__ ?? null;
}
