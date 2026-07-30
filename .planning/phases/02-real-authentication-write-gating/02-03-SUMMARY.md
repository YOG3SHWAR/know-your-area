---
phase: 02-real-authentication-write-gating
plan: 03
subsystem: auth
tags: [better-auth, next.js, server-action, route-handler, playwright, defense-in-depth]

# Dependency graph
requires:
  - phase: 02-02
    provides: "Server Component session gate on /capture, tests/e2e/auth-fixtures.ts (real DB-backed session-seeding Playwright fixture)"
provides:
  - "submitComplaint (Server Action) independently calls auth.api.getSession() and rejects before any DB work when no session is present, writing complaints.submitterId = session.user.id"
  - "POST /api/upload-url independently calls auth.api.getSession() and returns 401 { error: 'unauthorized' } before minting any R2 presigned URL when no session is present"
  - "src/lib/device-id.ts deleted outright — no device-id -> user_id fallback/migration path exists anywhere in the write path (D-03)"
  - "tests/e2e/feed.spec.ts and tests/e2e/permalink.spec.ts carry explicit AUTH-04 'not redirected to /login' assertions on the public browse surfaces"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action / Route Handler defense-in-depth session check: each write-performing handler independently calls auth.api.getSession({ headers: await headers() }) and rejects before any work, rather than relying solely on a page-level Server Component gate — first applied here to submitComplaint and POST /api/upload-url, now the standard for any future write surface"

key-files:
  created:
    - tests/unit/upload-url-auth.test.ts
  modified:
    - src/actions/submit-complaint.ts
    - src/app/api/upload-url/route.ts
    - tests/unit/submit-complaint-sanitization.test.ts
    - tests/e2e/feed.spec.ts
    - tests/e2e/permalink.spec.ts
  deleted:
    - src/lib/device-id.ts

key-decisions:
  - "submitComplaint's no-session rejection is a plain throw new Error('You must be signed in to submit a report.') — not routed through sanitizeError — since the message is developer-authored and inherently safe (matches the existing photoExists throw convention in the same file)"
  - "The no-session unit test uses getSessionMock.mockResolvedValueOnce(null) rather than a separate mock module, keeping the default authenticated mock in place for every other test in the file without needing an afterEach reset"

patterns-established:
  - "Defense-in-depth session check as the standard shape for any future write-performing Server Action or Route Handler: auth.api.getSession({ headers: await headers() }), reject (throw for Server Actions, 401 NextResponse.json for Route Handlers) before any work — never rely on a route-level page gate alone"

requirements-completed: [AUTH-01, AUTH-04]

coverage:
  - id: D1
    description: "submitComplaint (Server Action) independently calls auth.api.getSession() and rejects with 'You must be signed in to submit a report.' before any DB work when no valid session is present, writing complaints.submitterId = session.user.id on success"
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "tests/unit/submit-complaint-sanitization.test.ts#rejects with the no-session message and never calls console.error (pre-DB-insert throw)"
        status: pass
      - kind: unit
        ref: "tests/unit/submit-complaint-sanitization.test.ts#rejects with only the sanitized publish message, logging the raw detail server-side"
        status: pass
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts (all cases publish via submitComplaint through an authenticated auth-fixtures session; suite green)"
        status: pass
      - kind: other
        ref: "grep -rn \"device-id|getOrCreateDeviceId\" src -> no matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/lib/device-id.ts deleted outright with zero remaining importers — no device-id fallback identity anywhere in the write path (D-03)"
    requirement: AUTH-01
    verification:
      - kind: other
        ref: "ls src/lib/device-id.ts -> No such file or directory; grep -rn device-id src -> no matches"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/upload-url independently calls auth.api.getSession() as the first statement and returns 401 { error: 'unauthorized' } before minting any R2 presigned URL when no session is present; an authenticated caller still gets a working presigned URL"
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "tests/unit/upload-url-auth.test.ts#returns 401 { error: 'unauthorized' } when no session is present, without minting a URL"
        status: pass
      - kind: unit
        ref: "tests/unit/upload-url-auth.test.ts#returns 200 with a url and key for an authenticated caller with a valid ext"
        status: pass
    human_judgment: false
  - id: D4
    description: "Anonymous requests to GET /, GET /c/[id], and GET /api/feed return 200 with no redirect to /login and no login prompt (AUTH-04 — public browse stays fully open)"
    requirement: AUTH-04
    verification:
      - kind: e2e
        ref: "tests/e2e/feed.spec.ts#feed page: nearest complaint ranks above a farther one, sorted by proximity (FEED-01) — includes 'not redirected to /login' assertion"
        status: pass
      - kind: e2e
        ref: "tests/e2e/permalink.spec.ts#permalink page: renders the correct complaint at /c/{id} (FEED-04) — includes 'not redirected to /login' assertion"
        status: pass
      - kind: other
        ref: "grep -rnE getSession src/app/page.tsx src/app/c src/app/api/feed -> no matches"
        status: pass
    human_judgment: false

# Metrics
duration: ~35min
completed: 2026-07-30
status: complete
---

# Phase 02 Plan 03: Write-Gate Defense-in-Depth Summary

