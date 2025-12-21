import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

test('inputs are ignored while screencast frames stream', async () => {
  const sessionResponse = await fetch('http://localhost:3000/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ startUrl: 'data:text/html,<button id="btn">Click</button>' }),
  });

  const { sessionId, token } = await sessionResponse.json();
  await fetch(`http://localhost:3000/api/sessions/${sessionId}/start`, { method: 'POST' });

  const ws = new WebSocket(`ws://localhost:3000/ws?sessionId=${sessionId}&token=${token}`);
  const messages: Record<string, unknown>[] = [];

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });

  ws.on('message', (data: Buffer) => {
    try {
      messages.push(JSON.parse(data.toString()));
    } catch {
      // ignore
    }
  });

  // Wait for the screencast frame to confirm streaming.
  await test.step('wait for screencast frame', async () => {
    const start = Date.now();
    while (!messages.some((msg) => msg.type === 'frame') && Date.now() - start < 10000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(messages.some((msg) => msg.type === 'frame')).toBe(true);
  });

  // Send a click input and expect a step to be recorded.
  ws.send(JSON.stringify({ type: 'input:mouse', action: 'click', x: 50, y: 50, button: 'left' }));

  await test.step('wait for step creation', async () => {
    const start = Date.now();
    while (!messages.some((msg) => msg.type === 'step:new') && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(messages.some((msg) => msg.type === 'step:new')).toBe(true);
  });

  ws.close();
});