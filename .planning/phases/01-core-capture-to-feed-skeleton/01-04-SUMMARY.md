---
phase: 01-core-capture-to-feed-skeleton
plan: 04
subsystem: ui
tags: [nextjs, react, drizzle-orm, postgis, playwright, vitest, next-navigation]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Tracer feed to refactor: src/app/page.tsx's inline nearbyFeed/recentFeed, src/components/feed/LocationRequester.tsx, src/types/complaint.ts's FeedItem contract"
provides:
  - "src/lib/feed.ts — nearbyFeed/recentFeed cursor-paginated queries (::geography cast, <-> KNN order, distance/created_at/public_id tie-break)"
  - "src/app/api/feed/route.ts — GET cursor-paginated feed endpoint (lat/lng optional -> proximity else recency)"
  - "src/lib/distance.ts — formatDistance/formatRelativeTime"
  - "src/components/feed/FeedCard.tsx + FeedList.tsx — photo/badge/distance/timestamp card, IntersectionObserver infinite scroll"
  - "src/components/feed/SearchById.tsx — search-by-ID box with URL-paste extraction and pre-navigation existence check"
  - "src/app/c/[id]/page.tsx + not-found.tsx — SSR permalink page by opaque public_id"
  - "src/components/feed/LocationRequester.tsx fixed to replace the current pathname instead of a hardcoded '/'"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-comparison cursor pagination: cursor encodes {createdAt, publicId, distanceM?} as base64url JSON; the WHERE clause mirrors the ORDER BY exactly (distance ASC, created_at DESC, public_id ASC tie-break) via explicit OR-chained comparisons over a derived-table subquery, since distance_m is a computed expression, not a real column"
    - "Suspense-scoped SSR loading state: the feed's data-fetching async component is wrapped in <Suspense key={hasLocation ? ... : 'recent'} fallback={<FeedSkeleton />}> inside page.tsx itself, rather than a route-level loading.tsx — keys off hasLocation so the recency->proximity transition re-shows the skeleton without leaking into sibling routes (/capture, /c/[id])"
    - "Existence-check-before-navigate: SearchById does a plain GET to /c/{id} and checks response.ok before router.push, so an unknown ID never navigates into a dead permalink — relies on the permalink page's notFound() returning a real 404"
    - "LocationRequester is a single shared client component reused by both the feed page and the permalink page; it replaces the *current* pathname (usePathname) rather than a fixed path, so it's safe to mount from any page"

key-files:
  created:
    - src/lib/feed.ts
    - src/lib/distance.ts
    - src/app/api/feed/route.ts
    - src/components/feed/FeedCard.tsx
    - src/components/feed/FeedList.tsx
    - src/components/feed/SearchById.tsx
    - src/app/c/[id]/page.tsx
    - src/app/c/[id]/not-found.tsx
    - tests/unit/distance.test.ts
  modified:
    - src/app/page.tsx
    - src/components/feed/LocationRequester.tsx
    - tests/e2e/feed.spec.ts
    - tests/e2e/search.spec.ts
    - tests/e2e/permalink.spec.ts

key-decisions:
  - "Cursor pagination uses row-comparison OR-chains over a derived table (SELECT ... FROM (SELECT ..., ST_Distance(...) AS distance_m FROM complaints) AS feed WHERE ...) rather than a CTE builder, since distance_m must be computed once and then both ordered and filtered on by alias — kept as hand-written raw sql for full control over the tie-break semantics rather than relying on Drizzle's query builder for something this specific."
  - "SearchById's existence check reuses the permalink page's own GET response status (200 vs. notFound()'s 404) instead of adding a dedicated API route — keeps Task 2 within its planned file list while still satisfying the UI-SPEC 'stays on page, no navigation on failure' requirement."
  - "FeedCard's broken-photo placeholder uses a small fixed category->color map (orange/emerald/yellow/blue/violet) that isn't literally specified in UI-SPEC's Color section (only Dominant/Secondary/Accent/Destructive are declared) — chosen to be visually distinct per category while never using the reserved amber (CTAs only) or red (destructive/error only) tokens. Flagged as a 🧪 backstop item for end-of-phase human sign-off, per the plan's own must_haves tagging."

