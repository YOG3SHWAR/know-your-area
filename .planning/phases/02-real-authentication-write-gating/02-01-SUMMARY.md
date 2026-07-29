---
phase: 02-real-authentication-write-gating
plan: 01
subsystem: auth
tags: [better-auth, drizzle-orm, postgres, google-oauth, playwright]

# Dependency graph
requires:
  - phase: 01-core-capture-to-feed-skeleton
    provides: "Drizzle/postgres-js `db` singleton (src/lib/db/client.ts), `complaints` schema, drizzle.config.ts with the PostGIS extensionsFilters workaround"
provides:
  - "Installed and configured `better-auth` (Google-only provider) with a single `betterAuth()` server instance in src/lib/auth.ts"
  - "`src/lib/auth-client.ts` browser SDK (createAuthClient) for Plan 02's login button"
  - "`src/app/api/auth/[...all]/route.ts` catch-all Route Handler mounting OAuth redirect/callback/session/sign-out"
  - "Pushed user/session/account/verification tables in the live Postgres DB"
  - "Playwright smoke test proving the drizzleAdapter(db,{provider:'pg'}) round-trips against Postgres (Assumption A1 confirmed)"
affects: [02-02-tracer-write-gate, 02-03-defense-in-depth]

# Tech tracking
tech-stack:
  added: ["better-auth ^1.6.25", "@better-auth/cli ^1.4.21 (devDependency)"]
  patterns:
    - "requireEnv() (src/lib/env.ts) used for all auth env vars (GOOGLE_CLIENT_ID/SECRET) — fail-fast at module load, not raw `!` casts"
    - "Better Auth core tables merged into the single src/lib/db/schema.ts alongside `complaints` (not a separate auth-schema.ts) — one schema source of truth"
    - "drizzle-kit CLI invocations must set DOTENV_CONFIG_PATH=.env.local — drizzle-kit's bundled dotenv only auto-loads `.env` by default, not `.env.local`, and process.env.DATABASE_URL is otherwise unset for CLI-driven commands (Next.js's own env loading doesn't apply to standalone CLI processes)"
    - "@better-auth/cli generate defaults to writing a brand-new auth-schema.ts and OVERWRITES the target file entirely when pointed at an existing schema.ts via --output — never assume it merges; always diff/restore + manually re-merge existing table definitions after running it"

key-files:
  created:
    - src/lib/auth.ts
    - src/lib/auth-client.ts
    - src/app/api/auth/[...all]/route.ts
    - tests/e2e/auth-adapter.spec.ts
    - drizzle/0001_ancient_ironclad.sql
  modified:
    - package.json
    - package-lock.json
    - src/lib/db/schema.ts

key-decisions:
  - "Google is the only social provider (D-01) — no Credentials provider, no phone/otp field, confirmed via negative grep against src/lib/auth.ts"
  - "Kept Better Auth's default singular table names (user/session/account/verification) — did not set usePlural (RESEARCH.md Assumption A3 plugin-table bug)"
  - "Ran drizzle-kit push with DOTENV_CONFIG_PATH=.env.local since the CLI's bundled dotenv does not auto-load .env.local"
  - "Re-applied the documented SRID-4326 fix on complaints.location after every drizzle-kit push (confirmed drizzle-kit 0.31.10's known SRID-dropping bug from Phase 01 recurs on every push, not just the first)"

patterns-established:
  - "Auth env vars sourced via requireEnv(), never raw process.env casts"
  - "Single merged schema.ts (app tables + Better Auth tables) rather than a separate auth-schema.ts file"

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "better-auth and @better-auth/cli installed at pinned versions (1.6.25 / 1.4.21) after human package-legitimacy verification"
    requirement: AUTH-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 checkpoint:human-verify — user typed 'approved' after confirming publisher/repo/downloads on npmjs.com"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/lib/auth.ts wires a single betterAuth() instance to the existing Drizzle/postgres-js db via drizzleAdapter(db,{provider:'pg'}), Google as the only provider, nextCookies() last"
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
      - kind: other
        ref: "grep -nE \"Credentials|phone|otp|next-auth|@auth/\" src/lib/auth.ts (no matches — D-01 negative check)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Better Auth user/session/account/verification tables generated and pushed into the live Postgres database"
    requirement: AUTH-01
    verification:
      - kind: other
        ref: "npx drizzle-kit push (exit 0) + information_schema.tables query confirming account/session/user/verification present"
        status: pass
    human_judgment: false
  - id: D4
    description: "Better Auth session endpoint answers cleanly (200, null session) through the real dev server + Postgres for an unauthenticated request, confirming Assumption A1"
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "tests/e2e/auth-adapter.spec.ts#Better Auth session endpoint answers cleanly through the real server + Postgres (A1)"
        status: pass
    human_judgment: false

