---
phase: 01-foundation
plan: 03
subsystem: server
tags: [hono, zod, config, health-check, db-test, dotenv]

# Dependency graph
requires:
  - phase: 01-foundation-01
    provides: "TypeScript project scaffold with all dependencies installed"
  - phase: 01-foundation-02
    provides: "Drizzle schema, singleton pg Pool, db instance exported from src/db/index.ts"
provides:
  - "Zod-validated environment config (DATABASE_URL, PORT, API_KEY) with fail-fast on missing vars"
  - "Hono server entry point (src/server.ts) with /health endpoint and graceful shutdown"
  - "Database test script (scripts/db-test.ts) proving end-to-end insert + read roundtrip"
affects: ["02-mcp-tools", "03-rest-api"]

# Tech tracking
tech-stack:
  added:
    - "dotenv@17.x (dev, for test script)"
  patterns:
    - "Fail-fast config: envSchema.safeParse at import time, process.exit(1) on any missing var"
    - "Graceful shutdown: pool.end() on SIGINT/SIGTERM before process.exit(0)"
    - "Health check: GET /health returns { status: 'ok' } — standard JSON response"

key-files:
  created:
    - src/config.ts
    - src/server.ts
    - scripts/db-test.ts
  modified:
    - package.json

key-decisions:
  - "DATABASE_URL validated with z.string().url() — enforces URL format at startup"
  - "PORT uses z.coerce.number() with default 3000 — optional but validated if present"
  - "config imported first in server.ts — env validation runs before any other initialization"
  - "app exported from server.ts — Phase 2 can add MCP routes to the same Hono instance"

requirements-completed: [DB-03, DB-04]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 1 Plan 03: Server Config and DB Test Script Summary

**Zod-validated startup config with fail-fast on missing env vars, Hono /health endpoint, and end-to-end Drizzle insert/read test script**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-27T14:51:14Z
- **Completed:** 2026-03-27T14:52:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `src/config.ts` with Zod schema validating DATABASE_URL (url format), PORT (coerced number, default 3000), and API_KEY (non-empty string); process exits with descriptive errors on any missing var
- Created `src/server.ts` with Hono app, GET /health returning `{ status: "ok" }`, graceful shutdown closing the pg pool on SIGINT/SIGTERM; exports `app` for Phase 2 extension
- Created `scripts/db-test.ts` that inserts a word with all DB-01 fields (including enum register value "formal"), reads it back, verifies each field matches, cleans up, and exits 0 on success
- Installed `dotenv` as devDependency and added `db:test` script to package.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Zod config and Hono server with health check** - `f38992d` (feat)
2. **Task 2: Database test script and dotenv** - `ed1a82e` (feat)

## Files Created/Modified

- `src/config.ts` - Zod envSchema for DATABASE_URL, PORT (default 3000), API_KEY; fail-fast loadConfig() called at import time
- `src/server.ts` - Hono app, GET /health, serve() on config.PORT, graceful shutdown closing pool
- `scripts/db-test.ts` - End-to-end DB test: insert word -> read back -> verify fields -> cleanup -> exit 0
- `package.json` - Added `db:test` script and `dotenv` devDependency

## Decisions Made

- `DATABASE_URL` uses `z.string().url()` — validates URL format, not just non-empty string
- `config` is imported at the top of `server.ts` ensuring env validation runs before pool or Hono initialization
- `app` is exported from `server.ts` so Phase 2 can mount MCP routes on the same Hono instance without restructuring
- `dotenv/config` imported at the top of `db-test.ts` so `.env` is loaded before any DB connection attempt

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — all files implement real functionality. The db-test script requires a running PostgreSQL with migration applied to execute, but that is expected behavior (documented in the plan).

## Self-Check: PASSED

- FOUND: src/config.ts
- FOUND: src/server.ts
- FOUND: scripts/db-test.ts
- FOUND: package.json (modified with db:test script)
- FOUND commit: f38992d (Task 1)
- FOUND commit: ed1a82e (Task 2)

---
*Phase: 01-foundation*
*Completed: 2026-03-27*
