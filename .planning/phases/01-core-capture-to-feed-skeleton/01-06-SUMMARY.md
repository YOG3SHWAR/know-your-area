---
phase: 01-core-capture-to-feed-skeleton
plan: 06
subsystem: database
tags: [postgres, postgres.js, drizzle, supabase, tls, error-logging, gap-closure]

requires:
  - phase: 01-core-capture-to-feed-skeleton
    provides: "src/lib/db/client.ts (unhardened postgres.js client), src/app/api/feed/route.ts (feed GET handler)"
provides:
  - "buildClientOptions(url): pure, unit-tested postgres.js options builder (prepare:false always, ssl:'require' for hosted hosts, ssl:false for local)"
  - "Structured server-side error logging (name/message/code) in the feed route's catch block, client response unchanged"
affects: [01-07 (human-verify production closure of G-01-EXTRA-1)]

tech-stack:
  added: []
  patterns:
    - "DB connection options built via a pure, host-conditional function (buildClientOptions) rather than inline literal options — keeps SSL/prepare decisions unit-testable without a live DATABASE_URL"
    - "Catch-block error logging: log structured error fields (name/message/code) as separate console.error args server-side; client response stays a fixed generic message (Information Disclosure boundary)"

key-files:
  created:
    - tests/unit/db-client-options.test.ts
    - tests/unit/feed-route-logging.test.ts
  modified:
    - src/lib/db/client.ts
    - src/app/api/feed/route.ts

key-decisions:
  - "Used a dynamic import() + beforeAll in db-client-options.test.ts instead of a plain top-of-file process.env.DATABASE_URL assignment, because ES module imports are hoisted above ordinary top-level statements — a static import of @/lib/db/client would otherwise evaluate before the dummy env var was set, still throwing 'Missing required environment variable'."
  - "feed route now logs err.name, err.message, and err.code as three separate console.error arguments (not a single object) so a simple string-join based test assertion can verify each field landed in the log without coupling to a specific log-object shape."

requirements-completed: [FEED-01]

coverage:
  - id: D1
    description: "postgres.js client sends prepare:false unconditionally and ssl:'require' for hosted (non-local) DB hosts, ssl:false for localhost/127.0.0.1/::1"
    requirement: "FEED-01"
    verification:
      - kind: unit
        ref: "tests/unit/db-client-options.test.ts#buildClientOptions"
        status: pass
    human_judgment: false
  - id: D2
    description: "A feed-query failure logs the error's name/message/code server-side while the HTTP response stays the generic 'Couldn't load reports.' 500"
    requirement: "FEED-01"
    verification:
      - kind: unit
        ref: "tests/unit/feed-route-logging.test.ts#GET /api/feed error logging"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 06: Harden postgres.js client + surface feed error logging Summary

**Host-conditional TLS + prepare:false for postgres.js (Supabase pooler/TLS compatibility) and structured server-side error logging (name/message/code) in the feed route's catch block, with the client-facing response unchanged.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-23T15:25:06Z
- **Completed:** 2026-07-23T15:28:42Z
- **Tasks:** 2 completed
- **Files modified:** 4 (2 source, 2 new test files)

## Accomplishments
- `buildClientOptions(url)` exported from `src/lib/db/client.ts`: a pure function returning `{ prepare: false, ssl: false | "require" }`, `ssl:false` only for `localhost`/`127.0.0.1`/`::1`, `ssl:"require"` for every other (hosted) host including a URL that fails to parse. The postgres.js client is instantiated with these options.
- `GET /api/feed`'s catch block now logs `err.name`, `err.message`, and `err.code` (when present) to `console.error` as separate arguments — greppable in Vercel function logs — while the HTTP response is byte-for-byte unchanged: `{ error: "Couldn't load reports." }` at 500.
- Both fixes are unit-tested with true TDD RED→GREEN cycles (failing test committed before the implementation that makes it pass).

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden the postgres.js client (host-conditional TLS + prepare:false)**
   - `35e8d54` (test) — add failing test for buildClientOptions
   - `b0c231b` (feat) — harden postgres.js client with host-conditional TLS + prepare:false
2. **Task 2: Surface the real feed-query error server-side**
   - `f663ae7` (test) — add failing test for feed route error logging
   - `67ebf4e` (feat) — surface real feed-query error server-side, keep generic client response

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/lib/db/client.ts` — exports `buildClientOptions(url)`; postgres() call now passes `buildClientOptions(databaseUrl)` instead of zero options
- `src/app/api/feed/route.ts` — catch block logs `err.name`/`err.message`/`err.code` server-side; response to the client is unchanged
- `tests/unit/db-client-options.test.ts` — covers localhost/127.0.0.1 (ssl:false) and Supabase pooler/direct hosts (ssl:'require'), asserts prepare:false in every case
- `tests/unit/feed-route-logging.test.ts` — mocks `@/lib/feed`'s `recentFeed` to reject with a synthetic error carrying distinctive name/message/code tokens; asserts all three appear in `console.error` calls while the client still receives the generic 500

## Decisions Made
- `db-client-options.test.ts` sets `process.env.DATABASE_URL` inside `beforeAll` and dynamically `import()`s `@/lib/db/client` afterward, rather than a top-of-file assignment before a static `import`. ES module static imports are hoisted and evaluate before any of the importing module's own top-level statements, so a plain assignment-then-import ordering in source text does not guarantee that evaluation order at runtime — confirmed by reproducing the "Missing required environment variable: DATABASE_URL" failure with the naive approach first.
- The feed route logs `err.name`, `err.message`, `err.code` as three separate `console.error` arguments (not a single serialized object), matching the task's literal wording ("all three values appear in the logged arguments") and keeping the test assertion decoupled from a specific log-shape choice.

## Deviations from Plan

None - plan executed exactly as written. The env-var-hoisting issue encountered while writing `db-client-options.test.ts` was resolved within the task's own stated fallback ("if module load requires DATABASE_URL, set a dummy process.env.DATABASE_URL... so import succeeds") — using `beforeAll` + dynamic import is a mechanical implementation detail of that same instruction, not a deviation from the plan's intent.

## Issues Encountered
- `npm run lint` reported 3 pre-existing errors in `.claude/worktrees/agent-*/tests/e2e/fixtures.ts` (untracked, out-of-scope worktree copies unrelated to this plan's files). Scoped `npx eslint` to this plan's 4 changed files instead, which passed clean — consistent with the deviation-rules scope boundary (only auto-fix issues directly caused by the current task's changes).

## User Setup Required

None - no external service configuration required. This plan is a code-level fix; production closure of G-01-EXTRA-1 (confirming the actual Vercel `DATABASE_URL`/pooler/Supabase-project-state root cause against real function logs) is handled by plan 01-07 (human-verify), which depends on this fix being deployed.

## Next Phase Readiness
- Both leading code-level suspects for the production `/api/feed` 500 (missing TLS to Supabase; prepared statements incompatible with a transaction-mode pooler) are now closed at the code level and unit-tested.
- The feed route's real failure mode will now be visible in Vercel function logs (name/message/code) once deployed, unblocking plan 01-07's log-based diagnosis.
- No local-dev regression: localhost/127.0.0.1 connections still resolve to `ssl:false`.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-23*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 4 task commit hashes (35e8d54, b0c231b, f663ae7, 67ebf4e) confirmed in git log.
