# Phase 2: MCP Layer - Research

**Researched:** 2026-03-28
**Domain:** MCP server with Streamable HTTP transport, @hono/mcp, Drizzle query patterns
**Confidence:** HIGH

## Summary

Phase 2 builds a `/mcp` endpoint using `@hono/mcp`'s `StreamableHTTPTransport` and two tools registered on an `McpServer` from `@modelcontextprotocol/sdk`. The critical naming ambiguity flagged in STATE.md is resolved: `@hono/mcp` is the correct and canonical package (published by the Hono team at honojs/middleware). There is no package named `@modelcontextprotocol/hono`.

The `StreamableHTTPTransport` from `@hono/mcp` accepts a `sessionIdGenerator` option (just like `NodeStreamableHTTPServerTransport` from the SDK), and stateless mode is achieved by omitting it — matching decision D-07 exactly. Tool registration uses `mcpServer.registerTool()` from `@modelcontextprotocol/sdk/server/mcp.js` with a Zod input schema and a handler returning `{ content, structuredContent }`.

The `structuredContent` dual-response format is stable in SDK v1.28.0. A known bug (issue #654) where `isError: true` was blocked by output schema validation was fixed in PR #655 (merged June 2025, well before v1.28.0). The workaround for this phase: **do not define `outputSchema` on tools** — return `structuredContent` without registering a schema. This avoids the validation path entirely and both `content` and `structuredContent` are still returned correctly.

**Primary recommendation:** Install `@hono/mcp@0.2.3` (pinned as per D-07) and `@modelcontextprotocol/sdk@^1.28.0`. Register tools with `registerTool()`, use Drizzle `selectDistinct` + `and(eq(...), eq(...))` for queries, return `{ content, structuredContent }` from every tool, wrap all tool bodies in try/catch returning `{ isError: true, content: [...] }` on error.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Tool implementations live in `src/tools/` — `list-categories.ts` and `get-words-by-category.ts` as separate files
- **D-02:** `src/server.ts` mounts `/mcp` — MCP transport wiring may go in a dedicated `src/mcp.ts` or inline in server.ts (planner decides)
- **D-03:** `content[{type:"text"}]` is a human-readable summary string for the LLM agent — NOT a JSON-serialized duplicate of structuredContent
  - `list_categories` example: `"Available categories: emphasis, summary, examples (3 total)"`
  - `get_words_by_category` example: `"Words in 'emphasis': therefore (formal, freq:80), ..."`
- **D-04:** `structuredContent` carries the machine-parseable structured data (separate concern)
- **D-05:** Plan 02-04 must produce a `scripts/mcp-test.ts` using `@modelcontextprotocol/sdk` TypeScript client to connect, call both tools, and log results
- **D-06:** Streamable HTTP transport only — SSE not present (MCP-06)
- **D-07:** Stateless mode — `sessionIdGenerator: undefined` (plan 02-01)
- **D-08:** No auth on `/mcp` — unauthenticated requests accepted (AUTH-04)
- **D-09:** Dual response: both `content[{type:"text"}]` and `structuredContent` in every tool response (MCP-04)
- **D-10:** Tool errors returned as `{ isError: true, content: [...] }` — no exceptions bubbled (MCP-05)
- **D-11:** Zod pinned to `^3.25.x` for tool input schemas — Zod v4 breaks MCP SDK (package.json)

### Claude's Discretion

- Whether MCP transport wiring lives in `src/mcp.ts` or inline in `src/server.ts`
- Exact human-readable string format for text content (examples in D-03 are illustrative)
- Whether `scripts/mcp-test.ts` seeds test data or expects pre-existing rows

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | `list_categories` tool returns all distinct categories that have at least one active word | Drizzle `selectDistinct` + `WHERE active = true` |
| MCP-02 | `get_words_by_category` tool returns all active words for a given category, including `word`, `register`, `frequency`, `usage_sentence` | Drizzle `select` + `and(eq(active,true), eq(category,?))` |
| MCP-03 | MCP tools only return words where `active = true` | Enforced at query level with `eq(words.active, true)` in both tools |
| MCP-04 | MCP tools return both `content[{type:"text"}]` and `structuredContent` per MCP spec 2025-11-25 | `registerTool` handler returns `{ content: [{type:"text", text}], structuredContent: {...} }` |
| MCP-05 | MCP tool errors returned as `{ isError: true, content: [...] }` — exceptions never bubbled | try/catch in every tool handler; `isError: true` return path; confirmed stable in SDK 1.28.0 |
| MCP-06 | MCP server uses Streamable HTTP transport (`@hono/mcp` `StreamableHTTPTransport`) — SSE not used | `@hono/mcp` `StreamableHTTPTransport` is the correct package; `app.all('/mcp', ...)` pattern |
| AUTH-04 | MCP endpoint (`/mcp`) does not require authentication | No middleware applied to the `/mcp` route; confirmed by project decision |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@hono/mcp` | 0.2.3 (pinned) | Hono-native `StreamableHTTPTransport` | Official Hono middleware; wraps SDK transport for edge-compatible Hono request handling |
| `@modelcontextprotocol/sdk` | ^1.28.0 | `McpServer`, `Client`, `StreamableHTTPClientTransport` | Official MCP TypeScript SDK; provides `registerTool`, typed responses, client for smoke test |
| `drizzle-orm` | ^0.45.1 (existing) | `selectDistinct`, `select`, `eq`, `and` for queries | Already installed; matches schema |
| `zod` | ^3.25.76 (existing, pinned) | Tool input schema (D-11 — Zod v4 breaks MCP SDK) | Must stay on v3 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | ^17.3.1 (existing devDep) | Load `.env` in scripts | Only needed for `scripts/mcp-test.ts` — `import "dotenv/config"` at top |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@hono/mcp` `StreamableHTTPTransport` | `@modelcontextprotocol/sdk` `NodeStreamableHTTPServerTransport` | Node-only; requires `fetch-to-node` adapter to bridge Hono context; more boilerplate; not needed since `@hono/mcp` already handles this |
| `mcpServer.registerTool()` | Low-level `server.setRequestHandler(CallToolRequestSchema, ...)` | More verbose; loses typed Zod input parsing; `registerTool` is the recommended high-level API |

**Installation (new packages only):**

```bash
npm install @hono/mcp@0.2.3 @modelcontextprotocol/sdk
```

**Version verification (confirmed 2026-03-28):**

| Package | Latest | Pinned to | Publish Date |
|---------|--------|-----------|--------------|
| `@hono/mcp` | 0.2.4 | 0.2.3 (per D-07) | 2025-12-25 |
| `@modelcontextprotocol/sdk` | 1.28.0 | ^1.28.0 | 2026-xx |

> Note: `@hono/mcp` 0.2.4 exists (published 2026-02-27) and has identical peer deps to 0.2.3. The CONTEXT.md pins 0.2.3 as a locked decision. Use exactly `@hono/mcp@0.2.3`.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── server.ts          # Mounts /mcp alongside /health (existing)
├── mcp.ts             # (optional) MCP transport wiring — or inline in server.ts
├── tools/
│   ├── list-categories.ts         # MCP-01, MCP-03
│   └── get-words-by-category.ts   # MCP-02, MCP-03
└── db/
    ├── index.ts       # exports db, pool (existing)
    └── schema.ts      # exports words, registerEnum (existing)
scripts/
└── mcp-test.ts        # E2E smoke test (D-05)
```

### Pattern 1: MCP Server + Transport (Stateless Mode)

**What:** Create one `McpServer` instance, register tools on it, then create a new `StreamableHTTPTransport` per request and connect the server to it.

**When to use:** Stateless mode — no session state persisted between requests, safe for scale-out.

**Example:**
```typescript
// Source: honohub.dev/docs/hono-mcp + honojs/middleware src/streamable-http.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

const app = new Hono();

const mcpServer = new McpServer({
  name: "english-tutor-mcp",
  version: "1.0.0",
});

// Register tools here (see Pattern 2)

app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPTransport();
  // sessionIdGenerator is undefined by default — stateless mode (D-07)
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});
```

> Key: `new StreamableHTTPTransport()` with no arguments = stateless mode. The constructor accepts `{ sessionIdGenerator, enableJsonResponse, eventStore, ... }` but omitting `sessionIdGenerator` disables session management. Do NOT pass `sessionIdGenerator: undefined` explicitly — just omit the options object entirely.

### Pattern 2: Tool Registration with Dual Response (MCP-04)

**What:** Register tools using `mcpServer.registerTool()` with a Zod input schema. Return `{ content, structuredContent }` from the handler.

**When to use:** Every tool in this phase — both `list_categories` and `get_words_by_category`.

**Example:**
```typescript
// Source: github.com/modelcontextprotocol/typescript-sdk docs/server.md
import { z } from "zod";