# Metrics
duration: ~35min (Task 3 resumption work; excludes the human-action checkpoint wait for env var provisioning)
completed: 2026-07-29
status: complete
---

# Phase 02 Plan 01: Better Auth Foundation Summary

**Better Auth (Google-only) installed and wired to the existing Drizzle/postgres-js `db`, its four core tables pushed to Postgres, and an end-to-end Playwright smoke test proves the adapter round-trips against the real database (Assumption A1 confirmed).**

## Performance

- **Duration:** ~35 min for this resumed session (Task 3 + summary); Task 1-2 completed in a prior session
- **Started (this session):** 2026-07-29T10:04:00Z (approx, resume after checkpoint)
- **Completed:** 2026-07-29T10:11:13Z
- **Tasks:** 3 (Task 1 checkpoint, Task 2, Task 3 — all now complete)
- **Files modified:** 8 (package.json, package-lock.json, src/lib/auth.ts, src/lib/auth-client.ts, src/app/api/auth/[...all]/route.ts, src/lib/db/schema.ts, drizzle/, tests/e2e/auth-adapter.spec.ts)

## Accomplishments
- Better Auth (`better-auth` + `@better-auth/cli`) installed after human package-legitimacy verification (Task 1)
- `src/lib/auth.ts` server config, `src/lib/auth-client.ts` browser SDK, and `src/app/api/auth/[...all]/route.ts` catch-all Route Handler created — Google is the only provider (D-01)
- Better Auth's `user`/`session`/`account`/`verification` tables generated via `@better-auth/cli generate`, merged into the existing `src/lib/db/schema.ts` alongside `complaints`, and pushed into the live Postgres database via `drizzle-kit push`
- `tests/e2e/auth-adapter.spec.ts` added: an unauthenticated `GET /api/auth/get-session` returns `200` with a `null` session through the real dev server + real Postgres, confirming `drizzleAdapter(db, {provider:"pg"})` speaks the correct SQL dialect against the existing postgres-js `db` (Assumption A1)

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify better-auth package legitimacy** - checkpoint:human-verify, no code commit (user typed "approved")
2. **Task 2: Install Better Auth and create server config/browser client/catch-all route** - `3d01fe7` (feat)
3. **Task 3: Generate + push the Better Auth schema, prove adapter round-trips (A1)** - `b912552` (feat)

**Plan metadata:** (this commit) - `docs: complete 02-01 plan`

## Files Created/Modified
- `src/lib/auth.ts` - single `betterAuth()` instance, Google-only, `drizzleAdapter(db,{provider:"pg"})`, `nextCookies()` last
- `src/lib/auth-client.ts` - `createAuthClient()` browser SDK
- `src/app/api/auth/[...all]/route.ts` - `toNextJsHandler(auth)` catch-all handler
- `src/lib/db/schema.ts` - merged Better Auth `user`/`session`/`account`/`verification` tables alongside the existing `complaints` table
- `drizzle/0001_ancient_ironclad.sql` - migration creating the four auth tables + FKs/indexes
- `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json` - drizzle-kit migration bookkeeping
- `tests/e2e/auth-adapter.spec.ts` - A1 + schema-push smoke test
- `package.json`, `package-lock.json` - `better-auth` (dependency), `@better-auth/cli` (devDependency)

