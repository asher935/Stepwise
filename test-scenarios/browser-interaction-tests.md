# Browser Interaction Tests

## Test Suite Overview

**Objective**: Verify that browser interactions (typing, clicking, navigation) work correctly through the WebSocket-CDP bridge and that user interactions are accurately captured and recorded.

**Root Cause Hypothesis**: Browser interaction failures may cause WebSocket instability if error handling doesn't properly manage CDP command failures.

## Test Scenarios

### 3.1 Basic Click Interaction Test
**Priority**: High  
**Duration**: 2-3 minutes  
**Expected Behavior**: Mouse clicks execute correctly and are captured as steps

```typescript
// Test Steps:
1. Navigate to a page with clickable elements (buttons, links)
2. Connect WebSocket and verify browser control
3. Click on various elements:
   - Button elements
   - Link elements
   - Input field labels
   - Div elements with click handlers
4. Verify each click executes successfully
5. Check that steps are created for each click
6. Verify step screenshots show correct highlighting
7. Test right-click and middle-click

// Expected Results:
- All clicks execute without error
- Browser responds to all click events
- Steps are created with correct metadata
- Screenshots show proper element highlighting
- Click coordinates are accurate
```

### 3.2 Text Input Interaction Test
**Priority**: High  
**Duration**: 3-4 minutes  
**Expected Behavior**: Text input is captured accurately with proper redaction

```typescript
// Test Scenarios:
A) Basic Text Input:
   1. Navigate to form with text inputs
   2. Click on input field to focus
   3. Type "test@example.com"
   4. Verify text appears in field
   5. Verify step captures input with redaction

B) Multi-line Text:
   1. Navigate to textarea element
   2. Click to focus textarea
   3. Type multi-line text with newlines
   4. Verify all text appears correctly
   5. Verify step captures properly

C) Password/Sensitive Fields:
   1. Navigate to password input field
   2. Type password "secret123"
   3. Verify step shows redacted text
   4. Verify raw value is not stored in step

D) Form Validation:
   1. Fill out complete form with various field types
   2. Submit form
   3. Verify all field interactions recorded
   4. Verify form submission captured

// Expected Results:
- All text input executes correctly
- Text appears in correct fields
- Steps capture input with proper redaction
- Multi-line text handled correctly
- Sensitive data properly redacted
```

### 3.3 Navigation Interaction Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: Navigation commands execute and update session state

```typescript
// Test Steps:
1. Start at initial URL
2. Navigate to first page via WebSocket
3. Verify URL and title update in session state
4. Navigate to second page
5. Verify history is maintained
6. Test browser back button functionality
7. Test browser forward button functionality
8. Test page reload functionality
9. Test direct URL navigation
10. Test navigation to invalid URLs

// Expected Results:
- All navigation commands succeed
- Session state updates correctly
- Browser history works properly
- Invalid URLs handled gracefully
- Navigation steps captured accurately
```

### 3.4 Scroll and Hover Interaction Test
**Priority**: Medium  
**Duration**: 3-4 minutes  
**Expected Behavior**: Scroll and hover interactions work correctly

```typescript
// Test Scenarios:
A) Scroll Interactions:
   1. Navigate to long page (1000+ pixels)
   2. Scroll down gradually (100px increments)
   3. Scroll up gradually
   4. Scroll to specific position
   5. Test mouse wheel scrolling
   6. Verify scroll position tracking

B) Hover Interactions:
   1. Navigate to page with hover elements
   2. Hover over elements to trigger tooltips
   3. Hover over dynamic content
   4. Verify hover events are captured
   5. Test hover timing and persistence

// Expected Results:
- Scroll commands execute smoothly
- Scroll position updates correctly
- Hover events trigger properly
- Steps capture scroll and hover actions
- No browser freezing during scroll
```

### 3.5 Form Interaction Test
**Priority**: High  
**Duration**: 5-6 minutes  
**Expected Behavior**: Complete form interactions work end-to-end

