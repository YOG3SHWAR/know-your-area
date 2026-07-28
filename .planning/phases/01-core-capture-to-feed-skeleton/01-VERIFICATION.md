---
phase: 01-core-capture-to-feed-skeleton
verified: 2026-07-28T13:35:00Z
status: passed
score: 21/22 must-haves verified (21 VERIFIED, 0 FAILED, 1 human-only/infra-pending)
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 19/22 (prior pass, after plan 01-11, before plan 01-12 gap-closure landed)
  gaps_closed:

    - "G-01-CR-01 / VERIFICATION gap 1: submitComplaint no longer rethrows a raw DB/driver error across the Server Action boundary. Independently re-verified (not trusted from SUMMARY.md): read src/lib/sanitize-error.ts directly — it is a pure function that ALWAYS returns the caller-supplied fallback string and never the caught error's own message, logging real detail (name/message/code) via console.error under a context label. Read src/actions/submit-complaint.ts directly — both the insert-catch (line ~78) and the exhausted-ids throw (line ~85) now wrap the raw error through sanitizeError(err, SANITIZED_PUBLISH_MESSAGE, ...) before throwing, and the photoExists validation throw (a deliberate user message, not a passthrough) is untouched. Read src/app/capture/page.tsx directly — the publish catch no longer reads err.message at all; it calls setError(sanitizeError(err, \"Couldn't publish your report. Check your connection and try again.\", \"publish failed\")) unconditionally. Ran tests/unit/submit-complaint-sanitization.test.ts myself: it mocks a raw non-unique-violation DB error containing a distinctive marker (RAW_DRIVER_LEAK), asserts submitComplaint rejects with only the fixed sanitized string (marker absent from the rejection) while the marker IS present in the console.error log — passed. Also independently confirmed via a freshly re-run 01-REVIEW.md (dated 2026-07-28, HEAD d38c24b): 0 Critical findings, explicitly noting 'submitComplaint and every other UI-facing catch site now route through the shared sanitizeError() utility.'"
    - "G-01-WR-08 / VERIFICATION gap 2: the permalink page (/c/[id]) now renders the same category-colored placeholder tile as FeedCard on a photo 404, not a bare broken-image box. Independently re-verified: read src/components/feed/ComplaintPhoto.tsx directly — a new 'use client' component with an imgError useState, onError={() => setImgError(true)} on the <Image>, and a CATEGORY_TILE_STYLES-colored tile + lucide icon (data-testid=\"photo-fallback\") when imgError fires — replicated verbatim from FeedCard.tsx (which remains untouched). Read src/app/c/[id]/page.tsx directly — the inline <Image> block has been replaced by <ComplaintPhoto src=... category=... alt=... />. Ran the new e2e test myself (tests/e2e/permalink.spec.ts:46, 'a 404 photo renders the category-tile fallback, not a broken image (FEED-04/WR-08)'): it publishes a real complaint, THEN registers a page.route 404 interceptor scoped to /complaints/** (after publish, so the real upload PUT is never intercepted), navigates to the permalink, and asserts getByTestId('photo-fallback') is visible plus the category label still renders — passed (11.1-20.3s across runs)."
  gaps_remaining:

    - "G-01-2's infra half (R2 bucket CORS AllowedOrigins actually updated to include https://knowyourarea.in) and its live-production real-device confirmation remain open — see human_verification below. Declared user_setup/human-only since 01-11-PLAN.md (the coding agent has no R2 credentials); explicitly out of scope for plan 01-12, which did not touch it."
    - "iOS Safari real-device orientation/legibility check (01-UAT.md test 2) remains open — 01-UAT.md is unchanged since the prior verification pass; the test's recorded result: issue still reflects the CORS bug blocking the tester before a captured photo could even be seen on production, not a genuine orientation/legibility finding. Must be re-attempted once the R2 CORS item above is unblocked."
  regressions: []
