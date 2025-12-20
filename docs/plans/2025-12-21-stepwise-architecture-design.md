# Stepwise Architecture Design

> **Date:** 2025-12-21  
> **Status:** Validated  
> **Summary:** Docker-deployable web app for recording browser actions into step-by-step guides with screenshots. Self-hosted alternative to Tango.ai.

---

## Overview

Stepwise runs a remote Chromium browser per user session, streams the view via CDP screencast, and records user actions into editable step-by-step guides with screenshots and highlights.

**Key constraints:**
- Single Docker container deployment
- No persistent database (in-memory + temp files only)
- Multi-user concurrency with MAX_SESSIONS limit
- Privacy-safe (typed content redacted by default)

---

## 1. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Vite + React 18 + TypeScript | Fast DX, no SSR overhead, rich ecosystem |
| **UI Components** | shadcn/ui + Tailwind | Copy-paste components, easy customization |
| **State** | Zustand | Lightweight, no boilerplate, good for session state |
| **Backend** | Bun + Elysia | Fast runtime, elegant WebSocket support, TypeScript-native |
| **CDP Control** | Playwright | High-level API + raw CDP access via `CDPSession` |
| **Real-time** | Elysia WebSocket | Native support, typed, handles screencast frames |
| **PDF Export** | Playwright `page.pdf()` | Consistent rendering, already in stack |
| **DOCX Export** | `docx` library | Precise control, no external dependencies |
| **ZIP Handling** | `archiver` + `unzipper` | Battle-tested, streaming support |
| **Encryption** | `crypto` (built-in) | AES-256-GCM for optional password protection |

**Key dependencies:**
```json
{
  "playwright-core": "^1.40",
  "docx": "^8.0",
  "archiver": "^6.0",
  "unzipper": "^0.10"
}
```

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOCKER CONTAINER                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        BUN + ELYSIA SERVER                          │    │
│  │                                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │    │
│  │  │   Session    │  │   Export     │  │      Import Service      │  │    │
│  │  │   Manager    │  │   Service    │  │   (.stepwise parser)     │  │    │
│  │  │              │  │              │  │                          │  │    │
│  │  │ Map<id,Sess> │  │ PDF/DOCX/MD  │  │  decrypt → validate →    │  │    │
│  │  │ TTL cleanup  │  │ renderers    │  │  hydrate session         │  │    │
│  │  └──────┬───────┘  └──────────────┘  └──────────────────────────┘  │    │
│  │         │                                                           │    │
│  │  ┌──────▼─────────────────────────────────────────────────────┐    │    │
│  │  │                      CDP BRIDGE                             │    │    │
│  │  │                                                             │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │    │    │
│  │  │  │ Screencast  │  │   Input     │  │      Recorder       │ │    │    │
│  │  │  │  Streamer   │  │  Forwarder  │  │                     │ │    │    │
│  │  │  │             │  │             │  │  CDP events →       │ │    │    │
│  │  │  │ frames →    │  │ mouse/kbd → │  │  Step objects →     │ │    │    │
│  │  │  │ WebSocket   │  │ CDP         │  │  screenshots        │ │    │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │    │    │
│  │  └─────────────────────────┬───────────────────────────────────┘    │    │
│  │                            │ CDP (DevTools Protocol)                │    │
│  └────────────────────────────┼────────────────────────────────────────┘    │
│                               │                                              │
│  ┌────────────────────────────▼────────────────────────────────────────┐    │
│  │                    CHROMIUM INSTANCES (per session)                  │    │
│  │                                                                      │    │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐                         │    │
│  │   │ Browser  │  │ Browser  │  │ Browser  │  ... up to MAX_SESSIONS │    │
│  │   │ Session 1│  │ Session 2│  │ Session 3│                         │    │
│  │   └──────────┘  └──────────┘  └──────────┘                         │    │
│  │                                                                      │    │
│  │   --no-sandbox --disable-gpu --disable-dev-shm-usage                │    │
│  │   --remote-debugging-port=dynamic                                   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  EPHEMERAL STORAGE (/tmp/stepwise)                                   │   │
│  │                                                                       │   │
│  │  /sessions/{sessionId}/screenshots/   ← captured PNGs                │   │
│  │  /exports/{sessionId}/                ← generated PDFs/ZIPs          │   │
│  │  /downloads/{sessionId}/              ← browser downloads            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP + WebSocket (:3000)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WEB CLIENT                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         REACT SPA (Vite)                            │    │
│  │                                                                      │    │
│  │  ┌──────────────────┐  ┌────────────────────────────────────────┐  │    │
│  │  │   Steps Panel    │  │         Browser Viewport                │  │    │
│  │  │   (Left ~300px)  │  │         (Right, flex-grow)              │  │    │
│  │  │                  │  │                                         │  │    │
│  │  │  ┌────────────┐  │  │  ┌───────────────────────────────────┐ │  │    │
│  │  │  │ Step Card  │  │  │  │                                   │ │  │    │
│  │  │  │ [thumb]    │  │  │  │      <canvas> or <img>            │ │  │    │
│  │  │  │ caption... │  │  │  │      (screencast frames)          │ │  │    │
│  │  │  └────────────┘  │  │  │                                   │ │  │    │
│  │  │  ┌────────────┐  │  │  │      + highlight overlay          │ │  │    │
│  │  │  │ Step Card  │  │  │  │      + input event capture        │ │  │    │
│  │  │  │ [thumb]    │  │  │  │                                   │ │  │    │
│  │  │  │ caption... │  │  │  └───────────────────────────────────┘ │  │    │
│  │  │  └────────────┘  │  │                                         │  │    │
│  │  │       ...        │  │  [URL Bar] [◀ ▶ ↻] [Tabs]              │  │    │
│  │  └──────────────────┘  └────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  [Export ▼] [Import] [Settings]                     [End Session]   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User clicks in browser viewport → client sends input via WebSocket → CDP forwards to Chromium
2. Chromium renders → CDP screencast captures frame → WebSocket streams to client → canvas updates
3. Recorder detects action (click/type/navigate) → captures screenshot → creates Step → notifies client
4. Client updates steps panel in real-time

