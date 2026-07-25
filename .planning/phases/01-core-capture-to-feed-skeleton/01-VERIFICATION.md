---
phase: 01-core-capture-to-feed-skeleton
verified: 2026-07-26T00:20:00Z
status: gaps_found
score: 17/18 must-haves verified (programmatically checkable); 1 failed; 3 items remain human-verification (2 pre-flagged real-device backstop checks still skipped, 1 concurrency invariant present-by-construction but unexercised)
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 17/18 (1 failed: CR-01 overlay word-wrap timestamp drop)
  gaps_closed:
    - "CR-01 (original trigger): the narrow off-by-one break condition (`lines.length === OVERLAY_MAX_LINES - 1`) that fired the instant line 2 STARTED — for the exact reproduction case in 01-VERIFICATION.md ('12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03' at a width where the prefix alone fills line 1), the timestamp is now retained on line 2. Independently confirmed: read src/lib/overlay.ts directly (break condition is now `if (lines.length >= OVERLAY_MAX_LINES) break;`), ran the new tests/unit/overlay.test.ts wrapOverlayLines describe block (3/3 pass), and independently re-implemented + executed the function by hand in Node against the plan's exact scenario — timestamp survives."
  gaps_remaining:
    - "D-02 (the underlying Plan-must-have truth CR-01 was tracked against) is STILL FAILED via a different, still-open trigger in the same function: when the overlay text needs MORE than OVERLAY_MAX_LINES (2) physical lines to wrap — e.g. a long/imprecise GPS accuracy value such as '±123457m', which formatOverlayText's own test suite explicitly anticipates as realistic (poor-fix GPS is common, especially indoors/urban-canyon conditions relevant to India) — the loop's `break` leaves a dangling partial line in `current` that the post-loop `lines.length = OVERLAY_MAX_LINES` truncation silently discards with no ellipsis. Independently reproduced by hand (see Observable Truths #8 below): wrapOverlayLines(stubCtx, '12.9716, 77.5946 · ±123457m · 23 Jul 2026, 14:03', 20) => ['12.9716, 77.5946 ·', '±123457m · 23 Jul'] — '2026, 14:03' vanishes with no truncation signal, reproducing the exact same anti-fraud-evidence-loss failure mode the original CR-01 closed only one trigger of."
  regressions: []
gaps:
  - truth: "The captured photo has a visible geotag + timestamp overlay burned onto the canvas before the blob is produced (D-02, 01-03-PLAN.md must-have) — the overlay is part of the stored image bytes, and its timestamp component is never silently dropped."
    status: failed
    reason: "wrapOverlayLines (src/lib/overlay.ts) still silently drops the burned-in timestamp under a realistic trigger condition, just not the one 01-08-PLAN.md's must-haves scenario tested. Plan 01-08 correctly fixed the narrow 2-line 'break fires the instant line 2 starts' defect and added regression coverage for exactly that scenario — that specific fix is genuine and verified. But the post-loop code still has an unguarded path: when the loop's `break` fires because OVERLAY_MAX_LINES lines have already been pushed, the word being accumulated in `current` at that moment (a would-be 3rd line) is unconditionally pushed via `if (current) lines.push(current)` and then silently chopped off by the following `if (lines.length > OVERLAY_MAX_LINES) lines.length = OVERLAY_MAX_LINES;` — with no ellipsis, and any words after that one are never even reached (the for-loop already exited). This reproduces the exact 'burned-in timestamp silently vanishes with no signal' failure mode the phase goal's D-02 anti-fraud framing exists to prevent, just via a longer-text trigger (e.g. a long accuracy value from a poor GPS fix) instead of the original 2-line trigger."
    artifacts:
      - path: "src/lib/overlay.ts"
        issue: "wrapOverlayLines (lines 50-90): when the loop's `break` fires at `lines.length >= OVERLAY_MAX_LINES` (line 71), the word left in `current` at that moment is a fragment of a line that will be discarded, but the post-loop code (`if (current) lines.push(current)` at line 73, then `lines.length = OVERLAY_MAX_LINES` at line 74) pushes it and then silently truncates it away instead of routing it through the ellipsis logic at lines 79-87. Any words after that fragment (already outside the exited for-loop) are lost entirely with no trace."
    missing:
      - "Track that a break-triggered truncation occurred (e.g. a `truncated` flag set when the `break` fires) and skip pushing the dangling `current` fragment in that case, so it isn't appended-then-silently-chopped."
      - "Force the ellipsis/truncation branch to run on the last RETAINED line whenever a break-truncation happened (not only when that line's own measured width overflows maxWidth), so a truncation always leaves a visible '…' signal instead of a clean-looking but incomplete final line."
      - "Extend tests/unit/overlay.test.ts's 'caps wrapped output at OVERLAY_MAX_LINES (2) even for longer text' case (and/or add a new case using a long-accuracy-value overlay string) to assert on CONTENT — e.g. the last line ends with '…' when truncation occurs — not just `lines.length <= 2`, so this class of regression is caught automatically. The current test only checks length and passes despite this bug."
    debug_session: null