gaps: []
deferred: []
behavior_unverified_items: []
human_verification:

  - test: "After a human with Cloudflare R2 credentials adds https://knowyourarea.in (and active Vercel preview origins) to the R2 bucket's CORS AllowedOrigins per README.md's documented wrangler r2 bucket cors set/list commands, open https://knowyourarea.in/capture on a real phone browser, grant camera + location, capture a photo, and pick a category."
    expected: "The captured-photo preview appears with no error text, the upload succeeds, and Publish Report becomes enabled and publishes to the feed — closing G-01-2 end-to-end (its infra half; the code half — sanitized error message — has been verified since plan 01-11)."
    why_human: "This is real infrastructure state outside git (R2 bucket CORS policy) that the coding agent has no credentials to change, and its effect can only be observed against the live production origin — it cannot be reproduced on localhost or in Playwright (both origins were always CORS-allowed). Declared explicitly as user_setup + a designated human-check in 01-11-PLAN.md; unchanged this pass."

  - test: "On real iOS Safari, capture a photo in portrait orientation (only reachable once the item above is unblocked) and confirm it is not rotated/skewed, the burned-in overlay text is upright and legible, and it wraps/truncates gracefully at a narrow aspect ratio (with a visible '…' if truncation occurs)."
    expected: "Correct orientation; overlay readable; no skew; visible truncation signal if the overlay wraps past the line cap on a narrow real device."
    why_human: "Canvas orientation/legibility bugs on real iOS Safari are not reproducible in a headless Chromium E2E run (fake media device has no real sensor/orientation data). 01-UAT.md's test 2 (this exact check) was blocked by the G-01-2 CORS bug before the tester could even see a captured photo on production — still recorded as result: issue, not a genuine orientation/legibility finding. Unchanged this pass; must be re-attempted once the CORS fix (above) is applied and confirmed."
---

# Phase 1: Core Capture-to-Feed Skeleton Verification Report

**Phase Goal:** Prove the riskiest end-to-end loop — a user can capture a live, geo-tagged photo, pick a category, publish it, and anyone can see it in a nearby feed and open it directly by its unique ID or permalink. Auth is a stub dev-identity; no geocoding, dedup, blurring, or AI yet.

**Verified:** 2026-07-28T13:35:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 01-12, which closed the two blocking gaps (G-01-CR-01, G-01-WR-08) from the prior `01-VERIFICATION.md` (`gaps_found`, 19/22, dated 2026-07-27T22:00:00Z).

## MVP Mode Note

ROADMAP.md marks this phase `Mode: mvp`, but the phase goal text is a capability narrative, not the literal `As a [role], I want [capability], so that [outcome].` format. Continuing the established precedent from all prior verification passes on this phase: standard goal-backward verification, not the MVP User-Flow-Coverage format.

## Re-Verification Summary (this pass, independent of SUMMARY.md claims)

