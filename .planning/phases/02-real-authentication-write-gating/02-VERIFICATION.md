---
phase: 02-real-authentication-write-gating
verified: 2026-07-30T09:52:00Z
status: passed
score: 12/15 must-haves verified
behavior_unverified: 3
overrides_applied: 0
human_verification:

  - test: "Click 'Sign in with Google' on /login with real Google credentials (not the e2e testUtils-seeded fixture session) and complete the actual OAuth consent flow, then confirm the browser lands back on /capture authenticated."
    expected: "Google's consent screen appears, approving it returns the browser to /capture with a working session; signing in again with the same Google account does not create a second user row (Better Auth's account table is keyed by provider+accountId)."
    why_human: "Every automated test in this phase (auth-gate.spec.ts, auth-adapter.spec.ts, capture.spec.ts) seeds a session via Better Auth's testUtils plugin or an unauthenticated request — none of them drive an actual Google OAuth redirect/callback round trip. The real external-IdP hop (T-02-02 in the plan's own threat model) has never been exercised end-to-end."

  - test: "Click 'Sign in with Google' on /login and observe the button state transition."
    expected: "The button immediately disables and the Google 'G' logo is replaced by a spinner + 'Redirecting to Google…' label before the browser navigates away, per UI-SPEC."
    why_human: "The code path (setRedirecting(true) before the async call) is present and typechecks, but no test asserts the visual spinner swap or timing — this phase's tracer/UI checkpoints were auto-approved without a human looking at the rendered browser (explicit user instruction to defer all visual/functional checkpoints to end-of-phase)."

  - test: "Force a failed OAuth callback (deny consent on Google's screen, or otherwise trigger onAPIError.errorURL) and observe /login."
    expected: "The page shows 'Something went wrong signing you in. Please try again.' in destructive/red styling above a still-clickable 'Sign in with Google' button — no raw 500 or blank page."
    why_human: "No automated test exercises the error-callback path (no test navigates to /login?error=... or forces a real provider failure); the rendering code exists and was code-reviewed, but the actual error-state UI has not been observed by a human, and the async-rejection handling added in the review fix (WR-02) has no test coverage for the error branch specifically."
gaps: []
---

# Phase 2: Real Authentication & Write-Gating Verification Report

