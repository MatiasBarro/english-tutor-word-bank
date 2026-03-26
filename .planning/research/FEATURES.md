# Feature Landscape

**Domain:** Remote MCP vocabulary/word bank server for AI agent consumption
**Researched:** 2026-03-26
**Overall confidence:** HIGH (MCP spec sourced from modelcontextprotocol.io/specification/2025-11-25)

---

## Table Stakes

Features users (the agent and the admin) expect. Missing = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `list_categories` MCP tool | Agent needs to know what categories exist before querying words | Low | No parameters; returns only categories with at least one active word |
| `get_words_by_category` MCP tool | Core fetch: agent retrieves contextually appropriate words for a category | Low | Returns full word records including `frequency`, `register`, `usage_sentence` |
| Only active words returned by MCP tools | Agent must never see disabled words; filtering is a server responsibility | Low | `WHERE active = true` at DB query level, not application level |
| `POST /words` create endpoint | Admin needs to add individual words | Low | API key auth, returns created record |
| `PUT /words/:id` edit endpoint | Admin needs to update any field on a word | Low | API key auth, returns updated record |
| `DELETE /words/:id` delete endpoint | Admin needs to remove words | Low | API key auth; soft-delete via `active=false` is an option but hard-delete is simpler for scope |
| `POST /words/import` bulk import | Admin needs to seed the bank efficiently; row-by-row is impractical | Medium | Returns per-item success/failure; HTTP 207 for partial success |
| `GET /categories` REST endpoint | Admin tools need to list categories; separate from MCP tool | Low | Returns all categories, not filtered to active |
| API key authentication on all REST routes | Protects write operations from unauthenticated callers | Low | Bearer token in `Authorization` header |
| Structured + text response dual output | MCP spec requires `content[0].type=text` for backwards compat alongside `structuredContent` | Low | Both fields must be present per MCP 2025-11-25 spec |

## Differentiators

Features that set this server apart from a generic word lookup API.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Frequency weights exposed to agent | Agent can implement natural variation in word choice without server-side randomness | Low | Return `frequency` as a raw number; agent owns the sampling strategy |
| Register metadata (`formal` / `informal`) | Allows agent to select vocabulary appropriate to the conversational register of the interaction | Low | Enum, not free text — prevents drift |
| `usage_sentence` optional field | Gives the agent a concrete example, reducing misapplication of unusual words | Low | Nullable; agent falls back gracefully when absent |
| `active` flag on words | Disables words without destroying history; allows A/B management of vocabulary | Low | Always `WHERE active = true` in MCP queries |
| Categories as first-class entity | Agent calls `list_categories` first, enabling dynamic discovery without hard-coding category names | Low | Categories are inferred from words, not a separate table |

## Anti-Features

Features to explicitly NOT build in the initial scope.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Server-side frequency sampling | Introduces non-determinism on the server; agent loses control of variation strategy | Return all active words with weights; let agent decide how to sample |
| Multi-language support | Out of scope; adds schema and routing complexity for no current benefit | English-only; add `language` column later if needed |
| CEFR / learner-level tagging | Deferred; adds complexity without validated user need | Add `level` enum field in a later milestone if validated |
| Admin UI | REST API is sufficient for the admin workflow at this scale | Expose REST; UI is a future milestone |
| User authentication / OAuth | Overengineering for a single-admin tool | API key (Bearer token) is the right fit |
| Pagination on `get_words_by_category` | Word counts per category are expected to stay small; pagination adds agent complexity | Return full lists; add pagination if categories exceed ~200 words |

---

## MCP Tool Schemas (Concrete)

All schemas follow MCP specification 2025-11-25. The TypeScript SDK transforms Zod schemas into JSON Schema on the wire.

---

### Tool: `list_categories`

**Purpose:** Returns all distinct categories that have at least one active word. Called by the agent first to discover what vocabulary dimensions are available.

**Wire format — tool definition:**
```json
{
  "name": "list_categories",
  "title": "List Word Bank Categories",
  "description": "Returns all categories that have at least one active word in the word bank. Call this first to discover available vocabulary dimensions before fetching words.",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "categories": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Distinct category names with at least one active word"
      }
    },
    "required": ["categories"]
  }
}
```

**TypeScript SDK registration (Zod):**
```typescript
server.registerTool(
  "list_categories",
  {
    title: "List Word Bank Categories",
    description:
      "Returns all categories that have at least one active word in the word bank. " +
      "Call this first to discover available vocabulary dimensions before fetching words.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      categories: z.array(z.string()).describe(
        "Distinct category names with at least one active word"
      ),
    }),
  },
  async () => {
    const categories = await db.getActiveCategories();
    const output = { categories };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);
```