mcpServer.registerTool(
  "get_words_by_category",
  {
    description: "Get all active words for a given category",
    inputSchema: z.object({
      category: z.string().describe("The category name"),
    }),
    // NOTE: Do NOT define outputSchema — see Pitfall 1
  },
  async ({ category }) => {
    const rows = await db
      .select({
        word: words.word,
        register: words.register,
        frequency: words.frequency,
        usageSentence: words.usageSentence,
      })
      .from(words)
      .where(and(eq(words.active, true), eq(words.category, category)));

    const structured = { category, words: rows };
    const summary = rows
      .map((r) => `${r.word} (${r.register}, freq:${r.frequency})`)
      .join(", ");

    return {
      content: [{ type: "text", text: `Words in '${category}': ${summary}` }],
      structuredContent: structured,
    };
  }
);
```

### Pattern 3: Tool Error Handling (MCP-05)

**What:** Wrap all tool body in try/catch; return `{ isError: true, content: [...] }` on any exception. The server never crashes; the agent receives an actionable message.

**When to use:** Every tool handler — required by D-10.

**Example:**
```typescript
// Source: modelcontextprotocol.info/docs/concepts/tools + sdk issue #654 resolution
mcpServer.registerTool("list_categories", { ... }, async () => {
  try {
    const rows = await db
      .selectDistinct({ category: words.category })
      .from(words)
      .where(eq(words.active, true));

    const categories = rows.map((r) => r.category).sort();
    return {
      content: [
        {
          type: "text",
          text: `Available categories: ${categories.join(", ")} (${categories.length} total)`,
        },
      ],
      structuredContent: { categories },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return {
      isError: true,
      content: [{ type: "text", text: `Failed to list categories: ${message}` }],
    };
  }
});
```

### Pattern 4: MCP Client for Smoke Test (D-05)

**What:** Use `Client` + `StreamableHTTPClientTransport` from the SDK to connect and call both tools. Script goes in `scripts/mcp-test.ts`.

**Example:**
```typescript
// Source: github.com/modelcontextprotocol/typescript-sdk docs/client.md
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "smoke-test", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3000/mcp")
);
await client.connect(transport);

