# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 01-foundation
**Areas discussed:** `register` field type, Migrations directory layout

---

## `register` Field Type

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres native enum | `CREATE TYPE register_type AS ENUM ('formal', 'informal')` — DB enforces constraint, clean Drizzle types | ✓ |
| varchar with app-layer validation | Store as VARCHAR, validate in Zod only | |
| varchar with CHECK constraint | VARCHAR + CHECK (register IN ('formal', 'informal')) | |

**User's choice:** Postgres native enum (recommended)
**Notes:** Two project docs conflicted — DB-01 said enum, roadmap plan said varchar. User confirmed enum intent from requirements.

---

## Migrations Directory Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Root `drizzle/` | drizzle-kit default — zero config, matches roadmap success criteria reference | ✓ |
| `src/db/migrations/` | Co-located with db code, requires `out` override in drizzle.config.ts | |

**User's choice:** Root `drizzle/` (recommended)
**Notes:** Roadmap success criteria already references "a committed SQL migration file in `drizzle/`" — confirmed this path.