**Both write-performing surfaces (submitComplaint Server Action, POST /api/upload-url Route Handler) now independently call auth.api.getSession() and reject before any work when unauthenticated; the write identity is the real Better Auth session.user.id with the Phase 1 device-id stub deleted outright and zero fallback path, while the public feed/permalink stay reachable anonymously with explicit no-redirect e2e proof (AUTH-04).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-30T04:01:49Z (approx, file-read start)
- **Completed:** 2026-07-30T04:36:00Z (approx)
- **Tasks:** 2 (both complete)
- **Files modified:** 6 (2 deleted/modified production files, 1 new unit test, 2 modified unit/e2e test files, 2 modified e2e specs — `tests/unit/submit-complaint-sanitization.test.ts` and the two e2e specs counted once each)

## Accomplishments
- `src/actions/submit-complaint.ts` calls `auth.api.getSession({ headers: await headers() })` as its first identity-resolution step, throwing `"You must be signed in to submit a report."` when no session exists, and writes `submitterId = session.user.id` on success — the Phase 1 `kya_device_id` stub is gone with no reconciliation/migration (D-03)
- `src/lib/device-id.ts` deleted outright; `grep -rn "device-id|getOrCreateDeviceId" src` confirms zero remaining references
- `src/app/api/upload-url/route.ts`'s `POST` handler calls the same session check as its first statement, returning `401 { error: "unauthorized" }` before any body-parsing or R2 presign work when unauthenticated — an anonymous caller can no longer mint a real presigned PUT URL
- `tests/unit/upload-url-auth.test.ts` (new) proves both the 401-without-session and 200-with-session-and-valid-ext paths
- `tests/unit/submit-complaint-sanitization.test.ts` mock re-pointed from `@/lib/device-id` to `@/lib/auth` + `next/headers`, with a new "no session → rejects, never logs" test case
- `tests/e2e/feed.spec.ts` and `tests/e2e/permalink.spec.ts` each carry an explicit `not.toHaveURL(/\/login/)` assertion proving the public browse surfaces never redirect to login (AUTH-04) — their fixture import (`./auth-fixtures`, switched in the prior hotfix commit `e25e770` so the publish-then-verify flow in these specs can still reach the now-gated `/capture` page) was preserved unchanged
- Full suite green: `npm test` (44 unit + 20 e2e, all pass), `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap submitComplaint to the real session identity, delete device-id, update its unit test** - `8f390b5` (feat)
2. **Task 2: Gate /api/upload-url with a 401 session check + AUTH-04 anonymous-browse assertions** - `e6fd702` (feat)

**Plan metadata:** (this commit) - `docs: complete 02-03 plan`

## Files Created/Modified
- `src/actions/submit-complaint.ts` - session-gated identity resolution (`auth.api.getSession` -> `session.user.id`), device-id import removed
- `src/lib/device-id.ts` - deleted (Phase 1 `kya_device_id` stub, fully superseded)
- `tests/unit/submit-complaint-sanitization.test.ts` - mock re-pointed to `@/lib/auth` + `next/headers`; added no-session rejection case
- `src/app/api/upload-url/route.ts` - 401 session guard added as the first statement in `POST`, before body parsing
- `tests/unit/upload-url-auth.test.ts` - new: 401-without-session and 200-with-session unit coverage
- `tests/e2e/feed.spec.ts` - added AUTH-04 "not redirected to /login" assertion
- `tests/e2e/permalink.spec.ts` - added AUTH-04 "not redirected to /login" assertion

## Decisions Made
- The no-session rejection message in `submitComplaint` is a plain `throw new Error(...)` (not routed through `sanitizeError`) since it's a fixed, developer-authored, inherently safe string — matches the file's existing `photoExists` throw convention exactly, per PATTERNS.md guidance.
- `getSessionMock.mockResolvedValueOnce(null)` used for the single no-session test case in `submit-complaint-sanitization.test.ts`, keeping the module-level mock's default authenticated resolution intact for every other test without needing an `afterEach` reset.

## Deviations from Plan

None — plan executed exactly as written. The one contextual adjustment (both e2e specs already importing `./auth-fixtures` rather than `./fixtures`, per the pre-existing hotfix commit `e25e770`) was explicitly flagged in this plan's `<important_context>` and preserved as instructed, not a deviation from the plan itself.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both write-performing surfaces are now independently session-gated with no fallback identity path; AUTH-01 and AUTH-04 are both proven by automated tests (unit + e2e).
- This closes out Phase 02 (real-authentication-write-gating) — all 3 plans complete. Ready for `/gsd-verify-work` and end-of-phase UAT (per `workflow.human_verify_mode: end-of-phase`), which should also cover the deferred visual/UX verification of `/login` from 02-02's summary.
- No new blockers introduced. The phase's existing flagged spikes (AI provider cost benchmarking, Nominatim geocoding accuracy, dedup radius false-positive rate) remain scoped to future phases as already recorded in STATE.md.

---
*Phase: 02-real-authentication-write-gating*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/actions/submit-complaint.ts
- FOUND: src/app/api/upload-url/route.ts
- FOUND: tests/unit/upload-url-auth.test.ts
- FOUND: tests/unit/submit-complaint-sanitization.test.ts
- FOUND: tests/e2e/feed.spec.ts
- FOUND: tests/e2e/permalink.spec.ts
- CONFIRMED DELETED: src/lib/device-id.ts
- FOUND commit: 8f390b5
- FOUND commit: e6fd702
