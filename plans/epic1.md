# EPIC-1 — Repo, Docker, CI Skeleton

## **EPIC: SW-100 — Repo, Docker, CI Skeleton**

**Goal:** A predictable dev + build loop where the app boots in Docker Compose with health checks, validated config, and basic quality gates.
**Exit Criteria:** `docker compose up` runs UI+API; `/health` returns 200; env vars validated; docs + scripts exist; basic CI (optional but recommended) runs lint/test.

---

## Story Tickets

### **SW-101 — Repo Structure + Dev Scripts (P0)**

**Owner:** DevOps / Full-stack
**Estimate:** M
**Dependencies:** None

**Acceptance Criteria**

* Repo has a clear structure (e.g., `/apps/web`, `/apps/api`, `/packages/shared` or single app folder with `/server` + `/client`)
* Scripts exist and work locally:

  * `bun dev` (or `npm/pnpm` equivalent)
  * `bun build`
  * `bun test`
  * `bun lint`
* Prettier/formatter configured and consistent

**Sub-tasks**

* SW-101a: Initialize repo + package manager configuration (Bun) (S)
* SW-101b: Project folder layout + path aliases (S)
* SW-101c: Scripts + tooling config (lint/format/test) (M)
* SW-101d: Basic shared types folder (session IDs, config types placeholders) (S)

---

### **SW-102 — Dockerfile + Docker Compose Baseline (P0)**

**Owner:** DevOps
**Estimate:** M
**Dependencies:** SW-101

**Acceptance Criteria**

* `docker compose up` starts the app successfully on a clean machine
* Ports are documented and configurable via env
* Container includes required Chromium runtime deps (even if Chromium not wired yet)
* Dev mode supports live reload (as feasible in container)

**Sub-tasks**

* SW-102a: Dockerfile for app (multi-stage build if needed) (M)
* SW-102b: docker-compose.yml with named service(s) + volumes (M)
* SW-102c: Chromium dependencies layer (fonts, libs) (M)
* SW-102d: `.dockerignore` + build caching improvements (S)

---

### **SW-103 — Healthcheck Endpoint + Compose Health (P0)**

**Owner:** Backend / DevOps
**Estimate:** S
**Dependencies:** SW-102

**Acceptance Criteria**

* `/health` returns `200` with minimal JSON (uptime, version, env name)
* Compose healthcheck uses `/health` and marks service healthy
* Healthcheck failure produces clear logs

**Sub-tasks**

* SW-103a: Implement `/health` endpoint (S)
* SW-103b: Add Compose healthcheck configuration (S)

---

### **SW-104 — Runtime Config Loader + Env Validation (P0)**

**Owner:** Backend
**Estimate:** M
**Dependencies:** SW-101

**Acceptance Criteria**

* Config reads from env with sane defaults
* Required env vars fail fast with clear error
* Types enforced (numbers, booleans, enums)
* `.env.example` includes all required keys + explanations

**Sub-tasks**

* SW-104a: Config schema (zod/valibot) + typed loader (M)
* SW-104b: Startup validation + friendly error output (S)
* SW-104c: `.env.example` created + documented (S)

---

### **SW-105 — Non-secret Config Display (Admin/Status Page v0) (P0)**

**Owner:** Frontend + Backend
**Estimate:** S
**Dependencies:** SW-104, SW-102

**Acceptance Criteria**

* A `/status` (or `/admin/status`) page shows:

  * build/version (commit hash if available)
  * key non-secret config values (e.g., MAX_SESSIONS, viewport size)
* Secrets are never displayed
* Works in Docker

**Sub-tasks**

* SW-105a: Backend: expose `/status` JSON (non-secret allowlist) (S)
* SW-105b: Frontend: status page UI (S)
* SW-105c: Redaction/allowlist enforcement test (S)

---

### **SW-106 — Logging Baseline + Correlation IDs (P0)**

**Owner:** Backend
**Estimate:** M
**Dependencies:** SW-101

**Acceptance Criteria**

* Structured logs (JSON preferred) with levels
* Request ID + (future) session ID fields supported
* Log level configurable via `LOG_LEVEL`

**Sub-tasks**

* SW-106a: Logging utility + format decision (S)
* SW-106b: Middleware adds request correlation ID (S)
* SW-106c: Log sampling/verbosity defaults (S)

---

### **SW-107 — CI Pipeline: Lint + Test + Build (P1 but recommended)**

**Owner:** DevOps
**Estimate:** M
**Dependencies:** SW-101

**Acceptance Criteria**

* CI runs on PR:

  * install
  * lint
  * test
  * build (or typecheck)
* CI caches dependencies where possible
* Failing checks block merge (if you want strict)

**Sub-tasks**

* SW-107a: CI workflow file (GitHub Actions) (S)
* SW-107b: Cache bun install directory (S)
* SW-107c: Add status badges to README (S)

---

### **SW-108 — Developer Docs: Quickstart + Runbook + Known Issues (P0)**

**Owner:** PM/QA + DevOps
**Estimate:** M
**Dependencies:** SW-102, SW-104, SW-103

**Acceptance Criteria**

* README includes:

  * prerequisites
  * `docker compose up` steps
  * env var setup
  * ports
  * troubleshooting section
* Basic runbook: how to collect logs, restart services

**Sub-tasks**

* SW-108a: README Quickstart (S)
* SW-108b: Troubleshooting + common Docker issues (S)
* SW-108c: Contribution guidelines (optional) (S)

---

## EPIC-1 Definition of Done (for your tracker)

* [ ] Compose boots on clean machine
* [ ] `/health` 200 + compose healthcheck green
* [ ] Env validation blocks boot on bad config
* [ ] `/status` shows non-secret config
* [ ] Scripts: dev/build/test/lint
* [ ] README quickstart + `.env.example`
* [ ] (Optional) CI lint/test/build
