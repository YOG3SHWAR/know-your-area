---
phase: 01-core-capture-to-feed-skeleton
plan: 11
subsystem: infra
tags: [nextjs, playwright, r2, cors, cloudflare]

# Dependency graph
requires:
  - phase: 01-core-capture-to-feed-skeleton
    provides: CameraCapture.tsx upload flow (Plan 01-02's presigned-PUT-to-R2 pattern), tests/e2e/capture.spec.ts fixtures
provides:
  - "CameraCapture.tsx upload catch block renders one fixed sanitized message ('Couldn't upload the photo. Check your connection and try again.') instead of the raw thrown/network error text"
  - "data-testid=\"capture-error\" on the destructive error paragraph"
  - "Deterministic forced-upload-failure e2e test standing in for the production CORS block"
  - "README CORS setup step documents the production origin (https://knowyourarea.in) and Vercel preview origins alongside localhost, plus the wrangler cors set/list commands"
affects: [capture, e2e-tests, deployment-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "page.route stub chain (same-origin API route fulfilled with a fabricated r2.cloudflarestorage.com URL, then that host's PUT aborted) to deterministically simulate a CORS-class network failure in Playwright without live R2 credentials"

key-files:
  created: []
  modified:
    - src/components/capture/CameraCapture.tsx
    - tests/e2e/capture.spec.ts
    - README.md

key-decisions:
  - "Collapsed the upload catch block's err-typed branching to a single unconditional sanitized message — no code path in that catch should ever reach the UI with raw error text, so the `err instanceof Error` check was removed entirely rather than narrowed"
  - "Test forces failure via page.route abort() on a fabricated r2.cloudflarestorage.com host (not a real bucket) — hermetic, no live R2 credentials needed, same network-error class Safari's CORS block produces"

requirements-completed: [SUBM-01, SUBM-03]

coverage:
  - id: D1
    description: "Upload catch block renders a fixed sanitized message, never the raw thrown/network error text; Publish Report stays disabled on failure"
    requirement: "SUBM-01"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: forced upload failure renders sanitized error, Publish stays disabled (G-01-2)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "No regression to the existing happy-path (SUBM-01/SUBM-03), denial hard-block (G-01-3/D-03), and G-01-9 preview/Retake specs in the same file"
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts (full file, 8 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "README's CORS setup step lists both http://localhost:3000 and https://knowyourarea.in as required origins, with wrangler cors set/list commands"
    requirement: "SUBM-01"
    verification:
      - kind: other
        ref: "grep -n 'knowyourarea' README.md"
        status: pass
    human_judgment: false
  - id: D4
    description: "R2 bucket CORS AllowedOrigins actually updated to include https://knowyourarea.in in production (user_setup — requires R2 credentials the coding agent does not have)"
    verification: []
    human_judgment: true
    rationale: "Applying this change requires Cloudflare R2 credentials (wrangler login or dashboard access) that the executor does not hold. This is infra state outside git — a human with R2 access must run `wrangler r2 bucket cors set` (or the dashboard equivalent) documented in README.md, then confirm with `wrangler r2 bucket cors list`."
  - id: D5
    description: "On https://knowyourarea.in, on a real device, capturing a photo uploads successfully and Publish Report becomes enabled — the live production capture->upload->publish loop works (closes G-01-2 end-to-end)"
    verification: []
    human_judgment: true
    rationale: "This is the plan's own designated human-check: it cannot be reproduced on localhost or in Playwright because those origins were always CORS-allowed, so only a real phone browser hitting the live production origin after the CORS change (D4) is applied can prove the unblock. Per this project's `workflow.human_verify_mode: end-of-phase` config, this is deferred to end-of-phase UAT review rather than a mid-flight halt."

duration: 2min
completed: 2026-07-27
status: complete
---

# Phase 01 Plan 11: Sanitize Upload Errors + Document Production CORS (G-01-2) Summary

**Upload-error UI now shows one fixed sanitized message instead of leaking raw browser/network error text, backed by a deterministic forced-failure e2e test; README's R2 CORS setup step now documents the production origin and wrangler commands — the actual R2 CORS change and its real-device confirmation remain open human actions.**

## Performance

- **Duration:** 2 min (commit-to-commit)
- **Started:** 2026-07-27T15:51:00Z
- **Completed:** 2026-07-27T15:52:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `CameraCapture.tsx`'s upload catch block now always renders the fixed, actionable message "Couldn't upload the photo. Check your connection and try again." — the `err instanceof Error ? err.message : ...` branch that previously leaked raw browser/network error text (e.g. Safari's `TypeError: Load failed` on a CORS-blocked request) was removed entirely, matching the existing sanitization pattern already used for camera-start and geolocation errors in the same file.
- Added `data-testid="capture-error"` to the destructive error paragraph so the message is reliably selectable in tests.
- New deterministic e2e test in `tests/e2e/capture.spec.ts` forces the upload to fail (stubs `/api/upload-url` to hand back a fabricated `r2.cloudflarestorage.com` presigned URL, then aborts the PUT to that host) and asserts the sanitized message renders and Publish Report stays disabled — standing in for the production-only CORS block since it can't be reproduced against localhost/Playwright.
- README's CORS setup step now documents `https://knowyourarea.in` (plus active Vercel preview origins) as a required AllowedOrigins entry alongside `http://localhost:3000`, with the exact `wrangler r2 bucket cors set`/`list` commands and a note on the CLI-vs-dashboard JSON shape difference, and an explicit "never use a wildcard origin" caution.
- All 8 specs in `tests/e2e/capture.spec.ts` pass (7 pre-existing + 1 new), and `npx tsc --noEmit` is clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Sanitize the upload-error message + forced-failure e2e coverage** — `c35646b` (fix)
2. **Task 2: Document the production origin in README CORS setup** — `1451872` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/components/capture/CameraCapture.tsx` — upload catch block always sets the fixed sanitized error message; `data-testid="capture-error"` added to the error paragraph
- `tests/e2e/capture.spec.ts` — new forced-upload-failure test (G-01-2) using a `page.route` stub-then-abort chain
- `README.md` — CORS setup step now documents the production origin, Vercel preview origins, wrangler `cors set`/`cors list` commands, and the CLI-vs-dashboard JSON shape distinction

## Decisions Made

- Removed the `err instanceof Error` branch entirely rather than narrowing it — no code path through that catch block should ever be able to reach the UI with raw error text, so the fix is unconditional.
- The forced-failure e2e test targets a fabricated `r2.cloudflarestorage.com` host (not any real bucket) via `page.route`, keeping the test hermetic with zero live R2 credentials while still exercising the same network-error class (`route.abort()`) that a real CORS block produces in the browser.

## Deviations from Plan

None - plan executed exactly as written for both automatable tasks (Task 1 code + test, Task 2 README docs + grep verification).

## Issues Encountered

None for the automatable work. As anticipated by the plan itself, two items remain genuinely outside the executor's reach:

1. **user_setup (R2 CORS dashboard/CLI change) — still open.** The plan declares this as `user_setup` because it requires Cloudflare R2 credentials the coding agent does not have. A human must run `wrangler r2 bucket cors set <R2_BUCKET_NAME> --file cors.json` (shape documented in the updated README) or the Cloudflare Dashboard equivalent, adding `https://knowyourarea.in` (and any active Vercel preview origins) to the bucket's AllowedOrigins — never a wildcard. Verify with `wrangler r2 bucket cors list <R2_BUCKET_NAME>`.
2. **human-check (real-device production confirmation) — still open.** Task 2's `<verify><human-check>` requires, after the CORS change above AND this plan's code are both deployed, a real phone browser test against `https://knowyourarea.in/capture`: capture a photo, confirm no error text, Publish Report enables, and the report publishes to the feed. This cannot be reproduced on localhost or in Playwright (those origins were always CORS-allowed) and is deferred to end-of-phase UAT review per this project's `workflow.human_verify_mode: end-of-phase` config, consistent with how prior real-device checks in this phase (e.g. Plan 01-07's production-feed check, Plan 01-10's UAT test 9 re-check) were handled.

Neither item blocked completion of this plan's automatable deliverables (Task 1's code+test, Task 2's docs+grep verification), which are both done and committed.

## User Setup Required

**External service configuration is required and NOT yet applied.** See the plan's `user_setup` block (`.planning/phases/01-core-capture-to-feed-skeleton/01-11-PLAN.md`) and the updated README.md CORS section:

- Add `https://knowyourarea.in` (and any active Vercel preview-deployment origins) to the R2 bucket's CORS AllowedOrigins, keeping methods `GET`+`PUT` and header `Content-Type`. Never use a wildcard origin.
- Apply via `wrangler r2 bucket cors set <R2_BUCKET_NAME> --file cors.json` or the Cloudflare Dashboard (R2 → bucket → Settings → CORS Policy).
- Verify with `wrangler r2 bucket cors list <R2_BUCKET_NAME>`.
- This requires R2 credentials the coding agent does not have — a human must perform it.

## Next Phase Readiness

- The code-and-docs half of G-01-2 is closed: no raw browser/network error text can reach the capture UI on any upload failure, proven by a deterministic e2e test; README now documents the correct production CORS setup for any future fresh deploy.
- G-01-2 is **not yet fully closed** — closure depends on (1) a human applying the R2 CORS change (user_setup, above) and (2) the subsequent real-device human-check on `https://knowyourarea.in` succeeding. Both are recorded here for the orchestrator/end-of-phase UAT to surface to the user.
- No other gaps from `01-UAT.md` are addressed by this plan.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-27*

## Self-Check: PASSED

All modified files found on disk (CameraCapture.tsx, capture.spec.ts, README.md); both task commits (c35646b, 1451872) found in git log.
