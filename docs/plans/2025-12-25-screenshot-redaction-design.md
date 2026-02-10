# Screenshot Redaction for Input Fields - Design Document

## Overview

This document outlines the design for adding visual redaction capability to input field screenshots in Stepwise. Users can toggle redaction per step via the EditStepModal (renamed from ScreenshotModal), and the redaction is "baked in" to the image during export, making it tamper-proof across all export formats (PDF, DOCX, HTML, Markdown, .stepwise).

## Requirements

- Per-step toggle for visual redaction in EditStepModal
- Solid black rectangle over input field content
- Redaction persists through import/export cycles
- Redaction baked into image (not overlay) for all exports
- Coordinate mapping between viewport and cropped screenshots
- Fallback to original on errors

## Architecture

The feature introduces a three-tier redaction pipeline:

1. **UI Layer** - Toggle switch in EditStepModal for enabling/disabling redaction per step
2. **Processing Layer** - Server-side image processing that generates cached redacted screenshots
3. **Export Layer** - All export formats use the redacted screenshot when the toggle is enabled

The redaction state is persisted in step data and survives import/export cycles. The original screenshot is always preserved, allowing users to toggle redaction on/off without quality loss.

## Data Structure Updates

### Updated BaseStep Interface

```typescript
interface BaseStep {
  id: string;
  index: number;
  timestamp: number;
  screenshotPath: string;
  screenshotDataUrl?: string;
  caption: string;
  isEdited: boolean;
  screenshotClip?: { x: number; y: number; width: number; height: number };  // NEW
  redactedScreenshotPath?: string;  // NEW: path to cached redacted version
}
```

### Updated TypeStep Interface

```typescript
interface TypeStep extends BaseStep {
  action: 'type';
  target: StepHighlight;
  fieldName: string;
  redactScreenshot: boolean;  // Changed from hardcoded `redacted: true`
  displayText: string;
  rawValue?: string;
}
```

### Coordinate Adjustment Logic

The bounding box in `target.boundingBox` is viewport-relative. When a screenshot is captured with a clip region, coordinates must be adjusted to image-relative space:

```typescript
function getRedactionRect(step: TypeStep): { x: number; y: number; width: number; height: number } | null {
  const box = step.target.boundingBox;
  const clip = step.screenshotClip;
  
  if (!clip) {
    // Full viewport screenshot - use coordinates directly
    return box;
  }
  
  // Adjust coordinates relative to clip region
  return {
    x: box.x - clip.x,
    y: box.y - clip.y,
    width: box.width,
    height: box.height,
  };
}
```

## UI Implementation

### EditStepModal Updates

**New UI Elements:**
- Toggle switch labeled "Redact input field" (below screenshot, above caption field)
- Only visible for TypeStep actions (step.action === 'type')
- Default state: false (redaction disabled)

**Toggle Behavior:**
- **Toggled On:**
  1. Send API request to `POST /api/sessions/:sessionId/steps/:stepId/redact` with `{ redact: true }`
  2. Show loading state (spinner on image)
  3. On success: update step data and display redacted version
  4. On error: show error toast and revert toggle to off

- **Toggled Off:**
  1. Send API request with `{ redact: false }`
  2. Immediately switch back to original screenshot (no processing delay)

### StepCard Updates

- Add visual indicator (eye-slash icon) when `step.redactScreenshot` is true
- Indicator appears in screenshot preview thumbnail
- Clicking step opens EditStepModal with full controls

### API Endpoint

```
POST /api/sessions/:sessionId/steps/:stepId/redact
Body: { "redact": boolean }

Response:
{
  "redactedScreenshotPath": string | null
}
```

### Zustand Store

Extend existing step update logic in `sessionStore` to include `redactScreenshot` and `redactedScreenshotPath` properties.

## Server-Side Image Processing

### RedactionService

New service using Sharp library (already a dependency):

```typescript
class RedactionService {
  async generateRedactedScreenshot(
    screenshotPath: string,
    redactionRect: { x: number; y: number; width: number; height: number },
    outputPath: string
  ): Promise<void> {
    await sharp(screenshotPath)
      .composite([{
        input: {
          create: {
            width: redactionRect.width,
            height: redactionRect.height,
            channels: 3,
            background: '#000000'
          }
        },
        left: redactionRect.x,
        top: redactionRect.y
      }])
      .toFile(outputPath);
  }
}
```

### SessionManager Integration

