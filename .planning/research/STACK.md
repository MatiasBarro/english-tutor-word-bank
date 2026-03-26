# Technology Stack

**Project:** English Tutor Word Bank MCP Server
**Researched:** 2026-03-26
**Overall confidence:** HIGH (all core findings verified against official docs and npm registry)

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 24.x LTS | Runtime | Active LTS as of October 2025, built-in experimental TypeScript type-stripping (v22.6+), ships with npm v11. Node 22 remains valid (supported until April 2027) but 24 is the current active LTS for new projects. |
| TypeScript | 5.x (latest) | Language | Required by project constraints; Drizzle and MCP SDK both publish first-class TS types. |
| tsx | latest | Dev TS runner | ~20ms compilation vs ts-node's ~500ms. Handles ESM seamlessly without the module interop headaches that plague ts-node. Use for `npm run dev` and one-off scripts. |

### MCP Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @modelcontextprotocol/sdk | ^1.28.0 | Core MCP server | Official SDK, actively maintained (published within the last 24h as of research date). Provides `McpServer`, `StreamableHTTPServerTransport`, and Zod-based tool schemas. |
| @hono/mcp | ^0.2.3 | Hono-MCP bridge | Official Hono ecosystem package. Provides `StreamableHTTPTransport` — a thin wrapper that speaks the MCP Streamable HTTP spec while staying native to Hono's fetch-based request/response model. Eliminates the need for `fetch-to-node` conversion manually. |
| zod | ^3.25+ (or v4) | Tool schema validation | Peer dependency of the MCP SDK. The SDK uses Zod internally (`zod/v4`) but maintains backwards compat with zod v3.25+. Define tool `inputSchema` as Zod objects for type-safe argument parsing. |

### API Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| hono | ^4.12.0 | HTTP server + REST routes | Required by project constraints. Ultrafast, Web Standards-native, TypeScript-first. Ships built-in `bearerAuth` middleware — no third-party auth library needed for API key protection. Handles both the MCP endpoint (`/mcp`) and REST admin routes from a single process. |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| drizzle-orm | ^0.45.x | ORM | Required by project constraints. ~7.4kb, zero runtime dependencies, pure TypeScript schema definitions. Schema-as-code means the TypeScript type of a query result is inferred directly from the schema — no codegen step, no `.prisma` DSL. |
| drizzle-kit | ^0.31.x | Migrations CLI | Companion CLI to drizzle-orm. Generates SQL migration files from schema changes (`drizzle-kit generate`), applies them (`drizzle-kit migrate`), and runs Drizzle Studio. Version tracks drizzle-orm releases. |
| pg (node-postgres) | ^8.x | PostgreSQL driver | Required by project constraints. The `drizzle-orm/node-postgres` adapter is the most stable, well-documented path for Node.js server apps. Postgres.js (`postgres`) is faster but uses prepared statements by default which require opt-out for compatibility with connection poolers. Use `pg` to avoid that friction. |
| @types/pg | ^8.x | TypeScript types for pg | Dev dependency required alongside `pg`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | ^16.x | Environment variable loading | Load `DATABASE_URL`, `API_KEY`, and `PORT` from `.env` at startup. |
| @types/node | ^20.x+ | Node.js type definitions | Dev dependency. Required for `process.env`, `crypto.randomUUID()`, etc. |

---

## Transport: Streamable HTTP (not legacy SSE)

**This is a critical decision.** The MCP specification deprecated the original HTTP+SSE transport in version 2025-03-26. The replacement is **Streamable HTTP**, supported in `@modelcontextprotocol/sdk` starting at v1.10.0.

- **Old transport (deprecated):** Two endpoints — a GET `/sse` for the event stream and a POST `/messages` for sending. `SSEServerTransport` in the SDK.
- **New transport (current):** Single endpoint (e.g., `/mcp`) that handles both POST and GET. POST carries JSON-RPC messages; GET optionally opens an SSE stream for server-initiated messages. `StreamableHTTPServerTransport` (raw Node.js adapter) or `StreamableHTTPTransport` via `@hono/mcp` (Hono-native).

Use `@hono/mcp`'s `StreamableHTTPTransport`. Do not use `SSEServerTransport`.

---

## Wiring: MCP SDK + Hono

### Installation

```bash
npm install @modelcontextprotocol/sdk @hono/mcp hono zod drizzle-orm pg dotenv
npm install -D drizzle-kit tsx typescript @types/node @types/pg
```

### MCP Server + Hono wiring (`src/mcp.ts` + `src/index.ts`)

The pattern from `@hono/mcp` keeps the Hono route handler clean. The transport instance is created once; the server connects on first request.

```typescript
// src/mcp.ts — define tools, export McpServer instance
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { db } from './db/client.js'
import { words } from './db/schema.js'
import { eq, and } from 'drizzle-orm'

export const mcpServer = new McpServer({
  name: 'english-tutor-word-bank',
  version: '1.0.0',
})

mcpServer.tool(
  'list_categories',
  'Returns all categories that have at least one active word',
  {}, // no input parameters
  async () => {
    const rows = await db
      .selectDistinct({ category: words.category })
      .from(words)
      .where(eq(words.active, true))
    return {
      content: [{ type: 'text', text: JSON.stringify(rows.map(r => r.category)) }],
    }
  }
)

mcpServer.tool(
  'get_words_by_category',
  'Returns all active words for a given category with frequency weight and register',
  { category: z.string().describe('The category name to retrieve words for') },
  async ({ category }) => {
    const rows = await db
      .select()
      .from(words)
      .where(and(eq(words.category, category), eq(words.active, true)))
    return {
      content: [{ type: 'text', text: JSON.stringify(rows) }],
    }
  }
)
```

