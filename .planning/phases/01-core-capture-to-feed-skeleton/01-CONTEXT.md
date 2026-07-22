# Phase 1: Core Capture-to-Feed Skeleton - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the riskiest end-to-end loop in the product: a user captures a live, geo-tagged photo, picks one of 5 fixed categories, publishes instantly, and anyone (no account needed) can see it in a nearby feed or open it directly by its unique ID or permalink. Auth is a stub dev-identity only — no real accounts, no reverse geocoding, no duplicate detection, no photo blurring, no AI verification yet. Those are Phases 2-4.

Requirements covered: SUBM-01, SUBM-02, SUBM-03, SUBM-06, FEED-01, FEED-03, FEED-04.

</domain>

<decisions>
## Implementation Decisions

### Camera Capture Experience
- **D-01:** Use full `getUserMedia()` live in-page camera preview + capture-to-`<canvas>`, not the simpler `<input capture="environment">` fallback. Proves the actual riskiest mechanic now rather than deferring it. — **Reversibility:** costly — switching later means rebuilding the capture UI and losing the overlay-burn pipeline (D-02) built around canvas access.
- **D-02:** Burn a visible geotag + timestamp overlay onto the captured photo at capture time (rendered onto the canvas before it becomes the final image), not just invisible metadata. Signals "captured live, right here, right now" the way FixMyStreet/SeeClickFix-style apps do.
- **D-03:** If camera or GPS permission is denied, hard-block submission with a clear explanation and guidance to re-enable access in browser settings. No submission is possible without both — consistent with the "no gallery, no EXIF" anti-abuse design. There is no degraded/fallback submission path.
- **D-04:** Wait briefly (~3-5s) for the browser to refine the GPS fix, then submit with whatever accuracy is available at that point — store `coords.accuracy` alongside the coordinate per the roadmap note, so downstream phases (geocoding, dedup) can judge fix quality. Do not block submission on hitting a specific accuracy threshold.

### Stub Identity Model
- **D-05:** Represent the Phase 1 "dev identity" as a per-browser anonymous device ID, generated on first visit and stored in a cookie/localStorage. This maps cleanly onto a real `user_id` when Phase 2 replaces the stub with Google OAuth / phone OTP — no login screen needed in this phase. — **Reversibility:** reversible — Phase 2 swaps this for a real `user_id`; keep the schema field generic enough (e.g. `submitter_id`) that the swap doesn't require a data migration beyond backfilling real IDs.
- **D-06:** Do not show a fake username on feed cards or complaint pages. Use a generic label (e.g. "Reported by a nearby resident") or omit poster identity entirely, rather than inventing an anon handle that Phase 2 would need to retcon.

### Feed Behavior & Content
- **D-07:** Loading the public feed requests the browser's live location (even for anonymous, non-logged-in visitors) to sort by proximity. If location is denied, still render a feed (e.g. most recent overall / default view) rather than blocking browsing entirely — preserves "browse without an account" as a hard requirement even without location.
- **D-08:** Each feed card shows: the photo (with its burned-in geotag overlay visible), a category icon/badge, raw distance ("2.3 km away" — no human-readable address until Phase 3), and relative timestamp ("5m ago").
- **D-09:** Use infinite scroll to load more complaints as the user scrolls, matching the Reddit/Instagram social-feed reference point.
- **D-10:** "Nearby" has no hard distance cutoff for this phase — sort all complaints by distance (recency/engagement blending comes later in Phase 5). Avoids empty feeds in low-density areas before anchor-city seeding (Phase 6). A real radius/city-scoping can be tuned later once real density data exists.

### Complaint ID & Permalink Format
- **D-11:** Complaint IDs are short opaque alphanumeric codes (~6-8 characters, e.g. `KYA-7F3X2`) — not UUIDs and not sequential integers. Easy to read aloud, type into a search box, or write on a physical sign, while staying non-guessable/non-sequential. — **Reversibility:** one-way — the ID format is embedded in every published permalink from day one; changing format later breaks already-shared links unless a redirect/alias layer is added.
- **D-12:** Permalink URL structure is `/c/{id}` — short, Twitter-style path.
- **D-13:** Search-by-ID (FEED-03) is a visible search box on the feed/landing page where anyone can paste or type a complaint ID and jump straight to it — not URL-only access.

### Claude's Discretion
None — every gray area discussed reached an explicit user decision (no "you decide" selections were taken).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Constraints
- `.claude/CLAUDE.md` — Full technology stack rationale for this project, including the getUserMedia vs. capture-attribute tradeoff, the GPS-not-EXIF rule, and the MIT/open-source dependency bias. Directly informs D-01 through D-04.

### Project Definition
- `.planning/PROJECT.md` — Core value, constraints (mobile-web-only, live-capture-only, India-only), and key decisions log.
- `.planning/REQUIREMENTS.md` — SUBM-01, SUBM-02, SUBM-03, SUBM-06, FEED-01, FEED-03, FEED-04 (full acceptance criteria for this phase's scope).
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria, and build notes (GPS wait-for-fix window, raw-distance feed display until Phase 3).

No other specs, ADRs, or design docs exist yet — this is the first phase of a greenfield project.

</canonical_refs>

<code_context>
## Existing Code Insights

**Greenfield project — no source code exists yet.** This is Phase 1 of Phase 1; there is no Next.js scaffold, no components, no database schema, and no established patterns to reuse or conform to. The researcher and planner should treat this as a from-scratch build guided by `.claude/CLAUDE.md`'s stack recommendations (Next.js App Router, PostgreSQL + PostGIS, Drizzle ORM, Supabase, R2) rather than any existing codebase convention.

### Reusable Assets
None yet.

### Established Patterns
None yet.

### Integration Points
None yet — this phase establishes the initial schema (complaints table with submitter_id, category, photo reference, coordinates + accuracy, opaque ID, created_at) and the initial route structure (feed page, `/c/{id}` permalink page, capture flow) that later phases build on.

</code_context>

<specifics>
## Specific Ideas

- Photo overlay should read like FixMyStreet/SeeClickFix live-capture proof — a visible timestamp + approximate location burned into the image itself, not a polished Instagram-style filter treatment.
- Feed card and social framing should read like Reddit/Instagram (per PROJECT.md), not like a government complaint form.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep suggestions came up during this discussion.

</deferred>

---

*Phase: 1-Core Capture-to-Feed Skeleton*
*Context gathered: 2026-07-22*