**Example response (wire):**
```json
{
  "content": [{ "type": "text", "text": "{\"categories\":[\"emphasis\",\"summary\",\"giving examples\",\"contrast\",\"hedging\"]}" }],
  "structuredContent": {
    "categories": ["emphasis", "summary", "giving examples", "contrast", "hedging"]
  }
}
```

---

### Tool: `get_words_by_category`

**Purpose:** Returns all active words for a given category. The agent consults this before crafting a response to get contextually appropriate vocabulary, frequency weights, and register guidance.

**Wire format — tool definition:**
```json
{
  "name": "get_words_by_category",
  "title": "Get Words by Category",
  "description": "Returns all active words and phrases for a given category, including frequency weight and register (formal/informal). Use frequency weights to vary word choice naturally — higher weight means prefer more often. Use register to match the conversational tone.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "The category name to fetch words for. Must match a value from list_categories."
      }
    },
    "required": ["category"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "category": { "type": "string" },
      "words": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id":              { "type": "string", "description": "Unique identifier" },
            "word":            { "type": "string", "description": "The word or phrase" },
            "register":        { "type": "string", "enum": ["formal", "informal"], "description": "Usage register" },
            "frequency":       { "type": "number", "description": "Relative preference weight (e.g. 1–100). Higher = prefer more often." },
            "usage_sentence":  { "type": ["string", "null"], "description": "Optional example sentence; null if not provided" }
          },
          "required": ["id", "word", "register", "frequency", "usage_sentence"]
        }
      }
    },
    "required": ["category", "words"]
  }
}
```

**TypeScript SDK registration (Zod):**
```typescript
const WordSchema = z.object({
  id:             z.string(),
  word:           z.string(),
  register:       z.enum(["formal", "informal"]),
  frequency:      z.number().describe("Relative preference weight. Higher = prefer more often."),
  usage_sentence: z.string().nullable(),
});

server.registerTool(
  "get_words_by_category",
  {
    title: "Get Words by Category",
    description:
      "Returns all active words and phrases for a given category, including frequency " +
      "weight and register (formal/informal). Use frequency weights to vary word choice " +
      "naturally — higher weight means prefer more often. Use register to match the " +
      "conversational tone of the interaction.",
    inputSchema: z.object({
      category: z.string().describe(
        "The category name to fetch words for. Must match a value from list_categories."
      ),
    }),
    outputSchema: z.object({
      category: z.string(),
      words:    z.array(WordSchema),
    }),
  },
  async ({ category }) => {
    const words = await db.getActiveWordsByCategory(category);
    if (words === null) {
      return {
        content: [{ type: "text", text: `Unknown category: ${category}` }],
        isError: true,
      };
    }
    const output = { category, words };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);
```

**Example response (wire):**
```json
{
  "content": [{
    "type": "text",
    "text": "{\"category\":\"emphasis\",\"words\":[{\"id\":\"uuid-1\",\"word\":\"notably\",\"register\":\"formal\",\"frequency\":80,\"usage_sentence\":\"Notably, this approach avoids the common pitfall of...\"}]}"
  }],
  "structuredContent": {
    "category": "emphasis",
    "words": [
      {
        "id": "uuid-1",
        "word": "notably",
        "register": "formal",
        "frequency": 80,
        "usage_sentence": "Notably, this approach avoids the common pitfall of..."
      },
      {
        "id": "uuid-2",
        "word": "especially",
        "register": "informal",
        "frequency": 60,
        "usage_sentence": null
      }
    ]
  }
}
```

---

## Agent Consumption Patterns

How an AI agent (e.g. Claude) is expected to interact with this MCP server.

### Pattern 1: Discovery-then-fetch (recommended)

The agent calls `list_categories` once per session (or caches the result) to learn what vocabulary dimensions are available, then calls `get_words_by_category` for the relevant category before crafting a response.

```
1. Agent receives user message
2. Agent decides response needs vocabulary guidance for "emphasis"
3. Agent calls: get_words_by_category(category: "emphasis")
4. Server returns 12 active words with frequency and register
5. Agent selects words weighted by frequency, matching the register of the conversation
6. Agent crafts response incorporating selected vocabulary
```

### Pattern 2: Category discovery at session start

For agents that want to pre-load context, `list_categories` is called at session initialization and the result is held in the system prompt or working context. Individual `get_words_by_category` calls then happen on demand.

### Frequency weight interpretation

The server returns `frequency` as a raw integer (e.g., 1–100). The agent is responsible for interpreting it. The idiomatic approach:

- Treat frequency as a probability weight: a word with `frequency: 80` should be selected ~4x more often than one with `frequency: 20`
- Within a register group, normalize frequencies to sum to 1.0, then sample
- This produces natural variation rather than always picking the highest-frequency word

