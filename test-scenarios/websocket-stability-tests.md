# WebSocket Connection Stability Tests

## Test Suite Overview

**Objective**: Identify and verify fixes for WebSocket connections that close immediately (readyState: 3) and ensure stable real-time communication.

**Root Cause Hypothesis**: Resource cleanup race conditions, browser session instability, and inadequate error handling when CDP operations fail.

## Test Scenarios

### 1.1 WebSocket Connection Lifecycle Test
**Priority**: High  
**Duration**: 2-3 minutes  
**Expected Behavior**: WebSocket connects, authenticates, and maintains stable connection

```typescript
// Test Steps:
1. Create new session via POST /api/sessions
2. Connect WebSocket with sessionId + token
3. Verify readyState === 1 (OPEN)
4. Send ping message
5. Verify pong response received
6. Keep connection alive for 60 seconds
7. Verify no unexpected closures
8. Send test mouse input
9. Verify acknowledgment

// Expected Results:
- Connection established within 2 seconds
- No readyState transitions to 3 (CLOSED)
- Pong response within 1 second
- No console errors
- Mouse input acknowledged
```

### 1.2 WebSocket Reconnection Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: Automatic reconnection works correctly after network interruption

```typescript
// Test Steps:
1. Establish WebSocket connection
2. Simulate network interruption (close socket)
3. Verify reconnection attempt within 1 second
4. Verify re-authentication succeeds
5. Verify session state is restored
6. Test browser interaction after reconnection
7. Verify steps are still being recorded

// Expected Results:
- Reconnection within 5 seconds
- Re-authentication succeeds
- Session state properly restored
- No duplicate steps recorded
- Browser control restored
```

### 1.3 Multiple Connection Test
**Priority**: High  
**Duration**: 2-3 minutes  
**Expected Behavior**: Multiple clients can connect to same session simultaneously

```typescript
// Test Steps:
1. Create session and get credentials
2. Connect client A WebSocket
3. Connect client B WebSocket (same session)
4. Send input from client A
5. Verify both clients receive step updates
6. Send input from client B
7. Verify both clients receive step updates
8. Disconnect client A
9. Verify client B still functional
10. Reconnect client A

// Expected Results:
- Both connections stable
- Real-time synchronization between clients
- No interference between connections
- Graceful handling of client disconnections
```

### 1.4 Session State Transition Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: WebSocket handles all session state transitions correctly

```typescript
// Test Scenarios:
A) Lobby → Starting → Active:
   1. Connect in lobby state
   2. Start session via POST /api/sessions/:id/start
   3. Verify WebSocket receives session:state updates
   4. Verify browser becomes available for control

B) Active → Ending → Closed:
   1. Connect in active state
   2. End session via POST /api/sessions/:id/end
   3. Verify WebSocket closure with proper code
   4. Verify cleanup completes successfully

C) Failed State Recovery:
   1. Simulate browser launch failure
   2. Connect WebSocket
   3. Verify error handling
   4. Retry session start
   5. Verify recovery
```

### 1.5 Rate Limiting Test
**Priority**: Medium  
**Duration**: 2-3 minutes  
**Expected Behavior**: Rate limiting prevents abuse without breaking legitimate usage

```typescript
// Test Steps:
1. Establish WebSocket connection
2. Send 61 mouse input messages within 1 second
3. Verify messages are rate limited (silently dropped)
4. Wait for rate limit reset
5. Send message and verify it's processed
6. Verify no connection closure due to rate limiting

// Expected Results:
- Excess messages dropped silently
- Connection remains stable
- Legitimate usage unaffected
- Proper rate limit reset
```

## Test Implementation Notes

### Critical Monitoring Points
1. **WebSocket readyState transitions**: Track all transitions to CLOSED (3)
2. **CDP bridge initialization**: Verify bridge and recorder setup
3. **Browser session health**: Monitor browser process status
4. **Resource cleanup**: Verify cleanup operations complete
5. **Error propagation**: Ensure errors don't crash connections

### Failure Indicators
- Connection closes within 5 seconds of establishment
- readyState transitions to 3 without client-initiated close
- CDP bridge or recorder initialization failures
- Browser process crashes or becomes unresponsive
- Resource cleanup timeouts (>10 seconds)

### Success Indicators
- Stable connections for 5+ minutes
- Proper handling of network interruptions
- Successful reconnection and state restoration
- Clean resource cleanup on session end
- No browser process leaks

## Automated Test Commands

```bash
# Run WebSocket stability tests
npm run test:websocket-stability

# Run with verbose logging
npm run test:websocket-stability -- --verbose

# Run specific test
npm run test:websocket-stability -- --grep "Connection Lifecycle"
```

## Environment Requirements

```bash
# Test environment variables
NODE_ENV=test
PORT=3001
MAX_SESSIONS=10
IDLE_TIMEOUT_MS=60000
SCREENCAST_MAX_FPS=10
```

## Cleanup

After each test:
- Close all WebSocket connections
- End all browser sessions
- Clean up temporary files
- Reset test database/state
- Verify no zombie processes remain