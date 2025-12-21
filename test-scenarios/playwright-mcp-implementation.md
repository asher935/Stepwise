# Playwright MCP Test Implementation Plan

## Overview

This implementation plan provides a practical guide for using Playwright MCP to test the Stepwise application and identify the root cause of WebSocket closure issues.

**Primary Goal**: Identify why WebSocket connections close immediately (readyState: 3) and verify fixes through comprehensive testing.

**Secondary Goal**: Ensure all Stepwise functionality works reliably under various conditions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PLAYWRIGHT MCP TEST SUITE                     │
├─────────────────────────────────────────────────────────────────┤
│  Test Runner (Node.js)                                          │
│  ├── WebSocket Stability Tests                                   │
│  ├── CDP Command Tests                                           │
│  ├── Browser Interaction Tests                                   │
│  ├── Step Recording Tests                                        │
│  ├── Import/Export Tests                                         │
│  └── Error Handling Tests                                        │
├─────────────────────────────────────────────────────────────────┤
│  Stepwise Application Under Test                                 │
│  ├── Client (React SPA)                                          │
│  ├── Server (Bun + Elysia)                                       │
│  ├── WebSocket Endpoint (/ws)                                    Browser │
│  └── Automation (Playwright + CDP)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Strategy

### Phase 1: Environment Setup (30 minutes)

#### 1.1 Install Dependencies
```bash
# Install Playwright MCP and dependencies
npm install @playwright/test
npm install playwright
npm install ws
npm install axios
npm install form-data

# Install Playwright browsers
npx playwright install chromium
npx playwright install-deps
```

#### 1.2 Test Environment Configuration
```typescript
// test/config/test.config.ts
export const testConfig = {
  stepwise: {
    baseUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3000/ws',
    timeout: 30000,
  },
  browser: {
    headless: false, // Set to true for CI
    slowMo: 0, // Add delay for debugging
    viewport: { width: 1280, height: 800 },
  },
  test: {
    timeout: 60000,
    expectTimeout: 5000,
  }
};
```

#### 1.3 Server Startup Script
```bash
#!/bin/bash
# scripts/start-test-server.sh

# Start Stepwise server for testing
export NODE_ENV=test
export PORT=3000
export MAX_SESSIONS=10
export IDLE_TIMEOUT_MS=60000
export TEMP_DIR=/tmp/stepwise-test

# Clean up test directory
rm -rf /tmp/stepwise-test

# Start server
cd packages/server
bun run dev &
SERVER_PID=$!

# Wait for server to be ready
sleep 5

# Verify server is running
curl -f http://localhost:3000/api/health || {
  echo "Server failed to start"
  kill $SERVER_PID
  exit 1
}

echo "Server started successfully (PID: $SERVER_PID)"
echo $SERVER_PID > /tmp/stepwise-server.pid
```

### Phase 2: WebSocket Testing Framework (45 minutes)

#### 2.1 WebSocket Test Utilities
```typescript
// test/utils/websocket-client.ts
import WebSocket from 'ws';

export class TestWebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(message: any) => void> = [];
  private connectionPromise: Promise<void> | null = null;
  
  async connect(sessionId: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:3000/ws?sessionId=${sessionId}&token=${token}`;
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('[Test] WebSocket connected');
        resolve();
      };
      
      this.ws.onclose = (event) => {
        console.log(`[Test] WebSocket closed: ${event.code} ${event.reason}`);
        this.ws = null;
      };
      
      this.ws.onerror = (error) => {
        console.log('[Test] WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.messageHandlers.forEach(handler => handler(message));
        } catch (error) {
          console.error('[Test] Failed to parse message:', error);
        }
      };
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }
  
  onMessage(handler: (message: any) => void): void {
    this.messageHandlers.push(handler);
  }
  
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
  
  isConnected(): boolean {
    return this.readyState === WebSocket.OPEN;
  }
}
```

#### 2.2 Session Management Utilities
```typescript
// test/utils/session-manager.ts
import axios from 'axios';

export class TestSessionManager {
  private baseUrl = 'http://localhost:3000';
  
  async createSession(startUrl?: string): Promise<{sessionId: string, token: string}> {
    const response = await axios.post(`${this.baseUrl}/api/sessions`, {
      startUrl
    });
    return response.data;
  }
  
  async startSession(sessionId: string): Promise<void> {
    await axios.post(`${this.baseUrl}/api/sessions/${sessionId}/start`);
  }
  
