# AGENTS.md - Ask Mode

This file provides documentation context for agents working in Ask mode.

## Non-Obvious Documentation Context

### Project Structure Quirks
- `packages/shared` contains shared types - import as `@stepwise/shared`
- `packages/server` uses Bun runtime with Elysia framework
- `packages/client` uses React + Vite with path alias `@/` for `./src/*`
- `packages/desktop` wraps the web app in Electron

### WebSocket Architecture
- Client detects dev mode by checking `window.location.port === '5173'`
- In dev: connects to `ws://localhost:3000/ws`
- In prod: derives WebSocket URL from current host
- Desktop mode uses `window.__STEPWISE_RUNTIME_CONFIG__` injection

### Testing Setup
- `bun run test` runs server tests only (not all packages)
- `bun run playwright test --ui` runs Playwright with UI mode
- Single package tests: `cd packages/server && bun test`

### TypeScript Configuration
- `verbatimModuleSyntax: true` requires `type` keyword for type-only imports
- `noUncheckedIndexedAccess: true` means array access returns `T | undefined`
- Client has path alias `@/`, server does not

### Export/Import System
- Multiple formats: PDF, DOCX, Markdown, HTML, .stepwise
- .stepwise files can be encrypted with AES-256-GCM
- Import/export routes in `packages/server/src/routes/`

### Browser Control
- Uses Playwright with Chrome DevTools Protocol (CDP)
- CDPBridge handles screencast, input simulation, health monitoring
- Recorder service captures actions into structured steps

## Documentation Locations
- Main README.md has setup instructions and environment variables
- CLAUDE.md has detailed architecture and patterns
- docs/ folder contains implementation plans and analysis
- test-scenarios/ has Playwright test documentation