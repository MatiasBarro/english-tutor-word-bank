# Roadmap: English Tutor Word Bank MCP

## Overview

Three phases deliver a remote MCP server that gives an English tutor AI agent curated vocabulary recommendations. Phase 1 establishes the PostgreSQL schema and database foundation everything else depends on. Phase 2 builds the two MCP tools — the core product value — against real data using the correct Streamable HTTP transport. Phase 3 adds the REST admin API so an administrator can manage the word bank. Each phase is independently verifiable before the next begins.

## Milestone: v1.0

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Running TypeScript/Hono server with validated schema and migration workflow
- [ ] **Phase 2: MCP Layer** - Working MCP server an agent can connect to and call both tools against real data
- [ ] **Phase 3: REST API** - Full admin interface with CRUD, bulk import, and secure Bearer token auth

## Phase Details

### Phase 1: Foundation
**Goal**: A running Hono/TypeScript server connected to PostgreSQL with the `words` table created via a committed Drizzle migration and all environment variables validated at startup
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, DB-04
**Success Criteria** (what must be TRUE):
  1. Server starts and prints confirmation when `DATABASE_URL`, `PORT`, and `API_KEY` are present in `.env`
  2. Server refuses to start (with a clear error) when any required env variable is missing
  3. The `words` table exists in PostgreSQL with all fields from DB-01 (UUID primary key, `word`, `category`, `register` as varchar, `frequency` integer, `usage_sentence` nullable, `active` boolean, `created_at`)
  4. A committed SQL migration file in `drizzle/` was used to create the table — `drizzle-kit push` was never run
  5. A word can be inserted and read back via a raw Drizzle query in a test script
**Plans**: 3 plans

Plans:
- [x] 01-01: Project scaffold — TypeScript, Hono, Node.js 24, all dependencies pinned, `tsconfig.json` with `skipLibCheck: true`
- [x] 01-02: Database schema and migrations — Drizzle schema for `words` table, `drizzle-kit generate` + `migrate` workflow, singleton pg Pool with `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`
- [x] 01-03: Environment config and server startup — Zod-validated `src/config.ts`, Hono server wired with `@hono/node-server`, health check route, `npm run dev` with `tsx`

### Phase 2: MCP Layer
**Goal**: A working MCP server at `/mcp` using Streamable HTTP transport that an agent can connect to and call `list_categories` and `get_words_by_category` against real database rows
**Depends on**: Phase 1
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, AUTH-04
**Success Criteria** (what must be TRUE):
  1. An MCP client (e.g., Claude) can connect to `POST /mcp` using Streamable HTTP transport — SSE transport is not present
  2. `list_categories` returns only categories that have at least one word with `active = true`
  3. `get_words_by_category` returns `word`, `register`, `frequency`, and `usage_sentence` for all active words in the requested category
  4. Inactive words (`active = false`) never appear in either tool's response
  5. Both tools return dual response format: `content[{type:"text"}]` and `structuredContent` in the same response
  6. When a database error occurs inside a tool, the tool returns `{ isError: true, content: [...] }` — the server does not crash and the agent receives an actionable message
  7. `/mcp` does not require an `Authorization` header — unauthenticated requests are accepted
**Plans**: 4 plans

Plans:
- [x] 02-01: MCP server wiring — `@hono/mcp` v0.2.3 `StreamableHTTPTransport`, stateless mode (`sessionIdGenerator: undefined`), mounted at `/mcp` in `src/server.ts`
- [x] 02-02: `list_categories` tool — Drizzle query with `WHERE active = true`, `SELECT DISTINCT category`, dual `content` + `structuredContent` response
- [ ] 02-03: `get_words_by_category` tool — Drizzle query with `WHERE active = true AND category = ?`, full record return, dual response format, input schema via Zod v3
- [ ] 02-04: Tool error handling and agent smoke test — try/catch wrappers on both tools, `isError: true` return path, end-to-end test with a real MCP client call
**UI hint**: no

### Phase 3: REST API
**Goal**: Full admin interface with authenticated endpoints to create, update, delete, and bulk-import words, plus a categories listing — all protected by Bearer token auth with JSON error responses
**Depends on**: Phase 2
**Requirements**: REST-01, REST-02, REST-03, REST-04, REST-05, AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. `POST /words`, `PUT /words/:id`, `DELETE /words/:id`, `POST /words/import`, and `GET /categories` all return HTTP 401 with `{ "error": "Unauthorized" }` (JSON, not plain text) when no `Authorization` header is provided
  2. A valid `Authorization: Bearer <API_KEY>` header grants access to all five endpoints
  3. `POST /words` creates a word record and returns the new word's UUID
  4. `PUT /words/:id` updates any combination of fields on an existing word (partial update)
  5. `DELETE /words/:id` removes the word and returns a confirmation; subsequent requests for that ID return 404
  6. `POST /words/import` with a mix of valid and invalid items returns HTTP 207 Multi-Status with per-item success/failure — the server does not abort on the first failure
  7. `GET /categories` returns each category with `word_count` (all words) and `active_word_count` (active-only)
  8. The `Authorization` header value is never written to logs
**Plans**: 4 plans

Plans:
- [ ] 03-01: Auth middleware — `requireApiKey` using Hono `bearerAuth` with `verifyToken` + `crypto.timingSafeEqual`, global `app.onError` returning JSON 401, applied only to REST routes (not `/mcp`)
- [ ] 03-02: Word CRUD endpoints — `POST /words`, `PUT /words/:id` (partial update), `DELETE /words/:id` with input validation and proper HTTP status codes
- [ ] 03-03: Bulk import endpoint — `POST /words/import` accepting up to 500 items, per-item validation, HTTP 207 Multi-Status response with individual success/failure entries
- [ ] 03-04: Categories endpoint and final integration — `GET /categories` with `word_count` and `active_word_count`, auth applied to all REST routers, no `Authorization` values in logs

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-03-27 |
| 2. MCP Layer | 0/4 | Not started | - |
| 3. REST API | 0/4 | Not started | - |

---
*Roadmap created: 2026-03-26*
*Milestone: v1.0*
*Coverage: 19/19 v1 requirements mapped*