1. **Read `src/lib/sanitize-error.ts` directly at HEAD.** Confirmed it is a pure function `sanitizeError(error, fallback, context): string` that always returns `fallback` and logs `console.error(context, name, message, code)` for an `Error` or `console.error(context, String(error))` otherwise — never returning or interpolating the caught error's own message.
2. **Read `src/actions/submit-complaint.ts` directly.** Confirmed the insert-catch (`throw new Error(sanitizeError(err, SANITIZED_PUBLISH_MESSAGE, "submitComplaint insert failed"))`) and the exhausted-ids throw (`sanitizeError(lastError, SANITIZED_PUBLISH_MESSAGE, "submitComplaint exhausted id attempts")`) both route through the shared utility; the unrelated `photoExists` validation throw (a deliberate message) is untouched; `isUniqueViolation` retry semantics are unchanged.
3. **Read `src/app/capture/page.tsx` directly.** Confirmed the publish catch no longer reads `err.message` — it calls `setError(sanitizeError(err, "Couldn't publish your report. Check your connection and try again.", "publish failed"))` unconditionally.
4. **Read `src/components/feed/ComplaintPhoto.tsx` and `src/app/c/[id]/page.tsx` directly.** Confirmed a new `"use client"` component replicates `FeedCard.tsx`'s `imgError` → category-tile pattern verbatim (same `CATEGORY_ICONS`/`CATEGORY_TILE_STYLES` maps, `data-testid="photo-fallback"`), and the permalink page's inline `<Image>` block has been replaced by `<ComplaintPhoto>`. `FeedCard.tsx` itself is untouched.
5. **Read `src/components/capture/CameraCapture.tsx` and `src/app/api/feed/route.ts` directly.** Confirmed all three CameraCapture catch sites (camera-start, geolocation, upload) and the feed route's catch now call `sanitizeError`, and every previously-established user-facing string (`"Couldn't start the camera."`, `"Couldn't get your location for this photo. Try again."`, `"Couldn't upload the photo. Check your connection and try again."`, `"Couldn't load reports."`) is byte-identical to before.
6. **Ran `npx tsc --noEmit` myself** — exits 0, no output.
7. **Ran `npx vitest run` myself** — 8 files, 41/41 passed (up from 35/35 in the prior pass, +6 new tests: `sanitize-error.test.ts` 5 cases, `submit-complaint-sanitization.test.ts` 1 case).
8. **Started a genuinely fresh dev server** (confirmed serving 200) and **ran `npx playwright test tests/e2e/permalink.spec.ts` myself** — 3/3 passed (21.3s), including the new forced-404-photo fallback test.
9. **Ran `npx playwright test tests/e2e/capture.spec.ts` myself** — 8/8 passed (12.2s), including the pre-existing G-01-2 forced-upload-failure sanitized-message test (unaffected by the Task 2 retrofit).
10. **Ran the full `npx playwright test` myself** (all 16 specs across capture/feed/permalink/search) — 16/16 passed in 37.0s, confirming no regression to FEED-01/FEED-03/FEED-04 or any prior gap fix.
11. **Grepped for debt markers** (`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`) across `src/`/`tests/` — zero matches. Checked for `test.skip()`/`test.fixme()` — zero matches.
12. **Read the new `tests/unit/submit-complaint-sanitization.test.ts` and `tests/unit/sanitize-error.test.ts` directly.** Confirmed both are genuine forced-failure tests (a real non-`.code` Error rejected from a mocked `db.insert(...).returning()`; an Error-with-`.code` and a non-Error value passed through `sanitizeError` directly) — not trivial/tautological assertions.
13. **Read the new `tests/e2e/permalink.spec.ts` test directly (lines 46-70).** Confirmed the 404 route interception (`page.route("**/complaints/**", ...)`) is registered strictly *after* the real publish flow completes, so the forced 404 can only hit the subsequent photo-display request, not the capture-time upload PUT — a deliberately scoped, non-trivial test.
14. **Confirmed via `git log --oneline 6bf774d..HEAD -- src/ tests/ README.md`** (where `6bf774d` is the commit carrying the prior `01-VERIFICATION.md`) that only the 10 files declared in `01-12-PLAN.md`'s `files_modified` changed — no other previously-verified artifact could have regressed.
15. **Read the freshly re-run `01-REVIEW.md` at HEAD (`d38c24b`, dated 2026-07-28)** — an independent code-review pass, not authored by this verification. It reports **0 Critical / 15 Warning / 9 Info**, explicitly confirming both fixes: "submitComplaint and every other UI-facing catch site now route through the shared sanitizeError() utility" and "the permalink page now has a ComplaintPhoto component with the same broken-image -> category-tile fallback FeedCard already had." No new Critical/blocker-tier findings.
16. **Read `01-UAT.md` in full** — unchanged since the prior verification pass; test 2 (iOS Safari orientation) still records `result: issue` for the CORS-blocking bug, not a completed check. No new human-verification evidence exists for either open item.
17. **Read `README.md`'s CORS section** — unchanged since plan 01-11 (still documents the production origin + wrangler commands), consistent with no R2 credential access having been exercised since.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A user can capture a photo using only the live in-app camera — no gallery/file-picker path exists (SUBM-01) | VERIFIED | `CameraCapture.tsx` uses only `getUserMedia`; no `<input type="file">`/`capture=` anywhere in `src/`; happy-path e2e test re-run this pass, passes |
| 2 | User picks one of 5 fixed categories; app captures live GPS at submit time, never from EXIF (SUBM-02, SUBM-03) | VERIFIED | `CategoryPicker.tsx`, `geolocation.ts`'s `captureBestFix`, server-side `submissionSchema` re-validation unchanged; e2e test re-run, passes |
| 3 | A submitted complaint appears in a feed of nearby complaints sorted by proximity/recency, viewable by anyone (FEED-01) | VERIFIED | `src/lib/feed.ts` untouched; `feed.spec.ts` proximity-ranking e2e test re-run this pass — passed (26.3s) |
| 4 | Each complaint has a unique, opaque ID and can be opened via search-by-ID or its permalink (SUBM-06, FEED-03, FEED-04) | VERIFIED | `src/lib/ids.ts`, `SearchById.tsx`, `c/[id]/page.tsx` untouched (except the photo block, see truth 22); `search.spec.ts`/`permalink.spec.ts` re-run, all pass |
| 5 | G-01-3: real-device permission denial hard-blocks with no submit path | VERIFIED | Denial-escalation branches unchanged; e2e denial + escalation specs pass |
| 6 | G-01-4: category picker renders as a uniform grid | VERIFIED | `CategoryPicker.tsx` untouched; e2e grid-layout spec passes |
| 7 | G-01-EXTRA-1: production feed loads real data, not a 500 | VERIFIED | `db/client.ts` untouched |
| 8 | Burned-in geotag/timestamp overlay with visible "…" truncation signal (D-02) | VERIFIED | `src/lib/overlay.ts` untouched |
| 9 | Internal serial `complaints.id` never exposed (T-01-01 IDOR) | VERIFIED | Query surfaces unchanged; re-confirmed via grep |
| 10 | Poster identity (`submitter_id`) never exposed (D-06) | VERIFIED | Unchanged; re-confirmed via grep |
| 11 | Presigned-upload key/content-type always server-derived (T-01-02/T-01-03) | VERIFIED | `upload-url/route.ts` untouched |
| 12 | `complaints` table has `geometry(point,4326)`, GiST index, `public_id` UNIQUE | VERIFIED | `db/schema.ts` untouched |
| 13 | Build/typecheck clean | VERIFIED | `npx tsc --noEmit` exits 0 (re-run this pass) |
| 14 | Full unit test suite passes | VERIFIED | `npx vitest run` → 41/41, 8 files (re-run this pass; up from 35/35, +6 new tests for `sanitizeError`/`submitComplaint`) |
| 15 | Full e2e suite passes when run | VERIFIED | `npx playwright test` (16 specs) → 16/16 in 37.0s, fresh server (re-run this pass) |
| 16 | No debt markers or `test.fixme()`/`test.skip()` stubs in tracked source | VERIFIED | Repo-wide grep found zero matches (re-run this pass) |
| 17 | G-01-9: post-capture static preview + stream-stop + Retake | VERIFIED | `capture.spec.ts` state-transition test re-run, passes |
| 18 | Rapid double-tapping Publish cannot create two complaints | VERIFIED | `01-UAT.md` test 9 records `result: pass` (human-confirmed, unchanged since prior pass) |
| 19 | Upload-error UI shows one fixed sanitized message; never reflects raw browser/network error text (G-01-2's code half) | VERIFIED | `CameraCapture.tsx`'s upload catch now routes through the shared `sanitizeError` (retrofitted by 01-12), byte-identical copy; e2e test re-run, passes |
| 20 | On production (https://knowyourarea.in), on a real device, capture→upload→publish completes (G-01-2's infra half) | NOT VERIFIABLE BY VERIFIER (human-only, infra) | R2 bucket CORS AllowedOrigins update requires credentials the coding agent does not have; live confirmation requires a real phone against the live origin. Unchanged this pass — routed to Human Verification. |
| 21 | `submitComplaint` never leaks a raw DB/driver error message to the client on any insert failure (closes G-01-CR-01) | VERIFIED | `src/actions/submit-complaint.ts` and `src/app/capture/page.tsx` both route through `src/lib/sanitize-error.ts`; `tests/unit/submit-complaint-sanitization.test.ts` forces a raw non-unique-violation error and confirms the rejection contains only the sanitized string while the raw marker is logged server-side. Independently corroborated by a freshly re-run `01-REVIEW.md` (0 Critical). |
| 22 | Permalink page (`/c/[id]`) shows the same category-placeholder tile as the feed card on a 404/missing photo, not a broken-image box (closes G-01-WR-08) | VERIFIED | `src/components/feed/ComplaintPhoto.tsx` (new) implements the `imgError` → category-tile pattern; `src/app/c/[id]/page.tsx` now renders `<ComplaintPhoto>`; new e2e test (`permalink.spec.ts:46`) forces a photo 404 post-publish and confirms `getByTestId("photo-fallback")` renders. Independently corroborated by `01-REVIEW.md`. |

**Score:** 21/22 truths VERIFIED. 0 FAILED. 1 not verifiable by the verifier (human-only infra confirmation, routed to Human Verification).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/sanitize-error.ts` | Single shared sanitization mechanism, never returns raw error message | VERIFIED | Read directly; pure function, always returns `fallback`, logs real detail via `console.error` |
| `src/actions/submit-complaint.ts` | Insert-catch and exhausted-ids throw route through `sanitizeError` | VERIFIED | Confirmed via direct read; `photoExists` validation throw correctly untouched |
| `src/app/capture/page.tsx` | Publish catch routes through `sanitizeError`, no verbatim error render | VERIFIED | Confirmed via direct read |
| `src/components/capture/CameraCapture.tsx` | All three catches (camera-start, geolocation, upload) route through `sanitizeError`, byte-identical copy | VERIFIED | Confirmed via direct read + grep |
| `src/app/api/feed/route.ts` | Error path routes through `sanitizeError`, preserves log shape + generic body | VERIFIED | Confirmed via direct read; `tests/unit/feed-route-logging.test.ts` still passes |
| `src/components/feed/ComplaintPhoto.tsx` | Client component with `imgError` → category-tile fallback, `data-testid="photo-fallback"` | VERIFIED | Confirmed via direct read; `FeedCard.tsx` untouched |
| `src/app/c/[id]/page.tsx` | Photo block replaced by `<ComplaintPhoto>` | VERIFIED | Confirmed via direct read |
| `tests/unit/sanitize-error.test.ts` | Asserts fallback returned, raw message never returned, detail logged | VERIFIED | Ran myself; 5 cases pass |
| `tests/unit/submit-complaint-sanitization.test.ts` | Forces non-unique DB failure, asserts sanitized rejection + server-side log | VERIFIED | Ran myself; passes |
| `tests/e2e/permalink.spec.ts` | New forced-404-photo test asserting category-tile fallback | VERIFIED | Ran myself; 3/3 pass including the new test |
| All other artifacts from prior passes | Unchanged | VERIFIED (regression check) | `git log --oneline 6bf774d..HEAD -- src/ tests/ README.md` confirms only the 10 files in `01-12-PLAN.md`'s scope changed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `submitComplaint` catch block | Client-facing error text | `sanitizeError(err, SANITIZED_PUBLISH_MESSAGE, ...)` | VERIFIED | Unit test forces a raw error and confirms only the sanitized string crosses the boundary |
| `capture/page.tsx` publish catch | Rendered error `<p>` | `sanitizeError(...)` unconditional call, no `err.message` read | VERIFIED | Confirmed via direct read |
| `CameraCapture`/feed-route catches | Rendered/returned error text | All four sites now call `sanitizeError` | VERIFIED | Confirmed via direct read + grep; byte-identical copy preserved |
| `c/[id]/page.tsx`'s photo block | Category-placeholder fallback | `<ComplaintPhoto>`'s `onError` → `imgError` state | VERIFIED | New e2e test forces a 404 and confirms the fallback renders |
| Browser → R2 (presigned PUT) | R2 bucket CORS policy | `AllowedOrigins` must include `https://knowyourarea.in` | NOT VERIFIABLE (infra, human-only) | Cannot be checked from the repo; unchanged this pass |
| All other key links from prior passes | — | — | VERIFIED (regression check) | Files untouched outside the 01-12 scope, confirmed via `git log` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ComplaintPhoto` | `src` prop | `photoUrl(row.photo_key)` computed server-side in `c/[id]/page.tsx` from a real DB row | Yes | FLOWING |
| `sanitizeError`'s logged detail | `error.name`/`.message`/`.code` | The actually-thrown/rejected error object at each call site (not a static placeholder) | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Shared `sanitizeError` unit coverage | `npx vitest run tests/unit/sanitize-error.test.ts` (part of full run) | 5/5 passed | PASS |
| Forced non-unique-violation DB failure sanitized end-to-end | `npx vitest run tests/unit/submit-complaint-sanitization.test.ts` (part of full run) | 1/1 passed | PASS |
| Forced-404-photo permalink fallback | `npx playwright test tests/e2e/permalink.spec.ts` | 3/3 passed (21.3s) | PASS |
| Forced-upload-failure sanitized error (regression) | `npx playwright test tests/e2e/capture.spec.ts` | 8/8 passed (12.2s) | PASS |
| Full e2e suite (capture + feed + permalink + search) | `npx playwright test` | 16/16 passed in 37.0s | PASS |
| Typecheck | `npx tsc --noEmit` | exits 0 | PASS |
| Full unit test suite | `npx vitest run` | 41/41 passed (8 files) | PASS |
| Debt-marker scan | `grep -rn "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER" src/ tests/` | zero matches | PASS |
| `git log` scoping check | `git log --oneline 6bf774d..HEAD -- src/ tests/ README.md` | Only the 10 declared files changed | PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` conventions exist in this project and no probes are declared in any Phase 1 PLAN/SUMMARY. Skipped.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SUBM-01 | 01-02, 01-03, 01-05, 01-09, 01-10, 01-11, 01-12 | Live in-app camera capture only, no gallery upload | SATISFIED | Core capability works end-to-end (e2e-proven); the publish path's info-disclosure gap (prior Gap 1) is now closed by 01-12 |
| SUBM-02 | 01-01, 01-03, 01-05 | 5 fixed categories, server-validated | SATISFIED | Unchanged since prior pass |
| SUBM-03 | 01-02, 01-03, 01-05, 01-12 | Live GPS at submit time, never EXIF | SATISFIED | Unchanged; the publish-path sanitization fix (01-12) doesn't touch the GPS-capture logic |
| SUBM-06 | 01-01, 01-02 | Unique opaque searchable ID | SATISFIED | Unchanged |
| FEED-01 | 01-02, 01-04, 01-06, 01-07 | Proximity/recency feed, viewable by anyone | SATISFIED | Unchanged; e2e proximity-ranking test passes this pass |
| FEED-03 | 01-04 | Search by ID | SATISFIED | Unchanged; e2e search-by-ID tests pass this pass |
| FEED-04 | 01-04, 01-12 | Shareable permalink | SATISFIED | Core permalink rendering works (e2e-proven); the photo-404 graceful-degradation gap (prior Gap 2) is now closed by 01-12 |

No orphaned requirements — the same 7 IDs mapped in REQUIREMENTS.md's traceability table are all cited across plans 01-01 through 01-12. All 7 formal requirement descriptions have their core capability satisfied with no remaining caveats.

**Documentation inconsistency (informational, not a new finding, unchanged from prior pass):** `.planning/REQUIREMENTS.md` still shows only `SUBM-01`/`SUBM-03`/`FEED-04` checked `[x]` while the other 4 Phase 1 requirements remain `[ ]`, and the Traceability table still lists all 7 as "Gaps Found" — an internal inconsistency in the requirements doc itself. Now that all 7 requirements' underlying gaps are closed at the code level, recommend reconciling this doc once the phase's remaining human-verification items close out to `passed`.

### Anti-Patterns Found

None this pass. The two prior blocker-severity anti-patterns (raw error rethrow in `submit-complaint.ts`; missing `onError` fallback in `c/[id]/page.tsx`) are both fixed and re-verified above.

`01-REVIEW.md` (freshly re-run at HEAD `d38c24b`, after plan 01-12 landed) reports 0 Critical, 15 Warning, 9 Info findings, `status: issues_found`. It explicitly confirms both this round's fixes landed. The remaining Warnings/Info (empty `lat`/`lng` still resolving to a fake `(0,0)` fix in three call sites, `photoKey` not single-use, `photoExists` error conflation, no rate limiting on upload-url/submit — explicitly deferred to Phase 4 per prior review/UAT sign-off, missing DB-level category CHECK constraint, migration doesn't self-provision PostGIS, a `SearchById` case-sensitivity gap, a missing in-flight guard in `captureBestFix`'s geolocation watch, and a cursor-decoder type-validation gap) are correctness/robustness edge cases unrelated to this phase's 7 declared requirement IDs, its observable truths, or the two gaps this round specifically closed — consistent with how every prior verification pass in this phase triaged this class of finding. Noted for visibility, not blocking; candidates for a future gap-closure round if the project wants to keep hardening this phase, but they are not part of this phase's stated goal or success criteria.

Repo-wide grep of `src/`/`tests/` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and `test.fixme()`/`test.skip()` found zero matches — no debt-marker gate violation.

### Human Verification Required

2 items remain open (unchanged from the prior pass — both are real-infra/real-device checks that cannot be automated, and plan 01-12 correctly did not attempt either, per its own stated scope):

1. **G-01-2's infra half — R2 CORS change + live production confirmation.** A human with Cloudflare R2 credentials must add `https://knowyourarea.in` to the bucket's CORS `AllowedOrigins` (README.md documents the exact `wrangler` commands), then confirm on a real phone browser against `https://knowyourarea.in/capture` that capture→upload→publish completes with no error text and Publish Report enables. This is genuinely unautomatable — the coding agent has no R2 credentials, and the effect can't be reproduced on localhost/Playwright (both origins were always CORS-allowed).
2. **iOS Safari real-device orientation/legibility (01-UAT.md test 2).** Still unattempted since the CORS bug blocked the tester before a captured photo could even be seen on production. Must be re-attempted once item 1 above is unblocked.

### Gaps Summary

**Both blocking gaps from the prior `01-VERIFICATION.md` pass are closed, independently confirmed by direct source reading and by running the automated test suites myself (not trusted from `01-12-SUMMARY.md`):**

1. **`submitComplaint`'s insert-failure path no longer leaks raw DB/driver error text to the UI** (closes CR-01 / prior Gap 1). A single shared `sanitizeError` utility now backs the publish path plus the three prior ad-hoc sites (camera/geolocation, upload, feed route) — collapsing four independent hand-rolled implementations into one, exactly as the plan's `assumption_delta_decision` intended. Proven by a new unit test that forces a raw, marker-bearing DB error and confirms the marker never crosses the Server Action boundary while it is still logged server-side.
2. **The permalink page now has a photo-404 fallback**, matching the feed card's existing pattern (closes WR-08 / prior Gap 2), via a new `ComplaintPhoto` client component. `FeedCard` itself is untouched. Proven by a new, carefully-scoped e2e test that forces a 404 only on the post-publish photo-display request (never the capture-time upload PUT).

**No regressions:** typecheck clean, full unit suite 41/41 (up from 35/35 — 6 new tests, all passing), full e2e suite 16/16 (up from 15/15 — 1 new test, all passing), zero debt markers, `git log` confirms no previously-verified artifact outside the 10 files `01-12-PLAN.md` declared was touched. A freshly re-run, independent `01-REVIEW.md` corroborates both fixes and reports 0 Critical findings.

**Status is `human_needed`, not `passed` or `gaps_found`,** because both blocker-severity truths from the prior pass are now VERIFIED (no FAILED items remain) — but 2 genuinely human-only items (R2 bucket CORS production infra change + live-device confirmation; the iOS Safari real-device orientation check that depends on it) remain open, unchanged since plan 01-11 first declared them out of the coding agent's reach. Per the verification decision tree, human verification items take priority over an otherwise-clean pass. Once a human completes both open checks (R2 CORS dashboard change + a real-phone production run, then the iOS Safari check), this phase is ready to close to `passed`.

---

_Verified: 2026-07-28T13:35:00Z_
_Verifier: Claude (gsd-verifier)_
