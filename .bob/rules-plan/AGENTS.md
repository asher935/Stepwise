# AGENTS.md - Plan Mode

This file provides architectural context for agents working in Plan mode.

## Non-Obvious Architectural Constraints

### WebSocket Communication Pattern
- Real-time bidirectional communication between client and server
- Client sends: `input:mouse`, `input:keyboard`, `input:scroll`, `navigate`, `ping`
- Server sends: `frame`, `step:new`, `step:updated`, `step:deleted`, `session:state`, `element:hover`
- Rate limiting: 60 inputs/second per connection

### Session Management Architecture
- Sessions use 256-bit random tokens for authentication
- Configurable limits: max sessions, idle timeout, steps per session
- Each session gets its own temporary directory for screenshots
- Automatic cleanup on session end prevents resource leaks

### Recorder Service Patterns
- Two-stage click recording: screenshot captured BEFORE mouse event sent
- Debounced type input: individual keystrokes accumulated into single step
- Scroll accumulation: multiple scroll events combined into one step
- Screenshot clipping based on element bounding boxes

### Step Index Integrity
- Step indices MUST be 0-based and sequential with no gaps
- After any deletion, call `normalizeSessionSteps()` to recalculate
- Gaps in indices cause UI rendering issues

### CDPBridge Health Monitoring
- Two-level health checking: session-level and CDP-level
- Automatic recovery on browser connection failure
- Graceful error responses with detailed context

### Element Detection Strategy
- Dynamic IDs/classes filtered out (React `:r\d+:`, Ember `ember\d+`, CSS modules)
- Prioritization: `data-testid` > stable IDs > semantic attributes > text content
- See `selectors.ts` for filtering patterns

### Export System Architecture
- Multiple formats: PDF (Playwright), DOCX (docx library), Markdown, HTML, .stepwise
- .stepwise format supports AES-256-GCM encryption for password protection
- Templates in `packages/server/templates/` for HTML/PDF exports

### Runtime Detection
- Client detects dev mode by checking `window.location.port === '5173'`
- Desktop mode uses `window.__STEPWISE_RUNTIME_CONFIG__` injection
- WebSocket URL derived from runtime context

## Architectural Decisions
- Monorepo structure with shared types package
- Bun runtime for server (not Node.js)
- Playwright for browser control (not Puppeteer/Selenium)
- Zustand for client state (not Redux/Context)
- Elysia framework for server (not Express/Fastify)