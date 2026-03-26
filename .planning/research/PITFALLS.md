# Domain Pitfalls

**Domain:** Remote MCP server — `@modelcontextprotocol/sdk` + Hono + PostgreSQL + Drizzle ORM
**Researched:** 2026-03-26
**Overall Confidence:** MEDIUM-HIGH (most claims verified against official SDK issues, Drizzle docs, and Hono issue tracker)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or silent failures in production.

---

### Pitfall 1: SSE Transport Is Deprecated — Build Against Streamable HTTP From Day One

**What goes wrong:** The legacy `SSEServerTransport` from `@modelcontextprotocol/sdk` (spec version 2024-11-05) requires two separate HTTP endpoints: a GET `/sse` that opens a persistent connection and a POST `/messages` that delivers client payloads. This split design is stateful, requires sticky sessions, and cannot scale horizontally without a shared in-memory store. The MCP specification deprecated SSE transport as of **2025-03-26** (spec version 2025-03-26) in favor of **Streamable HTTP**, where a single `/mcp` POST endpoint handles everything, with optional SSE streaming as a response mode.

**Why it happens:** Early MCP tutorials, npm package docs, and even some official registry examples still show the SSE pattern. Developers copy that pattern, ship it, then discover clients like Claude Desktop have migrated to Streamable HTTP and the old endpoints are unreliable.