---

## 3. Key Design Patterns

### 3.1 Session Lifecycle (State Machine)

```
LOBBY → STARTING → ACTIVE → ENDING → CLOSED
          ↓                    ↑
        FAILED ────────────────┘
```

```typescript
type SessionState = 
  | { status: 'lobby' }
  | { status: 'starting'; startedAt: number }
  | { status: 'active'; browser: Browser; page: Page; cdp: CDPSession }
  | { status: 'ending'; reason: 'user' | 'timeout' | 'error' }
  | { status: 'closed' }
  | { status: 'failed'; error: string }
```

### 3.2 Event-Driven Recording (Observer Pattern)

```typescript
// CDP events → Recorder → Step events → Client
cdpSession.on('Page.domContentEventFired', handleNavigation)
cdpSession.on('Input.dragIntercepted', handleDrag)
page.on('click', handleClick)      // Playwright high-level
page.on('console', handleConsole)  // For debugging

// Recorder emits typed events
recorder.on('step:created', (step: Step) => {
  session.steps.push(step)
  broadcastToClient('step:new', step)
})
```

### 3.3 Screencast Flow Control (Backpressure)

```typescript
// Server acknowledges frames to prevent buffer overflow
cdpSession.on('Page.screencastFrame', async (frame) => {
  // Send to client first
  ws.send(JSON.stringify({ type: 'frame', data: frame.data }))
  
  // Then acknowledge to get next frame (flow control)
  await cdpSession.send('Page.screencastFrameAck', { 
    sessionId: frame.sessionId 
  })
})
```

### 3.4 Input Coordinate Translation

```typescript
// Client viewport may differ from actual browser size
function translateCoords(clientX: number, clientY: number, 
                         clientRect: DOMRect, 
                         actualViewport: { width: number; height: number }) {
  const scaleX = actualViewport.width / clientRect.width
  const scaleY = actualViewport.height / clientRect.height
  return {
    x: clientX * scaleX,
    y: clientY * scaleY
  }
}
```

### 3.5 Highlight Capture (Best-Effort DOM Selectors)

```typescript
interface StepHighlight {
  // Primary: selector for re-targeting
  selector: string | null       // CSS selector, null if unreliable
  
  // Fallback: absolute position at capture time
  boundingBox: { x: number; y: number; width: number; height: number }
  
  // For display
  elementTag: string            // 'button', 'input', etc.
  elementText: string | null    // Visible text, truncated
}

// Generate stable selectors (priority order)
function generateSelector(element: ElementHandle): string | null {
  // 1. data-testid, data-cy (most stable)
  // 2. id (if not dynamic-looking)
  // 3. aria-label + role
  // 4. unique class + tag combination
  // 5. null (fall back to bounding box only)
}
```

### 3.6 Privacy-Safe Typing (Redaction by Default)

```typescript
interface TypeStep extends BaseStep {
  action: 'type'
  target: StepHighlight
  fieldName: string        // Inferred from label/placeholder/name
  redacted: true           // Always true by default
  displayText: string      // "Typed in Email field"
  
  // Only populated if user opts in per-field
  rawValue?: string
}
```

---

## 4. Potential Pitfalls & Mitigations

### 4.1 Memory Leaks from Browser Instances

**Problem:** Chromium processes not properly killed on session end.

**Solution:**
```typescript
async function endSession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session?.browser) return
  
  try {
    await session.browser.close()
  } catch {
    session.browser.process()?.kill('SIGKILL')
  } finally {
    sessions.delete(sessionId)
    await fs.rm(`/tmp/stepwise/sessions/${sessionId}`, { recursive: true, force: true })
  }
}

// Periodic sweep for zombie sessions
setInterval(() => {
  for (const [id, session] of sessions) {
    if (Date.now() - session.lastActivity > IDLE_TIMEOUT_MS) {
      endSession(id)
    }
  }
}, 60_000)
```