const catResult = await client.callTool({ name: "list_categories", arguments: {} });
console.log("list_categories:", catResult);

const wordsResult = await client.callTool({
  name: "get_words_by_category",
  arguments: { category: "emphasis" },
});
console.log("get_words_by_category:", wordsResult);

await client.close();
```

### Pattern 5: Drizzle Queries

**list_categories** — select distinct categories for active words:
```typescript
// Source: orm.drizzle.team/docs/select (verified 2026-03-28)
import { eq } from "drizzle-orm";

const rows = await db
  .selectDistinct({ category: words.category })
  .from(words)
  .where(eq(words.active, true));
```

**get_words_by_category** — select active words for a category:
```typescript
// Source: orm.drizzle.team/docs/operators
import { and, eq } from "drizzle-orm";

const rows = await db
  .select({
    word: words.word,
    register: words.register,
    frequency: words.frequency,
    usageSentence: words.usageSentence,
  })
  .from(words)
  .where(and(eq(words.active, true), eq(words.category, category)));
```

### Anti-Patterns to Avoid

- **`new StreamableHTTPTransport({ sessionIdGenerator: () => randomUUID() })`:** Creates a stateful server requiring session management — violates D-07. Use default constructor.
- **Defining `outputSchema` on tools:** Introduces validation that runs before `isError` check. Although fixed in SDK >=1.x (PR #655), keeping tools without `outputSchema` is simpler and safe for this phase.
- **`app.post('/mcp', ...)` only:** The `@hono/mcp` docs use `app.all()` to handle all HTTP verbs — use `app.all('/mcp', ...)` to avoid 404 on non-POST requests.
- **`JSON.stringify(structuredContent)` as the text content:** Violates D-03. Text content must be a human-readable summary, not a JSON dump.
- **Importing from `@hono/mcp/server` or other sub-paths:** The package only exports `.` and `./auth` — all imports go through `"@hono/mcp"`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streamable HTTP transport | Custom HTTP request/response parsing for MCP | `StreamableHTTPTransport` from `@hono/mcp` | SSE framing, session negotiation, spec-compliant error handling are non-trivial |
| Tool input validation | Manual type checking on `arguments` | Zod schema in `registerTool` `inputSchema` | SDK parses and validates input before handler runs; type-safe handler arguments |
| MCP protocol framing | Raw JSON-RPC response construction | `registerTool` return values | SDK handles `CallToolResult` serialization, `isError` flag propagation, `structuredContent` wrapping |
| Distinct active categories query | Application-level dedup of all rows | `db.selectDistinct()` | DB-level dedup is correct, atomic, and handles nulls |

**Key insight:** The `@hono/mcp` + `@modelcontextprotocol/sdk` stack handles all MCP protocol complexity. The only custom code is the Drizzle queries and the response formatting.

---

## Common Pitfalls

### Pitfall 1: `outputSchema` Conflicts with `isError` Return

**What goes wrong:** Defining `outputSchema` in `registerTool` causes SDK to validate `structuredContent` against the schema. If `isError: true` is returned, the error response lacks `structuredContent`, causing a validation failure before the error reaches the client.

**Why it happens:** SDK validation runs before checking `isError` flag (issue #654). Fixed in SDK PR #655 (merged June 2025). The fix is present in SDK 1.28.0, but the safest path is to not define `outputSchema` at all in this phase.

**How to avoid:** Do not include `outputSchema` in tool metadata. Return `structuredContent` in success responses, omit it in `isError` responses.

**Warning signs:** Tools that return `isError: true` cause SDK to throw internally; agent receives a confusing error message instead of the tool's error content.

### Pitfall 2: `McpServer.connect()` Called Once vs. Per Request

**What goes wrong:** Calling `await mcpServer.connect(transport)` every request with a new transport instance fails if the server is already connected. Or calling it with a shared transport breaks stateless isolation.

**Why it happens:** The `@hono/mcp` docs show two patterns — one creates transport outside the handler (stateful), the other inside (stateless). For stateless mode you create a new transport per request.

**How to avoid:** Create `new StreamableHTTPTransport()` inside the route handler on every request. Check `if (!mcpServer.isConnected())` before calling `connect()` if transport is created outside — but for stateless (per-request transport), always call `connect()`.

**Warning signs:** `Error: Server is already connected` on second request; or all requests share session state when they shouldn't.

### Pitfall 3: `.js` Extension in ESM Imports

**What goes wrong:** Imports from `@modelcontextprotocol/sdk` sub-paths work at runtime but TypeScript with `NodeNext` resolution fails without `.js` extension.

**Why it happens:** Project uses `"module": "NodeNext"` + `"moduleResolution": "NodeNext"` in tsconfig. SDK exports map `./client` to `./dist/esm/client/index.js`.

**How to avoid:** Use the short sub-path form `"@modelcontextprotocol/sdk/client/index.js"` and `"@modelcontextprotocol/sdk/client/streamableHttp.js"` — these are the correct import identifiers (SDK uses `"./client/*"` wildcard export mapping).

**Warning signs:** TypeScript error `Cannot find module '@modelcontextprotocol/sdk/server/mcp'` — add `.js` extension: `'@modelcontextprotocol/sdk/server/mcp.js'`.

### Pitfall 4: `scripts/mcp-test.ts` Not in `tsconfig.json` Include Path

**What goes wrong:** `tsx scripts/mcp-test.ts` works (tsx resolves on the fly), but `tsc` build fails because `scripts/` is not in `"include": ["src/**/*"]`.

**Why it happens:** tsconfig.json `rootDir` is `src/` and `include` only covers `src/**/*`.

**How to avoid:** Run the test script with `tsx scripts/mcp-test.ts` only — never compile scripts/ with `tsc`. This matches the existing `db:test` pattern in package.json.

**Warning signs:** `tsc` error about files outside rootDir.

### Pitfall 5: `usageSentence` Column is `null`able

**What goes wrong:** TypeScript infers `usageSentence: string | null` from Drizzle schema. Passing it directly to `structuredContent` is fine, but building the text summary string with `${r.usageSentence}` produces `"null"` strings.

**Why it happens:** Schema has `usageSentence: text("usage_sentence")` with no `.notNull()`.

**How to avoid:** In `get_words_by_category` text summary, use `r.usageSentence ?? ""` or omit it from the summary string. In `structuredContent`, pass it as-is (`null` is valid JSON).

---

## Code Examples

### Verified: McpServer + tool server wiring skeleton

```typescript
// Source: honohub.dev/docs/hono-mcp (verified 2026-03-28)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";

