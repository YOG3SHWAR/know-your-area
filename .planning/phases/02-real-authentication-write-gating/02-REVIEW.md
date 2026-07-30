---
phase: 02-real-authentication-write-gating
reviewed: 2026-07-30T09:45:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - drizzle/0001_ancient_ironclad.sql
  - package.json
  - src/actions/submit-complaint.ts
  - src/app/api/auth/[...all]/route.ts
  - src/app/api/upload-url/route.ts
  - src/app/capture/page.tsx
  - src/app/login/page.tsx
  - src/components/capture/CaptureClient.tsx
  - src/lib/auth-client.ts
  - src/lib/auth.ts
  - src/lib/db/schema.ts
  - tests/e2e/auth-adapter.spec.ts
  - tests/e2e/auth-fixtures.ts
  - tests/e2e/auth-gate.spec.ts
  - tests/e2e/capture.spec.ts
  - tests/e2e/feed.spec.ts
  - tests/e2e/permalink.spec.ts
  - tests/unit/submit-complaint-sanitization.test.ts
  - tests/unit/upload-url-auth.test.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found_and_fixed
---

## Resolution

Applied manually (not via `--fix`) in commit `bf4cfc0`, verified with `tsc --noEmit`,
`npm run build`, and the full `npm test` suite (64/64 passing) after each fix:

- **CR-01** — fixed. Removed the spurious SRID-stripping statement from
  `drizzle/0001_ancient_ironclad.sql` and corrected the matching `0001_snapshot.json`
  entry. Verified `drizzle-kit check` reports consistent, and confirmed the live DB
  already had the correct SRID (the bug only affected the committed migration file,
  not the running dev environment).
- **WR-01** — fixed. Session check now runs before `photoExists()` in
  `submitComplaint`.
- **WR-02** — fixed. `signIn.social()`'s result/rejection is now handled in
  `src/app/login/page.tsx`, resetting the button on failure.
- **WR-03** — fixed. `BETTER_AUTH_SECRET` now goes through `requireEnv()` in
  `src/lib/auth.ts`, matching the existing Google credentials pattern.
- **IN-01** — not applied. Left as documented below; fixing it changes the error
  message shown to users on non-404 upload failures, which is a caller-side
  behavior call better left for a deliberate follow-up rather than bundled into
  this pass.

# Phase 02: Code Review Report

**Reviewed:** 2026-07-30T09:45:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

This phase wires Better Auth (Google OAuth only), gates `/capture` server-side, and adds
defense-in-depth session checks to `submitComplaint` and `POST /api/upload-url`. The
server-side session gating itself is sound: `/capture` uses a real `auth.api.getSession()`
DB-backed lookup in a Server Component (not a cookie-presence check), both write-adjacent
entry points (`submitComplaint`, `POST /api/upload-url`) independently re-check the session
rather than trusting the page-level gate, and the old client-supplied `device-id` identity
has been fully removed with no leftover references — `submitterId` now always comes from
`session.user.id`. No hardcoded secrets, `eval`, or unsanitized error leaks were found in
the reviewed files.

The one critical defect is not in the auth logic itself but in the migration file this
phase committed alongside the Better Auth schema: it silently strips the SRID constraint
off the `complaints.location` column, which will break every complaint submission on any
environment that applies migrations from this file. Two further warnings concern ordering
of the auth check relative to other work in `submitComplaint`, and an unhandled error path
on the login button that can leave the UI permanently stuck.

## Critical Issues

### CR-01: Committed migration silently drops the SRID constraint on `complaints.location`, breaking every future insert

**File:** `drizzle/0001_ancient_ironclad.sql:49`
**Issue:**
This migration — generated and committed as part of this phase to add the Better Auth
tables — contains an unrelated, spurious statement:

```sql
ALTER TABLE "complaints" ALTER COLUMN "location" SET DATA TYPE geometry(point);
```

The prior migration (`drizzle/0000_next_pete_wisdom.sql:6`) correctly created the column as
`geometry(point, 4326)`. This new statement retypes it to `geometry(point)` with no SRID,
which in PostGIS typmod semantics means the column now *enforces* SRID 0 (not "any SRID").
This is confirmed by `drizzle/meta/0001_snapshot.json`, whose recorded column type for
`location` is literally `"geometry(point)"` — the drift is baked into the migration's source
of truth, not just the SQL text.

Every write path in this codebase inserts via `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`
(`src/actions/submit-complaint.ts:64`, and `src/lib/feed.ts:78` for reads). Once this
migration has been applied in sequence, any such insert will fail with a Postgres error
("Geometry SRID (4326) does not match column SRID (0)") — i.e. `submitComplaint` breaks
entirely, for every user, on any environment (CI, a fresh clone, a new deploy) that runs
these migration files in order rather than the interactive `drizzle-kit push` + manual
verification flow the README documents.

`src/lib/db/schema.ts:23-33` explicitly documents this exact drizzle-kit SRID-dropping bug
and instructs re-running a manual `ALTER TABLE ... SET SRID` fix "after ANY `drizzle-kit
push`" — but that instruction is only ever a code comment (and a matching note in
`README.md:75-78` tied specifically to the `drizzle-kit push` workflow). It is not captured
in the migration file itself, in any script, or in any automated step tied to applying these
committed `.sql` files via `drizzle-kit migrate` — so there is no safety net for that path.

**Fix:** Regenerate this migration so it does not touch `location` at all (it should only
contain the Better Auth table DDL), or explicitly append the SRID back:
```sql
-- remove the spurious retype entirely, OR if it must stay, follow it with:
ALTER TABLE "complaints" ALTER COLUMN "location" TYPE geometry(Point, 4326)
  USING ST_SetSRID(location, 4326);
