# Project Research Summary

**Project:** English Tutor Word Bank MCP Server
**Domain:** Remote MCP server with companion REST management API
**Researched:** 2026-03-26
**Confidence:** HIGH

## Executive Summary

This project is a remote MCP server that functions as a curated vocabulary data source for an English tutor AI agent. The architecture is well-understood: a single-process Hono application exposes both an MCP endpoint (for agent consumption) and a REST API (for admin management), backed by PostgreSQL with Drizzle ORM. The entire surface area is small — two MCP tools and five REST endpoints — which means the primary engineering challenge is doing it correctly rather than managing complexity.

The recommended approach is to use Streamable HTTP transport via `@hono/mcp`, stateless mode. This is the only transport that aligns with the current MCP specification (SSE was deprecated March 2025) and is the only sensible choice for read-only request/response tools like these. The stack is locked by project constraints (TypeScript, Hono, Drizzle, PostgreSQL) and the research confirms all constraints are good choices with official ecosystem support. No stack decisions need revisiting.

The key risks are operational rather than architectural: using the deprecated SSE transport by accident (copy-pasting old tutorials), improperly surfacing database exceptions to the LLM (which breaks agent recovery), and misusing `drizzle-kit push` instead of proper migration files. All three are well-documented failure modes with clear prevention patterns. Avoiding them is a matter of discipline during implementation, not complexity.

## Key Findings

### Recommended Stack

The stack is fully locked by project constraints and all choices are validated. The only decision with non-obvious nuance is the MCP transport layer: use `@hono/mcp` v0.2.3's `StreamableHTTPTransport` — not `SSEServerTransport`, which is deprecated and will not receive future SDK support. Zod must be pinned to v3.x (not v4) because the MCP SDK's internal `zod-to-json-schema` adapter is incompatible with Zod v4 and silently produces empty tool schemas.

**Core technologies (exact versions):**
- **Node.js 24.x LTS**: Active LTS since October 2025; use for new projects
- **TypeScript 5.x (latest)**: Required; first-class support in all stack packages
- **`@modelcontextprotocol/sdk` ^1.28.0**: Official MCP SDK; provides `McpServer` and `StreamableHTTPServerTransport`
- **`@hono/mcp` ^0.2.3**: Official Hono-MCP bridge; handles Streamable HTTP protocol and DNS rebinding protection automatically
- **`hono` ^4.12.0**: HTTP framework; built-in `bearerAuth` middleware; single process for both MCP and REST
- **`drizzle-orm` ^0.45.x** + **`drizzle-kit` ^0.31.x**: Type-safe schema-as-code ORM; `drizzle-kit` for migrations
- **`pg` (node-postgres) ^8.x**: PostgreSQL driver; safer default than postgres.js for connection pooler compatibility
- **`tsx` (latest)**: Dev TS runner; ~25x faster startup than ts-node; handles ESM cleanly
- **`zod` ^3.25.x**: Peer dependency of MCP SDK; pin to v3, do NOT use v4
- **`dotenv` ^16.x**: Env loading; validate at startup with Zod (see Architecture)

### Expected Features

**Must have (table stakes):**
- `list_categories` MCP tool — returns distinct categories with at least one active word; no parameters
- `get_words_by_category` MCP tool — returns full word records (word, register, frequency, usage_sentence) filtered to active words
- Active-only filtering at DB query level (`WHERE active = true`) — agent must never see disabled words
- `POST /words` — create a single word (API key protected)
- `PUT /words/:id` — update any field on a word (API key protected)
- `DELETE /words/:id` — hard delete (API key protected)
- `POST /words/import` — bulk import up to 500 words; HTTP 207 for partial success (API key protected)
- `GET /categories` — list all categories including inactive, with word counts (API key protected)
- Dual response output on MCP tools: both `content[0].type=text` and `structuredContent` per MCP spec 2025-11-25

**Should have (differentiators):**
- Frequency weights (integer 1–100) returned as raw values — agent owns sampling logic
- Register as a strict enum (`"formal" | "informal"`) — prevents free-text drift
- `usage_sentence` optional field — concrete example for agent context
- `active` flag — disable words without destroying history
- Categories as a derived concept (no categories table) — reduces schema complexity