**Consequences:**
- `SSEClientTransport` is marked deprecated in the SDK; future SDK versions may remove it.
- Only the first tool call works after a reconnect in some client/server version combinations (documented in java-sdk issue #474; the underlying protocol issue applies cross-SDK).
- The legacy `/sse` GET endpoint cannot be served on platforms that terminate idle connections (Render free tier, Fly.io with `min_machines = 0`).
- Clients that have upgraded to Streamable HTTP cannot talk to a server that only speaks legacy SSE.

**Prevention:** Use `StreamableHTTPServerTransport` from the start. The official SDK exposes it as the primary transport since version 1.10.0 (released April 2025). The single-endpoint pattern is simpler to implement in Hono and does not require sticky sessions for stateless use cases.

**Mitigation if already on SSE:** Keep both endpoints live during transition. The SDK supports dual-mode. Add the `/mcp` Streamable HTTP endpoint alongside the existing `/sse` and `/messages` endpoints.

**Sources:**
- MCP spec 2025-03-26 transport deprecation: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Why SSE was deprecated: https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/
- TypeScript SDK releases: https://github.com/modelcontextprotocol/typescript-sdk/releases

---

### Pitfall 2: In-Memory Session Storage Breaks Multi-Instance Deployments

**What goes wrong:** Both `SSEServerTransport` and `StreamableHTTPServerTransport` store the live transport object in process memory, keyed by session ID. When a load balancer routes a follow-up request to a different instance, that instance has no record of the session and returns an error or silently drops the message.

**Why it happens:** The SDK's default session store is a plain JavaScript `Map`. This is correct for single-process deployments and works invisibly in development, so developers don't notice until they add a second replica in production.

**Consequences:**
- Tool calls intermittently fail with `session not found` errors.
- Debugging is extremely difficult because failures are non-deterministic (depends on which replica answers).

**Prevention:**
- For this project (dev/local deployment), a single process is fine — no action needed now.
- If you ever scale horizontally: use a stateless Streamable HTTP configuration (no session state required for request/response tools), or implement a Redis-backed session store.
- Document the constraint in your deployment notes so future-you doesn't blindly add replicas.

**Detection:** `sessionId` errors in server logs, tool calls that succeed on retry without code changes.

**Sources:**
- SDK issue #330 (sticky sessions): https://github.com/modelcontextprotocol/typescript-sdk/issues/330
- SDK issue #273 (serverless statefulness): https://github.com/modelcontextprotocol/typescript-sdk/issues/273

---

### Pitfall 3: Throwing Exceptions From Tool Handlers Versus Returning `isError: true`

**What goes wrong:** When a tool handler throws an uncaught exception, the SDK converts it to a JSON-RPC protocol-level error. This error is NOT injected into the LLM's context window — it appears as a notification in the client UI and is discarded. The LLM has no information about what went wrong and cannot self-correct. If the exception crashes the server process, the entire conversation ends.

When a tool handler returns `{ content: [...], isError: true }`, the response IS injected into the LLM context window exactly like a successful response. The LLM sees the error message and can retry, ask the user for clarification, or fall back gracefully.

**Why it happens:** Developers treat MCP tools like REST endpoints and bubble exceptions up expecting the client to show a meaningful error. The protocol has a different error model.

**Consequences:**
- The AI agent cannot recover from tool failures — it just sees a vague "tool call failed" notification.
- Unhandled exceptions in streamSSE can bring down the entire Hono server process (documented Hono issue #2164).

**Prevention — the correct pattern:**

```typescript
server.tool("get_words_by_category", { category: z.string() }, async ({ category }) => {
  try {
    const words = await db.select().from(wordsTable).where(
      and(eq(wordsTable.category, category), eq(wordsTable.active, true))
    );
    if (words.length === 0) {
      // Return isError so the LLM can see the failure
      return {
        content: [{ type: "text", text: `No active words found for category: ${category}` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(words) }] };
  } catch (err) {
    // Log internally, return sanitized message
    console.error("get_words_by_category failed:", err);
    return {
      content: [{ type: "text", text: "Database error retrieving words. Try again." }],
      isError: true,
    };
  }
});
```

**Rules:**
- Catch ALL exceptions inside tool handlers.
- Return `isError: true` with a descriptive, actionable message the LLM can act on.
- Never leak internal error details (stack traces, SQL queries, table names) to the LLM.
- Reserve thrown exceptions only for protocol-level failures (e.g., tool registration errors at startup).

**Sources:**
- MCP tool error response best practices: https://mcpcat.io/guides/error-handling-custom-mcp-servers/
- Why isError matters for LLM recovery: https://alpic.ai/blog/better-mcp-tool-call-error-responses-ai-recover-gracefully
- Official MCP tools documentation: https://modelcontextprotocol.io/docs/concepts/tools

---

### Pitfall 4: `drizzle-kit push` in Production Destroys Schema History

**What goes wrong:** `drizzle-kit push` applies schema changes directly to the database by diffing the TypeScript schema against the live DB, with no migration files generated. This is intentionally designed for rapid local prototyping. In production, it means: no audit trail, no rollback path, no way to replay schema history on a new database, and no ability to review changes before they run.

**Why it happens:** `push` is the fastest way to get a schema live during development. Developers use it, it works, and they keep using it. The official Drizzle docs warn against it for production but the warning is easy to miss.

**Consequences:**
- Schema diverges silently between environments.
- Destructive changes (column drops, type changes) run without review.
- CI/CD pipeline has no migration step — a fresh DB deploy will be out of sync.

**Prevention:**
- Use `drizzle-kit push` only against a local throw-away database during schema design.
- Use `drizzle-kit generate` to produce SQL migration files, commit them to version control, and `drizzle-kit migrate` (or `migrate()` called at application startup) to apply them.
- Never run `push` against any database that holds real data.

**Correct production workflow:**
```
# During development
drizzle-kit push          # fast iteration on local DB only

# Before committing
drizzle-kit generate      # creates migrations/0001_xxx.sql
git add drizzle/          # commit migration files
# CI runs: node -e "require('./src/db/migrate')"  at deploy time
```

**Sources:**
- Official Drizzle push docs (warning): https://orm.drizzle.team/docs/drizzle-kit-push
- Official Drizzle migrate docs: https://orm.drizzle.team/docs/drizzle-kit-migrate
- Production migration guide: https://budivoogt.com/blog/drizzle-migrations

---

### Pitfall 5: Manually Editing the Drizzle Migration History Breaks Future Migrations

**What goes wrong:** Drizzle maintains a `drizzle/meta/` directory containing `_journal.json` and per-migration snapshot JSON files. These snapshots are the "before state" that `drizzle-kit generate` diffs against to produce the next migration. If you manually delete, rename, or edit these files, the snapshot state diverges from reality and future `drizzle-kit generate` commands produce incorrect SQL (duplicate columns, missing alters, or empty diffs for real changes).

**Why it happens:** Developers try to "clean up" migration folders, squash migrations manually, or resolve git merge conflicts by hand-editing snapshot files.

**Consequences:**
- Future generated migrations are wrong and may corrupt the database.
- The only recovery path is re-introspecting the live DB to rebuild a baseline snapshot.

**Prevention:**
- Treat `drizzle/meta/` as append-only machine-generated state. Never edit it manually.
- To squash migrations: use `drizzle-kit generate --name baseline` after deleting old migrations, then mark prior migrations as applied in `__drizzle_migrations`.
- Resolve git merge conflicts on migration files by regenerating — don't manually merge snapshot JSON.
- If the meta folder is lost: `drizzle-kit introspect` to pull the current schema from the live DB, then generate a new baseline.

**Sources:**
- Drizzle migration internals: https://dev.to/websilvercraft/how-does-drizzle-handle-migrations-part-1-ddg
- Drizzle FAQ and troubleshooting: https://orm.drizzle.team/kit-docs/faq
- Squashing discussion: https://github.com/drizzle-team/drizzle-orm/discussions/3492

---

## Moderate Pitfalls

---

### Pitfall 6: Column Rename Detected Ambiguously by `drizzle-kit generate`

**What goes wrong:** When you rename a column in the Drizzle schema (TypeScript source), `drizzle-kit generate` cannot distinguish a rename from a drop+add. In non-interactive mode it generates a `DROP COLUMN` + `ADD COLUMN` migration, which destroys existing data. Even in interactive/strict mode, there are documented bugs where renaming a column AND changing its type in the same diff causes the generated SQL to only include the rename and omit the type change.

**Why it happens:** Drizzle compares schema snapshots structurally; a name change looks identical to a delete+create at the diff level.

**Consequences:**
- Data loss if migration is applied without review.
- Silent incompleteness (rename applied, constraint change silently dropped).

**Prevention:**
- Always review the generated SQL file in `drizzle/` before running `drizzle-kit migrate`. Never blindly apply.
- Rename columns in two separate migrations: first add the new column and backfill, then drop the old column.
- Use `drizzle-kit generate --verbose` to see the full diff.
- For this project's schema (word bank), column renames should be rare; prefer additive changes.

**Sources:**
- Bug report — rename + type change silently incomplete: https://github.com/drizzle-team/drizzle-orm/issues/5499
- Bug report — missing rename changes in migration: https://github.com/drizzle-team/drizzle-orm/issues/3826
- Modifying column causes data loss warning: https://github.com/drizzle-team/drizzle-orm/issues/2047

---

### Pitfall 7: Hono `bearerAuth` Middleware Returns `HTTPException` — Not JSON

**What goes wrong:** Hono's built-in `bearerAuth` middleware throws an `HTTPException` on auth failure. By default this produces a plain-text response body, not a JSON error. REST API clients expecting `{"error": "Unauthorized"}` get a `401` with a plain body, which can confuse API clients and makes error handling inconsistent across endpoints.

There is also a documented intermittent reliability issue in older Hono versions where `bearerAuth` only validates correctly on the first request (GitHub issue #320).

**Additional trap:** The middleware rejects tokens that do not match the regex `/[A-Za-z0-9._~+/-]+=*/`. API keys containing characters outside this set (e.g., underscores are fine, but `{`, `}`, or `|` will cause a `400 Bad Request` rather than a `401 Unauthorized`).

**Prevention:**
- Override the error handler to return JSON:
```typescript
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  return c.json({ error: "Internal server error" }, 500);
});
```
- Use `verifyToken` option for custom comparison logic (also allows constant-time comparison to prevent timing attacks):
```typescript
bearerAuth({
  verifyToken: async (token, c) => {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(process.env.API_KEY!)
    );
  }
})
```
- Generate API keys using only URL-safe base64 characters to avoid the regex rejection issue.

**Sources:**
- Hono bearerAuth middleware docs: https://hono.dev/docs/middleware/builtin/bearer-auth
- Intermittent auth issue: https://github.com/honojs/hono/issues/320
- Custom response discussion: https://github.com/orgs/honojs/discussions/3346

---

### Pitfall 8: Hono `streamSSE` Closes Connection Unless Explicitly Kept Alive

**What goes wrong:** Hono's `streamSSE` callback resolves immediately and closes the SSE connection unless the code inside the callback awaits a long-running operation (e.g., `await stream.sleep(...)`). This means an MCP SSE transport mounted on Hono silently drops the connection right after the initial handshake if the stream is not kept alive manually.

There is also a documented issue where unhandled exceptions inside `streamSSE` on Node.js bring down the entire server process (Hono issue #2164).

**Prevention:**
- When using the legacy SSE transport: use the `hono-mcp-server-sse-transport` community package (https://www.npmjs.com/package/hono-mcp-server-sse-transport) which handles the keep-alive pattern correctly.
- Better: migrate to Streamable HTTP transport, which avoids SSE connection management entirely for request/response tools.
- Always wrap stream callbacks in try/catch and register `stream.onAbort()` to clean up listeners:
```typescript
stream.onAbort(() => {
  emitter.removeAllListeners();
});
```

**Sources:**
- Hono stream closes immediately: https://github.com/honojs/hono/issues/2050
- Unhandled exception brings down server: https://github.com/honojs/hono/issues/2164
- streamSSE not working: https://github.com/honojs/hono/issues/2319

---

### Pitfall 9: PostgreSQL Connection Pool Exhaustion With Default Settings

**What goes wrong:** Drizzle ORM with `node-postgres` (`pg`) defaults to a pool with no `max` connection cap and `connectionTimeoutMillis: 0` (wait forever). Under sustained load or after a burst, the pool exhausts PostgreSQL's `max_connections` (default 100). New requests hang indefinitely rather than failing fast.

PostgreSQL backend processes also slowly leak memory over thousands of queries. Connections held open for the lifetime of the server process accumulate this leak.

**Why it happens:** The defaults work fine in development. In production, even moderate traffic can hit limits — especially if each request opens a transaction and holds connections during I/O.

**Prevention:**
- Set explicit pool limits in the Drizzle/postgres.js config:
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // cap connections
  idleTimeoutMillis: 30000,   // release idle after 30s
  connectionTimeoutMillis: 5000, // fail fast, don't hang
});
export const db = drizzle(pool);
```
- Set `maxUses: 7500` to recycle connections and prevent memory accumulation.
- Ensure `idleTimeoutMillis` is lower than your load balancer's idle timeout to prevent "connection terminated unexpectedly" errors.

**Sources:**
- Drizzle connection pool exhaustion: https://github.com/drizzle-team/drizzle-orm/discussions/947
- node-postgres pooling docs: https://node-postgres.com/features/pooling
- Connection pooling best practices: https://blog.railway.com/p/database-connection-pooling

---

### Pitfall 10: Zod Version Mismatch With `@modelcontextprotocol/sdk`

**What goes wrong:** The MCP TypeScript SDK uses Zod for tool input schema definition and internally uses `zod-to-json-schema` to convert Zod schemas to JSON Schema for transmission. If your project installs Zod v4.x as a peer dependency, the bundled `zod-to-json-schema` may be incompatible, resulting in tool schemas being generated with empty `properties` objects. The LLM client cannot see what parameters the tool accepts, and tool calls fail silently or with confusing errors.

There is also a separate compatibility issue: the SDK generates JSON Schema draft-07 but some modern MCP clients expect draft-2020-12 (SDK issue #745).

**Prevention:**
- Pin Zod to the version the SDK documents as supported (`zod@^3.x` as of SDK v1.x).
- After adding tools, call `server.listTools()` in a test or startup log and verify that each tool's `inputSchema.properties` is non-empty.
- Do not add Zod as a direct project dependency if the SDK provides it — let the SDK control the version to avoid conflicts.

**Sources:**
- Zod 4.x compatibility issue: https://github.com/modelcontextprotocol/typescript-sdk/issues/796
- JSON Schema draft incompatibility: https://github.com/modelcontextprotocol/typescript-sdk/issues/745

---

## Minor Pitfalls

---

### Pitfall 11: API Key Stored in Plain Environment Variable — No Rotation Path

**What goes wrong:** Hardcoding a single API key in `process.env.API_KEY` with no rotation mechanism means that if the key is leaked (logs, error messages, git history), you must redeploy to change it. There is also no way to issue a new key to a client while keeping the old one working during a transition period.

**Prevention:**
- Support multiple valid keys via an array: `process.env.API_KEYS.split(",")`.
- Never log the Authorization header or the raw API key — log only `req.method` and a redacted representation.
- Use a `.env` file in development, never commit it to git (ensure `.env` is in `.gitignore`).
- For this project's scope (local dev, single admin), a single key is fine — just document the rotation procedure.

---

### Pitfall 12: Drizzle `enum` Type Requires Extra Migration Step

**What goes wrong:** PostgreSQL enums created via Drizzle require the `CREATE TYPE` statement to run before the table that uses them. If you add an enum column to an existing table, `drizzle-kit generate` creates the correct migration, but if you manually create the migration file or split migrations, order matters. Renaming or extending a PostgreSQL enum is also more complex than renaming a varchar — `ALTER TYPE ... ADD VALUE` cannot be run inside a transaction in older PostgreSQL versions.

**Prevention:**
- For this project, use `varchar` with an application-level check constraint for fields like `register` (formal/informal) rather than a PostgreSQL native enum. This avoids migration complexity entirely and makes adding new register values a non-destructive schema change.
- If you do use enums: add new values with `ALTER TYPE register ADD VALUE 'semiformal'` in a standalone migration, never inside the same migration as a DDL change.

---

### Pitfall 13: MCP SDK TypeScript Compilation Memory Issues

**What goes wrong:** Large TypeScript projects importing `@modelcontextprotocol/sdk` have reported TypeScript compiler memory exhaustion during compilation (SDK issue #985). This manifests as the TypeScript server process being killed by the OS during IDE type-checking or `tsc` builds.

**Prevention:**
- Use `skipLibCheck: true` in `tsconfig.json` (already a common practice; it skips type-checking of `.d.ts` files in `node_modules`).
- Keep the project's TypeScript strict mode enabled for project files, but do not set `noUncheckedIndexedAccess` or other highly recursive checks that compound the SDK's type complexity.

**Sources:**
- TypeScript compilation memory issue: https://github.com/modelcontextprotocol/typescript-sdk/issues/985

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Initial MCP server setup | Using SSE transport instead of Streamable HTTP | Use `StreamableHTTPServerTransport` from day one |
| Tool implementation | Throwing exceptions instead of `isError: true` | Wrap all tool logic in try/catch; always return structured errors |
| Schema design | Using PostgreSQL native enum for `register` field | Use varchar; keep enum migration complexity out of v1 |
| First migration | Confusing `push` with `migrate` | Run `push` only locally; commit generated migration files |
| Auth middleware wiring | `bearerAuth` returning plain-text 401 | Add `app.onError` JSON override immediately after adding auth |
| Production deploy | Connection pool using defaults | Set `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` before first deploy |
| Any schema change | Reviewing generated SQL before applying | Make `drizzle-kit generate && cat drizzle/*.sql` part of the workflow |

---

## Sources

- MCP TypeScript SDK GitHub: https://github.com/modelcontextprotocol/typescript-sdk
- MCP specification transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- SSE deprecation rationale: https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/
- SDK sticky sessions issue #330: https://github.com/modelcontextprotocol/typescript-sdk/issues/330
- SDK serverless statefulness issue #273: https://github.com/modelcontextprotocol/typescript-sdk/issues/273
- MCP error handling guide: https://mcpcat.io/guides/error-handling-custom-mcp-servers/
- MCP tool error responses for LLM recovery: https://alpic.ai/blog/better-mcp-tool-call-error-responses-ai-recover-gracefully
- Drizzle push docs: https://orm.drizzle.team/docs/drizzle-kit-push
- Drizzle migrate docs: https://orm.drizzle.team/docs/drizzle-kit-migrate
- Drizzle production migration: https://budivoogt.com/blog/drizzle-migrations
- Drizzle migration internals: https://dev.to/websilvercraft/how-does-drizzle-handle-migrations-part-1-ddg
- Drizzle column rename bugs: https://github.com/drizzle-team/drizzle-orm/issues/5499
- Drizzle connection pool exhaustion: https://github.com/drizzle-team/drizzle-orm/discussions/947
- Hono bearerAuth docs: https://hono.dev/docs/middleware/builtin/bearer-auth
- Hono SSE connection issues: https://github.com/honojs/hono/issues/2050
- Hono unhandled exception crash: https://github.com/honojs/hono/issues/2164
- node-postgres pooling: https://node-postgres.com/features/pooling
- Zod 4.x SDK incompatibility: https://github.com/modelcontextprotocol/typescript-sdk/issues/796
- SDK TypeScript memory issue: https://github.com/modelcontextprotocol/typescript-sdk/issues/985
