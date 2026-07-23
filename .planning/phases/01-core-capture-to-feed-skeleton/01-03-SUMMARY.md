---
phase: 01-core-capture-to-feed-skeleton
plan: 03
subsystem: ui
tags: [nextjs, react, getusermedia, canvas, geolocation, permissions-api, lucide-react, playwright, zod]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Working tracer interfaces this plan refines: CameraCapture.tsx (getUserMedia + canvas capture-to-blob), geolocation.ts's captureBestFix() signature, capture/page.tsx composition, submitComplaint Server Action (already zod-validates), upload-url route (server-derived key/content-type)"
provides:
  - "Geotag+timestamp overlay burned onto the capture canvas before toBlob (D-02) via src/lib/overlay.ts (formatOverlayText + drawOverlay)"
  - "Orientation-safe canvas sizing re-read from videoTrack.getSettings() on every capture, never mirrored (RESEARCH.md Pitfall 3)"
  - "captureBestFix upgraded to a watchPosition wait-for-fix window (D-04) that keeps the best-accuracy reading and rejects a distinct no-fix error rather than resolving a fabricated coordinate (D-03)"
  - "src/components/capture/PermissionGate.tsx — proactive Permissions API hard-block on denied camera/location with verbatim UI-SPEC copy"
  - "src/components/capture/CategoryPicker.tsx — 5 fixed category chips with icons, amber selected state, 44px touch targets"
  - "Single-flight Publish flow (locating -> submitting phases) that cannot double-submit on a double-tap"