```typescript
// Test Steps:
1. Navigate to complex form page
2. Fill form fields in sequence:
   - Text inputs
   - Email inputs
   - Number inputs
   - Select dropdowns
   - Radio buttons
   - Checkboxes
   - File uploads
3. Validate field interactions
4. Submit form
5. Verify all interactions captured as steps
6. Test form validation errors
7. Test form reset functionality

// Expected Results:
- All form field interactions work
- Field validation functions properly
- Form submission succeeds
- All steps captured with accurate metadata
- Screenshots show correct field states
```

### 3.6 Dynamic Content Interaction Test
**Priority**: High  
**Duration**: 4-5 minutes  
**Expected Behavior**: Dynamic content and AJAX interactions work correctly

```typescript
// Test Scenarios:
A) AJAX Content Loading:
   1. Navigate to page with AJAX content
   2. Trigger content loading via clicks
   3. Wait for content to load
   4. Interact with loaded content
   5. Verify steps capture dynamic content

B) JavaScript Interactions:
   1. Navigate to page with JavaScript widgets
   2. Interact with sliders, datepickers, etc.
   3. Verify interactions execute correctly
   4. Verify steps capture widget state

C) Modal/Dialog Interactions:
   1. Trigger modal/dialog opening
   2. Interact with modal content
   3. Close modal
   4. Verify all interactions captured

// Expected Results:
- Dynamic content loads properly
- JavaScript interactions work
- Modal/dialog interactions succeed
- Steps capture dynamic state changes
- No timing issues with content loading
```

### 3.7 Multi-tab and Iframe Test
**Priority**: Medium  
**Duration**: 4-5 minutes  
**Expected Behavior**: Multi-tab and iframe interactions work within limitations

```typescript
// Test Steps:
1. Navigate to page with iframe
2. Click inside iframe content
3. Verify iframe interaction works
4. Open new tab via browser
5. Switch between tabs
6. Verify tab switching captured
7. Test cross-origin iframe limitations

// Expected Results:
- Iframe interactions work where possible
- Tab management functions correctly
- Cross-origin limitations handled gracefully
- Steps capture tab state changes
- No crashes from iframe issues
```

## Critical Monitoring Points

### Interaction Accuracy
- Click coordinates match intended targets
- Text input appears in correct fields
- Navigation URLs are accurate
- Element highlighting is precise

### Performance Under Load
- Interaction response time < 1 second
- No browser freezing during interactions
- Memory usage remains stable
- CPU usage stays reasonable

### Step Recording Quality
- All interactions captured as steps
- Screenshots show correct state
- Metadata is accurate and complete
- Step timing is reasonable

## Failure Indicators

- Interactions timeout (>3 seconds)
- Browser becomes unresponsive
- Click coordinates are significantly off
- Text input fails to appear
- Screenshots are blank or corrupted
- Step recording misses interactions

## Success Indicators

- All interactions complete within 1 second
- Browser remains responsive
- 95%+ interaction accuracy
- Complete step recording
- High-quality screenshots
- Proper error handling for edge cases

## Automated Test Commands

```bash
# Run browser interaction tests
npm run test:browser-interactions

# Run specific interaction type
npm run test:browser-interactions -- --grep "Text Input"

# Run with browser debugging
npm run test:browser-interactions -- --debug-browser --slow-mo 1000
```

## Environment Requirements

```bash
# Browser testing environment
BROWSER_VIEWPORT_WIDTH=1280
BROWSER_VIEWPORT_HEIGHT=800
SCREENCAST_QUALITY=80
SCREENCAST_MAX_FPS=15
MAX_STEPS_PER_SESSION=200
```

## Test Data

### Test Pages
- Simple form: `data:text/html,<form><input type="text"><button>Submit</button></form>`
- Complex form: Multiple field types and validation
- Dynamic content: AJAX-loaded content and JavaScript widgets
- Long page: Extensive content for scroll testing
- Modal dialogs: Various modal implementations

### Interaction Sequences
- Simple click: Button → Text Input → Submit
- Complex form: All field types → Validation → Submit
- Navigation: Page A → Page B → Back → Forward → Reload
- Dynamic: Trigger AJAX → Interact with loaded content
- Scroll: Long page → Scroll to bottom → Scroll to top