requirements-completed: [FEED-01, FEED-03, FEED-04]

coverage:
  - id: D1
    description: "The landing feed at / shows complaints near the visitor sorted by proximity (nearest first), with a deterministic distance/created_at/public_id tie-break; each card shows photo, category badge, distance, and relative timestamp"
    requirement: FEED-01
    verification:
      - kind: e2e
        ref: "tests/e2e/feed.spec.ts#feed page: nearest complaint ranks above a farther one, sorted by proximity (FEED-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Infinite scroll loads further pages via an IntersectionObserver sentinel calling /api/feed; the sentinel unmounts once the server returns a null cursor, so no infinite spinner appears at the end of the list"
    verification: []
    human_judgment: true
    rationale: "The live shared DB doesn't currently have enough test-created complaints beyond FEED_LIMIT=20 to force a second page deterministically without seeding dozens of rows; the stop-on-null-cursor behavior is verified by code review (FeedList only renders the sentinel <div> when `cursor` is truthy) rather than an e2e test that forces pagination past a full page."
  - id: D3
    description: "If the visitor denies location, the feed still renders (recency order, distance hidden) rather than blocking browsing"
    requirement: FEED-01
    verification:
      - kind: e2e
        ref: "tests/e2e/feed.spec.ts#feed page: location denied falls back to recency without blocking (D-07)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A malformed or nonexistent permalink id renders the dedicated not-found state (never a generic 500/crash) and returns a real 404"
    requirement: FEED-04
    verification:
      - kind: e2e
        ref: "tests/e2e/permalink.spec.ts#permalink page: an unknown ID renders the not-found state, not a crash (FEED-04)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A complaint is openable at its /c/{publicId} permalink, looked up by the opaque public_id only (never the serial id/submitter_id), showing the full photo, category, distance/timestamp, and the generic poster label"
    requirement: FEED-04
    verification:
      - kind: e2e
        ref: "tests/e2e/permalink.spec.ts#permalink page: renders the correct complaint at /c/{id} (FEED-04)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Searching a known ID jumps to /c/{id}; a pasted full permalink URL has its {id} segment extracted; an unknown ID shows the not-found message and stays on the page"
    requirement: FEED-03
    verification:
      - kind: e2e
        ref: "tests/e2e/search.spec.ts#search by ID: a known ID navigates to its permalink (FEED-03)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/search.spec.ts#search by ID: a full permalink URL is extracted and searched (FEED-03)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/search.spec.ts#search by ID: an unknown ID shows the not-found message and stays on the page (FEED-03)"
        status: pass
    human_judgment: false
  - id: D7
    description: "formatDistance/formatRelativeTime match the UI-SPEC copy formats exactly"
    verification:
      - kind: unit
        ref: "tests/unit/distance.test.ts (8 cases)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The feed load-failure state shows the 'Couldn't load reports…' banner with a Retry link and does not blank the feed"
    verification: []
    human_judgment: true
    rationale: "FeedContent's try/catch around nearbyFeed/recentFeed renders FeedErrorBanner on any query failure — verified by code review, but no automated test forces a live-DB query failure against the real Supabase connection to exercise this path end-to-end."
  - id: D9
    description: "A broken/404 photo URL renders a category-colored placeholder tile instead of a broken-image icon (must_haves backstop item)"
    verification: []
    human_judgment: true
    rationale: "Plan's own <human-check> explicitly defers this to end-of-phase review with a forced-404 image URL, matching the project's human_verify_mode: end-of-phase config and the must_haves item's own 'verification: backstop' tag."
  - id: D10
    description: "MUST NOT persist, log, or attribute the visitor's live location — it's used only transiently to compute the proximity ORDER BY"
    verification: []
    human_judgment: true
    rationale: "No schema column or log statement anywhere in src/lib/feed.ts, src/app/api/feed/route.ts, or src/app/c/[id]/page.tsx stores or logs lat/lng — verified by code review, not by an automated negative-case test (no DB-write assertion exists to prove the absence of persistence)."
  - id: D11
    description: "MUST NOT expose submitter_id or poster identity in feed payloads, the feed API response, or the permalink page"
    verification:
      - kind: e2e
        ref: "tests/e2e/permalink.spec.ts#permalink page: renders the correct complaint at /c/{id} (FEED-04) (asserts the generic 'Reported by a nearby resident' label is shown)"
        status: pass
      - kind: other
        ref: "Code review: nearbyFeed/recentFeed (src/lib/feed.ts) and the permalink page's SQL only ever SELECT public_id/category/created_at/photo_key(/distance_m) — submitter_id and the serial id are never in the column list of any external-facing query"
        status: pass
    human_judgment: false