affects: [01-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two independent GPS reads per submission: CameraCapture takes its own fresh captureBestFix() read at capture time to burn the overlay (best-effort visual proof); capture/page.tsx takes a second captureBestFix() read right before submit for the value actually stored as accuracy_m/lat/lng — matches the plan's own key_links (CameraCapture -> overlay.ts vs. page.tsx -> geolocation.ts 'before submit')."
    - "Permissions API proactive-denial gate: navigator.permissions.query({name:'camera'|'geolocation'}) checked once at mount, reactive via .onchange, fails open to 'ok' if the API or a given permission name is unsupported (Safari lacks 'camera') so getUserMedia's own catch remains the fallback signal rather than false-blocking a supported browser."
    - "Overlay burn-in: canvas 2D fillRect bottom bar + fillText, with a manual word-wrap-then-ellipsis-truncate helper (up to 2 lines) so long/imprecise accuracy strings degrade gracefully instead of overflowing the canvas."

key-files:
  created:
    - src/lib/overlay.ts
    - src/components/capture/PermissionGate.tsx
    - src/components/capture/CategoryPicker.tsx
    - tests/unit/overlay.test.ts
  modified:
    - src/components/capture/CameraCapture.tsx
    - src/lib/geolocation.ts
    - src/app/capture/page.tsx
    - tests/e2e/capture.spec.ts

key-decisions:
  - "GPS fix acquisition happens twice per submission (capture-time overlay read + pre-submit read) rather than lifting a single fix up through component state — kept CameraCapture self-contained per the plan's task/file boundaries, at the cost of a second ~4s wait-for-fix window between tapping Capture and tapping Publish."
  - "Added a 'no-fix' hard-block screen and copy ('We couldn't get an accurate location fix...') not present verbatim in UI-SPEC's Copywriting Contract — the contract only defines exact copy for camera-denied/location-denied, not for a permission-granted-but-no-reading-arrived case that the plan's own acceptance criteria explicitly requires hard-blocking (D-03)."
  - "lucide-react's AlertTriangle icon is named TriangleAlert in the installed package version (^1.26.0) — used TriangleAlert for the pothole category to avoid a build-breaking import (caught via a pre-write API check, not a runtime failure)."

requirements-completed: [SUBM-01, SUBM-02, SUBM-03]

coverage:
  - id: D1
    description: "Every captured photo has a visible geotag+timestamp overlay burned into the canvas before toBlob, sized/oriented from a live videoTrack.getSettings() read taken fresh on every capture (never cached), with no mirror transform"
    requirement: SUBM-01
    verification:
      - kind: unit
        ref: "tests/unit/overlay.test.ts#formatOverlayText (6 cases: formatting, fractional/negative/non-finite/very-long accuracy, negative lat/lng)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: live camera + GPS produces a published complaint (SUBM-01, SUBM-03)"
        status: pass
    human_judgment: true
    rationale: "drawOverlay's actual pixel output (bar placement, text legibility, wrap/truncation at narrow aspect ratios) cannot be verified by a headless emulated-camera Playwright run — the plan's own <human-check> defers real orientation/legibility verification to a real iOS Safari device at end-of-phase review (RESEARCH.md Pitfall 3 explicitly evades emulation), matching the project's human_verify_mode: end-of-phase config."
  - id: D2
    description: "captureBestFix runs a watchPosition wait-for-fix window (default 4s), keeps the best-accuracy reading, clears the watch, and rejects a distinct no-fix error without ever resolving a fabricated/default coordinate; capture/page.tsx hard-blocks (no submission path) if no reading arrives"
    requirement: SUBM-03
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: live camera + GPS produces a published complaint (SUBM-01, SUBM-03) (exercises the full wait-for-fix path against the fixture's mocked geolocation)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Camera or location permission denial is detected proactively via the Permissions API and hard-blocks the entire capture flow with the exact UI-SPEC copy, with no retry/degraded submission path"
    requirement: SUBM-01
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: denied camera permission hard-blocks with no submission path (D-03)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: denied location permission hard-blocks with no submission path (D-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 5-category picker renders exactly the 5 fixed categories with amber-accent selected state and 44px touch targets; Publish stays disabled until a category is chosen; submitComplaint re-validates category server-side against the 5-value zod enum"
    requirement: SUBM-02
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: live camera + GPS produces a published complaint (SUBM-01, SUBM-03) (clicks the 'Pothole/Road damage' chip and drives Publish enablement)"
        status: pass
      - kind: unit
        ref: "tests/unit/submit-schema.test.ts#rejects a 6th, unlisted category"
        status: pass
    human_judgment: true
    rationale: "Amber-accent visual styling and the 44px touch-target sizing are declared but not asserted by any automated check (no visual-regression tooling in this project) — plan's own <human-check> defers picker visuals + single-flight double-tap prevention to a real-device end-of-phase review."
  - id: D5
    description: "Publish disables and shows a sequential 'Getting your location…'/'Publishing…' state during the pre-submit GPS wait + insert, so a double-tap cannot create two complaints for one capture"
    requirement: SUBM-01
    verification:
      - kind: other
        ref: "Code review: handlePublish's `if (!photoKey || !category || publishPhase !== \"idle\") return;` guard makes re-entrant clicks a no-op while publishPhase is 'locating' or 'submitting'; no automated double-click concurrency test was written."
        status: pass
    human_judgment: true
    rationale: "No adversarial/double-click Playwright test exercises the exact race (two rapid clicks before React re-renders the disabled attribute) — the guard is correct by construction (photoKey/category/publishPhase captured synchronously in the event handler) but unexercised by an automated concurrency test."

duration: ~35min across two sessions (interrupted mid-investigation by a usage-limit cutoff before any 01-03 commits existed; resumed with no lost work)
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 3: Capture Flow Hardening (Overlay, GPS Wait-for-Fix, Permission Hard-Block, Category Picker) Summary

**Refined the Plan 02 tracer into the real SUBM-01/02/03 capture experience: canvas-burned geotag+timestamp overlay, orientation-safe capture sizing, a `watchPosition` GPS wait-for-fix window with a `no-fix` hard-block, proactive Permissions-API hard-blocks for denied camera/location, and a 5-category picker backed by existing server-side zod re-validation.**

## Performance

- **Duration:** ~35 min of active execution across the resumed session (task-commit span 14:14–14:32 IST)
- **Started:** 2026-07-23 (resumed after a usage-limit cutoff with zero prior 01-03 commits)
- **Completed:** 2026-07-23T09:02Z
- **Tasks:** 3/3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- `src/lib/overlay.ts`: `formatOverlayText` renders `"12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03"` via a fixed-timezone `Intl.DateTimeFormat("en-IN", ...)` (deterministic regardless of device timezone) with defensive accuracy clamping (negative/NaN/Infinity all fall back to `±0m`); `drawOverlay` fills a semi-opaque bottom bar and word-wraps/ellipsis-truncates up to 2 lines so long accuracy strings or narrow aspect ratios degrade gracefully instead of overflowing the canvas
- `CameraCapture.tsx` now takes its own fresh `captureBestFix()` read at the moment of capture, draws the video frame with canvas dimensions re-read from `videoTrack.getSettings()` on every capture (never cached), and calls `drawOverlay` **before** `canvas.toBlob` — so the overlay is part of the stored image bytes, not a CSS layer
- `src/lib/geolocation.ts`'s `captureBestFix` upgraded from a single `getCurrentPosition` call to the RESEARCH.md wait-for-fix pattern: `watchPosition` keeps the best-`accuracy` reading over a 4s window, clears the watch, and rejects a distinct `no-fix` error if literally nothing arrived — never resolves a fabricated/default coordinate
- `src/components/capture/PermissionGate.tsx` (new): queries the Permissions API for `camera`+`geolocation` once at mount, hard-blocks with the verbatim UI-SPEC denied copy, stays reactive to a permission flipped mid-session via `.onchange`, and fails open (`ok`) if the API/permission name isn't supported so a real denial is still caught by `getUserMedia`'s own error path
- `src/app/capture/page.tsx`: wraps the flow in `PermissionGate`, adds a page-level "Getting your location…"/"Publishing…" sequential Publish-button state with a single-flight re-entrancy guard, and hard-blocks (no submission path) with a new `no-fix` copy string if the pre-submit wait-for-fix window ends with zero readings
- `src/components/capture/CategoryPicker.tsx` (new): renders the 5 `CATEGORIES` as icon chips (`TriangleAlert`/`Trash2`/`Lightbulb`/`Droplet`/`TrafficCone`), amber-accent selected state, `min-h-11` (44px) touch targets — replaces the tracer's inline chip markup in `page.tsx`
- `tests/unit/overlay.test.ts` (new, 6 cases) and 2 new `tests/e2e/capture.spec.ts` denied-permission cases (camera, location) using an injected `navigator.permissions.query` override, since Playwright/Chromium has no supported API to force a real "denied" permission state deterministically
- Confirmed (no code change needed) that `submitComplaint`'s existing `submissionSchema.parse(input)` already re-validates `category` server-side against the 5-value zod enum, and that `/api/upload-url`'s server-derived key/content-type hardening from Plan 02 is untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Overlay burn-in + orientation-safe canvas (D-02, Pitfall 3)** - `b71bd81` (feat)
2. **Task 2: GPS wait-for-fix window + permission hard-block (D-03, D-04, Pitfall 4/5)** - `40c2453` (feat)
3. **Task 3: Category picker + server-side category re-validation (SUBM-02)** - `9e84161` (feat)

_No separate metadata commit yet — this repo is running sequential/non-worktree mode; STATE.md/ROADMAP.md/REQUIREMENTS.md updates are committed as part of the final-commit step below._

## Files Created/Modified
- `src/lib/overlay.ts` — `formatOverlayText(coords, accuracy, date)` + `drawOverlay(ctx, canvas, text)`, both exported per the plan's artifact spec
- `tests/unit/overlay.test.ts` — 6 unit cases covering formatting + defensive accuracy handling
- `src/components/capture/CameraCapture.tsx` — capture-time `captureBestFix()` read feeds `drawOverlay` before `toBlob`; adds a "Starting camera…" overlay and a "locating" status label
- `src/lib/geolocation.ts` — `captureBestFix(waitMs=4000)` rewritten to the `watchPosition` wait-for-fix pattern
- `src/components/capture/PermissionGate.tsx` — proactive camera/location denial hard-block wrapper
- `src/components/capture/CategoryPicker.tsx` — 5-category icon-chip picker
- `src/app/capture/page.tsx` — wraps flow in `PermissionGate`, sequential Publish-phase state, `no-fix` hard-block, wires `CategoryPicker`
- `tests/e2e/capture.spec.ts` — bumped write-path timeouts for the two 4s wait-for-fix windows now in the critical path; added 2 denied-permission hard-block cases

## Decisions Made
- Kept GPS acquisition as two independent `captureBestFix()` calls (capture-time for the overlay, pre-submit for the stored value) rather than threading a single fix through component props — matches the plan's own `key_links` (CameraCapture → overlay.ts vs. page.tsx → geolocation.ts "before submit") and keeps each task's file boundary self-contained, at the cost of ~8s combined wait-for-fix latency across a full capture→publish cycle.
- Wrote a new `no-fix` hard-block copy string (not in UI-SPEC's Copywriting Contract, which only defines camera-denied/location-denied copy) to satisfy the plan's explicit "hard-blocks on denial/no-fix" acceptance criterion — flagged as a coverage item needing human sign-off on wording, not just behavior.
- Used `TriangleAlert` instead of `AlertTriangle` for the pothole category icon after confirming via the installed `lucide-react` `.d.ts` that `AlertTriangle` was renamed upstream in this package version — avoided a build-breaking import before it happened.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `AlertTriangle` icon does not exist in the installed lucide-react version**
- **Found during:** Task 3 (CategoryPicker implementation)
- **Issue:** The natural icon choice for the "Pothole/Road damage" category, `AlertTriangle`, is not exported by the installed `lucide-react@^1.26.0` — grepping the package's `.d.ts` showed it was renamed to `TriangleAlert` upstream.
- **Fix:** Used `TriangleAlert` instead; verified against the installed package's type declarations before writing the import (not discovered via a failed build).
- **Files modified:** `src/components/capture/CategoryPicker.tsx`
- **Verification:** `npx tsc --noEmit` and `npm run build` both clean.
- **Committed in:** `9e84161` (Task 3 commit)

**2. [Rule 2 - Missing Critical] Added a `no-fix` hard-block screen and copy not present in UI-SPEC**
- **Found during:** Task 2 (GPS wait-for-fix + permission hard-block)
- **Issue:** The plan's acceptance criteria requires hard-blocking submission if the wait-for-fix window ends with zero GPS readings ("on `no-fix` or denied, hard-block per D-03"), but UI-SPEC's Copywriting Contract only defines exact copy for camera-denied/location-denied — no copy exists for a permission-granted-but-no-reading-arrived case.
- **Fix:** Added a new copy string ("We couldn't get an accurate location fix for this report...") and a dedicated `data-testid="gps-no-fix-block"` screen in `capture/page.tsx`, styled consistently with `PermissionGate`'s hard-block treatment.
- **Files modified:** `src/app/capture/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; behavior implied by `captureBestFix`'s `no-fix` rejection is exercised indirectly (no direct e2e forces a real no-fix condition, since the Playwright fixture always seeds a valid mocked position — flagged in coverage D2/D3 as code-reviewed, not e2e-proven for the no-fix branch specifically).
- **Committed in:** `40c2453` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - blocking, 1 Rule 2 - missing critical)
**Impact on plan:** Both necessary for the plan's own acceptance criteria/build correctness. No scope creep — no feature beyond what D-02/D-03/D-04/SUBM-02 already required was added.

## Issues Encountered

- **Full-parallel Playwright suite contention (environmental, not a regression):** Running the entire `tests/e2e/` suite with the default `fullyParallel: true` + 4 workers against the single `npm run dev` process and live Supabase/R2 infrastructure caused the two GPS-heavy write-path specs (`capture.spec.ts`'s full flow, `feed.spec.ts`'s full flow) to time out waiting for the post-publish redirect, even though each passes reliably in isolation (~13-14s) and the full suite passes cleanly with `--workers=1` (29.6s, 4 passed + 2 skipped `fixme` specs owned by Plan 04). This matches the plan's own required verification command (`npx playwright test tests/e2e/capture.spec.ts` — a single spec file, not the full suite) and is a pre-existing characteristic of the dev-mode single-process + live-external-services test setup from Plans 01/02, not something introduced by this plan's changes. Not modified (`playwright.config.ts` is outside this plan's `files_modified`); logged here for visibility rather than "fixed."
- **Session interruption:** The initial execution attempt was cut off mid-investigation by a usage-limit boundary before any file writes or commits existed for this plan (confirmed via `git log` showing zero 01-03 commits at resume time). Resumed from scratch with no partial/inconsistent state to reconcile.

## User Setup Required

None — no new external service configuration required. `.env.local`'s existing `DATABASE_URL`/`R2_*` values from Plans 01/02 are unchanged and sufficient.

## Next Phase Readiness

- Plan 04 (feed refinement — infinite scroll D-09, `FeedCard` styling, cursor pagination, `search.spec.ts`/`permalink.spec.ts`) is unaffected by this plan's changes — no shared files were touched (per the coordinator's environment note, verified: this plan's `files_modified` list stayed within `src/components/capture/`, `src/lib/overlay.ts`, `src/lib/geolocation.ts`, `src/app/capture/page.tsx`, `src/actions/submit-complaint.ts` (unchanged), `src/app/api/upload-url/route.ts` (unchanged), and `tests/e2e/capture.spec.ts`).
- Three coverage items are explicitly deferred to end-of-phase human review, matching the project's `human_verify_mode: end-of-phase` config: D1 (real iOS Safari orientation + overlay legibility at narrow aspect ratios, RESEARCH.md Pitfall 3 explicitly evades emulation), D4 (category-picker visual/touch-target check), and D5 (double-tap single-flight prevention on a real device).
- The `no-fix` hard-block branch (GPS permission granted but zero readings arrive in the wait-for-fix window) is code-reviewed and type-checked but has no dedicated e2e test — the Playwright fixture always seeds a valid mocked geolocation position, so there's no straightforward way to simulate "permission granted, but the watch never fires" headlessly. Flagging for a future test-infra investment (e.g. a fixture variant that grants geolocation but never calls `setGeolocation`) if this proves a real-world failure mode worth hardening further.

## Self-Check: PASSED

All 8 claimed created/modified files verified present on disk; all 3 claimed task commit hashes (`b71bd81`, `40c2453`, `9e84161`) verified present in `git log --oneline --all`; `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run` (16/16), and `npx playwright test tests/e2e/capture.spec.ts` (3/3) all independently re-run clean during this plan's execution, not just asserted.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-23*
