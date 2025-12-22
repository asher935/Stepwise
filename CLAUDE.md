# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stepwise is a Docker-deployable web application for recording browser actions into step-by-step guides with screenshots. It's a self-hosted alternative to Tango.ai built with:

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + Zustand
- **Backend**: Bun + Elysia (WebSocket support)
- **Browser Control**: Playwright with Chrome DevTools Protocol
- **Architecture**: Real-time WebSocket communication between client and server for live browser interaction

## Development Commands

### Package Management (uses Bun)
```bash
bun install                    # Install all dependencies
bun run dev                    # Start all dev servers (client + server)
bun run dev:server            # Start backend only on :3000
bun run dev:client            # Start frontend only on :5173
bun run build                  # Build all packages
bun run typecheck             # Type check all packages
bun run lint                  # Lint all packages
bun run clean                 # Clean build artifacts
```

### Testing
```bash
bun run test                   # Run tests (server package)
bun test                       # Run tests from project root
bun run playwright test       # Run Playwright tests
```

### Docker Development
```bash
# Development with hot reload
docker compose -f docker/docker-compose.dev.yml up --build

# Production build
cd docker && docker build -t stepwise:latest -f Dockerfile ..
```

## Key Architecture Patterns

### WebSocket Communication
The core architecture relies on real-time WebSocket messages between client and server:

**Client-to-Server Messages** (`packages/shared/src/ws.ts`):
- `input:mouse` - Mouse movements, clicks, drags
- `input:keyboard` - Keyboard input with modifier support
- `input:scroll` - Scroll events
- `navigate` - Browser navigation commands
- `ping` - Connection health checks

**Server-to-Client Messages**:
- `frame` - Real-time browser screenshots (JPEG screencast)
- `step:new` - New step recorded during user interaction
- `step:updated`/`step:deleted` - Step modifications
- `session:state` - Current session state updates
- `element:hover` - Element information at coordinates for UI hover feedback
- `error`/`cdp:error`/`input:error`/`rate:limited`/`session:unhealthy` - Error handling

### Chrome DevTools Protocol (CDP) Integration
The `CDPBridge` class (`packages/server/src/services/CDPBridge.ts`) handles browser automation:

- **Screencast**: Real-time JPEG frame streaming with configurable FPS/quality
- **Input Simulation**: Direct CDP calls for mouse/keyboard/scroll events
- **Health Monitoring**: Automatic session health checks with recovery
- **Element Detection**: JavaScript evaluation for element information at coordinates

### Session Management
Sessions are managed through `SessionManager` with:
- 256-bit random tokens for authentication
- Configurable limits (max sessions, idle timeout, steps per session)
- Automatic cleanup of inactive sessions
- Rate limiting (60 inputs/second per connection)

### State Management (Frontend)
Zustand stores handle global state:
- `sessionStore`: Session data, steps, connection status
- Component-level state for UI interactions, modals, forms

## Non-Obvious Architecture Details

### Recorder Event Patterns
The Recorder service uses several important patterns:

- **Two-Stage Click Recording**: For clicks, screenshots are captured BEFORE sending mouse events to ensure the visual state reflects the pre-click condition. This is done via a prepare/record pattern.

- **Debounced Type Input**: Individual keyboard events are debounced and accumulated into a single "type" step rather than creating a step per keystroke. This produces cleaner guides.

- **Scroll Accumulation**: Multiple scroll events are accumulated into a single scroll step with total distance, reducing step clutter.

- **Screenshot Clipping**: Smart screenshot clipping based on element position (bounding boxes) to capture relevant regions.

### Element Highlighting
Element highlights are injected directly into the browser page via CDP (not just UI overlays):
- Highlights are injected as DOM elements in the remote browser page
- This ensures highlights appear in screenshots
- Highlights are cleared before input actions are executed

### Session-Scoped Directories
Each session gets its own temporary directory for screenshots and assets:
- Paths are scoped per session (e.g., `/tmp/stepwise/{sessionId}/`)
- Automatic cleanup on session end
- Prevents resource leaks and conflicts

### Health Monitoring
Two-level health checking:
- **Session-level**: Rate limiting, idle timeout, input validation
- **CDP-level**: Browser connection health, automatic recovery on failure
- Graceful error responses with detailed context

## Project Structure

```
stepwise/
├── packages/
│   ├── shared/           # Shared TypeScript types and constants
│   │   └── src/ws.ts     # WebSocket message type definitions
│   ├── server/           # Bun + Elysia backend
│   │   ├── src/
│   │   │   ├── services/ # SessionManager, CDPBridge, Recorder
│   │   │   ├── routes/   # REST API endpoints
│   │   │   ├── ws/       # WebSocket handlers
│   │   │   └── types/    # Server-side type definitions
│   │   └── templates/    # Export format templates
│   └── client/           # React frontend
│       └── src/
│           ├── components/  # React components organized by feature
│           ├── stores/      # Zustand state management
│           └── lib/         # Utilities and helpers
├── docker/               # Docker configuration
├── test-scenarios/       # Playwright test scenarios
└── playwright.config.ts  # Playwright configuration
```

## Key Services

### Recorder Service
Records user interactions into structured steps:
- Clicks with element detection and metadata
- Keyboard input with text redaction for privacy
- Scroll events with delta information
- Navigation between pages
- Automatic screenshot capture for each step

### Export System
Multiple export formats supported:
- **PDF**: Professional sharing via Playwright PDF generation
- **Word (.docx)**: Editable documents using docx library
- **Markdown**: Plain text with base64 images
- **HTML**: Self-contained web pages
- **Stepwise (.stepwise)**: Re-importable format with optional AES-256-GCM encryption

## Environment Configuration

Key environment variables (see README.md for complete list):
- `SCREENCAST_MAX_FPS`: Frame rate limit (default: 15)
- `SCREENCAST_QUALITY`: JPEG quality 1-100 (default: 80)
- `BROWSER_VIEWPORT_WIDTH/HEIGHT`: Browser dimensions
- `MAX_SESSIONS`: Concurrent session limit
- `IDLE_TIMEOUT_MS`: Session auto-cleanup timeout

## Testing

Playwright tests in `test-scenarios/` cover:
- Basic recording workflows
- UI interactions
- Cross-browser compatibility
- End-to-end session management

Use `bun run playwright test` to run the full test suite.
