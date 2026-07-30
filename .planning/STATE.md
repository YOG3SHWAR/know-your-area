---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 3
current_phase_name: Location Pipeline — Geocoding & Duplicate Threading
status: planning
stopped_at: Completed 02-03-PLAN.md
last_updated: "2026-07-30T15:04:27.919Z"
last_activity: 2026-07-30
last_activity_desc: Phase 02 complete, transitioned to Phase 3
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 15
  completed_plans: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-22)

**Core value:** Make civic problem reporting dead simple and visible — so people who don't know (or don't trust) official government reporting channels can still report and see local issues, with photo-verified, deduplicated, publicly visible complaints.
**Current focus:** Phase 02 — real-authentication-write-gating

## Current Position

Phase: 3 — Location Pipeline — Geocoding & Duplicate Threading
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-30 — Phase 02 complete, transitioned to Phase 3

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 12 | - | - |
| 02 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 40min | 3 tasks | 34 files |
| Phase 01 P02 | 55min | 2 tasks | 13 files |
| Phase 01 P03 | 35min | 3 tasks | 8 files |
| Phase 01 P04 | 50min | 2 tasks | 14 files |
| Phase 01 P05 | 35min | 2 tasks | 4 files |
| Phase 01 P06 | 15min | 2 tasks | 4 files |
| Phase 01 P07 | 5min | 1 tasks | 0 files |
| Phase 01 P08 | 8min | 1 tasks | 2 files |
| Phase 01 P09 | 10min | 1 tasks | 2 files |
| Phase 01 P10 | 5min | 2 tasks | 3 files |
| Phase 01 P11 | 2min | 2 tasks | 3 files |
| Phase 01 P12 | 6min | 3 tasks | 8 files |
| Phase 02 P01 | 35min | 3 tasks | 8 files |
| Phase 02 P02 | 30min | 2 tasks | 6 files |
| Phase 02 P03 | 35min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Roadmap-shaping decisions affecting current work:

