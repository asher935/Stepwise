# Stepwise v0 — Project Manager Implementation Plan

## 1. Scope, Assumptions, Non-goals

### Scope (v0) — what we will deliver

1. **Docker-deployable web app** that runs an **interactive remote Chromium** inside the container.
2. Browser interaction via **Chrome DevTools Protocol screencast (Tier 2)** (no “native-feel” streaming required).
3. **One browser instance per user session**; configurable **multi-user concurrency** within a single deployment.
4. **No server-side persistence**: all project/session state is in-memory + temp files only, until exported/downloaded.
5. **Action recording** into a step-by-step guide with **screenshots + highlights + heuristic captions** (no AI).
6. **Editor UX**: steps list on the left, live browser on the right; users can **edit captions**, **delete/reorder**, **add manual steps**, **recapture screenshot**, **adjust highlight**.
7. **Capture significant actions**: clicks, typing (privacy-safe), scroll, navigation, shortcuts, form submit, hover menus best-effort, file upload/download.
8. **Tab switching** supported (recorded + reflected in the UI).
9. **Clipboard sync enabled** between user and container browser.
10. **Exports**: PDF + DOCX + Markdown/HTML (MD/HTML exported as **ZIP** with `/images`).
11. **Resume/edit** via **`.stepwise` session ZIP** (`session.json` + screenshots) with **optional password encryption**.
12. Works for **internal HTTP-only sites** (no HTTPS-only assumption).

### Assumptions (explicit)

* A1. **Single-container** deployment target for v0 (no external Redis/DB required).
* A2. “No raw text stored by default” means: typed content is not persisted in `session.json` unless user explicitly opts in; we still record that a typing action occurred with a redacted summary (e.g., “Typed into Email field (redacted)”).
* A3. File download handling in v0 is “**download within the container + user can retrieve via UI**”; we won’t attempt OS-level integrations beyond the web UI.
* A4. “Highlights” are stored as **DOM-based target selectors + element bounding box at capture time**; we may fallback to box-only highlight when selectors are unreliable (iframes/canvas).

### Non-goals (v0)

* No account system/auth inside Stepwise (beyond basic hardening).
* No long-term storage, collaboration, or shared workspaces.
* No AI captioning, summarization, or semantic understanding.
* No pixel-perfect highlight tracking during playback; highlights are “best effort” at capture/edit time.
* No guaranteed support for every complex UI pattern (canvas-heavy apps, cross-origin iframes) beyond graceful degradation.

### Definition of Done (DoD)

**Story DoD (minimum)**

* Acceptance criteria met and verified (happy path + 1 failure path).
* Unit/integration tests added where practical; critical flows covered by E2E smoke.
* No P0 bugs; known limitations documented in “Known Issues”.
* Works in Docker locally via `docker compose up` with documented env vars.

**Release DoD (minimum)**

* All Sprint 3 milestone stories done.
* Export round-trip validated (record → export → import → edit → re-export).
* Concurrency sanity tested at configured MAX_SESSIONS.
* Security basics (headers, sandboxing posture, upload limits) validated.
* Demo script passes on a clean machine using only Docker.

---

## 2. Architecture-at-a-glance (components only)

**Frontend (Web UI)**

* Session lobby + editor shell (steps left, browser right)
* Screencast viewer + input forwarding
* Step editor (CRUD + highlight adjustment)
* Export/import flows

**Backend (App Server)**

* **Session Manager**: create/close sessions, enforce MAX_SESSIONS, idle timeout
* **CDP Bridge**: connect to Chromium per session; start screencast; forward inputs
* **Recorder**: subscribe to CDP events, generate Step events, capture screenshots, compute highlights
* **Artifact Store (ephemeral)**: in-memory session model + temp filesystem for images/zips
* **Export Service**: PDF/DOCX/MD/HTML renderers + zip packaging
* **Import Service**: `.stepwise` parsing + optional decrypt + validation

**Chromium (per session)**

* Launched with hardened args + download directory + clipboard sync support (best-effort)
