# English Tutor Word Bank MCP

## What This Is

A remote MCP server that provides curated word and phrase recommendations to an English tutor AI agent. The agent consults the server before crafting responses, receiving contextually appropriate words organized by category (e.g., emphasis, summary, giving examples), register (formal/informal), and frequency weights. A companion REST API allows administrators to manage the word bank.

## Core Value

The agent always gets the right word for the right context — only active, categorized words with frequency guidance, so responses feel natural and pedagogically intentional.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Word record model: `word/phrase`, `category`, `register` (formal/informal), `frequency` weight, `usage_sentence` (optional), `active` (boolean)
- [ ] MCP tool: `list_categories` — returns all categories that have at least one active word
- [ ] MCP tool: `get_words_by_category` — returns all active words for a given category, including frequency weight and register
- [ ] REST endpoint: `POST /words` — create a single word (API key protected)
- [ ] REST endpoint: `PUT /words/:id` — edit a word (API key protected)
- [ ] REST endpoint: `DELETE /words/:id` — delete a word (API key protected)
- [ ] REST endpoint: `POST /words/import` — bulk import multiple words (API key protected)
- [ ] REST endpoint: `GET /categories` — list all categories (API key protected)
- [ ] Only active words are returned by MCP tools
- [ ] Frequency weight is returned to the agent as-is; agent decides how to use it
- [ ] API key authentication for all REST endpoints

### Out of Scope

- Server-side word sampling by frequency — agent handles selection logic
- User authentication / OAuth — API key is sufficient for this phase
- Admin UI — REST API is the management interface
- Multi-language support — English only
- Learner level tagging (CEFR A1–C2) — deferred, not needed now

## Context

- This server is consumed by an English tutor AI agent (e.g., Claude) via MCP protocol
- The agent consults the server before crafting responses to guide vocabulary choices
- The word bank is curated by an administrator via the REST API
- Frequency weights (e.g., 1/100) express relative preference within a category — the agent uses these to vary word choice naturally

## Constraints

- **Tech Stack**: TypeScript — all server and tooling code
- **MCP SDK**: `@modelcontextprotocol/sdk` — official SDK, HTTP/SSE transport for remote access
- **API Framework**: Hono — lightweight, TypeScript-first
- **Database**: PostgreSQL with Drizzle ORM — type-safe schema, SQL persistence
- **Auth**: API key (Bearer token) for all REST endpoints
- **Deployment**: Local / dev environment for now

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Return all words + weights to agent | Agent has full context to decide sampling strategy; avoids server-side randomness | — Pending |
| Hono over Express/Fastify | Lightweight, TypeScript-native, works cleanly alongside MCP HTTP server | — Pending |
| Drizzle ORM over Prisma | Less overhead, closer to SQL, better TypeScript inference | — Pending |
| `active` flag on words | Allows disabling words without deleting them; agent always gets clean list | — Pending |
| Bulk import endpoint | Admin needs to seed the word bank efficiently | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