**Defer (v2+):**
- Pagination on any endpoint — word counts per category will remain small (10–50)
- CEFR / learner-level tagging — not validated yet
- Admin UI — REST API is the admin interface for this phase
- Multi-language support — English only
- `GET /words` listing endpoint — not needed for agent operation
- Server-side frequency sampling — agent handles this intentionally

### Architecture Approach

The architecture is a single Hono process on one port with two route namespaces: `/mcp` for the MCP Streamable HTTP transport (agent-facing, no auth), and REST routes under `/words` and `/categories` (admin-facing, bearer token auth). A singleton `db` module (Node.js module cache) is shared by both layers — no dependency injection, no per-request reconnection. Environment variables are validated at startup via Zod in `src/config.ts`; nothing else reads `process.env` directly.

**Major components:**
1. `src/index.ts` — entry point; starts `@hono/node-server` HTTP listener
2. `src/server.ts` — composes the Hono app; mounts `/mcp` (MCP app) and REST routers
3. `src/mcp/` — `McpServer` instance + tool implementations (`list-categories.ts`, `get-words-by-category.ts`)
4. `src/api/` — Hono routers for REST CRUD (`words.ts`, `categories.ts`)
5. `src/db/` — singleton pool + Drizzle instance (`index.ts`), schema definition (`schema.ts`), generated migrations
6. `src/middleware/auth.ts` — `requireApiKey` middleware applied only to REST routers
7. `src/config.ts` — Zod-validated env; single source of truth for `PORT`, `DATABASE_URL`, `API_KEY`

**Key structural decisions:**
- Use `uuid` (not `serial`) as the primary key — matches the `id: string` wire format expected by MCP clients
- Use `varchar` for `register` field (not PostgreSQL native enum) — avoids enum migration complexity for a two-value field
- Categories are inferred via `SELECT DISTINCT category` — no separate categories table
- Stateless Streamable HTTP (no session tracking) — correct for request/response tools; no sticky sessions needed

### Critical Pitfalls

1. **SSE transport is deprecated — use Streamable HTTP from day one** — The legacy `SSEServerTransport` (spec 2024-11-05) was deprecated in March 2025. Old tutorials still show the SSE pattern. Building against it means clients that have upgraded to Streamable HTTP cannot connect. Use `StreamableHTTPServerTransport` (stateless mode) via `@hono/mcp` from the first commit.

2. **Throw exceptions inside tool handlers, not to the protocol** — Uncaught exceptions from tool handlers become protocol-level errors that the LLM never sees. The agent cannot self-correct. Always `try/catch` inside tool handlers and return `{ content: [...], isError: true }` with an actionable message. Never bubble exceptions out.

3. **`drizzle-kit push` destroys migration history** — `push` applies schema diffs directly with no generated SQL files. Use it only against a local throwaway DB during schema design. Commit generated migration files (`drizzle-kit generate`) and apply them with `drizzle-kit migrate`. Never run `push` against a DB with real data.

4. **Zod v4 breaks MCP tool schemas silently** — The SDK's internal `zod-to-json-schema` is incompatible with Zod v4. Tool schemas appear to register correctly but `inputSchema.properties` is empty on the wire. Pin `zod` to `^3.25.x` and do not add it as an independent project dependency if the SDK already provides it.

5. **`bearerAuth` middleware returns plain-text 401, not JSON** — Hono's built-in `bearerAuth` throws an `HTTPException` on failure; the default response body is plain text. Add a global `app.onError` handler that returns JSON. Also use `verifyToken` with `crypto.timingSafeEqual` to prevent timing attacks and avoid the character-set rejection bug.

## Implications for Roadmap

This project has a natural three-phase structure driven by dependencies: you cannot test MCP tools without a database, and you cannot manage the word bank without REST endpoints. The implementation order within each phase is dictated by the feature dependency graph from FEATURES.md.

### Phase 1: Foundation — Project scaffold, schema, and database

