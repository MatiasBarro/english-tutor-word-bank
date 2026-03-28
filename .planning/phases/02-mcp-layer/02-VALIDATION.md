---
phase: 02
slug: mcp-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed — Wave 0 creates `scripts/mcp-test.ts` in plan 02-04 |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx tsx scripts/mcp-test.ts` |
| **Full suite command** | `npx tsx scripts/mcp-test.ts` |
| **Estimated runtime** | ~30 seconds (E2E with live DB required for 02-04 only) |

> No unit test framework (no jest/vitest) in this project. Validation is integration-only via the MCP client smoke test (D-05).

---

## Sampling Rate

- **After every task commit:** Start server with `npm run dev`, run `npx tsx scripts/mcp-test.ts`
- **After every plan wave:** Run `npx tsx scripts/mcp-test.ts`
- **Before `/gsd:verify-work`:** Full smoke test must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | MCP-06, AUTH-04 | integration smoke | `npx tsx scripts/mcp-test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02-02 | 2 | MCP-01, MCP-03, MCP-04 | integration smoke | `npx tsx scripts/mcp-test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 02-03 | 2 | MCP-02, MCP-03, MCP-04 | integration smoke | `npx tsx scripts/mcp-test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 02-04 | 3 | MCP-05 | manual / integration | manual DB error trigger | ❌ W0 | ⬜ pending |
| 02-04-02 | 02-04 | 3 | MCP-01, MCP-02, MCP-03, MCP-04, MCP-06, AUTH-04 | integration smoke | `npx tsx scripts/mcp-test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/mcp-test.ts` — self-contained E2E test: inserts test rows, calls both MCP tools, verifies responses, cleans up. Covers MCP-01, MCP-02, MCP-03, MCP-04, MCP-06, AUTH-04. Created in plan 02-04.
- [ ] `@hono/mcp@0.2.3` and `@modelcontextprotocol/sdk` installed (plan 02-01 step 1)

*All wave 0 items are created within phase plans. No pre-existing test infrastructure required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tool returns `isError: true` on DB error | MCP-05 | Requires injecting a DB failure (bad credentials or forced exception); no automated failure injection in smoke test | 1. Start server. 2. Temporarily break DB connection (set invalid DB URL in env). 3. Run `npx tsx scripts/mcp-test.ts`. 4. Verify response contains `isError: true` and an actionable message. 5. Restore DB URL. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
