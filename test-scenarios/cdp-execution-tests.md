# CDP Command Execution Tests

## Test Suite Overview

**Objective**: Verify that CDP (Chrome DevTools Protocol) commands execute correctly through the WebSocket bridge and browser interactions work as expected.

**Root Cause Hypothesis**: CDP command failures or timeouts may cause WebSocket instability when error handling is inadequate.

## Test Scenarios

### 2.1 Mouse Input Command Test
**Priority**: High  
**Duration**: 2-3 minutes  
**Expected Behavior**: Mouse commands execute in browser with proper coordinate translation

```typescript
// Test Steps:
1. Create session and navigate to test page
2. Establish WebSocket connection
3. Send mouse move to specific coordinates
4. Send mouse down event
5. Send mouse up event
6. Send mouse click event
7. Verify each command executes successfully
8. Verify no WebSocket closures during commands

// Expected Results:
- All mouse commands execute without error
- Browser responds to all mouse events
- Coordinates translate correctly
- No WebSocket connection drops
- Step recording captures mouse actions
```

### 2.2 Keyboard Input Command Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: Keyboard commands execute correctly with proper character handling

```typescript
// Test Scenarios:
A) Text Input:
   1. Focus text input field
   2. Send key down/up sequences for "Hello World"
   3. Verify text appears in field
   4. Verify step recording captures typing

B) Special Keys:
   1. Send Tab key
   2. Send Enter key
   3. Send Escape key
   4. Send modifier combinations (Ctrl+C, Shift+Tab)
   5. Verify all keys execute correctly

C) Rapid Input:
   1. Send 100 characters rapidly
   2. Verify no input loss
   3. Verify no connection instability

// Expected Results:
- All keyboard commands execute
- Text input appears correctly
- Special keys work as expected
- Rapid input doesn't cause issues
- Step recording captures all typing
```

### 2.3 Navigation Command Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: Navigation commands execute and update session state correctly

```typescript
// Test Steps:
1. Start at initial URL (e.g., https://example.com)
2. Send navigate command to new URL
3. Verify page loads successfully
4. Verify session state updates (url, title)
5. Test goBack command
6. Verify navigation history works
7. Test goForward command
8. Test reload command

// Expected Results:
- All navigation commands succeed
- Session state updates correctly
- Page titles update
- Navigation history functions properly
- No WebSocket closures during navigation
```

### 2.4 Scroll Command Test
**Priority**: Medium  
**Duration**: 2-3 minutes  
**Expected Behavior**: Scroll commands execute with proper coordinate handling

```typescript
// Test Steps:
1. Navigate to long page
2. Send scroll down command
3. Verify page scrolls
4. Send scroll up command
5. Verify page scrolls up
6. Send scroll to specific coordinates
7. Verify precise scrolling
8. Test scroll speed (rapid vs slow)

// Expected Results:
- All scroll commands execute
- Page scrolls to correct positions
- Smooth scrolling behavior
- Step recording captures scroll actions
```

### 2.5 CDP Connection Health Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: CDP connection remains stable throughout browser interaction

```typescript
// Test Steps:
1. Establish WebSocket connection
2. Start monitoring CDP connection health
3. Execute various commands for 2 minutes:
   - Multiple mouse clicks
   - Text input sequences
   - Navigation between pages
   - Scroll operations
4. Verify CDP connection never drops
5. Verify no command timeouts
6. Check browser process health

// Expected Results:
- CDP connection remains stable
- No command timeouts (>5 seconds)
- Browser process stays healthy
- All commands execute successfully
- No memory leaks or resource exhaustion
```

### 2.6 Element Targeting Test
**Priority**: Medium  
**Duration**: 3-4 minutes  
**Expected Behavior**: Commands target correct elements and capture proper highlights

```typescript
// Test Steps:
1. Create test page with various elements
2. Send click commands to specific elements
3. Verify elements are targeted correctly
4. Check step recording for proper highlights
5. Test coordinate-based targeting
6. Test selector-based targeting
7. Verify bounding boxes are captured

// Expected Results:
- Commands target correct elements
- Highlights capture accurate bounding boxes
- Selectors work reliably
- Step metadata is complete
```

### 2.7 Browser Resource Management Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: Browser resources are managed properly under load

```typescript
// Test Steps:
1. Start session and connect WebSocket
2. Execute high-frequency operations:
   - Rapid mouse movements
   - Continuous typing
   - Multiple page navigations
   - Frequent screenshots
3. Monitor resource usage:
   - Memory consumption
   - CPU usage
   - Network traffic
   - Browser process status
4. Verify no resource exhaustion
5. Test recovery after load

// Expected Results:
- Resource usage remains stable
- No browser crashes or freezes
- Graceful degradation under load
- Recovery after high load periods
- No zombie browser processes
```

## Critical Monitoring Points

### CDP Bridge Health
- CDP session connection status
- Command execution timeouts
- Browser process status
- Screenshot capture success rate

### WebSocket Stability
- readyState during CDP operations
- Message delivery confirmation
- Error propagation handling
- Resource cleanup success

### Browser Interaction
- Element targeting accuracy
- Coordinate translation correctness
- Event handling reliability
- DOM state consistency

## Failure Indicators

- CDP commands timeout (>5 seconds)
- Browser becomes unresponsive
- Element targeting failures
- Coordinate translation errors
- Screenshot capture failures
- Memory usage growth >100MB during test

## Success Indicators

- All commands execute within 2 seconds
- Browser remains responsive
- Element targeting 95%+ accuracy
- Stable memory usage
- Clean resource cleanup
- No browser process leaks

## Automated Test Commands

```bash
# Run CDP execution tests
npm run test:cdp-execution

# Run with browser debugging
npm run test:cdp-execution -- --debug-browser

# Run specific command test
npm run test:cdp-execution -- --grep "Mouse Input"
```

## Environment Requirements

```bash
# Browser testing environment
BROWSER_VIEWPORT_WIDTH=1280
BROWSER_VIEWPORT_HEIGHT=800
SCREENCAST_QUALITY=80
SCREENCAST_MAX_FPS=15
```

## Test Data

### Test URLs
- Simple page: `https://example.com`
- Complex page: `https://example.com` with multiple forms
- Dynamic page: `https://example.com` with JavaScript interactions
- Long page: `https://example.com` with extensive content

### Test Coordinates
- Standard positions: (100, 100), (500, 300), (800, 600)
- Edge cases: (0, 0), (1279, 799), negative coordinates
- Rapid sequence: (100, 100) → (200, 200) → (300, 300)...

### Test Text Input
- Simple: "Hello World"
- Special characters: "Test @#$%^&*()"
- Unicode: "测试 émojis 🚀"
- Long text: 1000+ character string
- Rapid input: 50 characters per second