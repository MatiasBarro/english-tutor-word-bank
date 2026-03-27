# Requirements: English Tutor Word Bank MCP

**Defined:** 2026-03-26
**Core Value:** The agent always gets the right word for the right context — only active, categorized words with frequency guidance, so responses feel natural and pedagogically intentional.

## v1 Requirements

### Database & Schema

- [x] **DB-01**: Word record has fields: `id` (UUID), `word`, `category`, `register` (`"formal" | "informal"` enum), `frequency` (integer 1–100), `usage_sentence` (optional), `active` (boolean), `created_at`
- [x] **DB-02**: Database schema is managed via committed Drizzle migration files (`drizzle-kit generate` + `drizzle-kit migrate`) — never `drizzle-kit push`
- [x] **DB-03**: Database connection is a singleton pg Pool shared by both MCP tools and REST handlers
- [ ] **DB-04**: All environment variables (`PORT`, `DATABASE_URL`, `API_KEY`) are validated at startup via Zod; server fails fast if any are missing

### MCP Tools

- [ ] **MCP-01**: `list_categories` tool returns all distinct categories that have at least one active word
- [ ] **MCP-02**: `get_words_by_category` tool returns all active words for a given category, including `word`, `register`, `frequency`, and `usage_sentence`
- [ ] **MCP-03**: MCP tools only return words where `active = true`
- [ ] **MCP-04**: MCP tools return both `content[{type:"text"}]` and `structuredContent` per MCP spec 2025-11-25
- [ ] **MCP-05**: MCP tool errors are returned as `{ isError: true, content: [...] }` — exceptions are never bubbled to the protocol layer
- [ ] **MCP-06**: MCP server uses Streamable HTTP transport (`@hono/mcp` `StreamableHTTPTransport`) — SSE transport is not used

### REST API — Word Management

- [ ] **REST-01**: `POST /words` creates a single word record (API key required)
- [ ] **REST-02**: `PUT /words/:id` updates any field on an existing word (partial update, API key required)
- [ ] **REST-03**: `DELETE /words/:id` hard-deletes a word by ID (API key required)
- [ ] **REST-04**: `POST /words/import` bulk-imports up to 500 words; returns HTTP 207 Multi-Status with per-item success/failure (API key required)
- [ ] **REST-05**: `GET /categories` returns all categories with `word_count` and `active_word_count` (API key required)

### Authentication

- [ ] **AUTH-01**: All REST endpoints require `Authorization: Bearer <API_KEY>` header
- [ ] **AUTH-02**: Unauthorized requests return JSON `{ error: "Unauthorized" }` with HTTP 401 (not plain text)
- [ ] **AUTH-03**: API key comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- [ ] **AUTH-04**: MCP endpoint (`/mcp`) does not require authentication

## v2 Requirements

### Agent Enhancements

- **AGT-01**: `sample_word` MCP tool — server-side frequency sampling returns one word per category
- **AGT-02**: `get_all_words` MCP tool — dump all active words across all categories
- **AGT-03**: CEFR learner-level tagging (A1–C2) on word records

### Admin & Operations

- **ADMIN-01**: `GET /words` listing endpoint with filtering by category, register, active status
- **ADMIN-02**: Pagination on `GET /words` and `GET /categories`
- **ADMIN-03**: Admin UI for managing the word bank

### Extensibility

- **EXT-01**: Multi-language support (language field on word record)
- **EXT-02**: Category allow-list management endpoint

## Out of Scope

| Feature | Reason |
|---------|--------|
| SSE transport | Deprecated in MCP spec March 2025; Streamable HTTP is the current standard |
| Server-side frequency sampling | Agent owns sampling logic intentionally — avoids server-side randomness |
| Categories table | `SELECT DISTINCT category` is sufficient; separate table adds migration complexity for no gain at this scale |
| OAuth / JWT auth | API key is sufficient for admin use at this scale |
| Soft delete via active flag | `DELETE /words/:id` is a hard delete; `active` flag is for toggling visibility, not deletion semantics |
| Real-time subscriptions | Not needed for request/response vocabulary lookup pattern |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 1 | Complete |
| DB-04 | Phase 1 | Pending |
| MCP-01 | Phase 2 | Pending |
| MCP-02 | Phase 2 | Pending |
| MCP-03 | Phase 2 | Pending |
| MCP-04 | Phase 2 | Pending |
| MCP-05 | Phase 2 | Pending |
| MCP-06 | Phase 2 | Pending |
| REST-01 | Phase 3 | Pending |
| REST-02 | Phase 3 | Pending |
| REST-03 | Phase 3 | Pending |
| REST-04 | Phase 3 | Pending |
| REST-05 | Phase 3 | Pending |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| AUTH-04 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