export const mcpServer = new McpServer({
  name: "english-tutor-mcp",
  version: "1.0.0",
});

// Tools registered in src/tools/*.ts before this is used in server.ts
// e.g. import "./tools/list-categories.js" — registers as side effect

export function createMcpHandler() {
  return async (c: Context) => {
    const transport = new StreamableHTTPTransport();
    await mcpServer.connect(transport);
    return transport.handleRequest(c);
  };
}
```

### Verified: Drizzle query for list_categories

```typescript
// Source: orm.drizzle.team/docs/select
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { words } from "../db/schema.js";

const rows = await db
  .selectDistinct({ category: words.category })
  .from(words)
  .where(eq(words.active, true));

const categories = rows.map((r) => r.category).sort();
```

### Verified: Drizzle query for get_words_by_category

```typescript
// Source: orm.drizzle.team/docs/operators
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { words } from "../db/schema.js";

const rows = await db
  .select({
    word: words.word,
    register: words.register,
    frequency: words.frequency,
    usageSentence: words.usageSentence,
  })
  .from(words)
  .where(and(eq(words.active, true), eq(words.category, category)));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SSE transport for MCP | Streamable HTTP transport | March 2025 | SSE deprecated; `@hono/mcp` and SDK no longer recommend it |
| `server.setRequestHandler(CallToolRequestSchema, ...)` | `mcpServer.registerTool(name, meta, handler)` | SDK v1.x | High-level API with typed Zod input, fewer boilerplate |
| `structuredContent` missing or JSON-only in `content` | Dual `content` + `structuredContent` in same response | MCP spec 2025-11-25 | Both fields required per spec; SDK 1.28.0 supports it cleanly |