### 4.2 Screencast Frame Flooding

**Problem:** High-activity pages overwhelm WebSocket.

**Solution:** Rate limit to max 20 FPS on server side, ack frames even if not sent.

### 4.3 Input Event Race Conditions

**Problem:** Clicks faster than screencast updates cause misaligned highlights.

**Solution:** Wait for `networkidle` or 500ms max before screenshot capture.

### 4.4 Cross-Origin Iframe Blindness

**Problem:** CDP can't access cross-origin iframe elements.

**Solution:** Graceful degradation to click-point indicator only.

### 4.5 Docker Shared Memory Exhaustion

**Problem:** Chromium needs more than default 64MB `/dev/shm`.

**Solution:** Use `shm_size: '2gb'` in docker-compose OR `--disable-dev-shm-usage` flag.

### 4.6 Session Hijacking

**Problem:** Predictable session IDs.

**Solution:** Use `randomBytes(32).toString('base64url')` for 256-bit entropy.

### 4.7 Disk Exhaustion from Screenshots

**Problem:** Long sessions fill `/tmp`.

**Solution:** Limit to 200 steps, use JPEG at 80% quality, warn user near limit.

---

## 5. Project Structure

```
stepwise/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── packages/
│   ├── client/                     # Vite + React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/             # shadcn components
│   │   │   │   ├── Browser/
│   │   │   │   │   ├── Viewport.tsx
│   │   │   │   │   ├── Toolbar.tsx
│   │   │   │   │   ├── TabBar.tsx
│   │   │   │   │   └── HighlightOverlay.tsx
│   │   │   │   ├── Steps/
│   │   │   │   │   ├── StepsList.tsx
│   │   │   │   │   ├── StepCard.tsx
│   │   │   │   │   ├── StepEditor.tsx
│   │   │   │   │   └── HighlightAdjuster.tsx
│   │   │   │   ├── Export/
│   │   │   │   │   ├── ExportModal.tsx
│   │   │   │   │   └── FormatOptions.tsx
│   │   │   │   └── Layout/
│   │   │   │       ├── EditorShell.tsx
│   │   │   │       └── Lobby.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useSession.ts
│   │   │   │   ├── useScreencast.ts
│   │   │   │   ├── useInputCapture.ts
│   │   │   │   └── useSteps.ts
│   │   │   ├── stores/
│   │   │   │   └── sessionStore.ts
│   │   │   ├── lib/
│   │   │   │   ├── ws.ts
│   │   │   │   ├── coords.ts
│   │   │   │   └── api.ts
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── server/                     # Bun + Elysia backend
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   │   ├── session.ts
│       │   │   ├── steps.ts
│       │   │   ├── export.ts
│       │   │   └── import.ts
│       │   ├── ws/
│       │   │   ├── handler.ts
│       │   │   ├── screencast.ts
│       │   │   └── input.ts
│       │   ├── services/
│       │   │   ├── SessionManager.ts
│       │   │   ├── CDPBridge.ts
│       │   │   ├── Recorder.ts
│       │   │   ├── ExportService.ts
│       │   │   ├── ImportService.ts
│       │   │   └── HighlightService.ts
│       │   ├── types/
│       │   │   ├── session.ts
│       │   │   ├── step.ts
│       │   │   └── ws.ts
│       │   └── lib/
│       │       ├── env.ts
│       │       ├── crypto.ts
│       │       └── selectors.ts
│       ├── templates/
│       │   ├── export.html
│       │   └── styles.css
│       └── package.json
│
├── packages/shared/                # Shared types
│   ├── src/
│   │   ├── types.ts
│   │   └── constants.ts
│   └── package.json
│
├── .env.example
├── package.json
├── bun.lockb
└── README.md
```

---

## 6. Environment Variables

```bash
# Server
PORT=3000
MAX_SESSIONS=5
IDLE_TIMEOUT_MS=1800000        # 30 minutes
MAX_STEPS_PER_SESSION=200

# Chromium
BROWSER_VIEWPORT_WIDTH=1280
BROWSER_VIEWPORT_HEIGHT=800
SCREENCAST_QUALITY=80
SCREENCAST_MAX_FPS=15

# Security
SESSION_TOKEN_BYTES=32
```

---

## 7. Next Steps

1. Set up monorepo with Bun workspaces
2. Scaffold Elysia server with health check
3. Implement SessionManager with browser lifecycle
4. Add CDP screencast streaming via WebSocket
5. Build React shell with screencast viewport
6. Implement input forwarding (mouse/keyboard)
7. Add action recording and step capture
8. Build steps panel UI
9. Implement export services (PDF/DOCX/MD)
10. Add import flow for .stepwise files
11. Docker packaging and testing