  async endSession(sessionId: string): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/api/sessions/${sessionId}/end`);
    } catch (error) {
      // Session might already be ended
      console.log('Session end error (expected):', error.message);
    }
  }
  
  async getSessionState(sessionId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }
}
```

### Phase 3: Core Test Implementations (2-3 hours)

#### 3.1 WebSocket Connection Stability Test
```typescript
// test/websocket-stability.spec.ts
import { test, expect } from '@playwright/test';
import { TestWebSocketClient } from '../utils/websocket-client';
import { TestSessionManager } from '../utils/session-manager';

test.describe('WebSocket Connection Stability', () => {
  let wsClient: TestWebSocketClient;
  let sessionManager: TestSessionManager;
  let sessionId: string;
  let token: string;
  
  test.beforeEach(async () => {
    wsClient = new TestWebSocketClient();
    sessionManager = new TestSessionManager();
    
    const session = await sessionManager.createSession('about:blank');
    sessionId = session.sessionId;
    token = session.token;
    
    await sessionManager.startSession(sessionId);
  });
  
  test.afterEach(async () => {
    wsClient.disconnect();
    await sessionManager.endSession(sessionId);
  });
  
  test('should connect and maintain stable WebSocket connection', async () => {
    // Connect WebSocket
    await wsClient.connect(sessionId, token);
    
    // Verify connection is stable
    expect(wsClient.isConnected()).toBe(true);
    expect(wsClient.readyState).toBe(1); // WebSocket.OPEN
    
    // Send ping and verify pong
    let pongReceived = false;
    wsClient.onMessage((message) => {
      if (message.type === 'pong') {
        pongReceived = true;
      }
    });
    
    wsClient.send({ type: 'ping', timestamp: Date.now() });
    
    // Wait for pong
    await test.step('Wait for pong response', async () => {
      const start = Date.now();
      while (!pongReceived && Date.now() - start < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(pongReceived).toBe(true);
    });
    
    // Keep connection alive and monitor for closures
    await test.step('Monitor connection for 60 seconds', async () => {
      const start = Date.now();
      while (Date.now() - start < 60000) {
        if (!wsClient.isConnected()) {
          throw new Error(`WebSocket closed unexpectedly at ${Date.now() - start}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });
  });
  
  test('should handle reconnection after network interruption', async () => {
    // Initial connection
    await wsClient.connect(sessionId, token);
    expect(wsClient.isConnected()).toBe(true);
    
    // Simulate network interruption
    wsClient.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify disconnection
    expect(wsClient.isConnected()).toBe(false);
    
    // Reconnect
    await wsClient.connect(sessionId, token);
    expect(wsClient.isConnected()).toBe(true);
    
    // Verify session state is still accessible
    const sessionState = await sessionManager.getSessionState(sessionId);
    expect(sessionState).toBeTruthy();
    expect(sessionState.status).toBe('active');
  });
});
```

#### 3.2 CDP Command Execution Test
```typescript
// test/cdp-execution.spec.ts
import { test, expect } from '@playwright/test';
import { TestWebSocketClient } from '../utils/websocket-client';
import { TestSessionManager } from '../utils/session-manager';

