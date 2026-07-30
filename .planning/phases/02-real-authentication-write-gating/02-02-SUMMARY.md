---
phase: 02-real-authentication-write-gating
plan: 02
subsystem: auth
tags: [better-auth, next.js, server-component, playwright, e2e-fixtures]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Installed/configured better-auth (Google-only), src/lib/auth.ts + src/lib/auth-client.ts, live Postgres user/session/account/verification tables"
provides:
  - "Async Server Component gate on /capture (auth.api.getSession() + redirect to /login before any client paint — D-04/D-05)"
  - "CaptureClient.tsx — the Phase 1 capture UI moved verbatim, unchanged internals"
  - "/login page: Google-branded sign-in button, loading + error states, per UI-SPEC"
  - "tests/e2e/auth-fixtures.ts — real DB-backed session-seeding Playwright fixture (Better Auth's official testUtils plugin, not a hand-signed cookie)"
  - "tests/e2e/auth-gate.spec.ts — AUTH-01 (anonymous redirect, authed render) + AUTH-03 (survives refresh) e2e coverage"
  - "tests/e2e/capture.spec.ts passing again under the new gate"
affects: [02-03-defense-in-depth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component session gate: async page.tsx calls auth.api.getSession({headers: await headers()}) then redirect() before rendering any client child — first such pattern in the codebase"
    - "e2e session seeding via Better Auth's official testUtils plugin (better-auth/plugins -> testUtils()) on a SEPARATE test-only betterAuth() instance, never the production src/lib/auth.ts — ctx.test.login({userId}) returns ready-to-use Playwright cookie objects"
    - "Playwright test-runner process loads .env.local itself via process.loadEnvFile() when a fixture needs a live DB connection outside the Next.js dev server process"

key-files:
  created:
    - src/components/capture/CaptureClient.tsx
    - src/app/login/page.tsx
    - tests/e2e/auth-fixtures.ts
    - tests/e2e/auth-gate.spec.ts
  modified:
    - src/app/capture/page.tsx
    - tests/e2e/capture.spec.ts

key-decisions:
  - "Used Better Auth's official testUtils plugin (ctx.test.login) for e2e session seeding instead of manually driving internalAdapter.createSession() + hand-signing the cookie — more robust than replicating Better Auth's internal HMAC cookie-signing scheme, and it is the officially documented mechanism for exactly this use case"
  - "Session-seeding uses a SEPARATE, test-only betterAuth() instance (constructed inline in auth-fixtures.ts) rather than importing src/lib/auth.ts — matches the testUtils plugin's own docstring guidance and keeps privileged test-only session-creation helpers out of the production auth config entirely"
  - "auth-fixtures.ts avoids the @/* path alias entirely (imports schema.ts by relative path, duplicates the small buildClientOptions() helper) since Playwright's TS loader resolution of @/lib/env (a transitive import inside src/lib/db/client.ts) was an unverified risk — the plan's own relative-import fallback note was extended to the whole db-connection import chain, not just @/lib/auth"

patterns-established:
  - "Async Server Component gate (Pattern 3, RESEARCH.md) as the standard shape for any future route requiring pre-render auth"
  - "Test-only Better Auth instance + testUtils plugin as the standard e2e session-seeding mechanism for any future gated route's e2e tests"

requirements-completed: [AUTH-01, AUTH-03]

coverage:
  - id: D1
    description: "/capture converted to an async Server Component gate (auth.api.getSession + redirect to /login?callbackUrl=/capture when unauthenticated); CaptureClient.tsx holds the moved-verbatim Phase 1 capture UI"
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "tests/e2e/auth-gate.spec.ts#anonymous visitor is redirected from /capture to /login (AUTH-01)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/auth-gate.spec.ts#authenticated visitor sees the capture UI at /capture (AUTH-01)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/login page renders the Google-branded sign-in button, loading ('Redirecting to Google…') and error states per UI-SPEC Copywriting Contract"
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "tests/e2e/auth-gate.spec.ts#anonymous visitor is redirected from /capture to /login (AUTH-01) — confirms /login is reached and renders (does not assert pixel-level styling/copy)"
        status: pass
    human_judgment: true
    rationale: "The tracer feedback checkpoint (visual verification of /login's copy, button styling, loading/error states against UI-SPEC) was auto-approved by explicit user instruction to consolidate all visual verification at end-of-phase UAT rather than pausing here — exact copy/styling fidelity to UI-SPEC has not been human-verified yet."
  - id: D3
    description: "tests/e2e/auth-fixtures.ts seeds a real, DB-backed Better Auth session per test (Better Auth's official testUtils plugin, not a hand-signed cookie) and composes with fixtures.ts's camera/geolocation grants"
    requirement: AUTH-01
    verification:
      - kind: e2e
        ref: "tests/e2e/auth-gate.spec.ts (authenticated + refresh cases both depend on this fixture)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts (all 5 cases depend on this fixture)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A logged-in session survives a full browser refresh with no re-login (AUTH-03)"
    requirement: AUTH-03
    verification:
      - kind: e2e
        ref: "tests/e2e/auth-gate.spec.ts#session survives a full page refresh (AUTH-03)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Phase 1 capture e2e suite (5 tests) stays green under the new gate"
    verification:
      - kind: e2e
        ref: "npx playwright test tests/e2e/capture.spec.ts (8 tests total incl. G-01 regressions, all pass)"
        status: pass
    human_judgment: false

# Metrics
duration: ~30min (Task 2 in this resumed session; Task 1 completed in a prior session)
completed: 2026-07-30
status: complete
---

# Phase 02 Plan 02: Write-Gate Tracer + Session-Seeding e2e Coverage Summary

**Server Component session gate on /capture (redirect-before-paint), a Google-branded /login page, and a real DB-backed Playwright session fixture built on Better Auth's official testUtils plugin — proven end-to-end for anonymous redirect, authenticated render, and refresh persistence (AUTH-01/AUTH-03).**

## Performance

- **Duration:** ~30 min (this resumed session, Task 2 + summary); Task 1 (tracer: gate + CaptureClient move + /login page) completed and committed in a prior session
- **Started (this session):** 2026-07-30T03:20:00Z (approx, resume after tracer checkpoint)
- **Completed:** 2026-07-30T03:50:24Z
- **Tasks:** 2 (both complete)
- **Files modified:** 6 total across the plan (4 from Task 1, 3 from Task 2 — `tests/e2e/capture.spec.ts` counted once)

## Accomplishments
- `src/app/capture/page.tsx` is now an async Server Component: `auth.api.getSession()` then `redirect("/login?callbackUrl=/capture")` when unauthenticated, otherwise renders `<CaptureClient />` — structurally guarantees no camera/GPS prompt can fire for an anonymous visitor (D-04/D-05)
- `src/components/capture/CaptureClient.tsx` holds the Phase 1 capture UI, moved verbatim
- `src/app/login/page.tsx` — Google-branded sign-in button with loading (`Redirecting to Google…`) and inline error states, "Continue browsing without signing in" escape link
- `tests/e2e/auth-fixtures.ts` — a test-only Better Auth instance (Better Auth's official `testUtils` plugin) seeds a real `user` + `session` row and hands Playwright a ready-to-use, correctly-signed cookie via `ctx.test.login({ userId })`; composed with `fixtures.ts`'s camera/geolocation grants as an auto fixture
- `tests/e2e/auth-gate.spec.ts` — 3 passing cases: anonymous redirect, authenticated render, refresh persistence
- `tests/e2e/capture.spec.ts` now imports the session-seeding fixture; all 5 Phase 1 tests (plus 3 later-added G-01 regression tests, 8 total) pass through the new gate

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end write-gate slice — Server Component gate + CaptureClient move + /login page** - `1a51d5a` (feat, prior session)
2. **Task 2: Session-seeding e2e fixture + auth-gate spec + keep capture.spec green** - `ab3dfb1` (feat, this session)

**Plan metadata:** (this commit) - `docs: complete 02-02 plan`

## Files Created/Modified
- `src/app/capture/page.tsx` - async Server Component gate (no "use client"); `auth.api.getSession` + `redirect`
- `src/components/capture/CaptureClient.tsx` - the moved-verbatim Phase 1 capture UI (client component)
- `src/app/login/page.tsx` - Google-branded sign-in button, loading/error states, escape link (Suspense-wrapped for `useSearchParams`)
- `tests/e2e/auth-fixtures.ts` - test-only Better Auth instance + `testUtils` plugin session-seeding auto fixture
- `tests/e2e/auth-gate.spec.ts` - AUTH-01 (anonymous redirect, authed render) + AUTH-03 (refresh) e2e coverage
- `tests/e2e/capture.spec.ts` - fixture import switched from `./fixtures` to `./auth-fixtures`

## Decisions Made
- Used Better Auth's official `testUtils` plugin (`better-auth/plugins` → `testUtils()`, `ctx.test.login({ userId })`) for e2e session seeding instead of manually driving `internalAdapter.createSession()` and hand-signing the cookie per RESEARCH.md Pitfall 1's suggested (and explicitly flagged-as-version-sensitive) internal-API approach — the plugin is a purpose-built, documented mechanism for exactly this scenario and returns Playwright-`addCookies()`-shaped cookie objects directly.
- The session-seeding instance is a SEPARATE, test-only `betterAuth()` call constructed inline in `auth-fixtures.ts` (never imports `src/lib/auth.ts`) — matches the `testUtils` plugin's own docstring ("prefer including it in a test-only auth instance... instead of a production auth config") and keeps privileged test-only helpers fully out of the production auth surface.
- `auth-fixtures.ts` avoids the `@/*` path alias entirely: it imports `src/lib/db/schema.ts` by relative path and re-declares the small `buildClientOptions()` helper (ssl/prepare options) rather than importing `src/lib/db/client.ts`, since that file's own `@/lib/env` import is a second alias hop whose resolution inside Playwright's TS loader was an unverified risk — extending the plan's own stated relative-import fallback for `@/lib/auth` to the whole DB-connection import chain.
- The Playwright test runner is a separate Node process from the Next.js dev server; `auth-fixtures.ts` calls `process.loadEnvFile(".env.local")` (guarded, `process.env.DATABASE_URL` check first) so `DATABASE_URL`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` are available to construct the test-only Better Auth instance — the dev server's own env loading doesn't extend to this separate process.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright test process had no access to `.env.local`**
- **Found during:** Task 2 (writing `auth-fixtures.ts`)
- **Issue:** Constructing a live Postgres connection + a test-only Better Auth instance inside the Playwright test process requires `DATABASE_URL`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`, but only the `npm run dev` webServer process (spawned separately by `playwright.config.ts`) loads `.env.local` — the Playwright test runner's own Node process does not.
- **Fix:** Added a guarded `process.loadEnvFile(path.resolve(process.cwd(), ".env.local"))` at the top of `auth-fixtures.ts`, only when `process.env.DATABASE_URL` isn't already set (so CI-injected env vars are left untouched).
- **Files modified:** tests/e2e/auth-fixtures.ts
- **Verification:** `npx playwright test tests/e2e/auth-gate.spec.ts tests/e2e/capture.spec.ts` — 11/11 pass.
- **Committed in:** `ab3dfb1` (Task 2 commit)

**2. [Rule 1/discretion - Better available mechanism] Used Better Auth's official `testUtils` plugin instead of the internal API RESEARCH.md flagged as version-sensitive**
- **Found during:** Task 2 (implementing the session-seeding fixture)
- **Issue:** RESEARCH.md Pitfall 1 pointed at `auth.$context.internalAdapter.createSession()` plus manual cookie signing as the fallback approach, explicitly flagging it as an internal, version-sensitive API needing re-confirmation before use.
- **Fix:** Confirmed (via direct read of the installed `better-auth@1.6.25` package source) that Better Auth ships an official `test-utils` plugin (`better-auth/plugins` → `testUtils()`) exposing `ctx.test.login({ userId })`, purpose-built for e2e/integration session seeding and returning correctly HMAC-signed, Playwright-`addCookies()`-shaped cookie objects directly — used this instead of hand-driving `internalAdapter.createSession()` + replicating the cookie-signing scheme.
- **Files modified:** tests/e2e/auth-fixtures.ts
- **Verification:** `npx playwright test tests/e2e/auth-gate.spec.ts tests/e2e/capture.spec.ts` — 11/11 pass; `npx tsc --noEmit` exits 0.
- **Committed in:** `ab3dfb1` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking env-loading fix, 1 discretionary use of a better-documented library mechanism than the plan's suggested fallback)
**Impact on plan:** Both changes are test-infrastructure-only — no production code paths, schema, or auth config were touched beyond what the plan already specified. No scope creep.

## Issues Encountered
None beyond the two items documented above.

## User Setup Required
None - no external service configuration required (Google OAuth credentials were already provisioned in 02-01).

## Next Phase Readiness
- The write-gate tracer is proven end-to-end (anonymous redirect, authenticated render, refresh persistence) with real e2e coverage — Plan 03 (defense-in-depth: `submitComplaint` + `/api/upload-url` session checks) can build directly on this.
- `tests/e2e/auth-fixtures.ts` is now the standard session-seeding mechanism any future gated-route e2e test should reuse.
- Deferred to end-of-phase UAT (per `workflow.human_verify_mode: end-of-phase` and this session's explicit user instruction): visual/UX verification of `/login`'s exact copy, Google-button styling, and loading/error state transitions against UI-SPEC — automated tests confirm the page renders and functions, not pixel-level fidelity.

---
*Phase: 02-real-authentication-write-gating*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: tests/e2e/auth-fixtures.ts
- FOUND: tests/e2e/auth-gate.spec.ts
- FOUND: .planning/phases/02-real-authentication-write-gating/02-02-SUMMARY.md
- FOUND: src/app/login/page.tsx
- FOUND: src/components/capture/CaptureClient.tsx
- FOUND commit: 1a51d5a
- FOUND commit: ab3dfb1