```
Also verify `drizzle/meta/0001_snapshot.json`'s `location` column entry reflects
`geometry(point, 4326)` afterward so future `drizzle-kit generate` runs diff against the
correct state instead of silently re-dropping the SRID again.

## Warnings

### WR-01: `submitComplaint` does unauthenticated work (a real R2 API call) before checking the session

**File:** `src/actions/submit-complaint.ts:42-58`
**Issue:** The function's own comment (lines 36-40) states it "calls `auth.api.getSession()`
itself and rejects before any work when no valid session is present" — but the actual order
is: zod validation, then `photoExists(parsed.photoKey)` (a real `HeadObjectCommand` call to
R2), and only *then* the session check:
```ts
if (!(await photoExists(parsed.photoKey))) { ... }   // runs first — no auth required
const session = await auth.api.getSession({ headers: await headers() });
if (!session) { throw new Error("You must be signed in to submit a report."); }
```
Any caller that invokes this Server Action directly (bypassing the UI, as the surrounding
comments explicitly anticipate) can trigger a billed/rate-limited external R2 API call with
no session at all, purely by supplying a well-formed `photoKey` string. This phase adds no
rate limiting on this action, so it's an unauthenticated-reachable resource-consumption path
that directly contradicts the "reject before any work" invariant the code documents for
itself.
**Fix:** Move the session check immediately after zod validation, before `photoExists`:
```ts
const parsed = submissionSchema.parse(input);

const session = await auth.api.getSession({ headers: await headers() });
if (!session) {
  throw new Error("You must be signed in to submit a report.");
}
const submitterId = session.user.id;

if (!(await photoExists(parsed.photoKey))) {
  throw new Error("Photo not found — please retake and upload the photo before submitting.");
}
```

### WR-02: Login button can get stuck in "Redirecting…" forever — `signIn.social()`'s result/rejection is never handled

**File:** `src/app/login/page.tsx:43-50`
**Issue:**
```ts
function handleSignIn() {
  setRedirecting(true);
  void authClient.signIn.social({ provider: "google", callbackURL: callbackUrl });
}
```
`setRedirecting(true)` disables the button and shows a permanent spinner, but the call is
fire-and-forget: neither a resolved `{ error }` result (better-auth's client wraps
`better-fetch`, which resolves with `{ data, error }` rather than throwing by default) nor a
rejected promise is ever inspected. In the success path this is fine because the browser
navigates away to Google before it matters — but on any failure that occurs *before* the
redirect fires (network error, a callbackURL rejected by Better Auth's origin-check
middleware, a misconfigured provider, a transient 5xx from `/api/auth/sign-in/social`), the
promise resolves/settles with no visible effect: `redirecting` is never reset to `false`, no
error is shown, and the only way for the user to retry is a full page reload.
**Fix:** Handle both the resolved error and any rejection, and reset the loading state:
```ts
function handleSignIn() {
  setRedirecting(true);
  authClient.signIn.social({ provider: "google", callbackURL: callbackUrl })
    .then(({ error }) => {
      if (error) setRedirecting(false);
    })
    .catch(() => setRedirecting(false));
}
```

### WR-03: `BETTER_AUTH_SECRET` has no explicit fail-fast check, unlike every other auth-critical env var

**File:** `src/lib/auth.ts:12-19`
**Issue:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both loaded via `requireEnv(...)`
(throws immediately at module load if unset — `src/lib/env.ts`), but `betterAuth({...})` here
never passes a `secret` option and never validates `BETTER_AUTH_SECRET` itself. Better Auth's
own internals only hard-fail on a missing/default secret when `NODE_ENV === "production"`
(`node_modules/better-auth/dist/context/create-context.mjs`); outside that exact condition it
silently falls back to a well-known hardcoded default
(`"better-auth-secret-12345678901234567890"`), which would let session cookies be forged by
anyone who knows this public default string. This is inconsistent with the fail-fast pattern
this same file already applies to the Google credentials one line above.
**Fix:** Fail fast the same way the Google credentials do:
```ts
export const auth = betterAuth({
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, { provider: "pg" }),
  ...
```

## Info

### IN-01: `photoExists` collapses every failure mode (including transient/network errors) into "photo not found"

**File:** `src/lib/r2.ts:41-47` (called from `src/actions/submit-complaint.ts:51`)
**Issue:** `photoExists` catches *any* error from the R2 `HeadObjectCommand` call — a genuine
404, a network timeout, an R2 outage, or a credentials/config problem — and returns `false`
in every case. `submitComplaint` then always shows the user "Photo not found — please retake
and upload the photo before submitting.", even when the real photo was uploaded successfully
and the failure was transient/infrastructure-side. This is a minor robustness gap (a user
would be told to redo a step they already completed correctly), not a security issue.
**Fix:** Consider distinguishing a `404`/`NotFound` response from other error types (e.g.
inspect `err.name`/`err.$metadata?.httpStatusCode`) and surfacing a different, retry-oriented
message for non-404 failures.

---

_Reviewed: 2026-07-30T09:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
