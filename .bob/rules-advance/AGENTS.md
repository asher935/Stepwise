# AGENTS.md - Advance Mode

This file provides guidance for agents working in Advance mode with access to MCP and Browser tools.

## Non-Obvious Coding Patterns

### Import Requirements
- MUST use `type` keyword for type-only imports due to `verbatimModuleSyntax: true`
- Example: `import type { Step } from '@stepwise/shared'`
- Compiler will error if type imports don't use `type` keyword

### Array/Object Access Safety
- `noUncheckedIndexedAccess: true` means all indexed access returns `T | undefined`
- MUST handle undefined explicitly: `array[0]?.property` or check before access
- Example: `const step = steps[index]; if (step) { ... }`

### Screenshot Data URL Construction
- MUST match MIME type to `env.SCREENSHOT_FORMAT` setting
- Use `toScreenshotDataUrl()` helper in `Recorder.ts` - don't construct manually
- Format: `data:image/png;base64,...` or `data:image/jpeg;base64,...`

### Step Index Management
- After deleting steps, MUST call `normalizeSessionSteps()` to recalculate indices
- Indices must be 0-based and sequential with no gaps
- See `routes/session.ts` for normalization implementation

### Recorder Click Pattern
- Screenshots captured in `pendingClickScreenshot` BEFORE mouse event sent
- This ensures screenshot shows pre-click state
- Don't send mouse events before capturing screenshot

### Dynamic Selector Filtering
- Use patterns in `selectors.ts` to filter dynamic IDs/classes
- React: `:r\d+:`, Ember: `ember\d+`, CSS modules: `css-[hash]`
- Prioritize: `data-testid` > stable IDs > semantic attributes

### ESLint Type Safety
- `@typescript-eslint/no-unsafe-*` rules are ERRORS not warnings
- Never use `any` type - use `unknown` and narrow with type guards
- Unused variables must start with `_` to be allowed

### Path Aliases
- Client: `@/` maps to `./src/*` (configured in client tsconfig)
- Server: No path aliases - use relative imports
- Shared: Import as `@stepwise/shared` from both client and server

## Mode Capabilities
- Access to MCP tools for extended functionality
- Access to Browser tools for web automation
- Can perform complex multi-step operations