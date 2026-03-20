import { afterEach, describe, expect, it } from 'bun:test';

import { getRuntimeConfig } from './runtime';

const originalWindow = globalThis.window;

function setWindowState(
  location: { protocol: string; host: string; port: string },
  config?: { apiBaseUrl?: string; wsBaseUrl?: string; isDesktop?: boolean }
): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location,
      __STEPWISE_RUNTIME_CONFIG__: config,
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('getRuntimeConfig', () => {
  it('uses web defaults when no runtime config is injected', () => {
    setWindowState({ protocol: 'https:', host: 'stepwise.test', port: '' });

    expect(getRuntimeConfig()).toEqual({
      apiBaseUrl: '/api',
      wsBaseUrl: 'wss://stepwise.test/ws',
      isDesktop: false,
    });
  });

  it('preserves the Vite development websocket fallback', () => {
    setWindowState({ protocol: 'http:', host: 'localhost:5173', port: '5173' });

    expect(getRuntimeConfig().wsBaseUrl).toBe('ws://localhost:3000/ws');
  });

  it('uses the injected desktop runtime config', () => {
    setWindowState(
      { protocol: 'http:', host: '127.0.0.1:5173', port: '5173' },
      {
        apiBaseUrl: 'http://127.0.0.1:43123/api/',
        wsBaseUrl: 'ws://127.0.0.1:43123/ws/',
        isDesktop: true,
      }
    );

    expect(getRuntimeConfig()).toEqual({
      apiBaseUrl: 'http://127.0.0.1:43123/api',
      wsBaseUrl: 'ws://127.0.0.1:43123/ws',
      isDesktop: true,
    });
  });
});