```typescript
// src/index.ts — mount MCP endpoint + REST routes on Hono
import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { StreamableHTTPTransport } from '@hono/mcp'
import { mcpServer } from './mcp.js'

const app = new Hono()
const transport = new StreamableHTTPTransport()

// MCP endpoint — no auth, accessed by AI agents via MCP protocol
app.all('/mcp', async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport)
  }
  return transport.handleRequest(c)
})

// REST admin routes — API key protected
const api = new Hono()
const API_KEY = process.env.API_KEY!
api.use('*', bearerAuth({ token: API_KEY }))

api.post('/words', async (c) => { /* ... */ })
api.put('/words/:id', async (c) => { /* ... */ })
api.delete('/words/:id', async (c) => { /* ... */ })
api.post('/words/import', async (c) => { /* ... */ })
api.get('/categories', async (c) => { /* ... */ })

app.route('/api', api)

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}
```

> **Security note:** The MCP spec requires servers to validate the `Origin` header to prevent DNS rebinding attacks when listening on localhost. `@hono/mcp`'s `StreamableHTTPTransport` handles this automatically when invoked through `handleRequest(c)`.

---

## Drizzle ORM: Schema + Migration Setup

### Schema (`src/db/schema.ts`)

```typescript
import {
  pgTable, serial, varchar, integer, boolean, text, timestamp
} from 'drizzle-orm/pg-core'

export const words = pgTable('words', {
  id:             serial('id').primaryKey(),
  word:           varchar('word', { length: 255 }).notNull(),
  category:       varchar('category', { length: 100 }).notNull(),
  register:       varchar('register', { length: 50 }).notNull(),   // 'formal' | 'informal'
  frequency:      integer('frequency').notNull().default(1),
  usageSentence:  text('usage_sentence'),
  active:         boolean('active').notNull().default(true),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})
```

### Connection (`src/db/client.ts`)

```typescript
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

export const db = drizzle(process.env.DATABASE_URL!, { schema })
```

### Config (`drizzle.config.ts`)

```typescript
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

### Migration workflow

```bash
# After changing schema.ts — generate a new SQL migration
npx drizzle-kit generate

# Apply all pending migrations to the database
npx drizzle-kit migrate

# Inspect data during development
npx drizzle-kit studio
```

---

## API Key Auth (Hono built-in)

Hono ships `bearerAuth` middleware. No third-party library needed.

```typescript
import { bearerAuth } from 'hono/bearer-auth'

app.use('/api/*', bearerAuth({ token: process.env.API_KEY! }))
```

Clients send: `Authorization: Bearer <key>`

The middleware returns `401 Unauthorized` automatically when the token is absent or wrong.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| MCP Transport | Streamable HTTP (`@hono/mcp`) | Legacy HTTP+SSE (`SSEServerTransport`) | Deprecated in spec 2025-03-26; SSEServerTransport will not be maintained going forward |
| MCP-Hono bridge | `@hono/mcp` | Manual `fetch-to-node` conversion | More ceremony, more dependencies, need to manually manage `toReqRes` / `toFetchResponse`; `@hono/mcp` is the official ecosystem package |
| ORM | Drizzle | Prisma | Prisma's codegen step, `.prisma` DSL, and larger runtime weight are unnecessary overhead for a small, schema-stable project. Drizzle is SQL-first and TypeScript-native. |
| PostgreSQL driver | `pg` (node-postgres) | `postgres` (postgres.js) | postgres.js is faster but uses prepared statements by default — problematic with pgBouncer or any connection pooler. `pg` avoids this class of issue for local dev and production. |
| HTTP framework | Hono | Express / Fastify | Required by project constraints. Hono is lighter, TypeScript-native, and has official MCP ecosystem support (`@hono/mcp`). |
| TS runner (dev) | `tsx` | `ts-node` | tsx is ~25x faster to start, handles ESM correctly without extra config, and is the Drizzle docs-recommended runner for `tsx src/index.ts` scripts. |
| Auth | Hono `bearerAuth` | Passport.js / custom JWT | Overkill. API key bearer token is the entire auth requirement. Hono's built-in middleware covers it in three lines. |

---

## `package.json` Scripts (recommended)

```json
{
  "scripts": {
    "dev": "tsx --watch src/index.ts",
    "start": "node --import tsx/esm src/index.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## Sources

- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — version 1.28.0 (active, updated daily)
- [MCP Transports Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — Streamable HTTP is the current standard; SSE is deprecated
- [Why MCP Deprecated SSE and Went with Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) — context on the deprecation decision
- [@hono/mcp on npm / JSR](https://www.npmjs.com/package/@hono/mcp) — version 0.2.3, official Hono ecosystem package
- [Hono releases](https://github.com/honojs/hono/releases) — v4.12.0 current
- [Hono Bearer Auth Middleware](https://hono.dev/docs/middleware/builtin/bearer-auth) — built-in, no extra dependencies
- [Drizzle ORM PostgreSQL docs](https://orm.drizzle.team/docs/get-started/postgresql-new) — node-postgres setup, schema API
- [drizzle-orm on npm](https://www.npmjs.com/package/drizzle-orm) — v0.45.1 current
- [drizzle-kit on npm](https://www.npmjs.com/package/drizzle-kit) — v0.31.10 current
- [tsx documentation](https://tsx.is/) — recommended dev runner for TypeScript + Node.js
- [Node.js releases](https://nodejs.org/en/about/previous-releases) — Node 24 is Active LTS as of October 2025
- [mcp-hono-stateless example](https://github.com/mhart/mcp-hono-stateless) — reference implementation for stateless Hono + MCP
