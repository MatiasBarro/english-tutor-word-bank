# Phase 2: MCP Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 02-mcp-layer
**Areas discussed:** File organization, Text content format, E2E test approach

---

## File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| src/tools/ directory | list-categories.ts and get-words-by-category.ts as separate files. Mirrors Phase 3 handler structure. | ✓ |
| src/mcp.ts — one file | All MCP wiring + both tools in a single file. | |
| Inline in server.ts | Add MCP setup directly to existing server.ts. | |

**User's choice:** src/tools/ directory
**Notes:** None

---

## Text Content Format

| Option | Description | Selected |
|--------|-------------|----------|
| Human-readable summary | Plain-language string for LLM agent to read. Aligns with spec intent. | ✓ |
| JSON string | Same data as structuredContent serialized as JSON. Redundant. | |

**User's choice:** Human-readable summary
**Notes:** User questioned why JSON was initially recommended. Discussion clarified that `content[{type:"text"}]` is the LLM's reading pane — human-readable is more aligned with spec intent. Initial recommendation was revised.

---

## E2E Test Approach

| Option | Description | Selected |
|--------|-------------|----------|
| MCP SDK client script | scripts/mcp-test.ts using @modelcontextprotocol/sdk Client. Verifies full protocol stack. | ✓ |
| Claude Code MCP integration | Add server to Claude Code MCP config. Real scenario but manual/non-repeatable. | |
| curl HTTP check | POST raw JSON-RPC via curl. Easy but doesn't exercise SDK transport handshake. | |

**User's choice:** MCP SDK client script
**Notes:** None

---

## Claude's Discretion

- Whether MCP transport wiring lives in src/mcp.ts or inline in src/server.ts
- Exact human-readable string format for text content
- Whether scripts/mcp-test.ts seeds test data or expects pre-existing rows

## Deferred Ideas

None