test.describe('CDP Command Execution', () => {
  let wsClient: TestWebSocketClient;
  let sessionManager: TestSessionManager;
  let sessionId: string;
  let token: string;
  
  test.beforeEach(async () => {
    wsClient = new TestWebSocketClient();
    sessionManager = new TestSessionManager();
    
    const session = await sessionManager.createSession('data:text/html,<input id="test-input"><button id="test-button">Click Me</button>');
    sessionId = session.sessionId;
    token = session.token;
    
    await sessionManager.startSession(sessionId);
    await wsClient.connect(sessionId, token);
  });
  
  test.afterEach(async () => {
    wsClient.disconnect();
    await sessionManager.endSession(sessionId);
  });
  
  test('should execute mouse commands correctly', async () => {
    let clickReceived = false;
    let stepCreated = false;
    
    wsClient.onMessage((message) => {
      if (message.type === 'step:new' && message.step.action === 'click') {
        stepCreated = true;
        clickReceived = true;
      }
    });
    
    // Send mouse click
    wsClient.send({
      type: 'input:mouse',
      action: 'click',
      x: 100,
      y: 200,
      button: 'left'
    });
    
    // Wait for step creation
    await test.step('Wait for click to be recorded as step', async () => {
      const start = Date.now();
      while (!stepCreated && Date.now() - start < 10000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(stepCreated).toBe(true);
    });
  });
  
  test('should execute keyboard commands correctly', async () => {
    let typeStepCreated = false;
    
    wsClient.onMessage((message) => {
      if (message.type === 'step:new' && message.step.action === 'type') {
        typeStepCreated = true;
      }
    });
    
    // Send keyboard input
    wsClient.send({
      type: 'input:keyboard',
      action: 'press',
      key: 'a',
      text: 'a'
    });
    
    // Wait for step creation
    await test.step('Wait for typing to be recorded', async () => {
      const start = Date.now();
      while (!typeStepCreated && Date.now() - start < 10000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(typeStepCreated).toBe(true);
    });
  });
});
```

#### 3.3 Browser Interaction Test
```typescript
// test/browser-interactions.spec.ts
import { test, expect } from '@playwright/test';
import { TestWebSocketClient } from '../utils/websocket-client';
import { TestSessionManager } from '../utils/session-manager';

test.describe('Browser Interactions', () => {
  let wsClient: TestWebSocketClient;
  let sessionManager: TestSessionManager;
  let sessionId: string;
  let token: string;
  
  test.beforeEach(async () => {
    wsWebSocketClient();
Client = new Test    sessionManager = new TestSessionManager();
    
    const session = await sessionManager.createSession('https://example.com');
    sessionId = session.sessionId;
    token = session.token;
    
    await sessionManager.startSession(sessionId);
    await wsClient.connect(sessionId, token);
  });
  
  test.afterEach(async () => {
    wsClient.disconnect();
    await sessionManager.endSession(sessionId);
  });
  
  test('should handle navigation commands', async () => {
    let sessionStateUpdated = false;
    let newUrl: string | null = null;
    
    wsClient.onMessage((message) => {
      if (message.type === 'session:state' && message.state.url !== 'https://example.com') {
        sessionStateUpdated = true;
        newUrl = message.state.url;
      }
    });
    
    // Navigate to a new page
    wsClient.send({
      type: 'navigate',
      action: 'goto',
      url: 'https://httpbin.org/html'
    });
    
    // Wait for navigation to complete
    await test.step('Wait for navigation', async () => {
      const start = Date.now();
      while (!sessionStateUpdated && Date.now() - start < 30000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(sessionStateUpdated).toBe(true);
      expect(newUrl).toBe('https://httpbin.org/html');
    });
  });
});
```

### Phase 4: Error Handling Tests (1 hour)

#### 4.1 Browser Failure Simulation
```typescript
// test/error-handling.spec.ts
import { test, expect } from '@playwright/test';
import { TestWebSocketClient } from '../utils/websocket-client';
import { TestSessionManager } from '../utils/session-manager';

test.describe('Error Handling', () => {
  test('should handle browser launch failure gracefully', async () => {
    const sessionManager = new TestSessionManager();
    
    // Try to create session with invalid configuration
    process.env.BROWSER_VIEWPORT_WIDTH = '-1'; // Invalid value
    
    const session = await sessionManager.createSession('about:blank');
    
    // Starting session should fail gracefully
    await expect(sessionManager.startSession(session.sessionId)).rejects.toThrow();
    
    // Clean up
    delete process.env.BROWSER_VIEWPORT_WIDTH;
  });
  
  test('should handle WebSocket closure without crashes', async () => {
    const wsClient = new TestWebSocketClient();
    const sessionManager = new TestSessionManager();
    
    const session = await sessionManager.createSession('about:blank');
    await sessionManager.startSession(session.sessionId);
    
    await wsClient.connect(session.sessionId, session.token);
    expect(wsClient.isConnected()).toBe(true);
    
    // Simulate browser crash by ending session
    await sessionManager.endSession(session.sessionId);
    
    // WebSocket should close gracefully
    await test.step('Wait for graceful WebSocket closure', async () => {
      const start = Date.now();
      while (wsClient.isConnected() && Date.now() - start < 10000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(wsClient.isConnected()).toBe(false);
    });
    
    wsClient.disconnect();
  });
});
```

### Phase 5: Test Execution and Reporting (30 minutes)

#### 5.1 Test Runner Configuration
```typescript
// test-runner.js
import { test as base, expect } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';

// Custom test fixture with server management
const testWithServer = base.extend({
  serverProcess: async ({}, use) => {
    // Start server
    const serverProcess = spawn('./scripts/start-test-server.sh');
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await use(serverProcess);
    
    // Cleanup
    const pid = fs.readFileSync('/tmp/stepwise-server.pid', 'utf8').trim();
    process.kill(pid);
    serverProcess.kill();
  }
});

export { testWithServer as test, expect };
```

#### 5.2 Test Execution Scripts
```bash
#!/bin/bash
# run-websocket-tests.sh

echo "Starting Stepwise WebSocket Test Suite"

# Setup environment
export NODE_ENV=test
export PORT=3000

# Start server
./scripts/start-test-server.sh &
SERVER_PID=$!

# Wait for server
sleep 10

# Run tests
npx playwright test --grep "WebSocket" --reporter=html

# Cleanup
kill $SERVER_PID

echo "Test suite completed"
```

#### 5.3 CI/CD Integration
```yaml
# .github/workflows/websocket-tests.yml
name: WebSocket Stability Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        npm install
        npx playwright install chromium
    
    - name: Run WebSocket tests
      run: |
        ./scripts/run-websocket-tests.sh
    
    - name: Upload test results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

## Test Data and Fixtures

### Test Pages
```html
<!-- test/fixtures/test-pages/simple-form.html -->
<!DOCTYPE html>
<html>
<head><title>Simple Form Test</title></head>
<body>
  <form id="test-form">
    <input type="text" id="email" name="email" placeholder="Email">
    <input type="password" id="password" name="password" placeholder="Password">
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
</body>
</html>
```

### Mock Data
```typescript
// test/fixtures/mock-data.ts
export const mockSteps = [
  {
    id: 'step-1',
    action: 'click',
    target: {
      selector: 'button[type="submit"]',
      boundingBox: { x: 100, y: 200, width: 120, height: 40 },
      elementTag: 'BUTTON',
      elementText: 'Submit'
    },
    timestamp: Date.now(),
    screenshotPath: '/screenshots/step-1.jpg'
  }
];
```

## Performance Monitoring

### Resource Usage Tracking
```typescript
// test/utils/resource-monitor.ts
export class ResourceMonitor {
  private memoryUsage: number[] = [];
  private cpuUsage: number[] = [];
  
  startMonitoring(): void {
    setInterval(() => {
      const usage = process.memoryUsage();
      this.memoryUsage.push(usage.heapUsed);
      
      const cpuUsage = process.cpuUsage();
      this.cpuUsage.push(cpuUsage.user + cpuUsage.system);
    }, 1000);
  }
  
  getReport() {
    return {
      maxMemory: Math.max(...this.memoryUsage),
      avgMemory: this.memoryUsage.reduce((a, b) => a + b) / this.memoryUsage.length,
      maxCPU: Math.max(...this.cpuUsage),
      avgCPU: this.cpuUsage.reduce((a, b) => a + b) / this.cpuUsage.length
    };
  }
}
```

## Troubleshooting Guide

### Common Issues

#### WebSocket Connection Fails
```typescript
// Debug WebSocket connection issues
test('debug WebSocket connection', async () => {
  const wsClient = new TestWebSocketClient();
  
  try {
    await wsClient.connect(sessionId, token);
  } catch (error) {
    console.log('WebSocket connection failed:', error);
    
    // Check server health
    const health = await axios.get('http://localhost:3000/api/health');
    console.log('Server health:', health.data);
    
    // Check session state
    const session = await sessionManager.getSessionState(sessionId);
    console.log('Session state:', session);
    
    throw error;
  }
});
```

#### Browser Launch Failures
```bash
# Debug browser issues
export DEBUG=pw:browser*
npx playwright test --debug

# Check browser installation
npx playwright install --dry-run chromium
```

## Success Criteria

### WebSocket Stability
- ✅ 99% of test connections remain stable for 60+ seconds
- ✅ Reconnection works within 10 seconds
- ✅ No unexpected closures (readyState → 3)

### CDP Command Execution
- ✅ 95%+ command success rate
- ✅ Commands execute within 2 seconds
- ✅ No browser crashes during automation

### Browser Interactions
- ✅ 95%+ interaction accuracy
- ✅ Steps created within 5 seconds of action
- ✅ Screenshots high quality and accurate

### Error Handling
- ✅ Graceful degradation on failures
- ✅ Automatic recovery within 30 seconds
- ✅ No resource leaks from errors

## Next Steps

1. **Run Initial Test Suite**: Execute tests to identify specific failure patterns
2. **Analyze Root Causes**: Focus on WebSocket closure patterns
3. **Implement Fixes**: Address identified issues in order of severity
4. **Verify Fixes**: Re-run tests to confirm improvements
5. **Continuous Monitoring**: Set up automated testing in CI/CD

This comprehensive test suite will provide the foundation for identifying and resolving the WebSocket closure issues in the Stepwise application.