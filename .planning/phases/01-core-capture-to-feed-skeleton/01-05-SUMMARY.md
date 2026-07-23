---
phase: 01-core-capture-to-feed-skeleton
plan: 05
subsystem: ui
tags: [react-context, playwright, e2e, permissions-api, getUserMedia, geolocation]

# Dependency graph
requires:
  - phase: 01-core-capture-to-feed-skeleton (plans 01-04)
    provides: PermissionGate, CameraCapture, CategoryPicker, capture.spec.ts e2e baseline
provides:
  - PermissionDenialContext / usePermissionDenial — descendant-reportable escalation into PermissionGate's hard-block
  - CameraCapture routes real getUserMedia NotAllowedError and geolocation code-1 (PERMISSION_DENIED) denials into the hard-block instead of raw browser error text
  - CategoryPicker fixed 2-column uniform grid layout
affects: [capture-flow, permission-gate, category-picker, e2e-capture-suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React context escalation pattern: a gate component owns denial state; descendants get a stable callback via context to escalate a real API rejection into the gate's existing hard-block, without duplicating hard-block UI/copy in the descendant."
    - "Guard against a proactive/async re-check downgrading an already-reported denial (deniedRef latch) — order-of-resolution races between a slow proactive Permissions API check and a fast escalation must not un-deny."

key-files:
  created: []
  modified:
    - src/components/capture/PermissionGate.tsx
    - src/components/capture/CameraCapture.tsx
    - src/components/capture/CategoryPicker.tsx
    - tests/e2e/capture.spec.ts

key-decisions:
  - "Escalation lives in CameraCapture only (not CapturePage's own captureBestFix call before Publish) — CameraCapture always runs both the camera getUserMedia and its own captureBestFix before Publish is reachable, so both denial vectors are caught at the earliest point without touching CapturePage or src/lib/geolocation.ts."
  - "Used a ref (deniedRef) rather than state to latch 'a denial has been reported' — avoids a stale-closure/render-order bug where the proactive check's evaluate() could re-run after an escalation and flip state back to ok."
  - "Non-denial getUserMedia errors (e.g. NotFoundError) now show a generic 'Couldn't start the camera.' message instead of the raw err.message — closes T-01-07 (no UA-specific internals leak into the UI) as a side effect of the same fix."

requirements-completed: [SUBM-01, SUBM-02, SUBM-03]

coverage:
  - id: D1
    description: "Category picker renders as a uniform 2-column grid — all 5 chips equal width regardless of label length, 44px touch target preserved (G-01-4)"
    requirement: "SUBM-02"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#category picker renders uniform-width chips (G-01-4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Camera denial via real getUserMedia NotAllowedError rejection (Permissions API reporting 'prompt', e.g. Safari or first-visit) escalates into the exact UI-SPEC hard-block with no Capture/Publish path (G-01-3)"
    requirement: "SUBM-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: camera denial via getUserMedia rejection escalates to hard-block (G-01-3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Location denial via geolocation code 1 (PERMISSION_DENIED) after camera succeeds escalates into the exact UI-SPEC hard-block (G-01-3)"
    requirement: "SUBM-03"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: location denial via geolocation code 1 escalates to hard-block (G-01-3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No regression to the two pre-existing proactive-denial tests or the happy-path capture e2e test"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts (full file run — 6/6 pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 05: Gap-Closure — Permission Denial Escalation + Category Grid Summary

**Routed real getUserMedia/geolocation denial into PermissionGate's existing hard-block via a React context escalation callback, and switched CategoryPicker to a fixed 2-column grid for uniform chip widths.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-23T16:52:00Z (approx, from worktree timestamps)
- **Completed:** 2026-07-23T17:27:00Z
- **Tasks:** 2 completed
- **Files modified:** 3 source files + 1 test file (4 total)

## Accomplishments

- Fixed G-01-4: CategoryPicker now uses `grid grid-cols-2` instead of `flex flex-wrap`, so all 5 category chips render as uniform-width cells regardless of label length, with the 44px (`min-h-11`) touch target preserved.
- Fixed G-01-3: PermissionGate now exposes a `PermissionDenialContext`/`usePermissionDenial()` escalation hook. CameraCapture calls `reportDenied("camera")` on a real `getUserMedia` `NotAllowedError` and `reportDenied("location")` on a `captureBestFix` rejection carrying `code === 1` (`PERMISSION_DENIED`), routing both into the existing hard-block UI instead of leaking raw browser error text — restoring the D-03 contract on browsers (Safari, or any first-visit "prompt" state) where the Permissions API never proactively reports `denied`.
- Added a latch (`deniedRef`) so a slower proactive Permissions-API `evaluate()` can never downgrade an already-escalated denial back to `"ok"`.
- Added 3 new e2e tests (1 uniform-grid, 2 escalation) to `tests/e2e/capture.spec.ts`; full spec (6 tests) passes, including the 2 pre-existing proactive-denial tests and the happy-path capture flow test — no regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Category picker — fixed 2-column grid with uniform cells** - `aabcea3` (fix)
2. **Task 2: Route real denial into PermissionGate's hard-block (shared context)** - TDD cycle:
   - RED: `332bb5b` (test) — 2 failing escalation tests added
   - GREEN: `8bcced1` (feat) — PermissionDenialContext + CameraCapture wiring, tests pass

**Plan metadata:** (this commit, see below)

## Files Created/Modified

- `src/components/capture/CategoryPicker.tsx` - `grid grid-cols-2` container with `data-testid="category-picker"`; chips get `w-full justify-center` to center content in the stretched grid cell
- `src/components/capture/PermissionGate.tsx` - Added `PermissionDenialContext`, `usePermissionDenial()` hook, `reportDenied` callback, and a `deniedRef` latch guarding against downgrade races
- `src/components/capture/CameraCapture.tsx` - Consumes `usePermissionDenial()`; routes `NotAllowedError` (camera) and geolocation `code === 1` (location) into `reportDenied`; non-denial camera errors now show a generic message instead of raw `err.message`
- `tests/e2e/capture.spec.ts` - Added "uniform" test (G-01-4) and 2 "escalat" tests (G-01-3) simulating the Permissions-API "prompt" + real-rejection sequence that proactive-only detection misses

## Decisions Made

- Escalation is wired only through CameraCapture (both its own getUserMedia mount effect and its own captureBestFix call in `handleCapture`), not through CapturePage's separate pre-Publish `captureBestFix()` call — per the plan's key_link, CameraCapture always runs both denial-prone operations before Publish is ever reachable, so this is sufficient coverage without touching CapturePage or `src/lib/geolocation.ts`.
- Used a ref (`deniedRef`), not additional state, to latch "denial already reported" — avoids the proactive Permissions API's asynchronous `evaluate()` (which can resolve after an escalation has already fired) overwriting `state` back to `"ok"`.
- Non-denial `getUserMedia` errors (e.g., `NotFoundError` — no camera present) now show a generic "Couldn't start the camera." message rather than the raw `err.message`, incidentally closing T-01-07 (no browser/UA-specific error internals surfaced to the user) as a side effect of routing the NotAllowedError path.

## Deviations from Plan

None — plan executed exactly as written. TDD flow followed as specified (RED commit, then GREEN commit).

## Issues Encountered

- `npm run lint` reported 3 pre-existing `react-hooks/rules-of-hooks` errors, but all three are in stale worktree copies under `.claude/worktrees/agent-*/tests/e2e/fixtures.ts`, not the working tree this plan modified. Verified the 4 files this plan actually touched lint clean via `npx eslint <files>` directly. Logged to `.planning/phases/01-core-capture-to-feed-skeleton/deferred-items.md` per scope-boundary rules (out of scope — unrelated files).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both diagnosed UAT gaps (G-01-3 blocker, G-01-4 cosmetic) are closed with e2e coverage reproducing the original real-device failure modes.
- Full `tests/e2e/capture.spec.ts` suite (6 tests), `npx tsc --noEmit`, and targeted `eslint` on changed files all pass clean.
- No blockers for remaining Phase 01 plans (06, 07).

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-23*
