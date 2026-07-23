---
phase: 01-core-capture-to-feed-skeleton
plan: 02
subsystem: infra
tags: [nextjs, react, drizzle-orm, postgis, cloudflare-r2, aws-sdk-s3, zod, playwright, server-actions]

# Dependency graph
requires:
  - phase: 01-01
    provides: complaints table (geometry(point,4326)+GiST index), src/lib/db/client.ts, src/lib/ids.ts, src/types/complaint.ts contract, Vitest/Playwright harness
provides:
  - Full walking-skeleton tracer: live camera capture -> live GPS -> direct-to-R2 presigned upload -> Server Action geometry insert -> SSR proximity feed render
  - src/lib/device-id.ts (getOrCreateDeviceId — httpOnly cookie, crypto.randomUUID())
  - src/lib/geolocation.ts (captureBestFix — basic single-shot GPS read)
  - src/lib/r2.ts (presignPhotoUpload — S3Client against R2, ContentType pinned)
  - src/app/api/upload-url/route.ts (POST — server-derived key/content-type)
  - src/actions/submit-complaint.ts (submitComplaint Server Action — zod validate, device-id, retry-on-conflict insert)
  - src/components/capture/CameraCapture.tsx + src/app/capture/page.tsx (getUserMedia preview, canvas capture, category picker, publish)
  - src/app/page.tsx (SSR nearbyFeed/recentFeed with ::geography cast + <-> KNN order)
  - src/components/feed/LocationRequester.tsx (client geolocation boundary feeding the server component via searchParams)
  - README.md "Run the full stack locally" section