deferred: []
behavior_unverified_items:
  - truth: "Rapid double-tapping Publish cannot create two complaints (01-03-PLAN.md must-have, human_judgment)."
    test: "On the /capture page, after a photo is captured and a category chosen, tap 'Publish Report' twice in rapid succession (near-simultaneous, faster than a render cycle)."
    expected: "Exactly one complaint is created; the second tap is a no-op because publishPhase !== 'idle' guards handlePublish."
    why_human: "The guard (`if (!photoKey || !category || publishPhase !== \"idle\") return;` in src/app/capture/page.tsx:37) is present and correct by construction, but no concurrency/race test (unit or e2e) exercises two near-simultaneous clicks — this is a state-transition/ordering invariant that a static read cannot prove holds under real double-tap timing. Unchanged since the prior verification cycle; not touched by plan 01-08."
human_verification:
  - test: "On real iOS Safari, capture a photo in portrait orientation and confirm it is not rotated/skewed, and that the burned-in overlay text is upright, legible, and wraps/truncates gracefully at a narrow aspect ratio."
    expected: "Correct orientation; overlay readable; no skew; and — given the residual gap above — the timestamp must actually be visible or the overlay must show a visible '…' if truncated, never a silently-clean-looking-but-incomplete line."
    why_human: "Canvas orientation/legibility bugs on real iOS Safari are not reproducible in a headless Chromium E2E run. Status: SKIPPED in 01-UAT.md (test 2) — still open. Unchanged by plan 01-08."
  - test: "Force a photo URL to 404 (e.g. edit a card's photo_key to a nonexistent key) and confirm the feed/permalink renders a category-colored placeholder tile with an icon, not a broken-image icon."
    expected: "Category-colored tile with icon renders in place of the broken image."
    why_human: "Status: SKIPPED in 01-UAT.md (test 5) — still open. No automated test forces a live photo 404 against the real R2 bucket. Unchanged by plan 01-08."
  - test: "On the /capture page, tap 'Publish Report' twice in rapid succession and confirm only one complaint is created."
    expected: "Exactly one complaint created; second tap is a no-op."
    why_human: "See behavior_unverified_items above — code guard present, no concurrency test exists."
---

# Phase 1: Core Capture-to-Feed Skeleton Verification Report

**Phase Goal:** Prove the riskiest end-to-end loop — a user can capture a live, geo-tagged photo, pick a category, publish it, and anyone can see it in a nearby feed and open it directly by its unique ID or permalink. Auth is a stub dev-identity; no geocoding, dedup, blurring, or AI yet.

**Verified:** 2026-07-26T00:20:00Z
**Status:** gaps_found
**Re-verification:** Yes — after plan 01-08 (gap closure, round 2) attempted to close CR-01 in `src/lib/overlay.ts`

**Note on phase mode:** ROADMAP.md marks this phase `mode: mvp`, but the phase goal text does not conform to the strict `"As a ..., I want to ..., so that ...."` User Story format (`gsd_run query user-story.validate` returns `valid: false` against it). This predates this verification pass — the phase's own first verification cycle already used the standard goal-backward (non-MVP) format, which this re-verification pass continues for consistency. Flagged here for visibility, not treated as a new blocking issue.

## Re-Verification Summary

This is the third full verification pass for Phase 1. The second pass (`status: gaps_found`, 2026-07-23T16:45:00Z) closed all 3 prior UAT gaps (G-01-3, G-01-4, G-01-EXTRA-1) but found one new blocking gap from that run's code review: CR-01, an off-by-one break condition in `wrapOverlayLines` (`src/lib/overlay.ts`) that silently dropped the burned-in anti-fraud timestamp under a specific 2-line word-wrap trigger. Plan 01-08 was executed to close CR-01.

