# Stepwise

A Docker-deployable web application for recording browser actions into step-by-step guides with screenshots. Self-hosted alternative to Tango.ai.

## Features

- **Browser Recording**: Record clicks, typing, navigation, and scrolling in a remote browser
- **Screenshot Capture**: Automatic screenshots with element highlights for each step
- **Step Editing**: Edit captions and delete unwanted steps
- **Multiple Export Formats**: PDF, Word (DOCX), Markdown, HTML, and re-importable .stepwise format
- **Password Protection**: Encrypt exported .stepwise files
- **Import/Export**: Save and restore recording sessions
- **Real-time Streaming**: Low-latency browser view via Chrome DevTools Protocol

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + Zustand
- **Backend**: Bun + Elysia (WebSocket support)
- **Browser Control**: Playwright with Chrome DevTools Protocol
- **Export**: Playwright PDF, docx library for Word

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/stepwise.git
cd stepwise

# Start with Docker Compose
cd docker
docker compose up -d

# If you make code changes, rebuild the image
docker compose up -d --build

# If you suspect a cached build, force a clean rebuild
docker compose build --no-cache
docker compose up -d

# Open in browser
open http://localhost:3000
```

### Docker Development (Live Reload)

```bash
# From repo root
docker compose -f docker/docker-compose.dev.yml up --build

# Or from docker/ directory
cd docker
docker compose -f docker-compose.dev.yml up --build
```

This uses bind mounts and runs `bun run dev` inside the container, so changes hot-reload without rebuilding the image. Rebuild only if `docker/Dockerfile.dev` changes.

### Local Development

```bash
# Install dependencies
bun install

# Start development servers
bun run dev

# Or start individually
bun run dev:server  # Backend on :3000
bun run dev:client  # Frontend on :5173
```

## Project Structure

```
stepwise/
├── docker/                 # Docker configuration
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
├── packages/
│   ├── shared/            # Shared types and constants
│   ├── server/            # Bun + Elysia backend
│   │   ├── src/
│   │   │   ├── services/  # SessionManager, CDPBridge, Recorder, etc.
│   │   │   ├── routes/    # REST API routes
│   │   │   ├── ws/        # WebSocket handlers
│   │   │   └── lib/       # Utilities
│   │   └── templates/     # Export templates
│   └── client/            # React frontend
│       └── src/
│           ├── components/
│           ├── stores/
│           └── lib/
└── docs/                  # Documentation and plans
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `MAX_SESSIONS` | 5 | Maximum concurrent sessions |
| `IDLE_TIMEOUT_MS` | 1800000 | Session idle timeout (30 min) |
| `MAX_STEPS_PER_SESSION` | 200 | Maximum steps per session |
| `BROWSER_VIEWPORT_WIDTH` | 1280 | Browser viewport width |
| `BROWSER_VIEWPORT_HEIGHT` | 800 | Browser viewport height |
| `SCREENCAST_QUALITY` | 80 | JPEG quality (1-100) |
| `SCREENCAST_MAX_FPS` | 15 | Maximum frame rate |

## API Endpoints

### Sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session state
- `POST /api/sessions/:id/start` - Start browser session
- `POST /api/sessions/:id/end` - End session

### Steps
- `GET /api/sessions/:id/steps` - Get all steps
- `PATCH /api/sessions/:id/steps/:stepId` - Update step
- `DELETE /api/sessions/:id/steps/:stepId` - Delete step

### Export/Import
- `POST /api/export/:id` - Export session
- `GET /api/export/:id/download/:filename` - Download export
- `POST /api/import/:id` - Import .stepwise file

### WebSocket
- `ws://localhost:3000/ws?sessionId=...&token=...` - Real-time communication

## Development

### Scripts

```bash
bun run dev          # Start all dev servers
bun run build        # Build all packages
bun run typecheck    # Type check all packages
bun run lint         # Lint all packages
bun run clean        # Clean build artifacts
```

### Building Docker Image

```bash
cd docker
docker build -t stepwise:latest -f Dockerfile ..
```

## Security Considerations

- Sessions use 256-bit random tokens for authentication
- .stepwise files can be encrypted with AES-256-GCM
- Typed content is redacted by default for privacy
- Browser instances run with sandbox disabled (required for Docker)

## License

MIT
