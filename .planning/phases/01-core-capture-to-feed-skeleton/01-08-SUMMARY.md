---
phase: 01-core-capture-to-feed-skeleton
plan: 08
subsystem: capture
tags: [canvas, overlay, word-wrap, vitest, tdd, gap-closure]

# Dependency graph
requires:
  - phase: 01-core-capture-to-feed-skeleton
    provides: "src/lib/overlay.ts (formatOverlayText/wrapOverlayLines/drawOverlay) from 01-03"
provides:
  - "Corrected wrapOverlayLines break condition — the burned-in geotag+timestamp overlay no longer silently drops its timestamp half at common wrap widths"
  - "Exported wrapOverlayLines and a new unit-test describe block regression-locking timestamp retention, the 2-line cap, and ellipsis truncation"
affects: [overlay, capture, anti-fraud-evidence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stub CanvasRenderingContext2D-like measureText object (width = char count) for deterministic, dependency-free canvas text-wrap unit tests"

key-files:
  created: []
  modified:
    - src/lib/overlay.ts
    - tests/unit/overlay.test.ts

key-decisions:
  - "Fixed the break condition exactly as specified (`>= OVERLAY_MAX_LINES`) and exported wrapOverlayLines without touching formatOverlayText, drawOverlay, OVERLAY_MAX_LINES, or the post-loop clamp/ellipsis logic — narrow, low-risk, single-purpose fix per plan scope"

patterns-established:
  - "Canvas-adjacent pure functions get direct unit coverage via a minimal measureText stub rather than a full canvas mock"

requirements-completed: [SUBM-01]

coverage:
  - id: D1
    description: "wrapOverlayLines retains the trailing timestamp on the last wrapped line (CR-01 regression fixed) — the burned-in anti-fraud proof (D-02) is no longer silently truncated"
    requirement: "SUBM-01"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > retains the trailing timestamp on the last line (CR-01 regression)"
        status: pass
    human_judgment: false
  - id: D2
    description: "2-line cap still holds after the fix (never wraps to 3+ lines)"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > caps wrapped output at OVERLAY_MAX_LINES (2) even for longer text"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ellipsis truncation of an unbreakable overflowing word still holds after the fix"
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#wrapOverlayLines > ellipsizes a single unbreakable word that overflows maxWidth"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real-device legibility of the now-complete overlay (iOS Safari) — separate, still-open human-verification item; explicitly out of scope for this plan"
    verification: []
    human_judgment: true
    rationale: "Requires a physical device camera capture; 01-VERIFICATION.md already tracks this as a separate open item, not closed by this code-level fix"

# Metrics
duration: 8min
completed: 2026-07-25
status: complete
---

# Phase 01 Plan 08: CR-01 Overlay Word-Wrap Fix Summary

**Fixed an off-by-one break condition in `wrapOverlayLines` that silently discarded the burned-in timestamp on the overlay's second line, and closed the zero-coverage gap that let it ship.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-25T18:50:00Z
- **Completed:** 2026-07-25T18:58:00Z
- **Tasks:** 1 (TDD: RED + GREEN commits)
- **Files modified:** 2

## Accomplishments
- Fixed `wrapOverlayLines`'s break condition from `=== OVERLAY_MAX_LINES - 1` (fired the instant the final allowed line started accumulating, discarding every subsequent word) to `>= OVERLAY_MAX_LINES` (stops only once OVERLAY_MAX_LINES full lines have been pushed) — restoring the burned-in timestamp half of the D-02 anti-fraud overlay.
- Exported `wrapOverlayLines` from `src/lib/overlay.ts` for direct unit testing, closing the zero-coverage gap that let CR-01 ship undetected.
- Added a `describe("wrapOverlayLines")` block to `tests/unit/overlay.test.ts` with a stub `measureText` context, regression-locking: (1) timestamp retention on the last line for the real overlay string, (2) the 2-line cap, (3) ellipsis truncation of an unbreakable overflowing word.
- Full suite grew from 30/30 to 33/33 passing; no regressions.

## Task Commits

Each task step was committed atomically (TDD RED → GREEN):

1. **Task 1 RED: add failing wrapOverlayLines regression tests** - `32fdd40` (test)
2. **Task 1 GREEN: fix break condition + export wrapOverlayLines** - `11282ec` (fix)

**Plan metadata:** committed separately in final metadata commit below.

## Files Created/Modified
- `src/lib/overlay.ts` - `wrapOverlayLines` exported; break condition corrected to `>= OVERLAY_MAX_LINES`; rationale comment updated
- `tests/unit/overlay.test.ts` - new `describe("wrapOverlayLines")` block (stub `measureText` context, 3 assertions) added below the existing `formatOverlayText` tests

## Decisions Made
- Followed the plan's exact fix and scope: only the break-condition line and the `export` keyword changed in source; no changes to `formatOverlayText`, `drawOverlay`, `OVERLAY_MAX_LINES`, the post-loop clamp, or the ellipsis block.
- Used a minimal stub `{ measureText: (t) => ({ width: t.length }) }` cast to `CanvasRenderingContext2D` (character-count-as-width) rather than a full canvas mock — matches the plan's specified approach and keeps the test dependency-free.

## Deviations from Plan

None - plan executed exactly as written. RED test confirmed failing (import unresolved before the `export` was added) before the GREEN fix was applied, per the plan's strict RED→GREEN order.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

CR-01 is closed at the code level. Per the plan's scope note, the true driver was the D-02 plan-level must-have (not a REQUIREMENTS.md failure) — all 7 phase requirement IDs remain SATISFIED as tracked in `01-VERIFICATION.md`. Two items remain explicitly out of scope and still open there:
- Real-device legibility of the now-complete overlay (iOS Safari) — still requires physical-device human verification.
- The double-tap Publish race and the 6 Warning-level code-review robustness gaps — deferred per `01-VERIFICATION.md`, unchanged by this plan.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-25*

## Self-Check: PASSED

- FOUND: src/lib/overlay.ts
- FOUND: tests/unit/overlay.test.ts
- FOUND: .planning/phases/01-core-capture-to-feed-skeleton/01-08-SUMMARY.md
- FOUND commit: 32fdd40 (test RED)
- FOUND commit: 11282ec (fix GREEN)
- FOUND commit: 68d6830 (docs summary)
