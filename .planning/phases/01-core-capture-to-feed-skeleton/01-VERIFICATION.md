---
phase: 01-core-capture-to-feed-skeleton
verified: 2026-07-23T16:15:00Z
status: human_needed
score: 15/15 must-haves verified (programmatically checkable); 8 items require human/real-device sign-off (all pre-flagged as backstop/human_judgment by the plans themselves)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "On a real mobile browser, confirm shadcn new-york/neutral tokens and Geist Sans/Mono fonts render correctly (no font/token regression)."
    expected: "Design system renders as specified — no fallback-font flash, no broken oklch tokens."
    why_human: "Visual/font rendering cannot be verified by grep or a headless test (Plan 01 must-have, tagged `verification: backstop`)."
  - test: "On real iOS Safari, capture a photo in portrait orientation and confirm it is not rotated/skewed, and that the burned-in overlay text is upright, legible, and wraps/truncates gracefully at a narrow aspect ratio."
    expected: "Correct orientation; overlay readable; no skew (RESEARCH.md Pitfall 3 explicitly evades emulation)."
    why_human: "Canvas orientation/legibility bugs on real iOS Safari are not reproducible in a headless Chromium E2E run (Plan 01 + Plan 03 must-haves, tagged backstop/human_judgment)."
  - test: "On a real device, deny camera or location permission and confirm the exact UI-SPEC hard-block copy appears with settings guidance and no submit path."
    expected: "Hard block renders; no degraded/alternative submission path is reachable."
    why_human: "The e2e suite simulates denial by overriding `navigator.permissions.query` in Chromium — a real permission-denial UX (browser chrome, settings link behavior) needs a real device/browser (Plan 03)."
  - test: "On a real device, confirm the 5-category picker shows amber-selected chips at 44px touch targets that are comfortably tappable, and that rapid double-tapping Publish cannot create two complaints."
    expected: "Chips are visually correct and touch-friendly; double-tap is a no-op after the first tap begins publishing."
    why_human: "Visual sizing/spacing and true double-tap race timing aren't asserted by any automated test (Plan 03 must-have, tagged human_judgment); the code-level guard (`publishPhase !== \"idle\"`) is present and correct by construction but unexercised by a concurrency test."
  - test: "Force a photo URL to 404 (e.g. edit a card's photo_key to a nonexistent key) and confirm the feed/permalink renders a category-colored placeholder tile with an icon, not a broken-image icon."
    expected: "Category-colored tile with icon renders in place of the broken image."
    why_human: "Plan 04's own must-have is tagged `verification: backstop`, requiring a forced-404 real render check."
  - test: "Force the feed's DB query to fail (e.g. transient network drop) and confirm the 'Couldn't load reports…' banner with a Retry button appears, and the feed does not go blank."
    expected: "Error banner with Retry renders; feed content area is not blank/broken."
    why_human: "No automated test forces a live-DB query failure against the real Supabase connection; the try/catch path is code-reviewed only (Plan 04 D8)."
  - test: "Publish more than one page's worth of complaints (>20) near the same fixture location and scroll to the end of the feed; confirm the IntersectionObserver sentinel stops firing once the server returns a null cursor (no infinite spinner)."
    expected: "Scrolling stops cleanly at the end of the list; no perpetual loading spinner."
    why_human: "The shared live DB doesn't currently have enough test data to force a second page deterministically without seeding dozens of rows (Plan 04 D2, code-reviewed only)."
  - test: "Confirm no rate limiting exists yet on /api/upload-url or the submitComplaint Server Action (this is an accepted, explicitly scoped-out gap, not a defect) — sign off that this is acceptable for Phase 1 and deferred to Phase 4."
    expected: "Confirmed as an intentional, documented Phase-1 scope gap (WR-07, T-01-DoS), not a regression to fix now."
    why_human: "This is a scope/priority confirmation, not a code check — the review explicitly skipped it as out of scope for this phase and assigned it to Phase 4 (Upstash rate limiting)."
---

# Phase 1: Core Capture-to-Feed Skeleton Verification Report

