# Phase 2: MCP Layer - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `/mcp` endpoint with Streamable HTTP transport and two MCP tools (`list_categories`, `get_words_by_category`) that query real database rows. No auth on `/mcp`. No UI work.

</domain>

<decisions>
## Implementation Decisions

### File Organization
- **D-01:** Tool implementations live in `src/tools/` — `list-categories.ts` and `get-words-by-category.ts` as separate files
- **D-02:** `src/server.ts` mounts `/mcp` — MCP transport wiring may go in a dedicated `src/mcp.ts` or inline in server.ts (planner decides)

### Text Content Format
- **D-03:** `content[{type:"text"}]` is a human-readable summary string for the LLM agent to read — NOT a JSON-serialized duplicate of structuredContent
  - `list_categories` example: `"Available categories: emphasis, summary, examples (3 total)"`
  - `get_words_by_category` example: `"Words in 'emphasis': therefore (formal, freq:80), ..."`
- **D-04:** `structuredContent` carries the machine-parseable structured data (separate concern)

### E2E Verification
- **D-05:** Plan 02-04 must produce a `scripts/mcp-test.ts` that uses the `@modelcontextprotocol/sdk` TypeScript client to connect, call both tools, and log results — verifying the full MCP protocol stack, not just raw HTTP

### Locked from Prior Phases / Project Docs
- **D-06:** Streamable HTTP transport only — SSE not present (MCP-06)
- **D-07:** Stateless mode — `sessionIdGenerator: undefined` (plan 02-01)
- **D-08:** No auth on `/mcp` — unauthenticated requests accepted (AUTH-04)
- **D-09:** Dual response: both `content[{type:"text"}]` and `structuredContent` in every tool response (MCP-04)
- **D-10:** Tool errors returned as `{ isError: true, content: [...] }` — no exceptions bubbled (MCP-05)
- **D-11:** Zod pinned to `^3.25.x` for tool input schemas — Zod v4 breaks MCP SDK (package.json)

### Claude's Discretion
- Whether MCP transport wiring lives in `src/mcp.ts` or inline in `src/server.ts`
- Exact human-readable string format for text content (examples above are illustrative)
- Whether `scripts/mcp-test.ts` seeds test data or expects pre-existing rows

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Docs
- `.planning/ROADMAP.md` — Phase 2 success criteria, plan specs (02-01 through 02-04)
- `.planning/REQUIREMENTS.md` — MCP-01 through MCP-06, AUTH-04
- `.planning/PROJECT.md` — Key decisions table, constraints, tech stack

### Codebase Integration Points
- `src/server.ts` — Hono app to mount `/mcp` on
- `src/db/index.ts` — exports `db` (Drizzle instance) and `pool` (pg Pool) — use for tool queries
- `src/db/schema.ts` — exports `words` table and `registerEnum`
- `src/config.ts` — exports validated `config` object

### External
- No external specs — requirements fully captured in decisions above

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db` from `src/db/index.ts`: Drizzle instance — use directly in tool files for queries
- `pool` from `src/db/index.ts`: pg Pool — needed for graceful shutdown in server.ts
- `words` from `src/db/schema.ts`: table definition for Drizzle queries (`.where(eq(words.active, true))` etc.)

### Established Patterns
- ESM imports with `.js` extensions (type: module, NodeNext resolution)
- Config accessed via `import { config } from "./config.js"`
- Graceful shutdown via `pool.end()` on SIGINT/SIGTERM already in server.ts

### Integration Points
- `src/server.ts`: mount MCP handler at `/mcp` alongside existing `/health` route
- `package.json`: add `@hono/mcp@0.2.3` and `@modelcontextprotocol/sdk` as dependencies

### Missing Dependencies (not yet in package.json)
- `@hono/mcp` v0.2.3
- `@modelcontextprotocol/sdk`

</code_context>

<specifics>
## Specific Ideas

- No specific references — user confirmed standard approaches for all decisions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-mcp-layer*
*Context gathered: 2026-03-28*