```typescript
async toggleRedaction(sessionId: string, stepId: string, enable: boolean): Promise<string | null> {
  const session = this.sessions.get(sessionId);
  if (!session) throw new Error('Session not found');
  
  const step = session.steps.find(s => s.id === stepId);
  if (!step || step.action !== 'type') throw new Error('Step not found or not a type step');
  
  const typeStep = step as TypeStep;
  
  if (enable) {
    const redactionRect = getRedactionRect(typeStep);
    if (!redactionRect) throw new Error('Cannot determine redaction area');
    
    const redactedPath = typeStep.screenshotPath.replace(/\.(png|jpg)$/, '.redacted.$1');
    await redactionService.generateRedactedScreenshot(
      typeStep.screenshotPath,
      redactionRect,
      redactedPath
    );
    
    typeStep.redactScreenshot = true;
    typeStep.redactedScreenshotPath = redactedPath;
    return redactedPath;
  } else {
    typeStep.redactScreenshot = false;
    typeStep.redactedScreenshotPath = undefined;
    return null;
  }
}
```

## Export Format Handling

### Helper Function

```typescript
function getScreenshotPath(step: Step): string {
  if (step.action === 'type' && (step as TypeStep).redactScreenshot) {
    const typeStep = step as TypeStep;
    return typeStep.redactedScreenshotPath || step.screenshotPath;
  }
  return step.screenshotPath;
}
```

All export methods use `getScreenshotPath(step)` instead of `step.screenshotPath`.

### PDF, DOCX, HTML, Markdown

Each export format method is updated to:
1. Call `getScreenshotPath(step)` to get appropriate screenshot
2. Read and process the image (with Sharp for resizing where needed)
3. Include in output

### Stepwise Format

Native format automatically preserves all step properties including `redactScreenshot` and `redactedScreenshotPath`. No changes needed.

## Error Handling

### Server-Side

1. **Redaction coordinates outside image bounds:**
   - Clamp rectangle to image dimensions
   ```typescript
   function clampRedactionRect(
     rect: { x: number; y: number; width: number; height: number },
     imageWidth: number,
     imageHeight: number
   ): { x: number; y: number; width: number; height: number }
   ```

2. **Missing or corrupted screenshot file:**
   - Fall back to original with error warning
   - Log error for debugging

3. **Missing boundingBox on TypeStep:**
   - Cannot redact - disable toggle, show error
   - User can still use unredacted screenshot

4. **Export with missing redacted screenshot:**
   - Gracefully fall back to original
   - Add warning in export if possible

5. **Concurrent redaction requests:**
   - Track in-progress redactions per step
   - Reject duplicates until first completes

### Client-Side

- Network timeout: Retry with exponential backoff (max 3 attempts)
- Server error (500): Show user-friendly error message
- Rate limiting: Debounce toggle changes (minimum 500ms between requests)

### Import Handling

When importing .stepwise files:
- Validate `redactedScreenshotPath` exists in ZIP
- If missing: reset `redactScreenshot` to false, use original screenshot
- Log warning for diagnostics

## Testing Strategy

### Unit Tests (Server)

- Verify black rectangle drawn at correct coordinates
- Test coordinate adjustment with clip regions
- Test clamping behavior for out-of-bounds coordinates

### Integration Tests

- Verify redacted screenshots included in all export formats
- Test fallback to original when redacted version missing
- Test import/export roundtrip preserves redaction state

### E2E Tests (Playwright)

- User can toggle redaction for input field
- Loading state displays during generation
- Redacted screenshot appears after toggle
- Export includes redacted version
- Toggle persists after page refresh

## Implementation Checklist

- [x] Update shared types (step.ts) with new properties
- [x] Create RedactionService with Sharp
- [x] Add `toggleRedaction` to SessionManager
- [x] Create API route for redaction toggle
- [x] Update EditStepModal with redaction toggle
- [x] Update StepCard with redaction indicator
- [x] Extend sessionStore for redaction state
- [x] Update all export formats to use redacted screenshots
- [x] Add error handling and edge case logic
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Write E2E tests

## Current Implementation Status

### Status: CORE IMPLEMENTATION COMPLETED (2025-12-25)

**Completed Implementation:**

1. ✅ **Shared Types** - Updated `packages/shared/src/step.ts`:
   - Added `screenshotClip?: { x, y, width, height }` to BaseStep
   - Added `redactedScreenshotPath?: string` to BaseStep
   - Changed `TypeStep.redacted: true` to `redactScreenshot: boolean`
   - Updated `UpdateStepRequest` to include `redactScreenshot` and `redactedScreenshotPath`

