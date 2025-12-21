# Stepwise Implementation Plan

> **Date:** 2025-12-21  
> **Status:** Ready for Execution  
> **Goal:** Build a Docker-deployable web app for recording browser actions into step-by-step guides with screenshots - a self-hosted alternative to Tango.ai.

---

## Architecture Summary

**Tech Stack:**
- Frontend: Vite + React 18 + TypeScript + shadcn/ui + Tailwind + Zustand
- Backend: Bun + Elysia (WebSocket support)
- CDP Control: Playwright for browser control
- Export: PDF (Playwright page.pdf), DOCX (docx library), Markdown/HTML as ZIP
- Encryption: AES-256-GCM for password protection

**Key Components:**
1. SessionManager - create/close sessions, MAX_SESSIONS limit, idle timeout
2. CDP Bridge - connect to Chromium, screencast streaming, input forwarding
3. Recorder - CDP events → Step objects → screenshots with highlights
4. Export Service - PDF/DOCX/MD renderers
5. Import Service - .stepwise parsing + decryption

---

## Phase 1: Monorepo Foundation

### Task 1.1: Initialize Bun Monorepo

**Agent:** build  
**Files:**
- Create: `package.json`
- Create: `bun.lockb` (auto-generated)
- Create: `.gitignore`
- Create: `.env.example`

**Dependencies:** None (first task)

**Details:**

Root `package.json`:
```json
{
  "name": "stepwise",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:server": "bun run --filter @stepwise/server dev",
    "dev:client": "bun run --filter @stepwise/client dev",
    "build": "bun run --filter '*' build",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "bun run --filter '*' lint",
    "clean": "rm -rf packages/*/dist packages/*/.turbo"
  },
  "devDependencies": {
    "@types/bun": "^1.1.0",
    "typescript": "^5.3.3"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
bun.lockb
packages/client/.vite/
/tmp/
```

`.env.example`:
```bash
# Server
PORT=3000
MAX_SESSIONS=5
IDLE_TIMEOUT_MS=1800000
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

### Task 1.2: Create Root TypeScript Configuration

**Agent:** typescript-pro  
**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.base.json`

**Dependencies:** Task 1.1

**Details:**

`tsconfig.base.json` (shared settings):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