**Rationale:** Everything else depends on the database schema being correct and stable. Getting the schema right before writing any tool or endpoint logic prevents cascading rework. This is also the phase most prone to the `drizzle-kit push` vs `migrate` pitfall, so establishing the correct migration workflow early locks in good habits.

**Delivers:** A running Node.js/Hono/TypeScript server that connects to PostgreSQL, with the `words` table created via a committed migration file, and a validated startup config.

**Addresses:** Word record model (`word`, `category`, `register`, `frequency`, `usage_sentence`, `active`, `id` as UUID, `created_at`)

**Avoids:**
- Pitfall 4 (`drizzle-kit push` in production) — establish `generate` + `migrate` workflow from the start
- Pitfall 5 (editing migration history) — treat `drizzle/meta/` as append-only from commit one
- Pitfall 12 (PostgreSQL enum complexity) — use `varchar` for `register` field, not a native enum
- Pitfall 9 (pool exhaustion) — configure `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` in the Pool from day one

### Phase 2: MCP Layer — Two tools with correct transport and error handling

**Rationale:** The MCP tools are the core value of this project. They must be built before the REST API because they validate the schema design is correct for agent consumption. This phase is also where the most dangerous mistakes happen (SSE transport, exception surfacing), so isolating it lets you validate the transport setup without REST complexity in the mix.

**Delivers:** A working MCP server at `/mcp` that an agent (Claude) can connect to and call `list_categories` and `get_words_by_category` against real data. Dual `content` + `structuredContent` response format per MCP spec 2025-11-25.

**Addresses:**
- `list_categories` MCP tool (active-word filter, no parameters)
- `get_words_by_category` MCP tool (active-word filter, full record return including frequency + register)
- MCP server name/version metadata

**Avoids:**
- Pitfall 1 (SSE transport) — use `@hono/mcp` `StreamableHTTPTransport` from the first line
- Pitfall 3 (exceptions vs `isError: true`) — wrap all tool logic in try/catch; return structured errors
- Pitfall 10 (Zod v4 incompatibility) — pin Zod to v3.x
- Pitfall 13 (TypeScript compilation memory) — add `skipLibCheck: true` in `tsconfig.json`

### Phase 3: REST API — Admin CRUD and bulk import

**Rationale:** REST endpoints build on top of the validated schema and share the same `db` singleton. This phase is straightforward — the patterns from Phase 2 carry over directly. The bulk import endpoint is the only moderately complex piece (HTTP 207 multi-status). Auth middleware must be applied only to REST routes, not to the MCP endpoint.

**Delivers:** Full admin interface: create, update, delete individual words; bulk import; list categories with counts. All endpoints protected by Bearer token auth with JSON error responses.

**Addresses:**
- `POST /words` — create word
- `PUT /words/:id` — update word (partial)
- `DELETE /words/:id` — hard delete
- `POST /words/import` — bulk import (max 500 items, HTTP 207 partial success)
- `GET /categories` — list all categories with `word_count` and `active_word_count`
- API key authentication on all REST routes

**Avoids:**
- Pitfall 7 (`bearerAuth` plain-text 401) — add `app.onError` JSON override; use `verifyToken` with `crypto.timingSafeEqual`
- Pitfall 11 (API key in logs) — never log `Authorization` header values
- Pitfall 2 (in-memory session storage) — not relevant for REST, but confirms stateless MCP design is correct

### Phase Ordering Rationale

- Phase 1 must come first because both the MCP layer and REST API depend on the schema and DB connection. Establishing the migration workflow correctly before any business logic prevents schema rework.
- Phase 2 comes before Phase 3 because the MCP tools are the primary deliverable and validate schema correctness from the agent's perspective. If the schema is wrong for agent use, it is cheaper to fix before building REST CRUD on top of it.
- Phase 3 is last because REST is tooling support for the admin, not the core product. It reuses all patterns established in Phase 2 with no new architectural decisions.
- The entire project is implementable in three tight phases because the scope is well-defined, the stack is constrained, and the feature dependency graph is shallow.

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 1:** PostgreSQL + Drizzle setup is extremely well-documented; official docs cover the exact setup for this project
- **Phase 2:** MCP tool registration patterns are directly covered in the official SDK docs and confirmed by the STACK.md wiring examples
- **Phase 3:** Hono REST routing + `bearerAuth` middleware is standard and well-documented