affects: [01-03, 01-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct-to-R2 presigned upload: browser PUTs bytes straight to R2, Next.js server only ever mints the signed URL (never proxies the photo)"
    - "Opaque-ID retry-on-conflict insert loop (bounded 5 attempts) — DB UNIQUE constraint is the actual correctness guarantee, nanoid regeneration on unique_violation (Postgres code 23505)"
    - "::geography cast + <-> KNN operator (uses the location GiST index) for all proximity queries against the geometry(point,4326) column"
    - "App Router server/client split for browser-only APIs: a tiny 'use client' component (LocationRequester) reads navigator.geolocation and encodes lat/lng into the URL so the async Server Component page can run its DB query with real params — never a fake (0,0) fallback"

key-files:
  created:
    - src/lib/device-id.ts
    - src/lib/geolocation.ts
    - src/lib/r2.ts
    - src/app/api/upload-url/route.ts
    - src/actions/submit-complaint.ts
    - src/components/capture/CameraCapture.tsx
    - src/app/capture/page.tsx
    - src/components/feed/LocationRequester.tsx
    - README.md
  modified:
    - src/app/page.tsx
    - tests/e2e/capture.spec.ts
    - tests/e2e/feed.spec.ts

key-decisions:
  - "photoKey's embedded opaque ID (minted in /api/upload-url) and the complaint row's public_id (minted in submitComplaint's retry loop) are intentionally two independent nanoid generations, not threaded together — matches the architecture diagram's decoupled upload-then-insert steps; both use the same KYA-XXXXXXX format so this is invisible to users."
  - "Kept CameraCapture's capture button always JPEG (canvas.toBlob('image/jpeg', 0.85)) and the upload-url route hardcoded to `ext: 'jpg'` for the tracer — the route's zod schema still accepts webp for forward-compat, but nothing in this plan's UI sends it yet."
  - "Feed location handoff via searchParams + client-side router.replace (not a query-param-free client fetch) — keeps src/app/page.tsx a real async Server Component so nearbyFeed/recentFeed run server-side per the plan's explicit 'implement inline in page.tsx' instruction."

requirements-completed: [SUBM-01, SUBM-03, SUBM-06, FEED-01]

coverage:
  - id: D1
    description: "Live camera capture -> live GPS read -> presigned direct-to-R2 upload -> Server Action geometry insert produces a real R2 photo object and a complaints row with opaque public_id, non-null accuracy_m, and device submitter_id"
    requirement: SUBM-01
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts#capture flow: live camera + GPS produces a published complaint (SUBM-01, SUBM-03)"
        status: pass
      - kind: other
        ref: "manual verification against the live Supabase DB (SELECT ... ST_AsText(location), ST_SRID(location)) and live R2 bucket (HeadObjectCommand) after the e2e run — confirmed public_id KYA-PXFFE5W, submitter_id set, accuracy_m=20, location SRID 4326 at (77.5946, 12.9716), and a real image/jpeg object at complaints/KYA-E55XYGC.jpg"
        status: pass
    human_judgment: false
  - id: D2
    description: "Complaint ID is opaque, unique, and searchable — nanoid-generated with a DB UNIQUE constraint + bounded retry-on-conflict loop"
    requirement: SUBM-06
    verification:
      - kind: e2e
        ref: "tests/e2e/capture.spec.ts (exercises the full submitComplaint retry-loop insert path)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SSR feed at / renders a just-published complaint proximity-sorted via ST_Distance(::geography) + <-> KNN order against the GiST index"
    requirement: FEED-01
    verification:
      - kind: e2e
        ref: "tests/e2e/feed.spec.ts#feed page: shows nearby complaints distance-sorted (FEED-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Recency fallback (D-07): when visitor location is denied/unavailable, the feed still renders via ORDER BY created_at DESC and never queries against a fake (0,0) coordinate"
    verification: []
    human_judgment: true
    rationale: "Both e2e specs run under the fixture that grants geolocation permission (tests/e2e/fixtures.ts), so no automated test exercises the location-denied path. Verified only by code review: recentFeed() in src/app/page.tsx runs a location-free query with no hardcoded coordinate. Needs a human/deny-permission manual check."
  - id: D5
    description: "Presigned-upload security: object key and Content-Type are always server-derived (T-01-02/T-01-03) — a request cannot influence the R2 key or bypass the image/jpeg|webp restriction"
    verification: []
    human_judgment: true
    rationale: "No adversarial test sends a spoofed key/contentType field to /api/upload-url to confirm it's ignored. Guaranteed by construction (the route handler only ever reads a zod-validated `ext` enum and never accepts a `key` or `contentType` field at all), but this hasn't been exercised by a negative-case test."
  - id: D6
    description: "iOS Safari real-device capture check (RESEARCH.md Pitfall 3 — canvas orientation bugs evade emulation)"
    verification: []
    human_judgment: true
    rationale: "Plan's own <human-check> tag on Task 1 explicitly defers this to end-of-phase review on a real device; project config also sets human_verify_mode: end-of-phase."
  - id: D7
    description: "npx tsc --noEmit, npm run lint, npm run build, and npx vitest run all pass clean on the full tracer"
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npm run lint && npm run build && npx vitest run"
        status: pass
    human_judgment: false

duration: ~55min (across a precondition checkpoint pause for R2 bucket/credential provisioning)
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 2: Walking-Skeleton Tracer (Capture-to-Feed) Summary

**One committed path proven end-to-end: getUserMedia camera capture + live GPS -> presigned direct-to-R2 upload -> Server Action insert of a real PostGIS geometry(point,4326) row with an opaque ID -> SSR feed rendering it proximity-sorted via `::geography`/`<->` — verified against the live Supabase+R2 infrastructure, not mocked.**

## Performance

- **Duration:** ~55 min of active execution (plus a precondition checkpoint pause while the coordinator provisioned the Cloudflare R2 bucket, API token, CORS policy, and public access)
- **Started:** 2026-07-23 ~07:25 IST (resumed after checkpoint ~08:00 IST)
- **Completed:** 2026-07-23T08:09Z
- **Tasks:** 2/2
- **Files modified:** 12 (8 created, 1 net-new via deviation, 3 modified)

## Accomplishments
- Wired the full write path: `getUserMedia` live camera preview + canvas capture (never mirrored) → presigned R2 PUT (server-derived key + pinned Content-Type) → `submitComplaint` Server Action (zod validate → device-id cookie → 5-attempt opaque-ID retry loop → raw-sql `ST_SetSRID(ST_MakePoint(...))` insert)
- Verified the write path against **live infrastructure**, not test doubles: after the E2E run, a real `image/jpeg` object was confirmed present in the Cloudflare R2 bucket at `complaints/KYA-E55XYGC.jpg`, and a `complaints` row was confirmed in the hosted Supabase DB with `SRID 4326`, correct lat/lng, non-null `accuracy_m`, and the device `submitter_id`
- Wired the full read path: SSR `src/app/page.tsx` runs `nearbyFeed` (`::geography` cast, `<->` KNN order against the `location` GiST index) when a visitor lat/lng is present, falling back to `recentFeed` (`ORDER BY created_at DESC`, distance hidden) when it isn't — never a fake `(0,0)` query
- Solved the App Router server/client split needed for `navigator.geolocation` to feed a Server Component's query: a minimal `LocationRequester` client component (new file, see Deviations) reads the browser's location once and round-trips it into the URL via `router.replace`
- Replaced both `test.fixme()` stubs (`capture.spec.ts`, `feed.spec.ts`) with real Playwright E2Es that drive the actual capture→publish→feed flow against the live backend; both pass, and the full suite (including the still-`fixme` search/permalink specs owned by Plan 04) runs clean
- Documented the "Run the full stack locally" sequence in a new `README.md` (docker compose / hosted DB, `.env.local` incl. R2 vars + CORS note, `drizzle-kit push` + SRID caveat, `npm run dev`, capture→publish→feed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer write path — capture → GPS → presigned R2 upload → Server Action insert** — `78aef1c` (feat)
2. **Task 2: Tracer read path — SSR proximity feed renders the published complaint + documented local run** — `e68069f` (feat)

_No separate metadata commit yet — this repo is running sequential/non-worktree mode; STATE.md/ROADMAP.md/REQUIREMENTS.md updates are committed as part of the final-commit step below._

## Files Created/Modified
- `src/lib/device-id.ts` — `getOrCreateDeviceId()`, httpOnly/SameSite=Lax `kya_device_id` cookie seeded from `crypto.randomUUID()`
- `src/lib/geolocation.ts` — `captureBestFix()`, single-shot `getCurrentPosition` read (Plan 03 adds the 3-5s wait-for-fix window)
- `src/lib/r2.ts` — `presignPhotoUpload(key, contentType)`, S3Client against the R2 S3-compatible endpoint
- `src/app/api/upload-url/route.ts` — `POST`, accepts only `{ ext: "jpg"|"webp" }`, derives the R2 key server-side from a fresh `generatePublicId()`
- `src/actions/submit-complaint.ts` — `submitComplaint` Server Action: zod validate → device-id → 5-attempt opaque-ID retry loop on `23505` unique-violation → geometry insert
- `src/components/capture/CameraCapture.tsx` — live preview, capture-to-canvas (orientation-safe via `track.getSettings()`, never mirrored), upload-then-PUT flow
- `src/app/capture/page.tsx` — composes `CameraCapture` + minimal category chip picker + Publish button; reads `captureBestFix()` and calls `submitComplaint`, redirects to `/`
- `src/components/feed/LocationRequester.tsx` — client geolocation boundary (see Deviations)
- `src/app/page.tsx` — SSR feed: `nearbyFeed`/`recentFeed`, minimal card render (photo via `next/image` `unoptimized`, category label, distance/relative-timestamp)
- `README.md` — project intro + "Run the full stack locally" + test commands
- `tests/e2e/capture.spec.ts` — real E2E replacing the `fixme` stub
- `tests/e2e/feed.spec.ts` — real E2E replacing the `fixme` stub

## Decisions Made
- Kept the upload-url route's `ext` hardcoded to `"jpg"` from `CameraCapture` (the schema still accepts `webp` for forward-compat) — matches the actual `canvas.toBlob('image/jpeg', 0.85)` capture path; no reason to plumb a format choice through the UI in the tracer.
- `photoKey`'s embedded ID and the complaint row's `public_id` are separate `generatePublicId()` calls (architecture diagram's decoupled upload-then-insert steps) — not reconciled, since nothing in the schema or must-haves requires them to match.
- Feed's location handoff uses `searchParams` + `router.replace` (not a client-only fetch) specifically so `src/app/page.tsx` can remain a real `async` Server Component running `nearbyFeed`/`recentFeed` directly against `db`, per the plan's explicit instruction to implement the query inline in `page.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `src/components/feed/LocationRequester.tsx` (not in the plan's `files_modified` list)**
- **Found during:** Task 2
- **Issue:** The plan's own action text requires "a small client component that requests geolocation and passes lat/lng" to feed the SSR proximity query — but Next.js App Router forbids mixing a `"use client"` boundary into the same file as an `async` Server Component (`src/app/page.tsx` must stay server-only to call `db` directly, per the plan's explicit "implement inline in page.tsx" instruction). A separate client file is structurally required to satisfy both constraints simultaneously.
- **Fix:** Created `src/components/feed/LocationRequester.tsx`, a minimal client component that calls `navigator.geolocation.getCurrentPosition` once and encodes the result into the URL via `router.replace`; renders `null`.
- **Files modified:** `src/components/feed/LocationRequester.tsx` (new), `src/app/page.tsx` (renders it)
- **Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; `tests/e2e/feed.spec.ts` confirms the URL gains `?lat=...&lng=...` after first load and the feed re-renders proximity-sorted.
- **Committed in:** `e68069f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 3 - blocking)
**Impact on plan:** Necessary to satisfy the plan's own action text within the App Router's server/client component constraints. No scope creep — no feature beyond "attach the visitor's location to the feed query" was added.

## Issues Encountered

- **Precondition gate (resolved via checkpoint):** Task 1's precondition ("An R2 bucket exists, R2_* env vars are set, and the bucket has a CORS rule allowing PUT from the app origin") was unmet at plan start — `.env.local` and `.env.example` contained only `DATABASE_URL`, no `R2_*` variables. Execution halted before any file changes with a `checkpoint:human-verify` (`Blocked by: Precondition not met`), per the executor's precondition-check protocol. The coordinator resolved this by creating the `kya-photos` R2 bucket (via `wrangler r2 bucket create`), enabling public access via `r2.dev`, setting a CORS policy allowing `PUT`+`Content-Type` from `http://localhost:3000` (via `wrangler r2 bucket cors set`), and adding the 5 required `R2_*` values to `.env.local`. Execution resumed from Task 1 per the coordinator's explicit instruction. (Note: an initial env-var presence check used a regex bug — `[A-Z_]+` instead of `[A-Za-z0-9_]+` — that missed keys containing digits like `R2_ACCOUNT_ID`; caught and corrected before halting, confirming the real absence rather than a false negative.)
- **Tracer feedback gate — explicit continuation, not paused:** Per the executor's tracer-feedback-gate protocol, an interactive run (auto mode inactive; `workflow.auto_advance: false`, `_auto_chain_active: false`) would normally stop with a `checkpoint:human-verify` on Task 1's `<verify>` before proceeding to Task 2. The coordinator's resume message explicitly instructed "proceed with Task 1 ... through Task 2, exactly as planned," and the project's `human_verify_mode` config is `end-of-phase` (not per-task) — so execution continued directly into Task 2 without an intermediate stop. Task 1's automated `<verify>` (tsc + `capture.spec.ts`) passed, and its `must_haves` truths were additionally confirmed against live R2/DB state before proceeding (see D1's verification above).

## User Setup Required

None further — R2 credentials are now in place in `.env.local` (gitignored, not committed) alongside `DATABASE_URL` from Plan 01. Plan 03's real-device iOS Safari check (D6) and the location-denied fallback check (D4) remain open for end-of-phase review per project config.

## Next Phase Readiness

- Plan 03 (capture refinement — overlay burn-in D-02, wait-for-fix GPS window D-04, permission hard-blocks D-03) and Plan 04 (feed refinement — infinite scroll D-09, `FeedCard` styling, cursor pagination, `search.spec.ts`/`permalink.spec.ts`) can build directly on this tracer's committed interfaces: `CameraCapture`'s capture-to-upload flow, `captureBestFix`'s signature (Plan 03 replaces its body, not its shape), `submitComplaint`'s Server Action contract, and `src/app/page.tsx`'s `nearbyFeed`/`recentFeed` split (Plan 04 extracts `nearbyFeed` into `src/lib/feed.ts` with cursor pagination, per the plan's own note).
- Two coverage items are explicitly deferred to end-of-phase review, matching the project's `human_verify_mode: end-of-phase` setting: D4 (location-denied recency fallback, code-reviewed but not e2e-tested) and D6 (real iOS Safari device capture check, RESEARCH.md Pitfall 3).
- D5 (adversarial upload-url key/content-type spoofing) has no negative-case test yet — low risk since the route is constructed to only ever read a validated `ext` enum, but flagging for a future security-focused pass if one is added to this phase's scope.
- `docker-compose.yml` remains unexercised on this execution machine (no Docker) — the hosted Supabase + R2 path is what's actually proven working end-to-end here, same caveat as Plan 01.

## Self-Check: PASSED

All 9 claimed created/modified files verified present on disk; both claimed commit hashes (`78aef1c`, `e68069f`) verified present in `git log --oneline --all`; the live R2 object and DB row cited in D1's verification were independently re-confirmed via direct queries during this plan's execution (not just asserted).

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-23*
