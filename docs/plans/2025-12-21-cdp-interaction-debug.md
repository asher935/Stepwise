# CDP Input Ignored Debug Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Identify and fix why screencast frames render while input events are ignored.

**Architecture:** Treat this as an end-to-end input pipeline issue: client emits input messages, server routes them, CDP executes them, and recorder emits steps. Add a Playwright MCP repro to prove the failure, capture WebSocket/CDP flow with explicit trace logs, then apply TDD fixes on the server and/or client based on evidence.

**Tech Stack:** TypeScript, Bun, Elysia WebSockets, Playwright CDP, Playwright MCP, Zustand.

### Task 0: Prepare dedicated worktree

**Files:**
- Modify: none

**Step 1: Create a dedicated worktree**

Run: `@superpowers:using-git-worktrees`
Expected: New worktree created for CDP input debugging

**Step 2: Commit**

Run:
```bash
git status
```
Expected: No changes

### Task 1: Reproduce input ignored with Playwright MCP

**Files:**
- Create: `test-scenarios/mcp-input-ignored.spec.ts`

**Step 1: Write the failing test**

```typescript
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
  const messages: any[] = [];

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });

  ws.on('message', (data) => {
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
```

**Step 2: Run the test to verify it fails**

Run:
```bash
bun run dev:server
```
Expected: Server running on `http://localhost:3000`

Run (separate terminal):
```bash
npx playwright test test-scenarios/mcp-input-ignored.spec.ts --project=chromium --headed
```
Expected: FAIL on missing `step:new` despite `frame` messages

**Step 3: Commit**

```bash
git add test-scenarios/mcp-input-ignored.spec.ts
git commit -m "test: repro input ignored while screencast streams"
```

### Task 2: Capture WS and CDP input flow

**Files:**
- Modify: `packages/server/src/ws/handler.ts`
- Modify: `packages/server/src/services/CDPBridge.ts`
- Modify: `packages/client/src/lib/ws.ts`

**Step 1: Add trace logging behind env flags**

```typescript
// packages/client/src/lib/ws.ts
const shouldTrace = Boolean(import.meta.env.VITE_TRACE_INPUT);
...
if (shouldTrace) {
  console.log('[WS] send', message);
}
```

```typescript
// packages/server/src/ws/handler.ts
const shouldTrace = process.env.STEPWISE_TRACE_INPUT === '1';
...
if (shouldTrace) {
  console.log('[WS] recv', parsed);
}
```

```typescript
// packages/server/src/services/CDPBridge.ts
const shouldTrace = process.env.STEPWISE_TRACE_INPUT === '1';
...
if (shouldTrace) {
  console.log('[CDP] Input.dispatchMouseEvent', { x, y, type });
}
```

**Step 2: Run the repro with tracing**

Run:
```bash
STEPWISE_TRACE_INPUT=1 bun run dev:server
```
Expected: Server logs show inbound input messages and CDP dispatch attempts

Run (separate terminal):
```bash
VITE_TRACE_INPUT=1 bun run dev:client
```
Expected: Client logs show outbound input messages

Run (third terminal):
```bash
npx playwright test test-scenarios/mcp-input-ignored.spec.ts --project=chromium --headed
```
Expected: Logs show where the pipeline stops (client send vs server recv vs CDP dispatch)

**Step 3: Commit**

```bash
git add packages/server/src/ws/handler.ts packages/server/src/services/CDPBridge.ts packages/client/src/lib/ws.ts
git commit -m "chore: add trace logging for input pipeline"
```

### Task 3: Identify root cause from traces

**Files:**
- Modify: none

**Step 1: Analyze trace output**

Checklist:
- Client logs show `input:*` send before server logs
- Server logs show `input:*` receive before CDP logs
- CDP logs show `Input.dispatch*` calls returning without error
- WebSocket messages include `input:error` or `cdp:error`

**Step 2: Decide fix scope**

Outcome:
- Server-side bug if server never receives input or drops due to health/rate limit
- CDP bug if `Input.dispatch*` is sent but no effects recorded
- Client-side bug if client never sends input or disconnects before send

### Task 4: Server-side fix (TDD, if root cause is server)

**Files:**
- Create: `packages/server/tests/input-routing.test.ts`
- Modify: `packages/server/src/ws/handler.ts`
- Modify: `packages/server/src/services/CDPBridge.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import type { WSConnection } from '../src/types/session.js';
import { handleMessage } from '../src/ws/handler.js';

it('routes mouse input to CDP when session is healthy', async () => {
  const sent: string[] = [];
  const ws = {
    send: (payload: string) => sent.push(payload),
    data: { sessionId: 'session-1', token: 'token', lastPingAt: 0 },
  } as unknown as ServerWebSocket<WSConnection>;

  await handleMessage(ws, JSON.stringify({
    type: 'input:mouse',
    action: 'click',
    x: 10,
    y: 10,
    button: 'left',
  }));

  expect(sent.some((payload) => payload.includes('input:error'))).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test packages/server/tests/input-routing.test.ts -t "routes mouse input"
```
Expected: FAIL due to missing bridge/recorder wiring in test harness

**Step 3: Write minimal implementation**

Implement the smallest change needed based on trace evidence (examples):
- Ensure `setupBridgeAndRecorder` runs when session becomes active
- Fix `isCDPHealthy` false positives blocking input
- Correct CDP input parameters (e.g., `type` values) in `CDPBridge`

**Step 4: Run test to verify it passes**

Run:
```bash
bun test packages/server/tests/input-routing.test.ts -t "routes mouse input"
```
Expected: PASS

**Step 5: Commit**

```bash
git add packages/server/src/ws/handler.ts packages/server/src/services/CDPBridge.ts packages/server/tests/input-routing.test.ts
git commit -m "fix: route inputs through CDP when session is healthy"
```

### Task 5: Client-side fix (TDD, if root cause is client)

**Files:**
- Create: `packages/client/tests/ws-client.test.ts`
- Modify: `packages/client/src/lib/ws.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test';
import { wsClient } from '../src/lib/ws';

it('sends mouse click input when connected', () => {
  const sent: string[] = [];
  (wsClient as any).ws = { readyState: 1, send: (payload: string) => sent.push(payload) };

  wsClient.sendMouseClick(10, 20, 'left');

  expect(sent[0]).toContain('input:mouse');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test packages/client/tests/ws-client.test.ts -t "sends mouse click"
```
Expected: FAIL if client connection guard or payload shape blocks input

**Step 3: Write minimal implementation**

Implement the smallest change needed based on trace evidence (examples):
- Ensure `send` is called when `readyState` is open
- Fix client message payload shape or missing fields
- Prevent reconnect logic from dropping inputs

**Step 4: Run test to verify it passes**

Run:
```bash
bun test packages/client/tests/ws-client.test.ts -t "sends mouse click"
```
Expected: PASS

**Step 5: Commit**

```bash
git add packages/client/src/lib/ws.ts packages/client/tests/ws-client.test.ts
git commit -m "fix: ensure input messages send from client"
```

### Task 6: End-to-end verification

**Files:**
- Modify: none

**Step 1: Run server tests**

Run:
```bash
bun test packages/server/tests/input-routing.test.ts
```
Expected: PASS

**Step 2: Run client tests (if added)**

Run:
```bash
bun test packages/client/tests/ws-client.test.ts
```
Expected: PASS

**Step 3: Re-run Playwright MCP repro**

Run:
```bash
npx playwright test test-scenarios/mcp-input-ignored.spec.ts --project=chromium --headed
```
Expected: PASS with `step:new` recorded after input

**Step 4: Commit**

```bash
git status
```
Expected: No changes