- Roadmap: Vertical MVP slices — each phase ships an end-to-end capability, not a horizontal layer.
- Roadmap: Reverse geocoding (SUBM-04) folded into the dedup phase as one "Location Pipeline" (they share the GPS-drift spike root cause — Pitfalls 3 & 4).
- Roadmap: ENGAGE-03/04 (report + admin takedown) and SUBM-05 (face/plate blur) ship in v1 as legal requirements (IT Rules 2021; Section 66E), not deferrable features.
- Roadmap: Growth/anchor-city seeding is a launch-checklist consideration attached to Phase 6, not a standalone engineering phase — product stays country-wide open from day one.
- [Phase ?]: Used hosted Supabase Postgres+PostGIS instead of local docker-compose for the schema push (Docker not installed on execution machine); docker-compose.yml still authored for contributors with Docker
- [Phase ?]: shadcn CLI's classic --style/--base-color init flags were removed upstream; new-york/neutral design system reconstructed by hand (components.json, cn() helper, oklch theme) then components fetched via the current CLI's shadcn add
- [Phase ?]: drizzle-kit 0.31.10 confirmed to drop the geometry column's SRID on both generate and push (RESEARCH Assumption A3); fixed live DB via manual ALTER + documented as durable in-code warning in schema.ts
- [Phase ?]: Phase 1: LocationRequester client component added (not in plan's file list) to bridge navigator.geolocation into the SSR feed's Server Component query — App Router forbids mixing use client into an async server component file
- [Phase ?]: Phase 1: photoKey's R2-object ID and the complaint row's public_id are independent nanoid generations (decoupled upload-then-insert steps), not reconciled
- [Phase ?]: GPS fix acquired independently twice per submission (capture-time overlay read + pre-submit read) rather than a single lifted fix — matches plan's own key_links, at the cost of ~8s combined wait-for-fix latency
- [Phase ?]: Added a no-fix hard-block screen/copy not in UI-SPEC's Copywriting Contract (only camera/location-denied copy is specified) to satisfy the plan's explicit hard-block-on-no-fix acceptance criterion
- [Phase ?]: lucide-react's AlertTriangle is named TriangleAlert in the installed ^1.26.0 package — used TriangleAlert for the pothole category icon
- [Phase ?]: Phase 1: LocationRequester replaced its hardcoded feed-only redirect path with usePathname() so it's safe to reuse on the permalink page (/c/[id]) as well as the feed
- [Phase ?]: Phase 1: e2e specs against the shared live DB must identify complaints by their own opaque public_id rather than by category/content, since cross-run test data accumulates in the same hosted Supabase instance
- [Phase ?]: 01-05: Escalation wired only through CameraCapture (both getUserMedia mount + captureBestFix on Capture), not CapturePage's separate pre-Publish captureBestFix call — CameraCapture always runs both denial-prone operations before Publish is reachable
- [Phase ?]: 01-05: Used a deniedRef latch (not state) in PermissionGate to prevent a slower proactive Permissions-API check from downgrading an already-escalated denial back to ok
- [Phase ?]: 01-06: Used beforeAll + dynamic import() in db-client-options.test.ts instead of a top-of-file env assignment, since ES module static imports are hoisted above ordinary top-level statements
- [Phase ?]: 01-06: feed route logs err.name/err.message/err.code as three separate console.error args (not a single object) for a shape-agnostic test assertion
- [Phase ?]: 01-07: Production feed 500 root cause resolved via Vercel DATABASE_URL/Supabase pooler config + redeploy; exact hypothesis confirmed not specified by user beyond general pooler-config framing, recorded as reported.
- [Phase ?]: 01-08: Fixed wrapOverlayLines break condition (=== to >=) and exported it for direct unit testing, closing the CR-01 timestamp-drop gap without touching formatOverlayText/drawOverlay signatures
- [Phase ?]: 01-09: Skip post-loop append of the dangling wrap fragment on break-truncation instead of push-then-clamp; broaden ellipsis condition to (truncated || measured-width overflow) so a break-triggered truncation always leaves a visible ellipsis on the last retained overlay line (residual CR-01 closed)
- [Phase ?]: 01-10: Broadened onCaptured to accept null so Retake can clear the parent's pending photoKey without changing capture/page.tsx
- [Phase ?]: 01-10: Always-mounted <video> with an absolutely-positioned <img> preview overlay preserves the stream binding across generic error/retry paths (no remount)
- [Phase ?]: 01-11: Removed err-typed branching in CameraCapture.tsx's upload catch block entirely — always render one fixed sanitized message, never raw thrown/network error text
- [Phase ?]: 01-11: R2 CORS production-origin change (user_setup) and the real-device human-check remain open post-plan — deferred to end-of-phase UAT per workflow.human_verify_mode: end-of-phase
- [Phase ?]: [Phase ?]: 01-12: Promoted sanitizeError to the single primary error-sanitization mechanism, retrofitting the four prior ad-hoc call sites (camera-start, geolocation, upload, feed route) onto it — no fifth parallel implementation
- [Phase ?]: [Phase ?]: 01-12: ComplaintPhoto client component copies FeedCard's CATEGORY_ICONS/CATEGORY_TILE_STYLES verbatim rather than shared-extracting, keeping the permalink photo-404 fix a point-fix that never risks FeedCard's already-working fallback
- [Phase ?]: Google is the only social provider (D-01) — no Credentials provider, no phone/otp field
- [Phase ?]: Kept Better Auth default singular table names (no usePlural) per RESEARCH.md Assumption A3
- [Phase ?]: drizzle-kit CLI invocations require DOTENV_CONFIG_PATH=.env.local since drizzle-kit's bundled dotenv only auto-loads .env by default
- [Phase ?]: drizzle-kit push recurringly drops complaints.location SRID to 0 on every push (not just first) — must re-apply the documented ALTER fix after every push
- [Phase ?]: 02-02: Used Better Auth's official testUtils plugin (ctx.test.login) for e2e session seeding instead of internalAdapter.createSession() + hand-signed cookie
- [Phase ?]: 02-02: Session-seeding uses a separate test-only betterAuth() instance in auth-fixtures.ts, never imports production src/lib/auth.ts
- [Phase ?]: 02-02: auth-fixtures.ts avoids the @/* alias entirely (relative imports + duplicated buildClientOptions) and loads .env.local itself via process.loadEnvFile() since the Playwright test process is separate from the Next dev server
- [Phase ?]: 02-03: submitComplaint's no-session rejection is a plain throw (not routed through sanitizeError) since the message is developer-authored and inherently safe
- [Phase ?]: 02-03: Defense-in-depth session check pattern established — submitComplaint and POST /api/upload-url each independently call auth.api.getSession() and reject before any work, never relying solely on the /capture page gate

### Pending Todos

None yet.

### Blockers/Concerns

Flagged spikes (must be run within their phase, not silently assumed):

- Phase 2: AI provider cost benchmarking with real phone-camera-resolution images (blocking for Phase 4 provider selection).
- Phase 3: Nominatim India geocoding accuracy across dense/medium/rural coordinates.
- Phase 3: 200m dedup radius false-positive rate in dense metros (30-40% risk); DBSCAN / photo-similarity as fallback.

### Roadmap Evolution

- Phase 02.1 edited: edited fields: title, goal (shortened title, added real goal statement)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-30T04:02:59.525Z
Stopped at: Completed 02-03-PLAN.md
Resume file: None
