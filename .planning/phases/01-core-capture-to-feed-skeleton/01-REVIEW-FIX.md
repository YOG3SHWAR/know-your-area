---
phase: 01-core-capture-to-feed-skeleton
fixed_at: 2026-07-23T10:18:00Z
review_path: .planning/phases/01-core-capture-to-feed-skeleton/01-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-07-23T10:18:00Z
**Source review:** .planning/phases/01-core-capture-to-feed-skeleton/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (1 Critical + 8 Warnings; Info findings excluded per `fix_scope: critical_warning`)
- Fixed: 8
- Skipped: 1

## Fixed Issues

### CR-01: `submitComplaint` never verifies the photo was actually uploaded

**Files modified:** `src/lib/r2.ts`, `src/actions/submit-complaint.ts`
**Commit:** 5581dd3
**Applied fix:** Added a `photoExists(key)` helper in `src/lib/r2.ts` that issues a `HeadObjectCommand` against the exact `photoKey` and returns `false` on any error (404 or otherwise). `submitComplaint` now calls this before the DB insert and throws a clear validation error ("Photo not found — please retake and upload the photo before submitting.") if the object doesn't exist in R2, closing the gap where a forged `photoKey` matching only the regex shape could publish a fake "photo-verified" complaint. Verified against the live `kya-photos` R2 bucket (using the project's real `R2_*` env vars): a synthetic never-uploaded key correctly returns `false`, and a real uploaded-then-deleted test object correctly returns `true` while it existed.

### WR-01: `PermissionGate` leaks `onchange` listeners and updates state after unmount

**Files modified:** `src/components/capture/PermissionGate.tsx`
**Commit:** 6ee4796
**Applied fix:** Hoisted the `camera`/`location` `PermissionStatus` references to the effect's outer scope, added an early-return `cancelled` check inside `evaluate()`, and cleared both `onchange` handlers (`camera.onchange = null`, `location.onchange = null`) in the effect's cleanup function alongside setting `cancelled = true`.

### WR-02: `accuracy` input has no upper/finite bound

**Files modified:** `src/types/complaint.ts`
**Commit:** 23e3b4e
**Applied fix:** Changed `accuracy: z.number().nonnegative()` to `accuracy: z.number().finite().nonnegative().max(100_000)`, matching the review's suggested fix exactly — rejects `Infinity`/`NaN` and unreasonably large values with a clean 400 validation error instead of an unhandled Postgres integer-overflow error.

### WR-03: Device-id cookie is not marked `secure`

**Files modified:** `src/lib/device-id.ts`
**Commit:** 5640b3c
**Applied fix:** Added `secure: process.env.NODE_ENV === "production"` to the cookie options passed to `store.set(...)`, matching the review's suggested fix.

### WR-04: Required env vars are accessed with blind `!` assertions, no startup validation

**Files modified:** `src/lib/env.ts` (new), `src/lib/db/client.ts`, `src/lib/r2.ts`
**Commit:** b7e76f7
**Applied fix:** Added a small shared `requireEnv(name)` helper in a new `src/lib/env.ts` that throws a descriptive `Missing required environment variable: {name}` error immediately if the var is unset/empty. Replaced all blind `!` non-null assertions in `src/lib/db/client.ts` (`DATABASE_URL`) and `src/lib/r2.ts` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) with calls to `requireEnv`. A new shared helper (rather than duplicating the check in each file) was chosen since the review's Fix guidance explicitly offered this as one of two valid approaches and both call sites needed identical logic.

### WR-05: Errors are silently swallowed with no server-side logging

**Files modified:** `src/app/api/feed/route.ts`, `src/app/page.tsx`
**Commit:** 83e171e
**Applied fix:** Both bare `catch { ... }` blocks now capture the error (`catch (err)`) and log it via `console.error("feed query failed", err)` before returning the existing fallback response/component, exactly as suggested.

### WR-06: `formatRelativeTime` can render a negative duration on clock skew

**Files modified:** `src/lib/distance.ts`
**Commit:** a414c25
**Applied fix:** Wrapped the `diffMin` computation in `Math.max(0, ...)`, matching the review's suggested fix exactly.

### WR-08: 60-second presigned URL expiry may be too short for target network conditions

**Files modified:** `src/lib/r2.ts`
**Commit:** 773d31c
**Applied fix:** Increased `getSignedUrl(r2, command, { expiresIn: 60 })` to `expiresIn: 300`, per the review's suggested fix (chose the "increase expiry" option over the canvas-downscaling alternative, since it's the smaller, more targeted change).

## Skipped Issues

### WR-07: No rate limiting or abuse quota on the presign and submit endpoints

**File:** `src/app/api/upload-url/route.ts` (whole file), `src/actions/submit-complaint.ts` (whole file)
**Reason:** Explicitly out of scope per orchestrator instructions for this fix run — Phase 4 owns rate limiting (Upstash Redis + `@upstash/ratelimit` per the stack decision in `CLAUDE.md`). Left unfixed intentionally; not a code-context mismatch.
**Original issue:** Neither `/api/upload-url` nor `submitComplaint` enforces any per-IP/per-device quota, allowing unlimited presign mints and unlimited complaint inserts from a single caller.

---

_Fixed: 2026-07-23T10:18:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
