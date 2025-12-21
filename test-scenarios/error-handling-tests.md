# Error Handling and Recovery Tests

## Test Suite Overview

**Objective**: Test error handling and recovery mechanisms to identify the root cause of WebSocket closures and ensure graceful degradation when failures occur.

**Root Cause Hypothesis**: The WebSocket closure issue may stem from inadequate error handling when CDP commands fail or browser automation encounters problems.

## Test Scenarios

### 4.1 Browser Launch Failure Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: Browser launch failures are handled gracefully without WebSocket crashes

```typescript
// Test Scenarios:
A) Invalid Browser Arguments:
   1. Start session with invalid browser arguments
   2. Verify browser launch fails gracefully
   3. Connect WebSocket to failed session
   4. Verify proper error handling
   5. Test session recovery

B) Resource Exhaustion:
   1. Start multiple sessions to exhaust resources
   2. Try to start additional session
   3. Verify graceful failure handling
   4. Test WebSocket connection to failed session
   5. Verify cleanup occurs properly

C) Invalid Configuration:
   1. Set invalid browser viewport size
   2. Set invalid Chrome flags
   3. Try to start session
   4. Verify configuration validation
   5. Test error propagation

// Expected Results:
- Browser launch failures handled gracefully
- WebSocket connections don't crash
- Proper error messages displayed
- Session state reflects failure
- Resources cleaned up properly
```

### 4.2 CDP Command Failure Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: CDP command failures don't cause WebSocket instability

```typescript
// Test Scenarios:
A) Command Timeout:
   1. Navigate to slow-loading page
   2. Send commands while page is loading
   3. Verify commands timeout gracefully
   4. Verify WebSocket remains stable
   5. Test recovery after page loads

B) Invalid Commands:
   1. Send malformed CDP commands
   2. Send commands with invalid parameters
   3. Send commands to disconnected CDP session
   4. Verify errors are handled properly
   5. Verify WebSocket doesn't close

C) Browser Crash During Commands:
   1. Start browser interaction
   2. Simulate browser crash
   3. Send commands during crash
   4. Verify graceful error handling
   5. Test session recovery

// Expected Results:
- Command failures don't crash WebSocket
- Errors logged appropriately
- Client receives proper error messages
- Session can recover from failures
- No resource leaks from failures
```

### 4.3 Network Interruption Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: Network interruptions are handled gracefully with proper reconnection

```typescript
// Test Scenarios:
A) WebSocket Disconnection:
   1. Establish WebSocket connection
   2. Simulate network disconnection
   3. Verify automatic reconnection
   4. Test browser control after reconnection
   5. Verify step recording continues

B) Browser Network Issues:
   1. Start browser interaction
   2. Simulate browser network disconnection
   3. Try to navigate during disconnection
   4. Verify graceful handling
   5. Test recovery after network restoration

C) Server Restart:
   1. Establish session and WebSocket connection
   2. Restart server process
   3. Verify reconnection succeeds
   4. Test session state recovery
   5. Verify browser control restored

// Expected Results:
- Automatic reconnection within 10 seconds
- Session state recovered after reconnection
- Browser control restored
- No duplicate steps recorded
- No WebSocket connection leaks
```

### 4.4 Resource Exhaustion Test
**Priority**: High  
**Duration**: 6-7 minutes  
**Expected Behavior**: System handles resource exhaustion gracefully

```typescript
// Test Scenarios:
A) Memory Exhaustion:
   1. Start multiple browser sessions
   2. Execute memory-intensive operations
   3. Monitor memory usage
   4. Verify graceful degradation
   5. Test recovery after memory release

B) CPU Exhaustion:
   1. Start high-frequency interactions
   2. Monitor CPU usage
   3. Verify system remains responsive
   4. Test command throttling
   5. Verify recovery after load reduction

C) Disk Space Exhaustion:
   1. Fill disk space with screenshots
   2. Continue recording operations
   3. Verify graceful handling
   4. Test cleanup after space release

// Expected Results:
- System remains responsive under load
- Graceful degradation of features
- Automatic recovery when resources freed
- No crashes or data corruption
- Proper cleanup of resources
```

### 4.5 Invalid Session State Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: Invalid session states are handled gracefully