**Do not** sort and always pick the top-frequency word — this produces repetitive, unnatural output. The frequency exists precisely to introduce weighted randomness.

### Register selection

Before calling `get_words_by_category`, the agent should assess the register of the conversation:
- Tutoring a student who writes formally → prefer `register: "formal"` words
- Casual chat practice → prefer `register: "informal"` words
- The response payload always includes all words; the agent filters by register client-side

The agent SHOULD filter returned words by register before applying frequency sampling, not after. Mixing registers randomly is a misuse of the data.

### Tool description front-loading (important for LLM tool selection)

Per MCP best practices: the most important behavioral guidance for the agent must appear in the first sentence of the tool description, since LLMs may truncate long descriptions during tool selection. The schemas above reflect this — the first sentence tells the agent what the tool does and when to call it.

---

## REST API Endpoint Design

### Authentication

All REST endpoints require:
```
Authorization: Bearer <api_key>
```
Return `401 Unauthorized` if the header is absent or the key is invalid. Return `403 Forbidden` if the key is valid but lacks permission (not needed at single-key scope, but good practice to distinguish).

---

### `POST /words` — Create a word

**Request body:**
```json
{
  "word":           "notably",
  "category":       "emphasis",
  "register":       "formal",
  "frequency":      80,
  "usage_sentence": "Notably, this approach avoids...",
  "active":         true
}
```

**Field rules:**
- `word`: required, string, 1–200 chars
- `category`: required, string, 1–100 chars (free text; categories are inferred from words)
- `register`: required, enum `"formal" | "informal"`
- `frequency`: required, integer 1–100
- `usage_sentence`: optional, string or null
- `active`: optional, boolean, default `true`

**Success response — 201 Created:**
```json
{
  "id":             "uuid",
  "word":           "notably",
  "category":       "emphasis",
  "register":       "formal",
  "frequency":      80,
  "usage_sentence": "Notably, this approach avoids...",
  "active":         true,
  "created_at":     "2026-03-26T12:00:00Z",
  "updated_at":     "2026-03-26T12:00:00Z"
}
```

**Error response — 422 Unprocessable Entity:**
```json
{
  "error": "validation_error",
  "details": [
    { "field": "register", "message": "Must be 'formal' or 'informal'" }
  ]
}
```

---

### `PUT /words/:id` — Update a word

**Request body:** Same shape as `POST /words`, all fields optional (partial update).

**Success response — 200 OK:** Full updated word record (same shape as POST 201).

**Error responses:**
- `404 Not Found` if `id` does not exist
- `422 Unprocessable Entity` for validation errors

---

### `DELETE /words/:id` — Delete a word

**Success response — 204 No Content** (empty body).

**Error response — 404 Not Found** if `id` does not exist.

Note: This is a hard delete. If soft-delete is needed later, add `DELETE /words/:id` that sets `active=false` and a separate `DELETE /words/:id/permanent` route. For initial scope, hard delete is simpler.

---

### `POST /words/import` — Bulk import words

**Design rationale:** Items are processed independently; the response reports per-item success/failure using HTTP 207 Multi-Status for partial success scenarios (RFC 4918, widely adopted for bulk APIs).

**Request body:**
```json
{
  "words": [
    {
      "word": "notably",
      "category": "emphasis",
      "register": "formal",
      "frequency": 80,
      "usage_sentence": "Notably, this approach...",
      "active": true
    },
    {
      "word": "basically",
      "category": "emphasis",
      "register": "informal",
      "frequency": 70,
      "usage_sentence": null,
      "active": true
    }
  ]
}
```

**Constraints:**
- Maximum 500 items per request (enforce at validation layer)
- All items are validated before any are inserted (all-or-nothing validation, not all-or-nothing insert)

**Success response — 200 OK (all succeeded):**
```json
{
  "imported":  2,
  "failed":    0,
  "results": [
    { "index": 0, "status": "created", "id": "uuid-1" },
    { "index": 1, "status": "created", "id": "uuid-2" }
  ]
}
```

**Partial success response — 207 Multi-Status:**
```json
{
  "imported":  1,
  "failed":    1,
  "results": [
    { "index": 0, "status": "created",  "id": "uuid-1" },
    { "index": 1, "status": "error",    "error": "register must be 'formal' or 'informal'" }
  ]
}
```

**Full failure — 422 Unprocessable Entity:** Only when all items fail validation.

---

### `GET /categories` — List all categories (REST)

**Different from the MCP `list_categories` tool:** Returns all categories in the database, not filtered to active words. Useful for admin tooling.

**Query parameters:**
- `active_only=true` (optional): filters to categories with at least one active word (mirrors MCP behavior)

