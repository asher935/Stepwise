# AGENTS.md - Stepwise

## Commands
```bash
bun install              # Install dependencies
bun run dev              # Start all dev servers (client:5173, server:3000)
bun run build            # Build all packages
bun run typecheck        # Type check all packages
bun run lint             # Lint all packages
bun test                 # Run tests (in packages/server)
```

## Code Style
- **TypeScript**: Strict mode, no `any`, use explicit types. ES2022 target.
- **Imports**: Use `type` keyword for type-only imports. Path alias `@/` for client src.
- **Naming**: camelCase for variables/functions, PascalCase for components/types.
- **Errors**: Never use `no-unused-vars`, `no-explicit-any`, `no-unsafe-*` patterns.
- **Comments**: Do NOT add comments unless explicitly requested.
- **React**: Functional components only, Zustand for state, Radix UI primitives.
- **Backend**: Elysia framework, Bun runtime, Playwright for browser control.

## Structure
- `packages/shared` - Shared types/constants (import from `@stepwise/shared`)
- `packages/server` - Bun + Elysia backend
- `packages/client` - React + Vite frontend
