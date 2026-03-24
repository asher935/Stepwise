# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Non-Obvious Patterns

### TypeScript Configuration
- `verbatimModuleSyntax: true` - MUST use `type` keyword for type-only imports (enforced by compiler)
- `noUncheckedIndexedAccess: true` - Array/object access returns `T | undefined`, handle explicitly
- Client uses path alias `@/` for `./src/*`, server does not

### Recorder Two-Stage Click Pattern
- Screenshots captured BEFORE mouse events sent to browser (see `Recorder.ts` `pendingClickScreenshot`)
- This ensures visual state reflects pre-click condition in screenshots
- Pattern: prepare screenshot → send mouse event → finalize step

### WebSocket Runtime Detection
- Client detects dev mode by checking `window.location.port === '5173'` (see `client/src/lib/runtime.ts`)
- In dev: connects to `ws://localhost:3000/ws`
- In prod: derives WebSocket URL from current host
- Desktop mode uses `window.__STEPWISE_RUNTIME_CONFIG__` injection

### Step Index Normalization
- Step indices MUST be recalculated after any deletion (see `normalizeSessionSteps` in `routes/session.ts`)
- Indices are 0-based and sequential - gaps cause UI issues
- Always call normalization after modifying step arrays

### ESLint Strict Type Safety
- `@typescript-eslint/no-unsafe-*` rules enforced as errors (not warnings)
- Unused vars allowed only with `_` prefix pattern
- Server has `Bun` global, client has `React` global in scope

### Dynamic ID/Class Detection
- Selectors filter out dynamic IDs/classes (see `selectors.ts` patterns)
- React IDs like `:r\d+:`, Ember IDs like `ember\d+`, CSS modules like `css-[hash]` are excluded
- Prioritizes `data-testid` > stable IDs > semantic attributes

### Screenshot Data URL Format
- Format determined by `env.SCREENSHOT_FORMAT` (png or jpeg)
- MUST use correct MIME type: `image/png` or `image/jpeg` (see `toScreenshotDataUrl`)
- Base64 encoding required for data URLs

## Commands
```bash
bun run test                    # Run server tests only (not all packages)
bun run playwright test --ui    # Run Playwright with UI mode
cd packages/server && bun test  # Run single package tests
```