duration: ~50 min (across a mid-session connection interruption; no work was lost — resumed from the last confirmed commit)
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 4: Feed Discovery Slice — Proximity Feed, Search-by-ID, Permalink Summary

**Cursor-paginated proximity feed (`::geography`/`<->` KNN with a distance/created_at/public_id tie-break) with infinite scroll, a search-by-ID box that pre-checks existence before navigating, and an SSR `/c/{publicId}` permalink page — replacing Plan 02's inline tracer query with `src/lib/feed.ts`.**

## Performance

- **Duration:** ~50 min of active execution (mid-session API connection interruption after Task 1 landed; resumed from the confirmed `d29b038` commit per the coordinator's instructions, no work lost)
- **Started:** 2026-07-23T09:05:39Z (per prior plan's completion commit)
- **Completed:** 2026-07-23T09:51:18Z
- **Tasks:** 2/2
- **Files modified:** 14 (9 created, 5 modified)

## Accomplishments
- Extracted the Plan 02 tracer's inline feed query into `src/lib/feed.ts`: `nearbyFeed`/`recentFeed` cursor-paginated queries selecting only external-safe columns, with a deterministic `distance ASC, created_at DESC, public_id ASC` tie-break implemented as an explicit row-comparison `WHERE` clause over a derived table (since `distance_m` is a computed `ST_Distance(...)` expression, not a real column)
- `GET /api/feed` cursor-paginated endpoint (lat/lng optional -> proximity else recency, D-07); `src/lib/distance.ts`'s `formatDistance`/`formatRelativeTime` unit-tested against the UI-SPEC's exact copy formats
- `FeedCard`/`FeedList`: photo + category badge + distance (hidden when unavailable) + relative timestamp + generic "Reported by a nearby resident" label, wrapped in a `Link` to `/c/{publicId}` (the feed's own discovery path to the shareable permalink); `IntersectionObserver` infinite scroll that stops fetching once the server returns a null cursor
- `page.tsx` refactored onto `feed.ts`, with a `<Suspense>`-streamed skeleton (keyed on `hasLocation` so the recency->proximity transition re-shows it), an empty state, and an error banner with Retry — all three states self-contained within the SSR component tree, no new route-level loading files needed
- `SearchById`: extracts `{id}` from a pasted full permalink URL, otherwise treats input as the literal ID; checks existence via a `GET /c/{id}` before navigating, so an unknown ID shows the not-found copy and stays on the page rather than navigating into a dead link
- `src/app/c/[id]/page.tsx`: SSR permalink lookup by `public_id` only (never the serial `id`/`submitter_id`), reuses `LocationRequester` to show distance when a visitor location is available, `notFound()` for a missing/malformed id backed by a new `src/app/c/[id]/not-found.tsx` rendering the exact UI-SPEC copy
- Found and fixed a real pre-existing bug while wiring `LocationRequester` into the permalink page: it hardcoded `router.replace("/?...")`, which silently bounced any visitor on `/c/{id}` straight back to the feed the instant location resolved — now replaces the *current* pathname
- Replaced all three fixme-stub/tracer-smoke e2e specs (`feed.spec.ts`, `search.spec.ts`, `permalink.spec.ts`) with real assertions against the live Supabase/R2 infrastructure: nearest-first ordering (verified via a full `/api/feed` cursor walk, robust against the shared DB's cross-run test-data accumulation), location-denied fallback, known/unknown/URL-paste search, and permalink render/not-found

## Task Commits

Each task was committed atomically:

1. **Task 1: Proximity feed query + cursor pagination + FeedCard/FeedList + states (FEED-01)** — `d29b038` (feat)
2. **Task 2: Search-by-ID + SSR permalink page (FEED-03, FEED-04)** — `e6cf993` (feat)

_No separate metadata commit yet — this repo is running sequential/non-worktree mode; STATE.md/ROADMAP.md/REQUIREMENTS.md updates are committed as part of the final-commit step below._

## Files Created/Modified
- `src/lib/feed.ts` — `nearbyFeed`/`recentFeed` cursor-paginated queries
- `src/lib/distance.ts` — `formatDistance`/`formatRelativeTime`
- `src/app/api/feed/route.ts` — `GET` cursor-paginated feed endpoint
- `src/components/feed/FeedCard.tsx` — card UI, broken-photo placeholder
- `src/components/feed/FeedList.tsx` — infinite-scroll client list
- `src/components/feed/SearchById.tsx` — search-by-ID box
- `src/app/c/[id]/page.tsx` — SSR permalink page
- `src/app/c/[id]/not-found.tsx` — permalink not-found state
- `tests/unit/distance.test.ts` — 8 unit cases
- `src/app/page.tsx` — refactored feed page (Suspense skeleton, empty/error states, SearchById mount)
- `src/components/feed/LocationRequester.tsx` — bug fix (see Deviations)
- `tests/e2e/feed.spec.ts` / `tests/e2e/search.spec.ts` / `tests/e2e/permalink.spec.ts` — real E2E specs

## Decisions Made
- Kept `photoUrl` as a small duplicated helper in `src/lib/feed.ts` and `src/app/c/[id]/page.tsx` rather than exporting it from `feed.ts` — the plan's `must_haves.artifacts` declares `feed.ts`'s exports as exactly `nearbyFeed`/`recentFeed`, and the permalink page's own row shape (with an optional `distance_m`) differs enough from `FeedItem` that a shared mapper wasn't a clean fit.
- `SearchById`'s existence check does a plain `GET /c/{id}` (discarding the HTML body) rather than `HEAD`, since Next.js App Router page routes' `HEAD` support isn't something this plan verified against docs — `GET` is unambiguously supported and the extra payload is negligible for a single check.
- `nearbyFeed`/`recentFeed` are implemented via `db.execute(sql\`...\`)` raw queries rather than Drizzle's query builder + `$with` CTE helper, since the row-comparison tie-break WHERE clause needed full control over parenthesization that's simplest to express as literal SQL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Modified `src/app/page.tsx` in Task 2 (not in Task 2's declared file list)**
- **Found during:** Task 2
- **Issue:** Task 2's own action text says "Wire SearchById into the feed header," but `src/app/page.tsx` is only listed under Task 1's `<files>` — without editing it in Task 2, the search box (FEED-03's whole point — "a visible search box on the feed/landing page") would never actually be reachable by a user.
- **Fix:** Imported and mounted `<SearchById />` in the feed header, immediately below the `<h1>`.
- **Files modified:** `src/app/page.tsx`
- **Verification:** `npx tsc --noEmit`, `npx eslint`, `npm run build` all clean; `tests/e2e/search.spec.ts` exercises the mounted component end-to-end.
- **Committed in:** `e6cf993` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added `src/app/c/[id]/not-found.tsx`**
- **Found during:** Task 2
- **Issue:** `notFound()` (called from the permalink page for a missing/malformed id) renders Next.js's generic default 404 page unless a `not-found.tsx` boundary exists in the same route segment — without this file, the plan's own must_haves truth ("renders the dedicated 'This report doesn't exist…' state") would silently fail, showing Next's stock 404 copy instead.
- **Fix:** Added the segment-scoped `not-found.tsx` with the exact UI-SPEC copy and a "Back to feed" link.
- **Files modified:** `src/app/c/[id]/not-found.tsx` (new)
- **Verification:** `tests/e2e/permalink.spec.ts#an unknown ID renders the not-found state, not a crash` asserts both the 404 status code and the exact copy.
- **Committed in:** `e6cf993` (Task 2 commit)

**3. [Rule 1 - Bug] Fixed `LocationRequester`'s hardcoded feed-only redirect path**
- **Found during:** Task 2, while wiring `LocationRequester` into the permalink page for its distance display
- **Issue:** `LocationRequester` (built in Plan 02 for the feed page only) called `router.replace(\`/?${params}\`)` — a path hardcoded to `/`, regardless of which page mounted it. Reusing it unmodified on `/c/{id}` meant that the instant the visitor's location resolved, the browser silently navigated *away* from the permalink back to the feed — a real, user-visible bug, first caught by a failing e2e assertion, not a code read.
- **Fix:** Switched to `usePathname()` and replace `${pathname}?${params}` instead of a fixed `/?${params}`.
- **Files modified:** `src/components/feed/LocationRequester.tsx`
- **Verification:** `tests/e2e/permalink.spec.ts` and `tests/e2e/search.spec.ts` (both of which navigate to `/c/{id}` after publish) pass; `tests/e2e/feed.spec.ts` re-verified unaffected.
- **Committed in:** `e6cf993` (Task 2 commit)

**4. [Rule 1 - Bug] Reworked `tests/e2e/feed.spec.ts`'s nearest-first assertion twice during verification**
- **Found during:** Task 1 verification, then re-discovered during Task 2's regression pass
- **Issue:** The first version matched complaints by category-label text; once `search.spec.ts`/`permalink.spec.ts` also published complaints (some sharing a category, at the shared fixture's zero-distance location), the *first* occurrence of a category label in the page was sometimes a different, unrelated complaint from another spec's run against the same live, cross-run-accumulating DB — an accumulated-test-data flake, not a feed-ordering bug. A second attempt using DOM link order hit the same problem at a coarser level: as more zero-distance complaints piled up from repeated runs, the "near" complaint no longer fit inside the SSR's first `FEED_LIMIT=20` page at all.
- **Fix:** Identify each published complaint by its own opaque `public_id` (learned by following its own card immediately after publishing), and verify ordering by walking the full `/api/feed` cursor chain to completion rather than trusting a single fixed-size page — deterministic regardless of how much unrelated data has accumulated in the shared DB.
- **Files modified:** `tests/e2e/feed.spec.ts`
- **Verification:** Re-ran `npx playwright test tests/e2e/feed.spec.ts --workers=1` after each rewrite; final version passes reliably.
- **Committed in:** `e6cf993` (bundled with Task 2's commit, since the fix was needed to confirm Task 2 didn't regress Task 1's spec)

---

**Total deviations:** 4 auto-fixed (1 Rule 3 - blocking, 1 Rule 2 - missing critical, 2 Rule 1 - bug)
**Impact on plan:** All four were necessary for the plan's own stated behavior (search box actually reachable, not-found copy actually shown, permalink page actually stays put, and the plan's own required feed e2e test actually verifying what it claims) or for correctness against real accumulated test data. No scope creep beyond what FEED-01/03/04 already required.

## Issues Encountered

- **Dev-server HMR doesn't pick up new special route files (`not-found.tsx`) on an already-running server:** After creating `src/app/c/[id]/not-found.tsx` while a Playwright-managed `npm run dev` webServer was still alive from an earlier test run (`reuseExistingServer: true` in `playwright.config.ts`), requests to `/c/{bogus-id}` returned a `500` instead of `404` — the reused server's route manifest hadn't been rebuilt to know about the new file. Killing the stale server (port 3000) and letting Playwright spawn a fresh one resolved it immediately; confirmed via a direct `curl` comparison against a freshly-started `next dev` instance (404, correct) vs. the stale one (500). Not a code bug — flagging as a known dev-workflow gotcha for anyone adding a new `loading.tsx`/`error.tsx`/`not-found.tsx` mid-session.
- **Live-infra E2E specs are inherently cross-contaminating across runs:** Every capture->publish e2e test writes a real row into the shared hosted Supabase DB, and repeated executions across this plan's own iterative debugging (plus Plans 01-02/01-03's prior runs) accumulate dozens of complaints at the fixture's default coordinate. `feed.spec.ts`'s ordering assertion had to be redesigned twice (see Deviation 4) to be robust against this — a structural characteristic of the project's "live infra, never mocked" testing convention (see `.claude/CLAUDE.md`/RESEARCH.md), not something fixable within this plan's scope. Future phases adding e2e coverage in this same DB should identify complaints by their own opaque id rather than by category/content, per the pattern established here.
- **Mid-session API connection interruption after Task 1 landed:** Confirmed via `git log`/`git status` that Task 1's commit (`d29b038`) was intact and no uncommitted work was lost; resumed Task 2 from that exact point per the coordinator's instructions.

## User Setup Required

None — no new external service configuration required. `.env.local`'s existing `DATABASE_URL`/`R2_*` values from Plans 01/02 are unchanged and sufficient.

## Next Phase Readiness

- Phase 1 (`core-capture-to-feed-skeleton`) is now feature-complete across all 4 plans: capture (01-02/01-03), feed/search/permalink (01-04). The walking skeleton — live camera capture -> live GPS -> R2 upload -> geometry insert -> proximity feed -> search-by-ID -> shareable permalink — is fully wired against live Supabase+R2 infrastructure.
- Three coverage items are explicitly deferred to end-of-phase human review, matching the project's `human_verify_mode: end-of-phase` config: D2 (infinite-scroll stop-on-end, code-reviewed but not e2e-forced past one page), D8 (feed load-failure banner, code-reviewed but not exercised against a real query failure), and D9 (broken-photo category-tile placeholder — the plan's own `<human-check>` explicitly requires a forced-404 image URL check on a real render).
- D10 (visitor-location non-persistence) and the category-tile color choices (see Decisions) are also flagged for end-of-phase sign-off, consistent with prior plans' pattern of surfacing code-reviewed-but-not-automated items rather than silently asserting them proven.
- The `LocationRequester` fix (Deviation 3) is a small, generically useful correction that any future page reusing it (e.g. a future user-profile or "my reports" page) will now benefit from automatically.

## Self-Check: PASSED

All 9 claimed created files verified present on disk (`src/lib/feed.ts`, `src/lib/distance.ts`, `src/app/api/feed/route.ts`, `src/components/feed/FeedCard.tsx`, `src/components/feed/FeedList.tsx`, `src/components/feed/SearchById.tsx`, `src/app/c/[id]/page.tsx`, `src/app/c/[id]/not-found.tsx`, `tests/unit/distance.test.ts`); both claimed task commit hashes (`d29b038`, `e6cf993`) verified present in `git log --oneline --all`; `npx tsc --noEmit`, `npx eslint`, `npm run build`, `npx vitest run` (24/24), and `npx playwright test tests/e2e/feed.spec.ts tests/e2e/search.spec.ts tests/e2e/permalink.spec.ts` (7/7, run with `--workers=1` per Plan 03's documented full-parallel-suite contention workaround) all independently re-run clean during this plan's execution, not just asserted.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-23*
