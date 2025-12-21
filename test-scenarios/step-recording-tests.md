# Step Recording and Playback Tests

## Test Suite Overview

**Objective**: Verify that step recording captures user interactions accurately and that step data is complete and consistent for reliable playback.

**Root Cause Hypothesis**: Step recording failures or incomplete data may cause instability in the recording pipeline and potentially contribute to WebSocket closure issues.

## Test Scenarios

### 5.1 Step Creation Accuracy Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: Steps are created accurately with complete metadata

```typescript
// Test Steps:
1. Create new session and connect WebSocket
2. Navigate through a sequence of actions:
   - Click button at (100, 200)
   - Type "test@example.com" in email field
   - Navigate to new page
   - Scroll down 300px
3. Verify each step is created with accurate data:
   - Correct action type (click, type, navigate, scroll)
   - Accurate timestamp
   - Proper screenshot path and data
   - Correct element highlighting
   - Appropriate caption generation
4. Verify step indexing is sequential (1, 2, 3, 4...)
5. Verify step metadata completeness

// Expected Results:
- All steps created within 2 seconds of action
- Step metadata 100% accurate
- Screenshots show correct state
- Captions match actual actions
- Element highlighting precise
```

### 5.2 Step Screenshot Quality Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: Screenshots are high-quality and show correct browser state

```typescript
// Test Scenarios:
A) Static Page Screenshots:
   1. Navigate to static page
   2. Perform various actions
   3. Verify screenshots are sharp and clear
   4. Verify correct viewport captured
   5. Verify element highlighting visible

B) Dynamic Content Screenshots:
   1. Navigate to page with dynamic content
   2. Trigger content changes
   3. Verify screenshots capture dynamic state
   4. Verify timing is appropriate
   5. Verify no motion blur

C) Full Page vs Viewport:
   1. Test long page scrolling
   2. Verify viewport screenshots
   3. Verify scroll position captured
   4. Test multiple scroll positions

// Expected Results:
- Screenshots are JPEG quality ≥80%
- Viewport correctly captured
- Element highlighting visible
- No blank or corrupted screenshots
- Appropriate screenshot timing
```

### 5.3 Step Metadata Completeness Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: All step metadata fields are populated correctly

```typescript
// Test Scenarios:
A) Click Step Metadata:
   1. Click on various element types
   2. Verify click metadata:
     - button (left/right/middle)
     - element tag name
     - bounding box coordinates
     - element text content
     - selector (if available)

B) Type Step Metadata:
   1. Type in various field types
   2. Verify type metadata:
     - field name/label
     - redacted display text
     - element highlighting
     - input value (if not sensitive)

C) Navigate Step Metadata:
   1. Navigate between pages
   2. Verify navigate metadata:
     - fromUrl
     - toUrl
     - page title changes

// Expected Results:
- All metadata fields populated
- Element selectors work reliably
- Bounding boxes accurate
- Text content properly extracted
- Redaction working correctly
```

### 5.4 Step Editing Test
**Priority**: Medium  
**Duration**: 4-5 minutes  
**Expected Behavior**: Step editing works correctly and updates are synchronized

```typescript
// Test Steps:
1. Create session with several steps
2. Edit step captions via API
3. Verify updates propagate to WebSocket clients
4. Edit multiple steps simultaneously
5. Verify edit history is maintained
6. Test step deletion
7. Verify remaining steps reindex properly
8. Test edit validation (empty captions, etc.)

// Expected Results:
- Edit operations complete successfully
- Updates propagate to all clients
- Edit history maintained
- Step deletion works correctly
- Reindexing happens automatically
- Validation prevents invalid edits
```

### 5.5 Step Playback Simulation Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: Recorded steps can be replayed accurately

```typescript
// Test Scenarios:
A) Simple Playback:
   1. Record simple interaction sequence
   2. Extract step data
   3. Simulate playback by executing steps programmatically
   4. Verify browser state matches recorded state
   5. Verify timing is reasonable

B) Complex Playback:
   1. Record complex interaction (forms, navigation, etc.)
   2. Simulate full playback sequence
   3. Verify all actions execute correctly
   4. Verify state transitions match
   5. Test error handling during playback

C) Playback Accuracy:
   1. Record specific coordinates and timing
   2. Replay and measure accuracy
   3. Verify coordinate precision
   4. Verify timing consistency

// Expected Results:
- Playback executes without errors
- Browser state matches recording
- Coordinates accurate within 5px
- Timing reasonable (±1 second)
- Error handling works during playback
```

