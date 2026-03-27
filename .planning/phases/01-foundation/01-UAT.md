---
status: testing
phase: 01-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
started: 2026-03-27T15:00:00Z
updated: 2026-03-27T15:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server. Clear ephemeral state. Start the application from scratch
  (npm run dev). Server boots without errors, any seed/migration completes, and
  GET /health returns { "status": "ok" }.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Clear ephemeral state. Start the application from scratch (npm run dev). Server boots without errors, any seed/migration completes, and GET /health returns { "status": "ok" }.
result: [pending]

### 2. Server starts with valid env vars
expected: With DATABASE_URL, PORT, and API_KEY set in .env, running `npm run dev` starts the server and prints a confirmation message (e.g., "Server running on port 3000").
result: [pending]

### 3. Server refuses to start on missing env var
expected: Remove one required env var (e.g., delete API_KEY from .env). Running `npm run dev` exits immediately with a clear, descriptive error — not a stack trace — naming which variable is missing.
result: [pending]

### 4. Health check endpoint
expected: With server running, `curl http://localhost:3000/health` returns HTTP 200 with body `{"status":"ok"}`.
result: [pending]

### 5. Database migration creates words table
expected: With DATABASE_URL pointing to a running PostgreSQL instance, `npm run db:migrate` completes without errors and the `words` table exists with columns: id (uuid), word, category, register, frequency, usage_sentence, active, created_at.
result: [pending]

### 6. DB test script inserts and reads back
expected: After migration is applied, `npm run db:test` runs to completion, prints success (e.g., "word inserted and verified"), and exits 0.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