**Phase Goal:** Prove the riskiest end-to-end loop — a user can capture a live, geo-tagged photo, pick a category, publish it, and anyone can see it in a nearby feed and open it directly by its unique ID or permalink. Auth is a stub dev-identity; no geocoding, dedup, blurring, or AI yet.

**User Story (mode: mvp):** As a resident who does not trust official civic-reporting channels, I want to capture a live geo-tagged photo of a local problem, tag its category, and publish it, so that anyone nearby can see photo-verified local issues in a proximity feed and open any report by its ID or permalink.

**Verified:** 2026-07-23T16:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (post code-review-fix)

## User Flow Coverage (MVP mode)

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open capture | `/capture` gates on camera+location permissions, shows live `getUserMedia` preview, no gallery/file-picker path exists anywhere in the codebase | `src/app/capture/page.tsx` wraps flow in `PermissionGate`; `src/components/capture/CameraCapture.tsx:23-55` (`getUserMedia({video:{facingMode:"environment"}})`); repo-wide grep for `<input type="file"` / `capture=` attribute found none outside the generic shadcn `Input` (text) component | ✓ |
| Capture + tag category | Tap Capture burns a live GPS+timestamp overlay into the photo before upload; pick 1 of 5 categories; Publish disabled until category chosen | `src/components/capture/CameraCapture.tsx:92-99` (`drawOverlay` called before `canvas.toBlob`); `src/components/capture/CategoryPicker.tsx` (5 `CATEGORIES`, amber selected state, `min-h-11` touch target); e2e `capture.spec.ts` line 8 test passed live | ✓ |
| Publish | Publish uploads the real photo to R2, verifies it actually exists (`HeadObjectCommand`) before inserting, writes a `complaints` row with an opaque `KYA-XXXXXXX` id and SRID-4326 geometry point, redirects to `/` | `src/actions/submit-complaint.ts:39-41` (`photoExists` gate, CR-01 fix), `:48` (`ST_SetSRID(ST_MakePoint(...),4326)`); `src/lib/r2.ts:46-53` (`photoExists` via live `HeadObjectCommand`); e2e `capture.spec.ts` full flow re-run live during this verification — passed | ✓ |
| See it on the feed | Landing page `/` shows the new complaint, nearest-first, with photo+overlay, category badge, distance, timestamp; falls back to recency if location denied | `src/lib/feed.ts` (`nearbyFeed`/`recentFeed`, `::geography`/`<->` KNN, deterministic tie-break); `src/components/feed/FeedCard.tsx`; e2e `feed.spec.ts` "nearest complaint ranks above a farther one" re-run live during this verification (exercises the fixed pagination-cursor bug) — passed | ✓ |
| Open by ID/permalink | Searching a known ID or opening `/c/{publicId}` renders the full complaint (photo, category, distance/timestamp, generic poster label — never `submitter_id`); an unknown ID/permalink shows a dedicated not-found state, never a 500 | `src/app/c/[id]/page.tsx` (selects only `public_id`/`category`/`created_at`/`photo_key`), `src/app/c/[id]/not-found.tsx`; `src/components/feed/SearchById.tsx`; e2e `permalink.spec.ts` "unknown ID" re-run live during this verification — passed | ✓ |
| Outcome | "Anyone nearby can see photo-verified local issues in a proximity feed and open any report by its ID or permalink" | All five steps above verified end-to-end against live Supabase+R2 infrastructure, not mocked | ✓ |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A user can capture a photo using only the live in-app camera — no gallery/file-picker path exists (SUBM-01) | ✓ VERIFIED | `CameraCapture.tsx` uses only `getUserMedia`; repo-wide search found zero `<input type="file">`/`capture=` attributes anywhere in `src/` |
| 2 | User picks one of 5 fixed categories; app captures live GPS at submit time, never from EXIF (SUBM-02, SUBM-03) | ✓ VERIFIED | `CategoryPicker.tsx` renders exactly `CATEGORIES` (5); `geolocation.ts`'s `captureBestFix` reads `navigator.geolocation.watchPosition` only; `submissionSchema` server-re-validates the enum + India bbox |
| 3 | A submitted complaint appears in a feed of nearby complaints sorted by proximity/recency, viewable by anyone (FEED-01) | ✓ VERIFIED | `src/lib/feed.ts` `nearbyFeed`/`recentFeed`; e2e `feed.spec.ts` "nearest complaint ranks above a farther one" independently re-run during this verification, passed |
| 4 | Each complaint has a unique, opaque ID and can be opened via search-by-ID or its permalink (SUBM-06, FEED-03, FEED-04) | ✓ VERIFIED | `src/lib/ids.ts` `generatePublicId`, DB `UNIQUE` constraint on `public_id`; `src/components/feed/SearchById.tsx`; `src/app/c/[id]/page.tsx`; e2e `permalink.spec.ts`/`search.spec.ts` |
| 5 | `submitComplaint` never verifies the photo existed before the code review fix — now closed (CR-01, security-critical to the whole product's "photo-verified" premise) | ✓ VERIFIED | `src/actions/submit-complaint.ts:39-41` calls `photoExists()`; `src/lib/r2.ts:46-53` issues a real `HeadObjectCommand`; e2e capture flow (which depends on this gate not rejecting a real upload) re-run live and passed |
| 6 | The internal serial `complaints.id` is never exposed in any URL/API/feed payload — only `public_id` (T-01-01 IDOR prohibition) | ✓ VERIFIED | `src/lib/feed.ts`, `src/app/c/[id]/page.tsx`, `src/app/api/feed/route.ts` all select only `public_id, category, created_at, photo_key(, distance_m)` — grepped for `complaints.id`/serial selection in any external-facing query, none found |
| 7 | Poster identity (`submitter_id`) is never exposed on the feed or permalink (D-06 prohibition) | ✓ VERIFIED | Same query surfaces as above never select `submitter_id`; `FeedCard.tsx`/`c/[id]/page.tsx` render only the static "Reported by a nearby resident" string |
| 8 | Presigned-upload key/content-type are always server-derived, never client-supplied (T-01-02/T-01-03 prohibition) | ✓ VERIFIED | `src/app/api/upload-url/route.ts` accepts only `{ ext: "jpg"\|"webp" }` via zod; key is `complaints/${generatePublicId()}.${ext}`; no `key`/`contentType` field is ever read from the request body |
| 9 | The `complaints` table exists with a `geometry(point,4326)` location column, GiST index, and `public_id` UNIQUE constraint | ✓ VERIFIED | `src/lib/db/schema.ts` declares all three; live DB round-trip proven working via re-run e2e (insert with `ST_SetSRID(...,4326)` + KNN `<->` proximity query both succeeded against the real Supabase instance) |
| 10 | The Date-serialization pagination bug found post-review-fix is genuinely fixed | ✓ VERIFIED | `src/lib/feed.ts` cursor filters interpolate `decoded.createdAt` (already an ISO string) directly, no `new Date(...)` wrapper; commit `e394729`; e2e `feed.spec.ts`'s full-cursor-chain-walk test (which exercises this exact code path) re-run live, passed |
| 11 | Build/typecheck/lint are clean on the current commit | ✓ VERIFIED | `npx tsc --noEmit` exits 0; `npm run build` succeeds (all 6 routes compile: `/`, `/capture`, `/c/[id]`, `/api/feed`, `/api/upload-url`, `/_not-found`) |
| 12 | The full unit test suite passes | ✓ VERIFIED | `npx vitest run` → 24/24 passed (4 test files), matching the SUMMARY/task-description claim exactly |
| 13 | The e2e suite enumerates and (spot-checked) passes against live infrastructure | ✓ VERIFIED | `npx playwright test --list` → 10/10 tests across 4 spec files enumerate cleanly; 3 spot-checked tests (capture full write-path, feed pagination cursor walk, permalink not-found) independently re-run during this verification — all 3 passed |
| 14 | No debt markers (TODO/FIXME/XXX/TBD) or `test.fixme()` stubs remain in the phase's files | ✓ VERIFIED | Repo-wide grep found zero matches in `src/`; zero `fixme` occurrences in `tests/e2e/*.spec.ts` |
| 15 | All 7 declared requirement IDs (SUBM-01/02/03/06, FEED-01/03/04) are marked Complete in REQUIREMENTS.md and traced to Phase 1 | ✓ VERIFIED | `.planning/REQUIREMENTS.md` lines 19-45, 103-120 — all 7 marked `[x]`/`Complete`, mapped to Phase 1 |

**Score:** 15/15 programmatically verifiable truths VERIFIED. 0 behavior-unverified. 8 additional items (visual/real-device/load-failure/rate-limit-sign-off) are routed to human verification below — every one of them was already explicitly flagged as `verification: backstop` or `human_judgment: true` by the plans/SUMMARYs themselves (this is expected under the project's `human_verify_mode: end-of-phase` config, not a gap discovered by this verification).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` | `complaints` table: serial id (internal), `public_id` UNIQUE, `submitter_id`, `category`, `geometry(point,4326)` + GiST index, `accuracy_m`, `photo_key`, `created_at` | ✓ VERIFIED | All columns present exactly as declared; SRID-drop workaround documented in-code |
| `src/lib/db/client.ts` | postgres-js + drizzle singleton | ✓ VERIFIED | Now uses `requireEnv("DATABASE_URL")` (WR-04 fix) instead of a blind `!` assertion |
| `src/types/complaint.ts` | `CATEGORIES`, `submissionSchema`, `FeedItem` shared contract | ✓ VERIFIED | 5 categories; India-bbox + finite/nonnegative/max(100000) accuracy bound (WR-02 fix); photoKey regex |
| `src/lib/ids.ts` | `generatePublicId()` opaque ID generator | ✓ VERIFIED | `KYA-` + 7-char nanoid customAlphabet, ambiguity-free 32-symbol alphabet |
| `src/lib/r2.ts` | `presignPhotoUpload` + `photoExists` (CR-01 fix) | ✓ VERIFIED | `HeadObjectCommand`-backed existence check; 300s presign expiry (WR-08 fix) |
| `src/app/api/upload-url/route.ts` | Server-derived key/content-type presign endpoint | ✓ VERIFIED | Only accepts `{ ext }` enum; key/contentType never client-supplied |
| `src/actions/submit-complaint.ts` | zod-validate → photoExists → device-id → retry-loop → geometry insert | ✓ VERIFIED | All steps present in the stated order; CR-01 gate added before insert |
| `src/lib/device-id.ts` | `getOrCreateDeviceId()` CSPRNG cookie identity | ✓ VERIFIED | `crypto.randomUUID()`, httpOnly, `secure` in production (WR-03 fix) |
| `src/components/capture/CameraCapture.tsx` | Live preview + orientation-safe overlay-burned capture | ✓ VERIFIED | `getSettings()` re-read per capture, no mirror, `drawOverlay` before `toBlob` |
| `src/components/capture/PermissionGate.tsx` | Proactive Permissions-API hard-block | ✓ VERIFIED | Listener cleanup fixed (WR-01); fails open only when the API/permission name is unsupported |
| `src/components/capture/CategoryPicker.tsx` | 5-category chips, amber selected, 44px targets | ✓ VERIFIED | `min-h-11`, amber-500 border/bg on selected |
| `src/lib/geolocation.ts` | `captureBestFix` wait-for-fix window, `no-fix` rejection | ✓ VERIFIED | `watchPosition`, best-accuracy retained, never resolves a fabricated coordinate |
| `src/lib/overlay.ts` | `formatOverlayText` + `drawOverlay` burn-in | ✓ VERIFIED | Word-wrap + ellipsis-truncate up to 2 lines; deterministic IST formatting |
| `src/lib/feed.ts` | `nearbyFeed`/`recentFeed` cursor-paginated, tie-broken queries | ✓ VERIFIED | `::geography`/`<->` KNN; row-comparison cursor; Date-serialization bug fixed (`e394729`) |
| `src/app/api/feed/route.ts` | Cursor-paginated GET, lat/lng optional | ✓ VERIFIED | Delegates to `nearbyFeed`/`recentFeed`; logs errors (WR-05 fix) |
| `src/components/feed/FeedCard.tsx` / `FeedList.tsx` | Photo/badge/distance/timestamp card, infinite scroll, broken-photo tile | ✓ VERIFIED | Category-colored fallback tile on `onError`; IntersectionObserver sentinel unmounts on null cursor |
| `src/components/feed/SearchById.tsx` | Search-by-ID with URL-paste extraction, existence pre-check | ✓ VERIFIED | Extracts `/c/{id}` segment; `GET` pre-check before navigating |
| `src/app/c/[id]/page.tsx` + `not-found.tsx` | SSR permalink by `public_id` only, dedicated not-found | ✓ VERIFIED | Never selects `submitter_id`/serial id; segment `not-found.tsx` present (avoids Next's generic 404) |
| `src/lib/distance.ts` | `formatDistance`/`formatRelativeTime` | ✓ VERIFIED | Clock-skew clamp added (WR-06 fix); 8 unit tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `CameraCapture.tsx` | `overlay.ts` | `drawOverlay(ctx,...)` before `canvas.toBlob` | ✓ WIRED | Confirmed at `CameraCapture.tsx:99` (call) → `:101` (`toBlob`) |
| `CameraCapture.tsx` | `/api/upload-url` | fetch POST then PUT to presigned URL | ✓ WIRED | `CameraCapture.tsx:112-124` |
| `capture/page.tsx` | `submit-complaint.ts` | Server Action call | ✓ WIRED | Confirmed via passing e2e |
| `submit-complaint.ts` | `r2.ts` | `photoExists(parsed.photoKey)` before insert | ✓ WIRED | `submit-complaint.ts:39` |
| `submit-complaint.ts` | `db/schema.ts` | `db.insert(complaints)` with geometry point | ✓ WIRED | `submit-complaint.ts:54-64` |
| `FeedList.tsx` | `/api/feed` | IntersectionObserver → fetch next cursor page | ✓ WIRED | Present per Plan 04 SUMMARY + code read |
| `c/[id]/page.tsx` | `db/schema.ts` | `WHERE public_id = $1`, never serial id | ✓ WIRED | `c/[id]/page.tsx:51,57` |
| `SearchById.tsx` | `c/[id]/page.tsx` | existence-check GET then `router.push` | ✓ WIRED | `SearchById.tsx:40-44` |

### Behavioral Spot-Checks (live infrastructure, not mocked)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full capture write path (camera→GPS→R2 upload→photoExists gate→geometry insert) | `npx playwright test tests/e2e/capture.spec.ts -g "produces a published complaint"` | 1 passed (12.8s) | ✓ PASS |
| Feed proximity ordering + full pagination-cursor walk (exercises the fixed Date-serialization bug) | `npx playwright test tests/e2e/feed.spec.ts -g "nearest complaint ranks above"` | 1 passed (28.9s) | ✓ PASS |
| Permalink not-found path | `npx playwright test tests/e2e/permalink.spec.ts -g "unknown ID"` | 1 passed (2.1s) | ✓ PASS |
| Full unit suite | `npx vitest run` | 24/24 passed | ✓ PASS |
| Full e2e suite enumeration | `npx playwright test --list` | 10/10 tests enumerate across 4 files | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exits 0 | ✓ PASS |
| Production build | `npm run build` | succeeds, all 6 routes compile | ✓ PASS |

*Note: per verification protocol (avoid re-running the full live-infra e2e suite unnecessarily — it mutates the shared Supabase DB), 3 of the 10 e2e tests were spot-checked directly rather than the full 10. These 3 were chosen specifically because they exercise the two areas that changed after the SUMMARYs were written: the CR-01 photo-existence gate (capture test) and the Date-serialization pagination fix (feed test), plus one baseline sanity check (permalink not-found). All 3 passed. Combined with the unit suite (24/24, independently re-run) and clean build/typecheck, this constitutes strong evidence the "24 unit + 10 e2e pass clean" claim holds on the current commit.*

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SUBM-01 | 01-02, 01-03 | Live in-app camera capture only, no gallery upload | ✓ SATISFIED | `CameraCapture.tsx` (getUserMedia only), `PermissionGate.tsx` hard-block |
| SUBM-02 | 01-01, 01-03 | 5 fixed categories, server-validated | ✓ SATISFIED | `CategoryPicker.tsx`, `submissionSchema` enum |
| SUBM-03 | 01-02, 01-03 | Live GPS at submit time, never EXIF | ✓ SATISFIED | `geolocation.ts` `captureBestFix` (watchPosition only) |
| SUBM-06 | 01-01, 01-02 | Unique opaque searchable ID | ✓ SATISFIED | `ids.ts` `generatePublicId`, DB UNIQUE constraint |
| FEED-01 | 01-02, 01-04 | Proximity/recency feed, viewable by anyone | ✓ SATISFIED | `feed.ts` `nearbyFeed`/`recentFeed`, no auth gate on `/` |
| FEED-03 | 01-04 | Search by ID | ✓ SATISFIED | `SearchById.tsx` |
| FEED-04 | 01-04 | Shareable permalink | ✓ SATISFIED | `c/[id]/page.tsx` |

No orphaned requirements — REQUIREMENTS.md maps exactly these 7 IDs to Phase 1, and all 7 are claimed across the 4 plans and confirmed `[x]`/`Complete`.

### Anti-Patterns Found

None. Repo-wide grep for `TODO|FIXME|XXX|TBD`, `HACK|PLACEHOLDER`, "coming soon"/"not yet implemented", and `test.fixme()` across `src/` and `tests/e2e/` found zero matches. No stub returns (`return null`/`return {}`/`return []`) feeding rendered output were found in the reviewed files.

### Post-SUMMARY Changes Independently Verified

The task brief noted two rounds of post-SUMMARY changes; both were independently confirmed present and correctly wired in this verification, not merely trusted from the review docs:

1. **01-REVIEW.md / 01-REVIEW-FIX.md** (8 of 9 findings fixed, 1 explicitly deferred to Phase 4): CR-01 (photo-existence gate — the security-critical fix, since the product's entire premise is "photo-verified" reports) and all 7 warnings (WR-01 through WR-06, WR-08) were read directly in the current source and confirmed present. WR-07 (rate limiting) was explicitly and correctly deferred to Phase 4 per `CLAUDE.md`'s own stack plan (Upstash Redis) — not a gap in this phase.
2. **Date-serialization cursor bug** (commit `e394729`, found during post-fix re-verification): confirmed the `new Date(...)` wrapper is gone from `src/lib/feed.ts`'s cursor filters, and the exact code path it touches (pagination cursor comparison) was independently re-exercised via a live e2e run in this verification, passing cleanly.

### Human Verification Required

8 items — all pre-flagged by the plans/SUMMARYs themselves as `verification: backstop` or `human_judgment: true`, consistent with this project's `human_verify_mode: end-of-phase` configuration. See the `human_verification` list in the frontmatter above for the full set (design-system fonts on a real device, iOS Safari orientation/overlay legibility, real permission-denial UX, category-picker visual sizing + double-tap timing, forced-404 photo placeholder, forced feed-load-failure banner, infinite-scroll stop-at-end with >20 seeded complaints, and a sign-off that the deferred rate-limiting gap is acceptable for Phase 1).

None of these are code-level gaps — every one is a real-device/visual/load-condition check that cannot be resolved by static analysis or a headless test, and every one was already surfaced by the executing plans as deferred to this exact review point.

### Gaps Summary

No blocking gaps found. All 15 programmatically-checkable must-haves (goal-backward truths, required artifacts, key links, requirement coverage, anti-pattern scan, and the two post-SUMMARY fixes) are VERIFIED against the current codebase — not just asserted by the SUMMARYs. The single Critical finding from code review (CR-01 — the product's core "photo-verified" premise was previously unenforced server-side) is confirmed fixed and re-exercised via a live e2e run. The independently-found Date-serialization pagination bug is confirmed fixed and re-exercised via a live e2e run that specifically walks the affected cursor-comparison code path.

The phase's status is `human_needed` rather than `passed` solely because 8 explicitly-flagged real-device/visual/load-condition items remain open — this is expected, not a regression, under the project's end-of-phase human review config.

---

_Verified: 2026-07-23T16:15:00Z_
_Verifier: Claude (gsd-verifier)_