`tsconfig.json` (root references):
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@stepwise/shared": ["./packages/shared/src"],
      "@stepwise/shared/*": ["./packages/shared/src/*"]
    }
  },
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/server" },
    { "path": "./packages/client" }
  ],
  "include": [],
  "exclude": ["node_modules", "dist"]
}
```

---

### Task 1.3: Create Package Directory Structure

**Agent:** build  
**Files:**
- Create: `packages/shared/` directory
- Create: `packages/server/` directory
- Create: `packages/client/` directory
- Create: `docker/` directory

**Dependencies:** Task 1.1

**Details:**

Run commands:
```bash
mkdir -p packages/shared/src
mkdir -p packages/server/src/{routes,ws,services,types,lib}
mkdir -p packages/server/templates
mkdir -p packages/client/src/{components,hooks,stores,lib}
mkdir -p docker
```

---

## Phase 2: Shared Types Package

### Task 2.1: Initialize Shared Package

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

**Dependencies:** Task 1.2, Task 1.3

**Details:**

`packages/shared/package.json`:
```json
{
  "name": "@stepwise/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    },
    "./*": {
      "types": "./src/*.ts",
      "import": "./src/*.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

---

### Task 2.2: Define Session State Types

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/src/session.ts`

**Dependencies:** Task 2.1

---

### Task 2.3: Define Step Types

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/src/step.ts`

**Dependencies:** Task 2.1

---

### Task 2.4: Define WebSocket Message Types

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/src/ws.ts`

**Dependencies:** Task 2.2, Task 2.3

---

### Task 2.5: Define Export/Import Types

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/src/export.ts`

**Dependencies:** Task 2.3

---

### Task 2.6: Define Constants

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/src/constants.ts`

**Dependencies:** Task 2.1

---

### Task 2.7: Create Shared Package Index

**Agent:** typescript-pro  
**Files:**
- Create: `packages/shared/src/index.ts`

**Dependencies:** Task 2.2, Task 2.3, Task 2.4, Task 2.5, Task 2.6

---

## Phase 3: Backend Server

### Task 3.1: Initialize Server Package

**Agent:** build  
**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`

**Dependencies:** Task 2.7

**Details:**

`packages/server/package.json`:
```json
{
  "name": "@stepwise/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "build": "bun build src/index.ts --outdir=dist --target=bun",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@stepwise/shared": "workspace:*",
    "elysia": "^1.0.0",
    "@elysiajs/cors": "^1.0.0",
    "@elysiajs/static": "^1.0.0",
    "playwright-core": "^1.40.0",
    "docx": "^8.5.0",
    "archiver": "^6.0.1",
    "unzipper": "^0.10.14",
    "nanoid": "^5.0.4",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "@types/archiver": "^6.0.2",
    "@types/unzipper": "^0.10.9",
    "typescript": "^5.3.3"
  }
}
```

---

### Task 3.2: Create Environment Configuration

**Agent:** build  
**Files:**
- Create: `packages/server/src/lib/env.ts`

**Dependencies:** Task 3.1

---

### Task 3.3: Create Crypto Utilities

**Agent:** build  
**Files:**
- Create: `packages/server/src/lib/crypto.ts`

**Dependencies:** Task 3.1

---

### Task 3.4: Create Selector Generation Utilities

**Agent:** build  
**Files:**
- Create: `packages/server/src/lib/selectors.ts`

**Dependencies:** Task 3.1

---

### Task 3.5: Define Server-Side Session Types

**Agent:** build  
**Files:**
- Create: `packages/server/src/types/session.ts`

**Dependencies:** Task 3.1, Task 2.7

---

### Task 3.6: Implement Session Manager Service

**Agent:** build  
**Files:**
- Create: `packages/server/src/services/SessionManager.ts`

**Dependencies:** Task 3.2, Task 3.3, Task 3.5

---

### Task 3.7: Implement CDP Bridge Service

**Agent:** build  
**Files:**
- Create: `packages/server/src/services/CDPBridge.ts`

**Dependencies:** Task 3.6

---

### Task 3.8: Implement Recorder Service

**Agent:** build  
**Files:**
- Create: `packages/server/src/services/Recorder.ts`

**Dependencies:** Task 3.6, Task 3.7, Task 3.4

---

### Task 3.9: Implement Export Service

**Agent:** build  
**Files:**
- Create: `packages/server/src/services/ExportService.ts`
- Create: `packages/server/templates/export.html`
- Create: `packages/server/templates/styles.css`

**Dependencies:** Task 3.6, Task 3.3

---

### Task 3.10: Implement Import Service

**Agent:** build  
**Files:**
- Create: `packages/server/src/services/ImportService.ts`

**Dependencies:** Task 3.6, Task 3.3

---

### Task 3.11: Create WebSocket Handler

**Agent:** build  
**Files:**
- Create: `packages/server/src/ws/handler.ts`

**Dependencies:** Task 3.6, Task 3.7, Task 3.8

---

### Task 3.12: Create Session Routes

**Agent:** build  
**Files:**
- Create: `packages/server/src/routes/session.ts`

**Dependencies:** Task 3.6, Task 3.7

---

### Task 3.13: Create Export Routes

**Agent:** build  
**Files:**
- Create: `packages/server/src/routes/export.ts`

**Dependencies:** Task 3.9

---

### Task 3.14: Create Import Routes

**Agent:** build  
**Files:**
- Create: `packages/server/src/routes/import.ts`

**Dependencies:** Task 3.10

---

### Task 3.15: Create Main Server Entry Point

**Agent:** build  
**Files:**
- Create: `packages/server/src/index.ts`

**Dependencies:** Task 3.11, Task 3.12, Task 3.13, Task 3.14

---

## Phase 4: Frontend Foundation

### Task 4.1: Initialize Client Package

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/tsconfig.node.json`

**Dependencies:** Task 2.7

---

### Task 4.2: Configure Vite and Tailwind

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/tailwind.config.ts`
- Create: `packages/client/postcss.config.js`
- Create: `packages/client/index.html`

**Dependencies:** Task 4.1

---

### Task 4.3: Create Base Styles and Utilities

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/index.css`
- Create: `packages/client/src/lib/utils.ts`

**Dependencies:** Task 4.2

---

### Task 4.4: Create API Client

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/lib/api.ts`

**Dependencies:** Task 4.3

---

### Task 4.5: Create WebSocket Client

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/lib/ws.ts`

**Dependencies:** Task 4.3

---

### Task 4.6: Create Coordinate Translation Utility

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/lib/coords.ts`

**Dependencies:** Task 4.3

---

### Task 4.7: Create Session Store (Zustand)

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/stores/sessionStore.ts`

**Dependencies:** Task 4.4, Task 4.5

---

## Phase 5: Frontend Components

### Task 5.1: Create UI Primitives (shadcn-style)

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/ui/button.tsx`
- Create: `packages/client/src/components/ui/input.tsx`
- Create: `packages/client/src/components/ui/card.tsx`
- Create: `packages/client/src/components/ui/dialog.tsx`
- Create: `packages/client/src/components/ui/dropdown-menu.tsx`
- Create: `packages/client/src/components/ui/tooltip.tsx`
- Create: `packages/client/src/components/ui/scroll-area.tsx`
- Create: `packages/client/src/components/ui/separator.tsx`

**Dependencies:** Task 4.3

---

### Task 5.2: Create Viewport Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Browser/Viewport.tsx`

**Dependencies:** Task 4.6, Task 4.7, Task 5.1

---

### Task 5.3: Create Browser Toolbar Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Browser/Toolbar.tsx`

**Dependencies:** Task 4.7, Task 5.1

---

### Task 5.4: Create Step Card Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Steps/StepCard.tsx`

**Dependencies:** Task 4.4, Task 4.7, Task 5.1

---

### Task 5.5: Create Steps List Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Steps/StepsList.tsx`

**Dependencies:** Task 5.4

---

### Task 5.6: Create Export Modal Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Export/ExportModal.tsx`

**Dependencies:** Task 4.4, Task 5.1

---

### Task 5.7: Create Import Modal Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Import/ImportModal.tsx`

**Dependencies:** Task 4.4, Task 5.1

---

### Task 5.8: Create Editor Shell Layout

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Layout/EditorShell.tsx`

**Dependencies:** Task 5.2, Task 5.3, Task 5.5, Task 5.6, Task 5.7

---

### Task 5.9: Create Lobby Component

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/components/Layout/Lobby.tsx`

**Dependencies:** Task 4.7, Task 5.1, Task 5.7

---

### Task 5.10: Create App Entry Point

**Agent:** frontend-ui-ux-engineer  
**Files:**
- Create: `packages/client/src/App.tsx`
- Create: `packages/client/src/main.tsx`

**Dependencies:** Task 5.8, Task 5.9

---

## Phase 6: Docker Packaging

### Task 6.1: Create Dockerfile

**Agent:** build  
**Files:**
- Create: `docker/Dockerfile`

**Dependencies:** All previous tasks

---

### Task 6.2: Create Docker Compose Configuration

**Agent:** build  
**Files:**
- Create: `docker/docker-compose.yml`

**Dependencies:** Task 6.1

---

### Task 6.3: Create Production Docker Compose Override

**Agent:** build  
**Files:**
- Create: `docker/docker-compose.prod.yml`

**Dependencies:** Task 6.2

---

## Phase 7: Documentation and Verification

### Task 7.1: Create README

**Agent:** document-writer  
**Files:**
- Create: `README.md`

**Dependencies:** All previous tasks

---

### Task 7.2: Final Verification

**Agent:** code-reviewer  
**Actions:**
- Run `bun install` in root
- Run `bun run typecheck` - verify zero TypeScript errors
- Run `bun run lint` - verify zero linter errors
- Run `bun run build` - verify successful build
- Run Docker build and test health endpoint

**Dependencies:** All previous tasks

---

## Execution Progress

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 1. Monorepo Foundation | ✅ Complete | 2025-12-21 12:04 | 2025-12-21 12:05 |
| 2. Shared Types | ✅ Complete | 2025-12-21 12:05 | 2025-12-21 12:06 |
| 3. Backend Server | ✅ Complete | 2025-12-21 12:06 | 2025-12-21 12:10 |
| 4. Frontend Foundation | ✅ Complete | 2025-12-21 12:10 | 2025-12-21 12:12 |
| 5. Frontend Components | ✅ Complete | 2025-12-21 12:12 | 2025-12-21 12:18 |
| 6. Docker Packaging | ✅ Complete | 2025-12-21 12:18 | 2025-12-21 12:20 |
| 7. Documentation | ✅ Complete | 2025-12-21 12:20 | 2025-12-21 12:36 |

## Implementation Details

### Completed Features

#### Phase 1: Monorepo Foundation 
- Bun monorepo with workspace configuration
- TypeScript with strict mode and comprehensive settings
- Package directory structure for shared, server, and client

#### Phase 2: Shared Types Package 
- 400+ type definitions for sessions, steps, WebSocket messages
- Export/import types with password protection support
- Comprehensive constants for UI, browser settings, and API
- Clean exports for easy consumption across packages

#### Phase 3: Backend Server 
- **Session Manager**: Complete session lifecycle management with idle timeout
- **CDP Bridge**: Chrome DevTools Protocol integration for browser automation
- **Recorder**: Event-driven step capture with intelligent consolidation
- **Export Service**: Multi-format export (PDF, DOCX, Markdown, HTML, ZIP)
- **Import Service**: Multi-format import with validation and progress tracking
- **WebSocket Handler**: Real-time communication with rate limiting
- **REST API**: Complete REST endpoints for sessions, exports, and imports
- **Main Server**: Production-ready server with graceful shutdown

### Architecture Highlights
- **Type Safety**: Strict TypeScript throughout with no compromises
- **Event-Driven**: Comprehensive event system for real-time updates
- **Security**: AES-256-GCM encryption, secure tokens, rate limiting
- **Scalability**: Session limits, resource management, cleanup jobs
- **Templates**: Customizable export templates with multiple styles
- **Error Handling**: Comprehensive error boundaries and recovery

---

## Notes

- All frontend tasks (.tsx, .css files) MUST be delegated to `frontend-ui-ux-engineer`
- Backend tasks delegated to `build`
- Type definition tasks delegated to `typescript-pro`
- Documentation tasks delegated to `document-writer`
- Final review uses `code-reviewer` or `oracle` for verification
