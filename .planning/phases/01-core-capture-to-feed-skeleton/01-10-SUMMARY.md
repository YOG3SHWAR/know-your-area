---
phase: 01-core-capture-to-feed-skeleton
plan: 10
subsystem: ui
tags: [react, nextjs, playwright, getusermedia, canvas, e2e]

# Dependency graph
requires:
  - phase: 01-core-capture-to-feed-skeleton
    provides: CameraCapture.tsx (D-01 live capture), PermissionGate.tsx (D-03 denial hard-block), Plan 01-05's escalation wiring
provides:
  - "Static captured-photo preview (with D-02 burned-in overlay) shown over the live camera view immediately on capture"
  - "Live MediaStream tracks stopped on successful upload instead of left running until unmount"
  - "Distinct 'Photo captured — Retake?' control state, replacing the reverted 'Capture Photo' label"
  - "Working Retake path: clears preview, reports photoKey=null to parent (disables Publish), restarts live camera via a cameraSession-driven effect re-run"
  - "New G-01-9 e2e test in tests/e2e/capture.spec.ts proving preview/Retake behavior without regressing prior capture-flow tests"
  - "01-UI-SPEC.md 'populated' state row for the camera capture flow, closing the design-contract gap"
affects: [capture, ui-spec, e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Always-mounted <video> with an absolutely-positioned <img> overlay on top for a freeze-frame preview, so the underlying stream binding survives generic error/retry paths without remounting"
    - "A numeric 'session' counter state bumped to intentionally re-run a mount-style useEffect (restart pattern) instead of introducing a separate imperative restart function"

key-files:
  created: []
  modified:
    - src/components/capture/CameraCapture.tsx
    - tests/e2e/capture.spec.ts
    - .planning/phases/01-core-capture-to-feed-skeleton/01-UI-SPEC.md

key-decisions:
  - "Broadened onCaptured's signature to (photoKey: string | null) => void so Retake can explicitly clear the parent's pending photo — src/app/capture/page.tsx needed no change since setPhotoKey already accepts null"
  - "previewUrl set twice per capture (immediately after drawImage, then again after drawOverlay) so the user sees an instant freeze-frame first and the final overlaid image once available, matching exactly what gets uploaded"
  - "Denial escalation branches (reportDenied) deliberately do NOT clear previewUrl — PermissionGate replaces the whole subtree on denial, so it's moot there and left untouched to avoid any risk to Plan 01-05's hard-block"

requirements-completed: [SUBM-01]

coverage:
  - id: D1
    description: "After capturing a photo, the live camera feed is replaced by a static preview of the captured photo (with its burned-in overlay), and the camera stream is stopped"
    requirement: "SUBM-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture shows a static preview and a distinct captured/Retake control (G-01-9)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The capture control shows a distinct 'Photo captured — Retake?' state; Retake clears the pending photo and restarts the live camera"
    requirement: "SUBM-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture shows a static preview and a distinct captured/Retake control (G-01-9)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No regression to the happy-path publish flow, the two proactive-denial hard-blocks, the two G-01-3 escalation paths, or the G-01-4 uniform-grid test"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts (full file, 7 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "01-UI-SPEC.md's UI Considerations table specifies the post-capture 'populated' confirmation state, closing the design-contract gap"
    verification:
      - kind: other
        ref: "grep -qE \"populated.*Camera capture flow\" 01-UI-SPEC.md && grep -qi Retake 01-UI-SPEC.md"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real-device visual confirmation of the preview + Retake on a phone (UAT test 9 re-check)"
    verification: []
    human_judgment: true
    rationale: "Plan explicitly scopes this out of automated closure — real-device visual confirmation remains a manual UAT re-check, not verifiable by Playwright's simulated media device."

duration: 5min
completed: 2026-07-26
status: complete
---

# Phase 01 Plan 10: Capture Preview + Retake Feedback (G-01-9) Summary

**Static captured-photo preview (with burned-in geotag/timestamp overlay) replaces the live camera feed on capture, the stream stops, and a distinct "Photo captured — Retake?" control with a working restart path closes the missing-feedback gap from UAT test 9.**

## Performance

- **Duration:** 5 min (commit-to-commit)
- **Started:** 2026-07-26T14:27:57Z
- **Completed:** 2026-07-26T14:29:56Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `CameraCapture.tsx` now surfaces a static, overlay-bearing preview the instant a photo is captured, stops the live `MediaStream` on successful upload, and shows a distinct "Photo captured — Retake?" control instead of reverting to "Capture Photo"
- Retake works end-to-end: clears the preview, reports `photoKey = null` to the parent (disabling Publish), and restarts the live camera via a `cameraSession` counter that re-runs the acquire effect
- Generic capture failure paths (non-denial GPS error, blob failure, upload failure) clear the preview so the live view returns for retry; Plan 01-05's denial escalation (`reportDenied`) is untouched
- New G-01-9 e2e test added following the plan's RED→GREEN order: confirmed failing against the unmodified component, then passing after the fix, alongside all 6 pre-existing capture-flow tests (happy path, 2 proactive denials, 2 G-01-3 escalations, G-01-4 uniform grid)
- 01-UI-SPEC.md's UI Considerations table gained a `populated` row for the camera capture flow, closing the design-contract gap the RCA identified as the upstream cause

## Task Commits

Each task was committed atomically:

1. **Task 1: Show a captured-photo preview + stop the live stream + distinct captured/Retake state (G-01-9)** — RED: `d35c26e` (test), GREEN: `f51b378` (feat)
2. **Task 2: Close the design-contract gap — add the post-capture 'populated' state to 01-UI-SPEC.md** — `e85a7c8` (docs)

**Plan metadata:** (this commit)

## TDD Gate Compliance

Task 1 was `tdd="true"` with an explicit RED→GREEN order in its `<action>`:
- RED: `d35c26e` — new G-01-9 test added; run confirmed it failed (`capture-preview` testid not found) against the unmodified component.
- GREEN: `f51b378` — `CameraCapture.tsx` fix implemented; full `tests/e2e/capture.spec.ts` (7 tests) passes.
- No REFACTOR commit was needed — the GREEN implementation required no follow-up cleanup.

## Files Created/Modified

- `src/components/capture/CameraCapture.tsx` — captured-photo preview (`<img data-testid="capture-preview">` over the always-mounted `<video>`), stream-stop on success, `cameraSession`-driven restart effect, `handleRetake`, and a distinct captured/Retake button state
- `tests/e2e/capture.spec.ts` — new G-01-9 test proving the preview and captured/Retake control appear, and that Retake restores the live camera and disables Publish
- `.planning/phases/01-core-capture-to-feed-skeleton/01-UI-SPEC.md` — new `populated` state row for the camera capture flow (post-capture confirmation); resolved-state summary count bumped 16 → 17 covered

## Decisions Made

- Broadened `onCaptured`'s type to `(photoKey: string | null) => void` so Retake can clear the parent's pending photo; `src/app/capture/page.tsx` needed no change since `setPhotoKey` already accepts `null`.
- Set `previewUrl` twice per capture (right after `drawImage`, again after `drawOverlay`) so the user gets an instant freeze-frame and then sees the final overlaid image that matches the uploaded bytes exactly.
- Left the two `reportDenied(...)` denial branches in `handleCapture` without preview-clearing logic, per the plan's explicit instruction — `PermissionGate` replaces the whole subtree on denial, so clearing `previewUrl` there would be a no-op and adds needless risk to Plan 01-05's hard-block path.

## Deviations from Plan

None — plan executed exactly as written, including the RED→GREEN task ordering explicitly specified in Task 1's `<action>`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-01-9 closed: automated verification (`npx playwright test tests/e2e/capture.spec.ts`, `npx tsc --noEmit`, `npm run lint` on touched files) all pass per the plan's `<verification>` block.
- Real-device visual confirmation of the preview + Retake flow remains an open manual UAT re-check (test 9) — out of scope for this automated closure per the plan.
- No other gaps from `01-UAT.md` are addressed by this plan; G-01-EXTRA-2 (home-page SSR webpack error) remains explicitly out of scope (diagnosed as a transient dev-server cache artifact, no code fix).

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-26*

## Self-Check: PASSED

All created/modified files found on disk; all three task commits (d35c26e, f51b378, e85a7c8) found in git log.