```typescript
// Test Scenarios:
A) Stale Session Token:
   1. Create session and get token
   2. End session
   3. Try to connect WebSocket with old token
   4. Verify proper authentication failure
   5. Verify clean connection closure

B) Session State Corruption:
   1. Start session
   2. Corrupt session state in memory
   3. Try to use WebSocket connection
   4. Verify error handling
   5. Test session recovery

C) Concurrent Session Access:
   1. Create session
   2. Connect multiple WebSocket clients
   3. Simulate conflicting operations
   4. Verify proper state management
   5. Test conflict resolution

// Expected Results:
- Invalid tokens rejected cleanly
- Corrupted state detected and handled
- Concurrent access managed properly
- No crashes from state issues
- Proper error messages returned
```

### 4.6 Screenshot Capture Failure Test
**Priority**: Medium  
**Duration**: 3-4 minutes  
**Expected Behavior**: Screenshot failures don't break step recording

```typescript
// Test Scenarios:
A) Blank Page Screenshots:
   1. Navigate to blank page
   2. Perform actions
   3. Verify screenshot capture handles blank pages
   4. Verify step recording continues

B) Screenshot Timeout:
   1. Navigate to very slow page
   2. Perform actions quickly
   3. Verify screenshot timeout handling
   4. Verify step creation continues

C) Corrupted Screenshot:
   1. Simulate screenshot corruption
   2. Verify error handling
   3. Test step metadata preservation
   4. Verify recording continuation

// Expected Results:
- Screenshot failures don't stop recording
- Steps created with placeholder screenshots
- Step metadata preserved accurately
- Recording continues after failures
```

### 4.7 Recovery Mechanism Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: System can recover from various failure states

```typescript
// Test Scenarios:
A) Browser Process Recovery:
   1. Start session and WebSocket connection
   2. Kill browser process manually
   3. Verify detection of browser failure
   4. Test automatic browser restart
   5. Verify session continuity

B) CDP Session Recovery:
   1. Establish browser control
   2. Disconnect CDP session
   3. Verify detection of CDP failure
   4. Test CDP reconnection
   5. Verify control restoration

C) WebSocket Recovery:
   1. Start session and connection
   2. Force WebSocket closure
   3. Test automatic reconnection
   4. Verify state restoration
   5. Verify continued recording

// Expected Results:
- Automatic detection of failures
- Recovery mechanisms function properly
- Session state preserved during recovery
- No data loss during recovery
- Smooth user experience during recovery
```

## Critical Monitoring Points

### Error Detection
- Browser crashes detected within 5 seconds
- CDP failures detected immediately
- Network issues detected within 10 seconds
- Resource exhaustion detected proactively

### Recovery Success
- Automatic recovery within 30 seconds
- Session state preserved during recovery
- No duplicate steps created
- Browser control restored successfully
- WebSocket reconnection succeeds

### Error Handling Quality
- No crashes or unhandled exceptions
- Appropriate error messages logged
- Client notified of errors appropriately
- Resources cleaned up properly
- No memory leaks from errors

## Failure Indicators

- WebSocket crashes on errors
- Browser failures not detected
- Recovery attempts fail
- Resources leak from errors
- Session state corrupted by errors

## Success Indicators

- All errors handled gracefully
- Automatic recovery within 30 seconds
- Session state preserved
- No resource leaks
- Smooth error reporting

## Automated Test Commands

```bash
# Run error handling tests
npm run test:error-handling

# Run specific error scenario
npm run test:error-handling -- --grep "Browser Launch Failure"

# Run with verbose error logging
npm run test:error-handling -- --verbose --log-level debug
```

## Environment Requirements

```bash
# Error testing environment
NODE_ENV=test
LOG_LEVEL=debug
MAX_SESSIONS=5
IDLE_TIMEOUT_MS=60000
```

## Error Simulation Tools

### Browser Crashes
```bash
# Kill browser process
kill -9 $(pgrep chromium)

# Corrupt CDP session
# Send invalid CDP commands
```

### Network Issues
```bash
# Block network access
iptables -A OUTPUT -p tcp --dport 3000 -j DROP

# Simulate slow network
tc qdisc add dev eth0 root netem delay 1000ms
```

### Resource Exhaustion
```bash
# Fill memory
stress --vm 1 --vm-bytes 1G

# Fill disk
dd if=/dev/zero of=/tmp/largefile bs=1G count=10