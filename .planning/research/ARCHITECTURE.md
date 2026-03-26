# Architecture Patterns

**Domain:** Remote MCP server with companion REST management API
**Project:** English Tutor Word Bank MCP
**Researched:** 2026-03-26

---

## Recommended Architecture

### One Process, One Port, Two Route Namespaces

Run a single Hono application that serves both the MCP endpoint and the REST API on the same HTTP port. Hono is the outer HTTP layer; the MCP SDK's `StreamableHTTPServerTransport` is wired into a dedicated route prefix. There is no reason to run two separate processes or listen on two ports for this project.

```
HTTP :3000
│
└── Hono app
    ├── POST /mcp          ← MCP Streamable HTTP transport
    ├── GET  /mcp          ← MCP SSE stream (when client requests)
    ├── DELETE /mcp        ← MCP session cleanup (stateful mode)
    ├── POST /words        ← REST: create word
    ├── PUT  /words/:id    ← REST: update word
    ├── DELETE /words/:id  ← REST: delete word
    ├── POST /words/import ← REST: bulk import
    └── GET  /categories   ← REST: list categories
```

### MCP Transport: Streamable HTTP (not SSE)

The MCP specification deprecated the legacy HTTP+SSE transport on 2025-03-26 and replaced it with **Streamable HTTP**. The `@modelcontextprotocol/sdk` v1.x exports `StreamableHTTPServerTransport`; the Node-specific wrapper is `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node`.

For this project's use case (stateless, simple query tools) use **stateless mode**:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// One transport instance per request — stateless
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,  // disables session tracking
});
```

Stateless mode means each request is self-contained. This is correct for `list_categories` and `get_words_by_category` — they read from DB and return; no streaming state needed between calls.

**DNS rebinding protection (important):** The official SDK docs warn that direct `NodeStreamableHTTPServerTransport` use on localhost does NOT include Host-header validation. Use `createMcpHonoApp()` from `@modelcontextprotocol/hono` (the official Hono adapter) or manually set `allowedHosts`. This is a CVE-class concern (CVE-2025-66414).

---

## MCP + Hono Coexistence Pattern

### Approach: MCP mounted as a Hono route group

The `@modelcontextprotocol/hono` package provides `createMcpHonoApp()` which returns a Hono app pre-configured with JSON body parsing and Host-header validation. Mount it as a sub-app under `/mcp`:

```typescript
// src/server.ts
import { Hono } from "hono";
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wordsRouter } from "./api/words.js";
import { categoriesRouter } from "./api/categories.js";
import { registerMcpTools } from "./mcp/tools.js";

const mcp = new McpServer({ name: "english-tutor-word-bank", version: "1.0.0" });
registerMcpTools(mcp);                      // attaches list_categories, get_words_by_category

const mcpApp = createMcpHonoApp(mcp, {
  // allowedHosts: ["your-domain.com"]       // set when not on localhost
});

const app = new Hono();
app.route("/mcp", mcpApp);                  // MCP traffic
app.route("/words", wordsRouter);           // REST word CRUD
app.route("/categories", categoriesRouter); // REST category list

export default app;
```

```typescript
// src/index.ts — entry point
import { serve } from "@hono/node-server";
import app from "./server.js";

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

### Alternative: manual route mounting without the adapter package

If `@modelcontextprotocol/hono` is not yet stable or available on npm when building, the fallback is the `fetch-to-node` bridge pattern from the community example (mhart/mcp-hono-stateless):

```typescript
import { toReqRes, toFetchResponse } from "fetch-to-node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

app.post("/mcp", async (c) => {
  const { req, res } = toReqRes(c.req.raw);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcp.connect(transport);
  await transport.handleRequest(req, res, await c.req.json());
  return toFetchResponse(res);
});
```

This is lower-level and requires manual Host-header validation if the server will be publicly accessible.

**Recommendation:** Use `@modelcontextprotocol/hono` (official adapter) when available. Fall back to `fetch-to-node` bridge only if the adapter is not yet released as stable.

---

## Database Layer Sharing Strategy

### Singleton module: `src/db/index.ts`

Both MCP tool handlers and REST route handlers import the same `db` export. Node.js module caching guarantees the `Pool` is instantiated once per process lifetime.

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,          // max concurrent connections
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
```

Both layers import exactly this:

```typescript
// src/mcp/tools.ts  (MCP tool handler)
import { db } from "../db/index.js";