2. ✅ **RedactionService** - Created `packages/server/src/services/RedactionService.ts`:
   - Sharp-based image processing with solid black rectangle overlay
   - Coordinate clamping to image bounds
   - Concurrent request handling (tracks in-progress redactions)
   - Public API for generating redacted screenshots

3. ✅ **SessionManager Integration** - Added to `packages/server/src/services/SessionManager.ts`:
   - `toggleRedaction(sessionId, stepId, enable: boolean)` method
   - Integrates with RedactionService for image generation
   - Updates step state with redaction metadata
   - Error handling for missing steps/bounding boxes

4. ✅ **API Route** - Added to `packages/server/src/routes/session.ts`:
   - `POST /api/sessions/:sessionId/steps/:stepId/redact` endpoint
   - Accepts `{ redact: boolean }` request body
   - Returns `{ redactedScreenshotPath?: string | null }` response
   - Token validation and error handling

5. ✅ **Frontend UI** - Created `packages/client/src/components/Steps/EditStepModal.tsx`:
   - Renamed from ScreenshotModal
   - Toggle switch for "Redact input field"
   - Only visible for TypeStep actions
   - Loading state during redaction generation
   - Error handling with revert to original state
   - Deleted old ScreenshotModal.tsx

6. ✅ **StepCard Indicator** - Updated `packages/client/src/components/Steps/StepCard.tsx`:
   - Redaction indicator (eye-slash icon) on screenshot thumbnails
   - Badge showing "Redacted" when step is redacted
   - Only displays for TypeStep with redactScreenshot: true

7. ✅ **State Management** - Updated `packages/client/src/stores/sessionStore.ts`:
   - Extended `SessionStore` interface with `toggleRedaction` action
   - Updated `updateStep` to accept redaction properties
   - Local state updates for immediate UI feedback
   - API integration with toggleRedaction method

8. ✅ **API Client** - Updated `packages/client/src/lib/api.ts`:
   - Added `toggleRedaction(sessionId, stepId, redact: boolean)` method
   - Returns `{ redactedScreenshotPath?: string | null }`

9. ✅ **Export Integration** - Updated `packages/server/src/services/ExportService.ts`:
   - Added `getScreenshotPath(step)` helper method
   - Updated all export methods (PDF, DOCX, Markdown, HTML, .stepwise)
   - All formats now use redacted screenshots when `redactScreenshot: true`
   - Graceful fallback to original on errors

**Remaining Tasks:**

- [ ] Write unit tests for RedactionService
- [ ] Write integration tests for export formats
- [ ] Write E2E tests for UI interactions
- [ ] Verify redaction coordinates accuracy across various screenshot clips

**Test Coverage:** Not implemented (future work)

**Known Limitations:**
- Single redaction region per step (as designed)
- No redaction preview before applying
- No batch redaction (toggle all steps at once)

## Files to Modify

### Shared
- `packages/shared/src/step.ts` - Update TypeStep with `redactScreenshot: boolean`, add `screenshotClip` and `redactedScreenshotPath` to BaseStep

### Server
- `packages/server/src/services/RedactionService.ts` - **NEW FILE** - Create with Sharp-based image processing
- `packages/server/src/services/SessionManager.ts` - Add `toggleRedaction` method
- `packages/server/src/routes/session.ts` - Add redaction endpoint
- `packages/server/src/services/ExportService.ts` - Update all export methods to use redacted screenshots

### Client
- `packages/client/src/components/Steps/ScreenshotModal.tsx` - Rename to EditStepModal.tsx, add redaction toggle
- `packages/client/src/components/Steps/StepCard.tsx` - Add redaction indicator
- `packages/client/src/stores/sessionStore.ts` - Add redaction toggle action
- `packages/client/src/lib/api.ts` - Add API call for redaction toggle

## Risks and Considerations

1. **Performance:** Generating redacted screenshots is CPU-intensive. Mitigation: Cache results, lazy generation.
2. **Coordinate Accuracy:** Incorrect coordinates could miss or over-redact. Mitigation: Clamp to bounds, test with various clip regions.
3. **Backwards Compatibility:** Existing steps lack `screenshotClip`. Mitigation: Treat undefined as full viewport.
4. **Storage:** Redacted screenshots double storage for redacted steps. Mitigation: Clean up when unredacted, compress images.

## Future Enhancements

- Multiple redaction regions per screenshot
- User-selectable redaction style (blur, solid, custom color)
- Batch redaction (toggle all steps at once)
- Undo/redo for redaction changes
- Redaction preview before applying