No phases require `/gsd:research-phase`. All patterns are established and verified in the research files. The implementation questions that remain are execution decisions, not research gaps.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry and official docs on 2026-03-26. MCP SDK active daily releases confirm rapid ecosystem movement. |
| Features | HIGH | Derived from official MCP spec (2025-11-25) and project requirements. No ambiguity in scope. |
| Architecture | HIGH | Single-process Hono pattern is established; stateless Streamable HTTP is the official recommendation. One MEDIUM-confidence note: `@modelcontextprotocol/hono` package API surface was partially verified via search, not full code review. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (SSE deprecation, `isError` pattern, `drizzle-kit push`) are directly documented in official sources and SDK GitHub issues. Moderate pitfalls verified in Hono and Drizzle issue trackers. |

**Overall confidence:** HIGH

### Gaps to Address

- **`@hono/mcp` vs `@modelcontextprotocol/hono` naming**: Two different packages appear in the research. STACK.md uses `@hono/mcp` (npm, v0.2.3). ARCHITECTURE.md references `@modelcontextprotocol/hono` with `createMcpHonoApp()`. Verify which package is canonical before implementation. The STACK.md package (`@hono/mcp`) has confirmed npm availability; use it if the `@modelcontextprotocol/hono` adapter is not yet available as stable.

- **Dual response format validation**: FEATURES.md specifies both `content` and `structuredContent` must be present per MCP spec 2025-11-25. The STACK.md wiring examples only use `content`. Confirm the SDK version in use supports `structuredContent` and test with an actual MCP client before treating Phase 2 as complete.

- **`idleTimeoutMillis` vs load balancer idle timeout**: The pool must be configured with `idleTimeoutMillis` lower than any upstream load balancer's idle timeout. For local/dev deployment this is not a concern, but should be documented for any future production deploy.

## Sources

### Primary (HIGH confidence)
- [MCP Transports Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — Streamable HTTP is current standard; SSE deprecated
- [MCP Tool Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — dual response format, tool schema requirements
- [Drizzle ORM PostgreSQL docs](https://orm.drizzle.team/docs/get-started/postgresql-new) — schema setup, migration workflow
- [Drizzle Kit push warning](https://orm.drizzle.team/docs/drizzle-kit-push) — push vs migrate distinction
- [Hono Bearer Auth Middleware](https://hono.dev/docs/middleware/builtin/bearer-auth) — built-in auth, plain-text 401 behavior
- [Node.js releases](https://nodejs.org/en/about/previous-releases) — Node 24 Active LTS since October 2025
- [CVE-2025-66414 — DNS rebinding in MCP SDK](https://advisories.gitlab.com/pkg/npm/@modelcontextprotocol/sdk/CVE-2025-66414/) — Host-header validation requirement

### Secondary (MEDIUM confidence)
- [@hono/mcp on npm](https://www.npmjs.com/package/@hono/mcp) — v0.2.3, Hono-MCP bridge
- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.28.0, verified active
- [MCP TypeScript SDK server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — wiring examples
- [mcp-hono-stateless example](https://github.com/mhart/mcp-hono-stateless) — community reference for fetch-to-node bridge
- [Why MCP deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) — context on transport decision
- [MCP tool error responses for LLM recovery](https://alpic.ai/blog/better-mcp-tool-call-error-responses-ai-recover-gracefully) — `isError: true` pattern
- [SDK issue #330 sticky sessions](https://github.com/modelcontextprotocol/typescript-sdk/issues/330) — session state pitfall
- [SDK issue #796 Zod v4 incompatibility](https://github.com/modelcontextprotocol/typescript-sdk/issues/796) — confirmed breakage
- [Drizzle column rename bugs](https://github.com/drizzle-team/drizzle-orm/issues/5499) — migration edge case
- [node-postgres pooling docs](https://node-postgres.com/features/pooling) — pool configuration

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