// src/api/words.ts  (Hono REST handler)
import { db } from "../db/index.js";
```

There is no dependency injection framework, no global variable, and no per-request reconnection. The `Pool` manages connection reuse internally.

### Pool sizing

For a local/dev server with light concurrent load: `max: 10` is sufficient. PostgreSQL default `max_connections` is 100; leave headroom for other clients (psql, drizzle-kit studio).

### Drizzle schema location

Schema is the single source of truth. `drizzle-kit` reads it for migration generation. Both app code and migrations reference the same file:

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, varchar, boolean, integer } from "drizzle-orm/pg-core";

export const words = pgTable("words", {
  id:             uuid("id").defaultRandom().primaryKey(),
  word:           text("word").notNull(),
  category:       varchar("category", { length: 100 }).notNull(),
  register:       varchar("register", { length: 50 }).notNull(),  // "formal" | "informal"
  frequencyWeight: integer("frequency_weight").notNull().default(1),
  usageSentence:  text("usage_sentence"),
  active:         boolean("active").notNull().default(true),
});
```

---

## Environment Configuration

Use Zod for startup validation so the process fails fast with a clear message if a required variable is missing.

```typescript
// src/config.ts
import { z } from "zod";

const schema = z.object({
  PORT:         z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  API_KEY:      z.string().min(32),
  NODE_ENV:     z.enum(["development", "production", "test"]).default("development"),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment variables:", result.error.flatten());
  process.exit(1);
}

export const config = result.data;
```

Import `config` anywhere; never read `process.env` directly outside this module.

---

## API Key Authentication

REST endpoints use a Hono middleware that checks the `Authorization: Bearer <key>` header against `config.API_KEY`. MCP endpoints do NOT require API key auth — MCP clients (AI agents) authenticate separately if needed at the network level.

```typescript
// src/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import { config } from "../config.js";

export const requireApiKey = createMiddleware(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${config.API_KEY}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
```

Applied to REST routers only:

```typescript
// src/api/words.ts
import { Hono } from "hono";
import { requireApiKey } from "../middleware/auth.js";

export const wordsRouter = new Hono()
  .use("*", requireApiKey)
  .post("/", createWord)
  .put("/:id", updateWord)
  .delete("/:id", deleteWord)
  .post("/import", bulkImport);
```

---

## Recommended Project Structure

```
english-tutor-mcp/
├── src/
│   ├── index.ts              # Entry point: starts Node HTTP server
│   ├── server.ts             # Composes Hono app, mounts /mcp + REST routers
│   ├── config.ts             # Zod env validation, exports config object
│   │
│   ├── db/
│   │   ├── index.ts          # Singleton: Pool + drizzle(pool, { schema })
│   │   ├── schema.ts         # Drizzle table definitions (words)
│   │   └── migrations/       # Generated by drizzle-kit (do not edit manually)
│   │
│   ├── mcp/
│   │   ├── server.ts         # McpServer instance, calls registerTools
│   │   └── tools/
│   │       ├── list-categories.ts
│   │       └── get-words-by-category.ts
│   │
│   ├── api/
│   │   ├── words.ts          # Hono router: POST /words, PUT /words/:id, etc.
│   │   └── categories.ts     # Hono router: GET /categories
│   │
│   └── middleware/
│       └── auth.ts           # Bearer token middleware
│
├── drizzle.config.ts         # drizzle-kit config (schema path, out dir, dialect)
├── .env                      # Local secrets (git-ignored)
├── .env.example              # Committed template with placeholder values
├── package.json
└── tsconfig.json
```

### Key structural decisions