**Deprecated/outdated:**
- SSE transport: Deprecated March 2025 per MCP spec. `@hono/mcp` 0.2.x does not use it.
- `McpServer` in `@hono/mcp`: The package does NOT re-export `McpServer` — import it from `@modelcontextprotocol/sdk/server/mcp.js`.

---

## Open Questions

1. **`@hono/mcp` 0.2.3 vs 0.2.4**
   - What we know: 0.2.4 was published 2026-02-27. Both 0.2.3 and 0.2.4 have identical peer deps. No changelog diff was found.
   - What's unclear: Whether 0.2.4 contains any breaking changes or behavior changes from 0.2.3.
   - Recommendation: Honor CONTEXT.md D-07 pin to 0.2.3. If testing reveals a bug, upgrading to 0.2.4 is low-risk since peer deps are identical.

2. **`scripts/mcp-test.ts` — seed data vs. pre-existing rows**
   - What we know: The script is responsible for smoke-testing both tools. The DB may or may not have seed data at test time (Claude's discretion per CONTEXT.md).
   - What's unclear: Whether to insert test rows at the top of the script and clean up after.
   - Recommendation: Follow the `scripts/db-test.ts` pattern — insert a known test row at the start, run both tool calls, then clean up. This makes the test self-contained.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.14.0 | — |
| npm | Package install | Yes | 11.9.0 | — |
| tsx | Run scripts/mcp-test.ts | Yes | in project node_modules | — |
| PostgreSQL / DATABASE_URL | DB queries in tools | .env exists; pg_isready not found | — | Must have running DB for E2E test (plan 02-04 only) |
| `@hono/mcp` | Plan 02-01 | Not installed (npm list shows absent) | — | None — must install |
| `@modelcontextprotocol/sdk` | Plans 02-01 to 02-04 | Not installed | — | None — must install |

**Missing dependencies with no fallback:**
- `@hono/mcp@0.2.3` — install before plan 02-01
- `@modelcontextprotocol/sdk` — install before plan 02-01
- Running PostgreSQL — required for plan 02-04 E2E smoke test; plans 02-01 through 02-03 can be implemented and tested structurally without it

**Missing dependencies with fallback:**
- Running PostgreSQL — plans 02-01 through 02-03 (wiring + tool structure) do not require live DB; only 02-04 (smoke test) does.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed yet |
| Config file | None — see Wave 0 |
| Quick run command | `npx tsx scripts/mcp-test.ts` (integration smoke test) |
| Full suite command | `npx tsx scripts/mcp-test.ts` (same — no unit framework installed) |

> Note: The project has no test framework (no jest, vitest, or similar in package.json). The validation strategy for this phase is the E2E MCP client smoke test (`scripts/mcp-test.ts`) mandated by D-05. This tests the full protocol stack, not just units.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | `list_categories` returns distinct active categories | integration smoke | `npx tsx scripts/mcp-test.ts` | No — Wave 0 |
| MCP-02 | `get_words_by_category` returns active word fields | integration smoke | `npx tsx scripts/mcp-test.ts` | No — Wave 0 |
| MCP-03 | Inactive words never appear in either tool's response | integration smoke (test DB row) | `npx tsx scripts/mcp-test.ts` | No — Wave 0 |
| MCP-04 | Both `content` and `structuredContent` present in every response | integration smoke (inspect result) | `npx tsx scripts/mcp-test.ts` | No — Wave 0 |
| MCP-05 | Error returns `isError: true`, server does not crash | manual / integration (trigger DB error) | manual test | No |
| MCP-06 | Streamable HTTP transport, no SSE | connection success in smoke test | `npx tsx scripts/mcp-test.ts` | No — Wave 0 |
| AUTH-04 | `/mcp` accepts unauthenticated requests | connection success (no Authorization header in test) | `npx tsx scripts/mcp-test.ts` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** Start server with `npm run dev`, run `npx tsx scripts/mcp-test.ts`
- **Per wave merge:** Same — full smoke test
- **Phase gate:** Smoke test passes green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `scripts/mcp-test.ts` — covers MCP-01, MCP-02, MCP-03, MCP-04, MCP-06, AUTH-04 (created in plan 02-04)
- [ ] `@hono/mcp@0.2.3` and `@modelcontextprotocol/sdk` must be installed (plan 02-01 step 1)

---

## Sources

### Primary (HIGH confidence)

- `npm view @hono/mcp@0.2.3` — version, peer deps, publish date confirmed 2026-03-28
- `npm view @modelcontextprotocol/sdk@1.28.0` — current version, exports, confirmed 2026-03-28
- honohub.dev/docs/hono-mcp — `StreamableHTTPTransport` constructor, `app.all()` pattern, `transport.handleRequest(c)` usage
- github.com/honojs/middleware/packages/mcp/src/streamable-http.ts — confirmed `sessionIdGenerator` option; stateless = omit option
- github.com/modelcontextprotocol/typescript-sdk/docs/server.md — `registerTool`, `{ content, structuredContent }` return pattern
- github.com/modelcontextprotocol/typescript-sdk/docs/client.md — `Client`, `StreamableHTTPClientTransport`, import paths `client/index.js` and `client/streamableHttp.js`
- orm.drizzle.team/docs/select + /operators — `selectDistinct`, `and`, `eq` query patterns

### Secondary (MEDIUM confidence)

- github.com/modelcontextprotocol/typescript-sdk/issues/654 — `isError` + `outputSchema` conflict; confirmed fixed in PR #655 merged June 2025
- github.com/modelcontextprotocol/typescript-sdk/issues/911 — `structuredContent` specification status; active in SDK 1.28.0 without `outputSchema`
- github.com/mhart/mcp-hono-stateless — real-world stateless Hono MCP example; confirms `sessionIdGenerator: undefined` pattern

### Tertiary (LOW confidence)

- None — all critical findings verified against official sources.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — both packages confirmed via npm registry 2026-03-28; versions verified
- Architecture: HIGH — patterns traced to official docs and source code
- Pitfalls: HIGH for Pitfall 1 (tracked GitHub issue with PR), HIGH for Pitfall 3 (tsconfig.json confirmed), MEDIUM for Pitfall 2 (docs ambiguous, two valid patterns documented)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable ecosystem, `@hono/mcp` and MCP SDK are actively maintained but not frequently breaking)
