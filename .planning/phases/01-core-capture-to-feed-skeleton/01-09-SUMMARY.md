---
phase: 01-core-capture-to-feed-skeleton
plan: 09
subsystem: capture
tags: [canvas, overlay, text-wrapping, vitest, anti-fraud]

# Dependency graph
requires:
  - phase: 01-core-capture-to-feed-skeleton (plan 08)
    provides: wrapOverlayLines with the OVERLAY_MAX_LINES break-condition fix (=== to >=) and the exported function for direct unit testing
provides:
  - wrapOverlayLines guaranteed to never silently drop trailing overlay content — a break-triggered truncation now always leaves a visible "…" on the last retained line
  - Content-based (not length-only) regression tests locking the truncation-signal behaviour for both the original CR-01 2-line trigger and the residual 3+-line trigger
affects: [overlay burn-in, capture flow, code-review gap-closure tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Break-truncation tracking: set a local boolean at the loop-exit `break` site instead of appending-then-clamping a doomed fragment, so post-loop logic can distinguish 'ran out of words naturally' from 'cut off mid-wrap' and react accordingly (append vs. don't-append, ellipsize vs. don't-ellipsize)."

key-files:
  created: []
  modified:
    - src/lib/overlay.ts
    - tests/unit/overlay.test.ts

key-decisions:
  - "Skip the post-loop `if (current) lines.push(current)` append entirely when a break-truncation occurred, rather than pushing then clamping — the dangling fragment belongs to a line that will never render, so appending it was always wasted work masking the real bug."
  - "Broadened the ellipsis condition to `truncated || measuredWidth > maxWidth` (was: measuredWidth > maxWidth only) so both truncation causes (break-triggered and single-overflowing-line) converge on the same visible-signal code path, reusing the existing character-trimming loop."
  - "Removed the now-unreachable-by-construction post-loop length clamp (`if (lines.length > OVERLAY_MAX_LINES) lines.length = OVERLAY_MAX_LINES`) rather than leaving it as a defensive no-op, since lines.length can no longer exceed OVERLAY_MAX_LINES by construction once the doomed append is skipped."

requirements-completed: [SUBM-01]

coverage:
  - id: D1
    description: "wrapOverlayLines never silently drops trailing overlay content on a 3+-line wrap trigger (e.g. long GPS accuracy value) — the last retained line always ends with a visible '…' truncation signal"
    requirement: "SUBM-01"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > never silently drops the timestamp for a long-accuracy 3+-line input (residual CR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Original CR-01 2-line trigger regression still passes with no spurious ellipsis (01-08's fix preserved, not re-broken)"
    requirement: "SUBM-01"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > retains the trailing timestamp on the last line (CR-01 regression)"
        status: pass
    human_judgment: false
  - id: D3
    description: "2-line cap and single-unbreakable-word ellipsis behaviours still hold, now content-checked (not length-only)"
    requirement: "SUBM-01"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > caps wrapped output at OVERLAY_MAX_LINES (2) even for longer text, signaling truncation"
        status: pass
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > ellipsizes a single unbreakable word that overflows maxWidth"
        status: pass
    human_judgment: false
  - id: D4
    description: "No-false-signal guard: a text that wraps cleanly to exactly 2 lines with no leftover content is not over-ellipsized"
    requirement: "SUBM-01"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > does not over-ellipsize output that wraps cleanly with no truncation"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-26
status: complete
---

# Phase 01 Plan 09: Overlay Truncation Signal (Residual CR-01) Summary

**Fixed `wrapOverlayLines`'s break-truncation path so a 3+-line wrap (e.g. a long/imprecise GPS accuracy value) now always leaves a visible "…" on the last retained line instead of silently discarding the burned-in timestamp, and locked it with content-based unit assertions.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-25T19:37Z
- **Completed:** 2026-07-25T19:47Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Closed the residual CR-01 gap: `wrapOverlayLines("...±123457m... 2026, 14:03", 20)` previously returned `["12.9716, 77.5946 ·", "±123457m · 23 Jul"]` with the timestamp silently gone and no signal — now returns a last line ending in "…" whenever content is cut
- Added a `truncated` boolean tracked at the loop's `break` site so the post-loop code can distinguish "ran out of words naturally" (append the leftover fragment, no ellipsis unless it independently overflows) from "cut off mid-wrap" (never append the doomed fragment, always ellipsize the last retained line)
- Removed the now-unreachable post-loop length clamp that used to append-then-silently-discard the dangling fragment — root cause of the original defect
- Strengthened the test suite from length-only assertions to content-based assertions: the residual 3+-line case, the strengthened 2-line-cap case, and a new no-false-signal guard (clean 2-line wraps are not over-ellipsized) all assert on the actual last-line content, not just `lines.length`

## Task Commits

Each task was committed atomically:

1. **Task 1: Guarantee wrapOverlayLines signals truncation instead of silently dropping content beyond 2 lines (residual CR-01)** - `38fa44b` (fix, TDD: RED verified before GREEN in-session, single commit per plan's non-strict-TDD `type="auto" tdd="true"` execution — see Deviations)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/lib/overlay.ts` - `wrapOverlayLines`'s post-loop truncation path reworked: a `truncated` flag set at the `break` site prevents appending a doomed fragment and broadens the ellipsis branch to fire on break-truncation OR measured-width overflow; `formatOverlayText`, `drawOverlay`, `OVERLAY_MAX_LINES`, and the function signature/export are unchanged
- `tests/unit/overlay.test.ts` - Added a residual-CR-01 long-accuracy 3+-line test, a no-false-signal guard test, and strengthened the existing 2-line-cap and CR-01-regression cases to assert on ellipsis-signal content rather than length alone

## Decisions Made
- See `key-decisions` in frontmatter: skip-append-on-truncation over push-then-clamp; broadened ellipsis condition (`truncated || overflow`) unifies both truncation causes on one visible-signal path; removed the now-dead length clamp rather than keeping it as a no-op.

## Deviations from Plan

None — plan executed exactly as written. The plan's task carries `tdd="true"` under a `type="auto"` (not plan-level `type: tdd`) task, so RED→GREEN was executed within the single task as instructed (extend tests, confirm the two new/strengthened assertions FAIL against the pre-fix source, then apply the source fix and confirm all pass) and committed as one atomic `fix(01-09)` commit per the plan's task-commit-protocol default (single-task plan, not a plan-level `type: tdd` requiring separate `test(...)`/`feat(...)` gate commits).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The single residual blocking gap identified in `01-VERIFICATION.md` (the D-02 timestamp-drop defect's 3+-line trigger) is now closed and regression-locked with content-based tests.
- All 7 phase requirement IDs (SUBM-01/02/03/06, FEED-01/03/04) remain `✓ SATISFIED`; no new requirement was introduced by this narrow gap-closure round.
- Out of scope and untouched, per plan: `01-REVIEW.md`'s 10 Warning-level and 6 Info-level findings, the double-tap-race concurrency test, and the 2 skipped real-device human-verification items (iOS Safari orientation/legibility, forced photo-404 placeholder) — these remain open items for a future round or human-verify pass, not blockers to this plan's completion.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-26*

## Self-Check: PASSED

- FOUND: src/lib/overlay.ts
- FOUND: tests/unit/overlay.test.ts
- FOUND: .planning/phases/01-core-capture-to-feed-skeleton/01-09-SUMMARY.md
- FOUND commit: 38fa44b