**Phase Goal:** Replace the stub identity with a real Google OAuth account normalized to one internal `user_id`, gate all write actions behind login, and keep feed browsing fully anonymous. Phone OTP (AUTH-02) is deferred out of this phase.
**Verified:** 2026-07-30T09:52:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `better-auth`/`@better-auth/cli` installed at audited, pinned versions after a human legitimacy check | ✓ VERIFIED | `package.json`: `"better-auth": "^1.6.25"`, `"@better-auth/cli": "^1.4.21"`; 02-01-SUMMARY records the blocking-human checkpoint was answered "approved" |
| 2 | Single `betterAuth()` instance wired to existing `db` via `drizzleAdapter(db,{provider:'pg'})`, Google as the ONLY provider | ✓ VERIFIED | `src/lib/auth.ts:12-38` — one `betterAuth()` call, `drizzleAdapter(db,{provider:"pg"})`, `socialProviders.google` only; `grep -nE "Credentials\|phone\|otp\|next-auth\|@auth/" src/lib/auth.ts` returns no matches |
| 3 | Better Auth `user`/`session`/`account`/`verification` tables exist in the live Postgres DB (pushed, not just declared) | ✓ VERIFIED | `src/lib/db/schema.ts` exports all four tables; `tests/e2e/auth-adapter.spec.ts` re-run live against real dev server + Postgres passed (session endpoint does a DB read) |
| 4 | Session endpoint answers over HTTP through the real server + Postgres with no dialect/driver error (A1) | ✓ VERIFIED | Ran `npx playwright test tests/e2e/auth-adapter.spec.ts` myself — 1/1 passed in 2.6s against the live dev server + DB |
| 5 | Anonymous visitor hitting `/capture` is redirected to `/login?callbackUrl=/capture` by a Server Component check BEFORE any client paint — no camera/GPS prompt, no flash of gated content | ✓ VERIFIED | `src/app/capture/page.tsx` has no `"use client"`, is `async`, calls `getSession` then `redirect()` unconditionally before rendering `<CaptureClient/>` (structural guarantee); ran `tests/e2e/auth-gate.spec.ts` "anonymous visitor is redirected..." myself — passed |
| 6 | A visitor completes real Google sign-in via `authClient.signIn.social`, returns to callbackUrl, and each distinct Google account maps to exactly one internal user row | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code is present and wired (`src/app/login/page.tsx:52` calls `signIn.social`), but every automated test seeds a session via Better Auth's `testUtils` plugin or tests the unauthenticated path — none exercises a real Google OAuth redirect/callback round trip. See Human Verification #1. |
| 7 | With a valid session, `/capture` renders `CaptureClient` (the Phase 1 capture UI) unchanged | ✓ VERIFIED | Ran `tests/e2e/auth-gate.spec.ts` "authenticated visitor sees the capture UI..." myself — passed; `CaptureClient.tsx` confirmed as the moved-verbatim body (PermissionGate, handlePublish, etc. intact) |
| 8 | A logged-in visitor stays logged in across a full browser refresh (AUTH-03) | ✓ VERIFIED | Ran `tests/e2e/auth-gate.spec.ts` "session survives a full page refresh..." myself — passed |
| 9 | Clicking "Sign in with Google" immediately disables the button and swaps to a "Redirecting to Google…" spinner state before navigation | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `src/app/login/page.tsx:43-58` sets `redirecting` before the async call and conditionally renders `Loader2` — code present, typechecks, but no test or human observation confirms the actual visual transition. See Human Verification #2. |
| 10 | A failed OAuth callback routes back to `/login` (never a raw 500/blank page) with inline error copy, button still clickable | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `onAPIError.errorURL: "/login"` in `auth.ts` and the `error &&` block in `login/page.tsx:70-74` are present, but no test triggers this path and no human has observed the rendered error state. See Human Verification #3. |
| 11 | An already-authenticated visitor navigating to `/login` sees the page render again (no auto-redirect-away) | ✓ VERIFIED | `src/app/login/page.tsx` contains no session check or redirect logic at all — structurally always renders regardless of auth state (matches RESEARCH.md Open Question 1's stated default) |
| 12 | `submitComplaint` and `POST /api/upload-url` each independently call `getSession()` and reject before doing work when unauthenticated (defense-in-depth) | ✓ VERIFIED | `src/actions/submit-complaint.ts:44-47` (session check now runs before `photoExists`, confirming the WR-01 review fix); `src/app/api/upload-url/route.ts:30-33` (first statement in POST); unit tests re-run myself — 44/44 passed including both no-session cases |
| 13 | `submitComplaint` writes `submitterId = session.user.id`; `device-id.ts` deleted with zero importers | ✓ VERIFIED | `src/actions/submit-complaint.ts:48`; `ls src/lib/device-id.ts` → No such file; `grep -rn "device-id\|getOrCreateDeviceId" src` → no matches |
| 14 | `POST /api/upload-url` returns 401 `{error:"unauthorized"}` for an unauthenticated caller | ✓ VERIFIED | Code confirmed + `tests/unit/upload-url-auth.test.ts` re-run myself — both cases (401 no-session, 200 with session) passed |
| 15 | Anonymous `GET /`, `GET /c/[id]`, `GET /api/feed` return 200 with no redirect to `/login` (AUTH-04) | ✓ VERIFIED | `grep -rnE "getSession" src/app/page.tsx src/app/c src/app/api/feed` → no matches; ran `tests/e2e/feed.spec.ts`, `permalink.spec.ts`, `search.spec.ts` myself — all passed, including the explicit `not.toHaveURL(/\/login/)` assertions added in this phase |

**Score:** 12/15 truths verified (3 present + wired, behavior-unverified — routed to human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/auth.ts` | Single `betterAuth()`, Google-only, drizzleAdapter, nextCookies() last | ✓ VERIFIED | Confirmed via `gsd-tools verify.artifacts` + manual read |
| `src/lib/auth-client.ts` | `createAuthClient()` browser SDK | ✓ VERIFIED | Exists, exports `authClient` |
| `src/app/api/auth/[...all]/route.ts` | `toNextJsHandler(auth)` catch-all | ✓ VERIFIED | `export const { GET, POST } = toNextJsHandler(auth)` confirmed |
| `src/lib/db/schema.ts` | Auth tables merged with `complaints` | ✓ VERIFIED | `user`/`session`/`account`/`verification`/`complaints` all present |
| `tests/e2e/auth-adapter.spec.ts` | A1 smoke test | ✓ VERIFIED | Re-run live, passed |
| `src/app/capture/page.tsx` | Server Component gate | ✓ VERIFIED | No `"use client"`, calls `redirect()` |
| `src/components/capture/CaptureClient.tsx` | Moved-verbatim capture UI | ✓ VERIFIED | `"use client"`, PermissionGate/handlePublish intact |
| `src/app/login/page.tsx` | Google sign-in UI | ✓ VERIFIED | Renders heading, button, error state, escape link |
| `tests/e2e/auth-fixtures.ts` | Session-seeding fixture | ✓ VERIFIED | Uses Better Auth's official `testUtils` plugin, cascades cleanup |
| `tests/e2e/auth-gate.spec.ts` | AUTH-01/AUTH-03 e2e coverage | ✓ VERIFIED | 3 cases, all re-run live and passed |
| `src/actions/submit-complaint.ts` | Session-gated submit | ✓ VERIFIED | `getSession` before `photoExists`; `submitterId = session.user.id` |
| `src/app/api/upload-url/route.ts` | 401-gated presign | ✓ VERIFIED | `getSession` first statement, 401 on null |
| `tests/unit/upload-url-auth.test.ts` | 401-without-session proof | ✓ VERIFIED | Re-run, both cases pass |

All 13 artifact-level checks from `gsd-tools query verify.artifacts` returned `passed: true` for all three plans (5/5, 5/5, 3/3).

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/lib/auth.ts` | `src/lib/db/client.ts` | `drizzleAdapter(db, {provider:'pg'})` | ✓ WIRED | Confirmed manually (`gsd-tools query verify.key-links` reported a false negative due to a double-escaped regex bug in the tool itself — `grep -n "drizzleAdapter(db" src/lib/auth.ts` confirms the pattern is present at line 21) |
| `src/app/api/auth/[...all]/route.ts` | `src/lib/auth.ts` | `toNextJsHandler(auth)` | ✓ WIRED | Confirmed manually — file body is exactly `export const { GET, POST } = toNextJsHandler(auth)` |
| `src/app/login/page.tsx` | `src/lib/auth-client.ts` | `authClient.signIn.social(...)` | ✓ WIRED | Confirmed manually — same tool false-negative as above; `grep -n "signIn\.social" src/app/login/page.tsx` line 52 |
| `src/actions/submit-complaint.ts` | `src/lib/auth.ts` | `session.user.id` | ✓ WIRED | Confirmed manually — same tool false-negative; line 48 |
| `src/app/api/upload-url/route.ts` | `src/lib/auth.ts` | `getSession()` guard → 401 | ✓ WIRED | Tool reported this one as verified directly |

**Note on tooling:** `gsd-tools query verify.key-links` reported 3 of 5 links as unverified due to an apparent double-escaping bug in its own regex handling (e.g. `"Invalid regex pattern: drizzleAdapter\\\\(\\\\s*db"` — the pattern string itself is malformed by the tool, not absent from source). All 5 links were independently confirmed present via direct `grep`/file read against the actual source files, so this is a tooling artifact, not a phase gap.

### Behavioral Spot-Checks / Live Test Runs

Rather than trusting SUMMARY.md's test-pass claims, the full suite was re-run live in this verification pass:

| Suite | Command | Result | Status |
|-------|---------|--------|--------|
| TypeScript | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| Unit tests | `npm run test:unit` (vitest) | 9 files, 44/44 tests passed | ✓ PASS |
| e2e (auth-adapter + auth-gate) | `npx playwright test tests/e2e/auth-adapter.spec.ts tests/e2e/auth-gate.spec.ts` | 4/4 passed against live dev server + Postgres | ✓ PASS |
| e2e (full suite) | `npx playwright test` | 20/20 passed | ✓ PASS |

This confirms the 02-03-SUMMARY.md claim of "44 unit + 20 e2e, all pass" is accurate as of this verification, not just as claimed.

### Code Review Fix Verification (02-REVIEW.md, applied in commit `bf4cfc0`)

| Finding | Claimed Fix | Verified in Current Code |
|---------|-------------|---------------------------|
| CR-01 (Critical): migration silently drops SRID on `complaints.location` | Removed spurious `ALTER COLUMN location` statement from `drizzle/0001_ancient_ironclad.sql`; corrected `0001_snapshot.json` | ✓ CONFIRMED — `grep "location" drizzle/0001_ancient_ironclad.sql` returns nothing; `drizzle/meta/0001_snapshot.json` shows `"type": "geometry(point, 4326)"` |
| WR-01: session check runs after an unauthenticated R2 call (`photoExists`) | Moved session check before `photoExists` in `submitComplaint` | ✓ CONFIRMED — `src/actions/submit-complaint.ts:44-58`: `getSession()` at line 44, `photoExists()` at line 58 |
| WR-02: `signIn.social()` fire-and-forget, button can get stuck "Redirecting…" forever | Handle both `{error}` result and rejection, reset `redirecting` | ✓ CONFIRMED — `src/app/login/page.tsx:52-57`: `.then(({error}) => {...}, () => setRedirecting(false))` |
| WR-03: `BETTER_AUTH_SECRET` has no fail-fast check | Route through `requireEnv("BETTER_AUTH_SECRET")` | ✓ CONFIRMED — `src/lib/auth.ts:20`: `secret: requireEnv("BETTER_AUTH_SECRET")` |
| IN-01 (Info, not fixed by design decision) | `photoExists` collapses all failures to "not found" — left as-is per review's own resolution note | ✓ CONFIRMED unfixed, matches the documented decision not to bundle it into this pass |

### Cross-Plan Regression Fix Verification (commit `e25e770`)

| Claim | Verified |
|-------|----------|
| `feed.spec.ts`, `permalink.spec.ts`, `search.spec.ts` switched from `./fixtures` to `./auth-fixtures` after `/capture` became gated | ✓ CONFIRMED — all three files' first/third import line reads `import { expect, test } from "./auth-fixtures";` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AUTH-01 | 02-01, 02-02, 02-03 | Sign up/log in via Google OAuth | ⚠️ Mostly satisfied — mechanism (button, redirect, session creation, defense-in-depth gates) fully verified; real end-to-end Google OAuth click-through not yet human-verified | See Truth #6 / Human Verification #1 |
| AUTH-03 | 02-02 | Session persists across refresh | ✓ SATISFIED | Truth #8, live e2e re-run |
| AUTH-04 | 02-02, 02-03 | Browse feed without logging in | ✓ SATISFIED | Truth #15, live e2e re-run + grep negative check |
| AUTH-02 | (none — deferred) | Phone OTP | Not applicable this phase | Correctly deferred; REQUIREMENTS.md traceability already marks it "Unscheduled/Deferred"; no scaffold code found (grep clean) |

No orphaned requirements — REQUIREMENTS.md's Phase 2 mapping (AUTH-01, AUTH-03, AUTH-04) exactly matches the union of `requirements:` fields declared across the three plans.

### Anti-Patterns Found

None. Scanned all 14 files touched by this phase for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` and empty-implementation patterns — zero matches. No debt markers.

### Prohibitions (must_haves.prohibitions)

| Statement | Source Plan | Disposition |
|-----------|-------------|-------------|
| No account-linking/merge logic (D-02) | 02-01 | Judgment-tier, non-authoritative — `grep`-based review of `src/lib/auth.ts` found no linking/merge code, and since Google is the only configured provider this phase there is no second-provider linking surface to misfire. **Flagged: human review recommended** before phone OTP (Phase X, deferred) reopens this question, per D-02's own note. |
| Write-gate must never be bypassable via a device-id fallback | 02-03 | Test-tier — resolved. `grep -rn "device-id\|getOrCreateDeviceId" src` returns no matches; the module is deleted. |
| Auth must never be added to public browse surfaces (`/`, `/c/[id]`, `/api/feed`) | 02-02, 02-03 | Test-tier — resolved. `grep -rnE "getSession" src/app/page.tsx src/app/c src/app/api/feed` returns no matches; live e2e confirms 200/no-redirect. |

### Human Verification Required

See `human_verification` in frontmatter for full detail. Summary:

1. **Real Google OAuth click-through** — no test in this phase drives an actual Google consent screen; only Better Auth's `testUtils`-seeded fixture sessions were exercised. AUTH-01's core mechanism (redirect, session creation, defense-in-depth gating) is proven, but the literal "user clicks Sign in with Google, completes consent, lands back authenticated, one row per account" flow has not been observed end-to-end with real credentials.
2. **Sign-in button loading-state visual transition** ("Redirecting to Google…" spinner swap) — code present, not human-observed.
3. **Failed-OAuth-callback error UI** — code present, not exercised by any test or human.

These were explicitly deferred to end-of-phase per the user's own instruction to consolidate visual/functional checkpoints, and per 02-02-SUMMARY.md's own "Next Phase Readiness" note ("automated tests confirm the page renders and functions, not pixel-level fidelity"). Do not treat prior tracer-checkpoint auto-approvals as if a human had looked at the browser — none did.

### Gaps Summary

No gaps. All 15 must-have truths are either fully VERIFIED with live-re-run evidence, or PRESENT_BEHAVIOR_UNVERIFIED (code present, correctly wired, typechecked, and code-reviewed — but the specific runtime/visual behavior has genuinely never been observed by an automated test or a human). The phase's core architectural claims (server-side session gate before any client paint, defense-in-depth on both write surfaces, device-id fully removed, anonymous browse untouched) are all confirmed by live test execution performed in this verification pass, not by trusting SUMMARY.md claims. The one Critical and three Warning code-review findings are all confirmed fixed in the current codebase. The remaining open items are exclusively human-observable behaviors (live OAuth round-trip, visual loading/error states) that no prior checkpoint in this execution actually exercised with a human present.

---

_Verified: 2026-07-30T09:52:00Z_
_Verifier: Claude (gsd-verifier)_