**Independent re-verification of plan 01-08's claim (not trusted from SUMMARY.md):**

1. Read `src/lib/overlay.ts` directly. Confirmed the break condition is now `if (lines.length >= OVERLAY_MAX_LINES) break;` (was `=== OVERLAY_MAX_LINES - 1`), and `wrapOverlayLines` is exported.
2. Ran `tests/unit/overlay.test.ts` — 9/9 pass, including the new `wrapOverlayLines` describe block (3 assertions: timestamp retention, 2-line cap, ellipsis truncation).
3. Independently re-implemented `wrapOverlayLines` verbatim in a standalone Node script (not trusting the test file's own assertions) and ran it against the plan's exact reproduction scenario (`"12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03"` at the narrow width where the prefix alone fills line 1) — the timestamp is retained. **The originally-reported CR-01 trigger is genuinely fixed.**
4. This phase's fresh `01-REVIEW.md` (completed and committed this same run) independently claimed a **second, related, still-present defect** in the same function, reproducible via a longer overlay string (e.g. a long GPS-accuracy value like `±123457m`) that needs 3+ physical lines to wrap. Per this verification's explicit instructions, this claim was **not** trusted at face value from either SUMMARY.md or REVIEW.md — it was independently reproduced from scratch: `wrapOverlayLines(stubCtx, "12.9716, 77.5946 · ±123457m · 23 Jul 2026, 14:03", 20)` executed via a standalone Node script against the exact current `src/lib/overlay.ts` logic returns `["12.9716, 77.5946 ·", "±123457m · 23 Jul"]` — the timestamp (`2026, 14:03`) is silently gone, with no ellipsis, no signal. **Confirmed real and reproducible**, and it is the same failure mode CR-01 was meant to close, via a different trigger. `tests/unit/overlay.test.ts`'s "caps wrapped output at OVERLAY_MAX_LINES (2)" test only asserts `lines.length <= 2` and does not check content preservation, so it passes despite this bug.

**Conclusion:** Plan 01-08 closed the exact scenario it targeted (verified genuine), but the underlying D-02 must-have — "the overlay's timestamp is never silently dropped" — is **still failed** overall, because the same function has an un-fixed sibling defect that reproduces the identical failure mode via a realistic, not contrived, input (a long GPS accuracy value, which is common for poor/indoor GPS fixes and is explicitly anticipated by `formatOverlayText`'s own existing test suite). This is recorded as a continuing gap, not a new/separate one, since it blocks the same phase-goal-relevant truth.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A user can capture a photo using only the live in-app camera — no gallery/file-picker path exists (SUBM-01) | ✓ VERIFIED | Unchanged since prior pass (file not touched by plan 01-08); `CameraCapture.tsx` uses only `getUserMedia`; no `<input type="file">`/`capture=` in `src/` |
| 2 | User picks one of 5 fixed categories; app captures live GPS at submit time, never from EXIF (SUBM-02, SUBM-03) | ✓ VERIFIED | Unchanged since prior pass; `CategoryPicker.tsx`, `geolocation.ts` `captureBestFix`, `submissionSchema` untouched by plan 01-08 |
| 3 | A submitted complaint appears in a feed of nearby complaints sorted by proximity/recency, viewable by anyone (FEED-01) | ✓ VERIFIED | Unchanged since prior pass; `src/lib/feed.ts` untouched; e2e `feed.spec.ts` enumerates and both tests present in the 13/13 listing re-run this pass |
| 4 | Each complaint has a unique, opaque ID and can be opened via search-by-ID or its permalink (SUBM-06, FEED-03, FEED-04) | ✓ VERIFIED | Unchanged since prior pass; `src/lib/ids.ts`, `SearchById.tsx`, `c/[id]/page.tsx` untouched |
| 5 | G-01-3: real-device permission denial (Safari/first-visit) hard-blocks with no submit path | ✓ VERIFIED | Unchanged since prior pass; `PermissionGate.tsx`/`CameraCapture.tsx` untouched by plan 01-08 |
| 6 | G-01-4: category picker renders as a uniform grid, not an uneven flex-wrap | ✓ VERIFIED | Unchanged since prior pass; `CategoryPicker.tsx` untouched |
| 7 | G-01-EXTRA-1: production feed loads real data, not a 500 | ✓ VERIFIED | Unchanged since prior pass; `db/client.ts`, `api/feed/route.ts` untouched by plan 01-08 |
| 8 | The captured photo has a visible geotag + timestamp overlay burned onto the canvas, and the timestamp is never silently dropped (D-02, 01-03-PLAN.md must-have) | ✗ FAILED | Original 2-line CR-01 trigger genuinely fixed (independently re-verified — see Re-Verification Summary). A related, still-present defect in the same function silently drops the timestamp when the overlay text needs 3+ physical lines (e.g. a long GPS-accuracy value). Independently reproduced this pass via standalone Node execution of the exact current source: `wrapOverlayLines(stubCtx, "12.9716, 77.5946 · ±123457m · 23 Jul 2026, 14:03", 20)` → `["12.9716, 77.5946 ·", "±123457m · 23 Jul"]` — timestamp gone, no ellipsis. See `gaps` in frontmatter. |
| 9 | The internal serial `complaints.id` is never exposed in any URL/API/feed payload — only `public_id` (T-01-01 IDOR prohibition) | ✓ VERIFIED | Unchanged since prior pass; query surfaces untouched by plan 01-08 |
| 10 | Poster identity (`submitter_id`) is never exposed on the feed or permalink (D-06 prohibition) | ✓ VERIFIED | Unchanged since prior pass |
| 11 | Presigned-upload key/content-type are always server-derived, never client-supplied (T-01-02/T-01-03 prohibition) | ✓ VERIFIED | Unchanged since prior pass; `upload-url/route.ts` untouched |
| 12 | The `complaints` table exists with a `geometry(point,4326)` location column, GiST index, and `public_id` UNIQUE constraint | ✓ VERIFIED | Unchanged since prior pass; `db/schema.ts` untouched |
| 13 | Build/typecheck are clean on the current commit | ✓ VERIFIED | `npx tsc --noEmit` exits 0 (re-run this verification) |
| 14 | The full unit test suite passes | ✓ VERIFIED | `npx vitest run` → 33/33 passed (6 test files, +3 since prior pass' 30/30 — new wrapOverlayLines coverage) — re-run this verification |
| 15 | The e2e suite enumerates cleanly | ✓ VERIFIED | `npx playwright test --list` → 13/13 tests across 4 spec files (unchanged count; e2e specs untouched by plan 01-08) — re-run this verification |
| 16 | No debt markers (TODO/FIXME/XXX/TBD) or `test.fixme()` stubs remain in tracked source | ✓ VERIFIED | Repo-wide grep of `src/`/`tests/` found zero matches; targeted grep of the two files plan 01-08 touched also clean |
| 17 | Rapid double-tapping Publish cannot create two complaints | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Unchanged since prior pass; guard present and correct by construction, no concurrency test exercises the race |
| 18 | All 7 declared requirement IDs (SUBM-01/02/03/06, FEED-01/03/04) are marked Complete in REQUIREMENTS.md and traced to Phase 1 | ✗ NOT YET (expected while gaps_found) | `.planning/REQUIREMENTS.md` currently shows all 7 as `Gaps Found` in the Traceability table (SUBM-01's checkbox is `[x]` but the table status was intentionally reverted, per commit `2733b44 docs(phase-01): revert premature Complete requirements after gaps found`) — consistent with, not contradicting, this pass's `gaps_found` status; will correctly flip to Complete once the residual overlay gap is closed. Not counted as a fresh regression. |

**Score:** 16/18 truths verified (15 VERIFIED + 1 not separately counted as behavior-unverified). 1 FAILED (residual overlay bug, truth #8). 1 PRESENT_BEHAVIOR_UNVERIFIED (double-tap race). Truth #18 tracked separately as an expected consequence of `gaps_found`, not a distinct new defect.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/overlay.ts` | `formatOverlayText` + `wrapOverlayLines` + `drawOverlay` burn-in, no silent content loss | ⚠️ PARTIALLY FIXED (functional, still incorrect on a related path) | `formatOverlayText` correct and unit-tested. `wrapOverlayLines`'s originally-reported off-by-one is fixed and now unit-tested (3 new assertions). A related defect (dangling `current` fragment silently discarded by the post-loop truncation instead of being ellipsized) remains, reproduced independently this pass. |
| `tests/unit/overlay.test.ts` | Direct coverage of `wrapOverlayLines`, not just `formatOverlayText` | ✓ VERIFIED (coverage added, but incomplete) | New `describe("wrapOverlayLines")` block exists with 3 assertions per plan 01-08; however none of the 3 assert on *content* for the "longer text" case (only `lines.length <= 2`), so the residual defect is not caught by this new coverage either. |
| All other artifacts from the prior pass (`src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/app/api/feed/route.ts`, `PermissionGate.tsx`, `CameraCapture.tsx` escalation wiring, `CategoryPicker.tsx`, `src/lib/feed.ts`, `FeedCard.tsx`/`FeedList.tsx`, `c/[id]/page.tsx`/`not-found.tsx`) | Unchanged | ✓ VERIFIED (regression check) | `git diff --stat` between the prior verification's HEAD and this pass's HEAD confirms only `src/lib/overlay.ts` and `tests/unit/overlay.test.ts` were modified — no other artifact could have regressed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CameraCapture.tsx` | `overlay.ts` | `drawOverlay(ctx,...)` before `canvas.toBlob` | ✓ WIRED (but source function still has a residual bug) | Call order confirmed unchanged at `CameraCapture.tsx:124`/`overlay.ts:108`; the wiring is not the defect — `wrapOverlayLines`' internal loop/post-loop interaction still is, on the longer-text trigger. |
| `wrapOverlayLines` | `drawOverlay`'s bar-height/line-render loop | Return value drives `lines.length * lineHeight` and `lines.forEach(...)` rendering | ✓ WIRED | Confirmed in source (`overlay.ts:110-120`) — whatever `wrapOverlayLines` returns is faithfully rendered; the defect is upstream (which lines make it into the array), not in this rendering step. |
| All other key links from the prior pass | — | — | ✓ VERIFIED (regression check, files untouched) | Not re-traced line-by-line this pass; confirmed unaffected via the same `git diff --stat` scoping evidence above. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Original CR-01 trigger (2-line, prefix-fills-line-1) is fixed | Standalone Node re-implementation of current `wrapOverlayLines`, run against plan 01-08's exact reproduction input | Timestamp retained on line 2 | ✓ PASS |
| Residual defect (3+ physical lines needed) reproduction | Standalone Node re-implementation of current `wrapOverlayLines`, run against a long-accuracy-value overlay string (`±123457m`) at maxWidth 20 | `["12.9716, 77.5946 ·", "±123457m · 23 Jul"]` — timestamp dropped, no ellipsis | ✗ CONFIRMS RESIDUAL BUG |
| `tests/unit/overlay.test.ts` (targeted) | `npx vitest run tests/unit/overlay.test.ts` | 9/9 passed | ✓ PASS (but does not cover the residual defect — see artifact notes) |
| Full unit test suite | `npx vitest run` | 33/33 passed (6 files) | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exits 0 | ✓ PASS |
| e2e suite enumeration | `npx playwright test --list` | 13/13 tests enumerate across 4 files (unchanged) | ✓ PASS |
| Lint | `npm run lint` | 3 errors, all confirmed in untracked/ignored `.claude/worktrees/agent-*` copies (`git check-ignore -v` confirms `.git/info/exclude` match, not part of the working tree) | ✓ PASS (no in-scope regressions) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SUBM-01 | 01-02, 01-03, 01-05 | Live in-app camera capture only, no gallery upload | ✓ SATISFIED (unaffected by overlay gap) | `CameraCapture.tsx` (getUserMedia only) — the overlay defect is about burn-in completeness, not capture-path enforcement |
| SUBM-02 | 01-01, 01-03, 01-05 | 5 fixed categories, server-validated | ✓ SATISFIED | Unchanged |
| SUBM-03 | 01-02, 01-03, 01-05 | Live GPS at submit time, never EXIF | ✓ SATISFIED | The authoritative GPS location is a DB column (`geometry(point,4326)`), stored independently of the canvas overlay per this project's own CLAUDE.md architecture decision — unaffected by the overlay bug |
| SUBM-06 | 01-01, 01-02 | Unique opaque searchable ID | ✓ SATISFIED | Unchanged |
| FEED-01 | 01-02, 01-04, 01-06, 01-07 | Proximity/recency feed, viewable by anyone | ✓ SATISFIED | Unchanged |
| FEED-03 | 01-04 | Search by ID | ✓ SATISFIED | Unchanged |
| FEED-04 | 01-04 | Shareable permalink | ✓ SATISFIED | Unchanged |

No orphaned requirements — same 7 IDs mapped in REQUIREMENTS.md, all traced to Phase 1 across 01-01…01-08. All 7 formal requirement descriptions remain satisfied even with the overlay gap open (none reference the image overlay specifically — SUBM-03 concerns the DB-stored GPS value). The gap is tracked against the Plan-level D-02 must-have, matching how the prior pass scoped it. REQUIREMENTS.md's Traceability table correctly still shows all 7 as "Gaps Found" (not yet flipped to Complete), consistent with this pass's `gaps_found` status.

### Anti-Patterns Found

None blocking beyond the tracked CR-01 residual (which is a logic defect, not a debt marker). Targeted grep of the two files plan 01-08 touched (`src/lib/overlay.ts`, `tests/unit/overlay.test.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` found zero matches. The 3 `npm run lint` errors remain confirmed-untracked/ignored `.claude/worktrees/agent-*` copies, unchanged from the prior pass.

Code review (`01-REVIEW.md`, this run) also re-confirmed the 10 previously-known/newly-found Warning/Info-level robustness gaps (concurrency guards, unguarded track access, permission-check fail-open, DB client singleton guard, `photoExists` error conflation, unvalidated-category icon crash risk, logging inconsistency, missing rate limiting, unreachable code, duplicated helpers, dead `.jpeg`/webp support, and the captured-photo-not-previewed-before-publish gap). These remain correctly triaged as Warnings/Info, not Criticals — none block a ROADMAP success criterion or REQUIREMENTS.md ID for this phase, so they are noted for visibility but not elevated to blocking gaps here.

### Human Verification Required

3 items remain open (see frontmatter for the full structured list) — all unchanged since the prior pass, none newly introduced by plan 01-08:

1. **iOS Safari real-device orientation/overlay legibility** — skipped in `01-UAT.md` (test 2), still open. Now doubly relevant given the residual overlay defect: confirm the timestamp is visible, or that a visible truncation signal appears if the overlay text wraps to 3+ lines on a real narrow device viewport.
2. **Forced photo-404 placeholder render** — skipped in `01-UAT.md` (test 5), still open.
3. **Double-tap Publish race** — code guard present and correct by construction, but no concurrency test exercises it; unchanged since the prior verification cycle.

### Gaps Summary

**1 blocking gap remains, in the same location as the prior pass:** `src/lib/overlay.ts`'s `wrapOverlayLines` still silently drops the burned-in timestamp — plan 01-08 genuinely fixed the specific 2-line trigger it targeted (independently re-verified via direct source read, the new unit tests, and an independent standalone re-implementation run against the plan's exact scenario), but this phase's fresh code review surfaced, and this verification pass independently confirmed by hand-executing the current source, a **second, related trigger in the same function** (overlay text needing 3+ physical lines to wrap, e.g. from a long/imprecise GPS accuracy value) that reproduces the identical "timestamp silently vanishes with no ellipsis" failure mode. This is the same D-02 must-have failing again via a different, equally realistic path — not a new, unrelated defect.

**No regressions:** `git diff --stat` between the prior verification pass and this one confirms only `src/lib/overlay.ts` and `tests/unit/overlay.test.ts` changed; every other previously-VERIFIED truth, artifact, and key link was spot-checked or diff-confirmed unaffected. Full unit suite grew 30→33 passing (all green), typecheck clean, e2e enumeration unchanged at 13/13, lint unchanged (3 pre-existing, out-of-scope, ignored-directory errors).

**Recommended next gap-closure plan:** fix the post-loop path in `wrapOverlayLines` so a break-triggered truncation never silently discards the dangling fragment — either skip appending it and force-ellipsize the last retained line, or otherwise guarantee a visible truncation signal whenever content is cut. Extend `tests/unit/overlay.test.ts`'s "longer text" case (or add a dedicated one using a long-accuracy-value overlay string) to assert on *content* — e.g. the last line ends with `…` when truncation occurs — not just `lines.length <= 2`, so this class of regression cannot silently ship a third time. `01-REVIEW.md`'s suggested fix (tracking a `truncated` flag and skipping the dangling-fragment push) is a reasonable starting point but should be independently re-verified against a fresh hand-execution before being trusted, per this pass's own findings.

**3 human-verification items remain open**, all carried forward unchanged from the prior pass — none are new regressions from plan 01-08.

---

_Verified: 2026-07-26T00:20:00Z_
_Verifier: Claude (gsd-verifier)_