## Decisions Made
- Kept Better Auth's default singular table names (no `usePlural`) per RESEARCH.md Assumption A3.
- Ran `drizzle-kit` CLI commands with `DOTENV_CONFIG_PATH=.env.local` since the bundled dotenv in `drizzle-kit` only auto-loads `.env` by default (undocumented in RESEARCH.md — discovered during Task 3 execution).
- Re-applied the manual `ALTER TABLE complaints ALTER COLUMN location TYPE geometry(Point, 4326) USING ST_SetSRID(location, 4326)` fix after `drizzle-kit push`, confirming the Phase 01-documented SRID-dropping bug in drizzle-kit 0.31.10 recurs on every push (not just the first) — captured in the schema.ts in-code comment already, no further action needed beyond re-running the fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@better-auth/cli generate` overwrote schema.ts instead of merging into it**
- **Found during:** Task 3 (schema generation)
- **Issue:** Running `npx @better-auth/cli generate` with no `--output` wrote a brand-new top-level `auth-schema.ts`, not into `src/lib/db/schema.ts` as the plan expected. Re-running with `--output src/lib/db/schema.ts` did generate into the right file, but the CLI **overwrote** the entire file (printed "Schema was overwritten successfully!"), destroying the existing `complaints` table definition and its SRID-workaround comment.
- **Fix:** Deleted the stray `auth-schema.ts`; restored `complaints` from `git show HEAD:src/lib/db/schema.ts` and manually merged it with the CLI-generated `user`/`session`/`account`/`verification` tables (plus their relations) into a single `src/lib/db/schema.ts`, consolidating the drizzle-orm imports.
- **Files modified:** src/lib/db/schema.ts
- **Verification:** `npx tsc --noEmit` exits 0; `complaints` export with its SRID comment intact; all four auth table exports present.
- **Committed in:** `b912552` (Task 3 commit)

**2. [Rule 3 - Blocking] `drizzle-kit push` failed with "Either connection url or host/database are required" despite DATABASE_URL being set in .env.local**
- **Found during:** Task 3 (schema push)
- **Issue:** `drizzle.config.ts` reads `process.env.DATABASE_URL!` directly, and `drizzle-kit`'s bundled dotenv only auto-loads a file literally named `.env` — not `.env.local`, which is where this project's DB credentials live (consistent with Phase 01's convention). The CLI process had no `DATABASE_URL` in its environment at all.
- **Fix:** Ran `drizzle-kit generate`/`push` with `DOTENV_CONFIG_PATH=.env.local` set, which drizzle-kit's bundled dotenv respects, loading the correct file without creating a new `.env` file or hardcoding credentials anywhere.
- **Files modified:** None (invocation-only fix, no source change)
- **Verification:** `npx drizzle-kit push` completed with `[✓] Changes applied`; confirmed via a direct query that `account`/`session`/`user`/`verification` tables exist in `information_schema.tables`.
- **Committed in:** N/A (command invocation, not a file change)

**3. [Rule 1 - Bug] `drizzle-kit push` re-dropped the `complaints.location` SRID to 0 (confirmed recurring, not one-time)**
- **Found during:** Task 3 (schema push) and again during final verification re-run
- **Issue:** As documented in the Phase 01 in-code comment, `drizzle-kit push` silently strips the SRID from `geometry(point, 4326)` down to `geometry(point)`/srid 0 on the live column. This was observed to recur on a second `push` run during the plan's own re-verification step, confirming the bug fires on every push, not only the first.
- **Fix:** Re-ran the documented corrective SQL — `ALTER TABLE complaints ALTER COLUMN location TYPE geometry(Point, 4326) USING ST_SetSRID(location, 4326)` — immediately after each push, verified via `SELECT srid FROM geometry_columns WHERE f_table_name='complaints'` (srid=4326).
- **Files modified:** None (live DB fix only, no schema.ts change — srid:4326 was already declared correctly there per Phase 01)
- **Verification:** `geometry_columns` query confirms `srid=4326` after the fix.
- **Committed in:** N/A (live DB state, no file change to commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug — all required to make the plan's own verification commands (`drizzle-kit push`, the Playwright smoke test) actually pass against the real database). No scope creep — no new features or architecture were added beyond what Task 3 already specified.
**Impact on plan:** All three were necessary corrections to make documented/expected tooling behavior (CLI overwrite quirk, dotenv loading, recurring SRID bug) actually work as the plan assumed; the plan's schema-gate and A1 assumption are both now concretely proven against the live database, not just typechecked.

## Issues Encountered
None beyond the auto-fixed deviations above — all were resolved inline per deviation Rule 1/3 without requiring architectural changes.

## User Setup Required
None further for this plan — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` are already confirmed present in `.env.local` (gitignored, not committed) per the resolved Task 3 precondition checkpoint. A real Google sign-in end-to-end click-through is deferred to Plan 02's UI work / end-of-phase human check, as the plan's `user_setup` block notes.

## Next Phase Readiness
- Plan 02 (tracer write-gate) can now build the `/login` page against `authClient` (`src/lib/auth-client.ts`) and gate writes using real sessions from `src/lib/auth.ts` — both exist and are proven to round-trip against Postgres.
- Plan 03 (defense-in-depth / device-id removal) can proceed once Plan 02's write-gate is live.
- No blockers. The recurring `drizzle-kit push` SRID bug is a known, documented, cheap-to-repeat manual fix (single ALTER statement) — any future `drizzle-kit push` in this project must be followed by the same corrective SQL until a drizzle-kit upgrade fixes it upstream.

---
*Phase: 02-real-authentication-write-gating*
*Completed: 2026-07-29*

## Self-Check: PASSED

All created files confirmed present on disk (src/lib/auth.ts, src/lib/auth-client.ts, src/app/api/auth/[...all]/route.ts, src/lib/db/schema.ts, tests/e2e/auth-adapter.spec.ts, drizzle/0001_ancient_ironclad.sql, this SUMMARY.md) and both task commits (`3d01fe7`, `b912552`) confirmed present in git log.