**Success response — 200 OK:**
```json
{
  "categories": [
    { "name": "emphasis",       "word_count": 12, "active_word_count": 10 },
    { "name": "summary",        "word_count": 8,  "active_word_count": 8  },
    { "name": "giving examples","word_count": 6,  "active_word_count": 3  }
  ]
}
```

Including `word_count` and `active_word_count` makes this useful for admin review without needing a separate endpoint.

---

## Word Record Data Model

The canonical word record shared across MCP tools and REST API:

```typescript
interface WordRecord {
  id:             string;          // UUID, generated server-side
  word:           string;          // The word or phrase (e.g. "notably", "in other words")
  category:       string;          // Free-text category (e.g. "emphasis", "giving examples")
  register:       "formal" | "informal";
  frequency:      number;          // Integer 1–100; relative preference weight
  usage_sentence: string | null;   // Optional example sentence
  active:         boolean;         // false = disabled, never returned by MCP tools
  created_at:     string;          // ISO 8601
  updated_at:     string;          // ISO 8601
}
```

**Why `frequency` is 1–100 (not 0.0–1.0):**
- Integer representation is easier to author in bulk import CSV/JSON
- Normalization to probability weights is the agent's responsibility
- Avoids floating-point precision issues in storage and transport

**Why `register` is an enum (not free text):**
- Free text would create `Formal`, `formal`, `FORMAL`, `semi-formal` drift
- The two-value enum matches the binary decision the agent needs to make
- If more granularity is needed later, add `"neutral"` as a third value

**Why categories are inferred (no separate categories table):**
- Reduces schema complexity for the initial scope
- `list_categories` is a `SELECT DISTINCT category FROM words WHERE active = true` query
- If categories need metadata (display name, description, sort order), add a `categories` table later

---

## Pagination and Filtering Considerations

**`get_words_by_category` (MCP):** No pagination. The expected word count per category is small (10–50 words). Returning all active words gives the agent full context for weighted selection. Add pagination only if profiling shows payload size is a problem.

**`GET /categories` (REST):** No pagination. Category counts will remain low (single digits to low tens).

**`GET /words` (REST, future):** Not in current scope. If added, use cursor-based pagination (`?cursor=<uuid>&limit=50`) rather than offset pagination. Offset pagination is unreliable on frequently updated datasets.

**Filtering for `get_words_by_category`:** The `register` filter is intentionally NOT applied server-side. Returning all register variants gives the agent flexibility. If a category has both formal and informal words, the agent can switch register based on context without making a second MCP call.

---

## Feature Dependencies

```
list_categories
  └── requires: at least one active word exists in the database

get_words_by_category(category)
  └── requires: category name exists with active words
  └── requires: word record model (word, register, frequency, usage_sentence, active)

POST /words/import
  └── requires: POST /words validation logic (same schema, applied per-item)

PUT /words/:id
  └── requires: POST /words (same field rules, all optional)

GET /categories (REST)
  └── requires: word records exist (otherwise returns empty array)

MCP tools (both)
  └── require: MCP server with Streamable HTTP transport on single endpoint
  └── require: active flag filtering at DB query level
```

---

## MVP Recommendation

Prioritize in this order:

1. Word record model + database schema (`word`, `category`, `register`, `frequency`, `usage_sentence`, `active`)
2. `get_words_by_category` MCP tool — this is the core value delivery
3. `list_categories` MCP tool — required for agent discovery pattern
4. `POST /words` and `PUT /words/:id` REST endpoints — minimum admin interface
5. `DELETE /words/:id` REST endpoint
6. `POST /words/import` bulk import — needed for initial seeding
7. `GET /categories` REST endpoint

Defer:
- Pagination on any endpoint — word bank will remain small
- `active_only` filter on `GET /categories` — low priority admin convenience
- Hard-delete vs soft-delete sophistication — start with hard-delete, revisit if needed
- `GET /words` listing endpoint — not required for agent operation

---

## Sources

- MCP Tool Specification (2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP TypeScript SDK docs: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- Writing Effective MCP Tools: https://modelcontextprotocol.info/docs/tutorials/writing-effective-tools/
- MCP Best Practices: https://modelcontextprotocol.info/docs/best-practices/
- Streamable HTTP Transport (deprecates SSE): https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/
- Bulk API design patterns: https://tyk.io/blog/api-design-guidance-bulk-and-batch-import/
- HTTP 207 Multi-Status for bulk operations: https://oneuptime.com/blog/post/2026-01-27-rest-api-bulk-operations/view
- How LLMs choose MCP tools: https://gyliu513.medium.com/how-llm-choose-the-right-mcp-tools-9f88dbcf11a2
- MCP tool descriptions best practices: https://www.merge.dev/blog/mcp-tool-description