### 5.6 Step Limit and Cleanup Test
**Priority**: Medium  
**Duration**: 4-5 minutes  
**Expected Behavior**: System handles step limits gracefully

```typescript
// Test Steps:
1. Set low step limit (e.g., 5 steps)
2. Record interactions until limit reached
3. Verify limit enforcement
4. Verify user notification
5. Test continued recording after limit
6. Test step deletion to free space
7. Verify cleanup of old steps

// Expected Results:
- Step limit enforced strictly
- User notified appropriately
- Recording can continue after deletion
- Old steps cleaned up properly
- No crashes from limit exceeded
```

### 5.7 Step Storage and Retrieval Test
**Priority**: Medium  
**Duration**: 3-4 minutes  
**Expected Behavior**: Steps stored and retrieved reliably

```typescript
// Test Scenarios:
A) Session Persistence:
   1. Create session with steps
   2. Disconnect and reconnect WebSocket
   3. Verify steps retrieved correctly
   4. Verify step order maintained

B) Step API Retrieval:
   1. Create session with steps
   2. Retrieve steps via REST API
   3. Verify API response format
   4. Verify step data completeness
   5. Test pagination if needed

C) Step Search/Filter:
   1. Create session with various step types
   2. Search/filter steps by type
   3. Verify search results accurate
   4. Test date range filtering

// Expected Results:
- Steps persist across connections
- API retrieval works correctly
- Step data complete and accurate
- Search/filter functions work
- No data loss during storage/retrieval
```

## Critical Monitoring Points

### Step Creation Quality
- Steps created within 2 seconds of action
- 100% metadata accuracy
- Screenshots high quality (≥80% JPEG quality)
- Element highlighting precise

### Step Data Integrity
- Sequential step indexing
- No duplicate steps
- Consistent data format
- Proper redaction of sensitive data

### Recording Stability
- No crashes during recording
- Graceful handling of recording failures
- Continued recording after errors
- Proper cleanup of failed steps

## Failure Indicators

- Steps take >5 seconds to create
- Screenshots are blank or corrupted
- Metadata missing or incorrect
- Element highlighting off by >20px
- Steps created out of order
- Recording crashes or freezes

## Success Indicators

- Steps created within 2 seconds
- 95%+ metadata accuracy
- High-quality screenshots
- Precise element highlighting
- Stable recording under load
- Clean error handling

## Automated Test Commands

```bash
# Run step recording tests
npm run test:step-recording

# Run specific recording scenario
npm run test:step-recording -- --grep "Step Creation Accuracy"

# Run with screenshot debugging
npm run test:step-recaction -- --debug-screenshots
```

## Environment Requirements

```bash
# Step recording environment
MAX_STEPS_PER_SESSION=200
SCREENCAST_QUALITY=80
SCREENCAST_MAX_FPS=15
TEMP_DIR=/tmp/stepwise-test
```

## Test Data

### Sample Step Sequences
1. **Form Fill Sequence**:
   - Click email field
   - Type "user@example.com"
   - Click password field
   - Type "password123"
   - Click submit button

2. **Navigation Sequence**:
   - Navigate to page A
   - Click link to page B
   - Click link to page C
   - Click browser back
   - Click browser forward

3. **Complex Interaction**:
   - Click dropdown
   - Select option
   - Type in text field
   - Check checkbox
   - Click submit
   - Handle modal dialog

### Expected Metadata Examples

```typescript
// Click Step Example
{
  id: "step_123",
  index: 1,
  action: "click",
  timestamp: 1703123456789,
  screenshotPath: "/tmp/stepwise/sessions/abc123/screenshots/step_123.jpg",
  target: {
    selector: "button[type='submit']",
    boundingBox: { x: 100, y: 200, width: 120, height: 40 },
    elementTag: "BUTTON",
    elementText: "Submit Form"
  },
  button: "left",
  caption: "Clicked Submit Form button"
}

// Type Step Example
{
  id: "step_124", 
  index: 2,
  action: "type",
  timestamp: 1703123456789,
  screenshotPath: "/tmp/stepwise/sessions/abc123/screenshots/step_124.jpg",
  target: {
    selector: "input[name='email']",
    boundingBox: { x: 150, y: 100, width: 200, height: 30 },
    elementTag: "INPUT",
    elementText: ""
  },
  fieldName: "Email",
  redacted: true,
  displayText: "Typed in Email field",
  caption: "Entered email address"
}