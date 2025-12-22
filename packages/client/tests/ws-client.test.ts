import { describe, expect, it } from 'bun:test';
import { wsClient } from '../src/lib/ws';

it('sends mouse click input when connected', () => {
  const sent: string[] = [];
  (wsClient as any).ws = { readyState: 1, send: (payload: string) => sent.push(payload) };

  wsClient.sendMouseClick(10, 20, 'left');

  const message = JSON.parse(sent[0]);
  expect(message.type).toBe('input:mouse');
  expect(message.action).toBe('click');
  expect(message.x).toBe(10);
  expect(message.y).toBe(20);
  expect(message.button).toBe('left');
});

it('sends mouse move input when connected', () => {
  const sent: string[] = [];
  (wsClient as any).ws = { readyState: 1, send: (payload: string) => sent.push(payload) };

  wsClient.sendMouseMove(50, 75);

  const message = JSON.parse(sent[0]);
  expect(message.type).toBe('input:mouse');
  expect(message.action).toBe('move');
  expect(message.x).toBe(50);
  expect(message.y).toBe(75);
});