| Decision | Rationale |
|----------|-----------|
| `src/db/index.ts` exports single `db` | Module cache ensures one Pool; no DI framework needed |
| `src/mcp/` is a peer of `src/api/` | Clear separation; both import from `src/db/` |
| `src/server.ts` owns all routing | Single file to understand the full URL surface |
| `src/config.ts` is the only `process.env` reader | Validated at startup; rest of app uses typed `config` |
| `drizzle.config.ts` at root | drizzle-kit convention; keeps migrations outside src/ |

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `src/index.ts` | Start Node HTTP server, bind port | `src/server.ts` |
| `src/server.ts` | Compose Hono app, mount routes | `src/mcp/server.ts`, `src/api/*` |
| `src/mcp/server.ts` | Create McpServer, register tools | `src/mcp/tools/*` |
| `src/mcp/tools/*` | Implement MCP tool logic, query DB | `src/db/index.ts` |
| `src/api/*` | Implement REST handlers, validate input | `src/db/index.ts` |
| `src/db/index.ts` | Pool management, expose `db` | `src/db/schema.ts` |
| `src/middleware/auth.ts` | API key enforcement | `src/config.ts` |
| `src/config.ts` | Env validation, typed config export | — (reads process.env only) |

---

## Data Flow

**MCP tool call (agent → server):**
```
Agent (Claude) → HTTP POST /mcp
  → Hono routes to mcpApp
    → StreamableHTTPServerTransport.handleRequest()
      → McpServer dispatches to tool handler (list_categories / get_words_by_category)
        → tool handler queries db (SELECT from words WHERE active = true)
          → returns structured response to transport
            → HTTP response back to agent
```

**REST write (admin → server):**
```
Admin client → HTTP POST /words  (Authorization: Bearer <key>)
  → Hono routes to wordsRouter
    → requireApiKey middleware validates token
      → createWord handler validates body (Zod)
        → INSERT into words via db
          → 201 JSON response
```

---

## Scalability Considerations

| Concern | At 1 user (dev) | At 100 concurrent | Notes |
|---------|-----------------|-------------------|-------|
| DB connections | Pool max:10 adequate | Pool max:10–20 adequate | PgBouncer if > 200 |
| MCP sessions | Stateless, no state | Stateless, no state | No memory growth |
| REST throughput | Single process fine | Single process fine | Hono is fast enough |
| Multi-instance | Not needed now | Share DB only | Stateless MCP makes this trivial |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Two separate processes for MCP and REST
**What:** Running `node mcp-server.js` and `node api-server.js` on separate ports.
**Why bad:** Two deployments to manage, shared DB config duplicated, no benefit for this scale.
**Instead:** Single Hono app, two route namespaces on one port.

### Anti-Pattern 2: Creating a new DB connection per request
**What:** `drizzle(new Pool(...))` inside a route handler or tool handler.
**Why bad:** Exhausts PostgreSQL `max_connections` under any load; slow cold paths.
**Instead:** Import singleton `db` from `src/db/index.ts`.

### Anti-Pattern 3: Using legacy SSE transport
**What:** `SSEServerTransport` from the old MCP HTTP+SSE spec.
**Why bad:** Deprecated March 2025; clients will prefer Streamable HTTP; no new features.
**Instead:** `StreamableHTTPServerTransport` (stateless mode for read-only tools).

### Anti-Pattern 4: Reading `process.env` in route/tool handlers
**What:** `process.env.API_KEY` checked inline in business logic.
**Why bad:** Missing vars fail silently at runtime, not startup; untestable.
**Instead:** Validate once in `src/config.ts`; import typed `config` everywhere.

---

## Sources

- [MCP TypeScript SDK — server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — MEDIUM confidence (content verified via WebFetch)
- [MCP Transports specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — HIGH confidence (official spec)
- [Why MCP deprecated SSE for Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) — MEDIUM confidence
- [@hono/mcp on npm](https://www.npmjs.com/package/@hono/mcp) — MEDIUM confidence (package exists, API surface verified via search)
- [mcp-hono-stateless example (mhart)](https://github.com/mhart/mcp-hono-stateless) — MEDIUM confidence (community example, fetch-to-node bridge pattern)
- [CVE-2025-66414 — DNS rebinding in MCP SDK](https://advisories.gitlab.com/pkg/npm/@modelcontextprotocol/sdk/CVE-2025-66414/) — HIGH confidence (security advisory)
- [Drizzle ORM PostgreSQL docs](https://orm.drizzle.team/docs/get-started-postgresql) — HIGH confidence (official docs)
- [Zod env validation pattern](https://jsdev.space/howto/env-ts-zod/) — HIGH confidence (established community pattern)
- [Roo Code MCP transport docs](https://docs.roocode.com/features/mcp/server-transports) — MEDIUM confidence
