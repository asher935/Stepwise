import { describe, expect, it } from 'bun:test';
import { wsClient } from '../src/lib/ws';

it('sends mouse click input when connected', () => {
  const sent: string[] = [];
  (wsClient as any).ws = { readyState: 1, send: (payload: string) => sent.push(payload) };

  wsClient.sendMouseClick(10, 20, 'left');

  const message = JSON.parse(sent[0]);
  expect(message).toHaveProperty('id');
  expect(message).toHaveProperty('type');
  expect(message).toHaveProperty('timestamp');
  expect(message).toHaveProperty('payload');
  expect(message.type).toBe('BROWSER_ACTION');
  expect(message.payload.type).toBe('input:mouse');
  expect(message.payload.action).toBe('click');
  expect(message.payload.x).toBe(10);
  expect(message.payload.y).toBe(20);
  expect(message.payload.button).toBe('left');
});

it('sends mouse move input when connected', () => {
  const sent: string[] = [];
  (wsClient as any).ws = { readyState: 1, send: (payload: string) => sent.push(payload) };

  wsClient.sendMouseMove(50, 75);

  const message = JSON.parse(sent[0]);
  expect(message.type).toBe('BROWSER_ACTION');
  expect(message.payload.type).toBe('input:mouse');
  expect(message.payload.action).toBe('move');
  expect(message.payload.x).toBe(50);
  expect(message.payload.y).toBe(75);
});