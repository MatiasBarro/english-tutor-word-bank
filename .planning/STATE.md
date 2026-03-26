# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** The agent always gets the right word for the right context — only active, categorized words with frequency guidance, so responses feel natural and pedagogically intentional.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 3 (Foundation)
Plan: 0 of 3 in current phase
Status: Ready to plan
Last activity: 2026-03-26 — Roadmap and STATE.md initialized

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Use `pg` (node-postgres) driver, not postgres.js — safer for connection pooler compatibility
- Use `varchar` for `register` field — avoids PostgreSQL enum migration complexity for a two-value field
- Use UUID (not serial) as primary key — matches `id: string` wire format expected by MCP clients
- Use `drizzle-kit generate` + `drizzle-kit migrate` — never `drizzle-kit push` against any persistent DB
- Pin `zod` to `^3.25.x` — Zod v4 silently breaks MCP tool schemas (SDK incompatibility)
- Use `@hono/mcp` v0.2.3 `StreamableHTTPTransport`, stateless mode — SSE transport is deprecated (March 2025)

### Pending Todos

None yet.

### Blockers/Concerns

- Verify whether `@hono/mcp` or `@modelcontextprotocol/hono` is the canonical package before Phase 2 implementation (research flagged naming ambiguity)
- Confirm SDK version in use supports `structuredContent` dual response format before treating Phase 2 as complete

## Session Continuity

Last session: 2026-03-26
Stopped at: Roadmap created, ready to begin Phase 1 planning
Resume file: None
