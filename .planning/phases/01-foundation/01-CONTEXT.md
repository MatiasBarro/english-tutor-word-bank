# Phase 1: Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a running TypeScript/Hono server connected to PostgreSQL with the `words` table created via a committed Drizzle migration and all environment variables validated at startup. This is pure infrastructure — no MCP tools, no REST endpoints. Everything Phase 2 and 3 depend on.

</domain>

<decisions>
## Implementation Decisions

### Schema

- **D-01:** `register` field uses a **Postgres native enum type** (`CREATE TYPE register_type AS ENUM ('formal', 'informal')`). Drizzle maps this to a typed enum in the schema. DB enforces the constraint — not just app-layer Zod validation. Migration must create the type before the table.

### Migrations

- **D-02:** Drizzle migration files live in the **root `drizzle/` directory** — drizzle-kit's default output path. No `out` override needed in `drizzle.config.ts`. The roadmap success criteria already references "a committed SQL migration file in `drizzle/`" — this matches.

### Claude's Discretion

- Health check response format (simple 200 OK vs JSON `{ status: "ok" }`) — standard JSON response is fine
- Project source layout within `src/` (e.g., `src/db/schema.ts`, `src/db/index.ts`) — Claude decides
- pg Pool values for `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` — sensible defaults
- Test script form for success criteria #5 (insert + read back via Drizzle) — a standalone npm script (`npm run db:test` or similar) is sufficient

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §DB-01–DB-04 — all four database requirements for this phase; DB-01 defines the full `words` table schema including field types

### Roadmap
- `.planning/ROADMAP.md` §Phase 1 — success criteria (5 items) and plan breakdown (01-01, 01-02, 01-03)

No external specs — requirements fully captured in decisions above and the referenced planning files.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes the baseline patterns for all future phases

### Integration Points
- `src/server.ts` will be the entry point that Phase 2 extends with MCP routing
- The singleton pg Pool (DB-03) must be importable by both MCP tools (Phase 2) and REST handlers (Phase 3)
- `src/config.ts` Zod schema must include `API_KEY` even though it's only used in Phase 3 — DB-04 requires all three vars validated at startup

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-27*
