# Roadmap: Know Your Area

## Overview

Know Your Area is built as a sequence of vertical MVP slices — each phase ships a working end-to-end capability rather than a horizontal technical layer. We start by proving the riskiest, least-standard mechanics (forcing live-only camera capture in a mobile browser, reading GPS at capture time, and rendering a geo-sorted feed) with auth and the verification pipeline stubbed (Phase 1). We then layer in real accounts and write-gating (Phase 2), the async location pipeline that geocodes and deduplicates raw submissions into a clean threaded feed (Phase 3), the pre-publish trust layer that blurs faces/plates, runs AI verification, and blocks abuse (Phase 4), and the social layer of upvotes, comments, ranked feed, and content reporting (Phase 5). Finally, a blocking compliance-and-launch gate (Phase 6) stands up the operational takedown workflow, the legal scaffolding required for IT Rules 2021 safe harbor, and a non-empty first-run experience — with anchor-city seeding as a launch consideration even though the product stays open country-wide from day one.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Core Capture-to-Feed Skeleton** - Live camera + GPS capture → instant publish → nearby feed → open by ID/permalink (stub auth) (completed 2026-07-28)
- [ ] **Phase 2: Real Authentication & Write-Gating** - Google OAuth + phone OTP normalized to one identity; anonymous browse, gated writes
- [ ] **Phase 3: Location Pipeline — Geocoding & Duplicate Threading** - Async pipeline: reverse-geocode to locality/ward/pincode + thread same-issue reports onto the original
- [ ] **Phase 4: AI Verification, Photo Privacy & Abuse Prevention** - Auto face/plate blur + AI pre-publish gate (category/location/genuineness) + submission rate-limiting
- [ ] **Phase 5: Social Engagement, Ranking & Moderation** - Upvote, comment, report affordance + moderation queue, and a social-style ranked feed
- [ ] **Phase 6: Compliance, Privacy & Launch Readiness** - Pre-launch gate: takedown workflow + IT Rules 2021 scaffolding + non-empty first-run experience

## Phase Details

### Phase 1: Core Capture-to-Feed Skeleton

**Goal**: Prove the riskiest end-to-end loop — a user can capture a live, geo-tagged photo, pick a category, publish it, and anyone can see it in a nearby feed and open it directly by its unique ID or permalink. Auth is a stub dev-identity; no geocoding, dedup, blurring, or AI yet.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SUBM-01, SUBM-02, SUBM-03, SUBM-06, FEED-01, FEED-03, FEED-04
**Success Criteria** (what must be TRUE):

  1. A user can capture a photo using only the live in-app camera — the gallery/file picker is not an available submission path.
  2. When submitting, the user picks one of the 5 fixed categories and the app captures their live GPS location automatically (read from the browser at submit time, not from image EXIF).
  3. A submitted complaint appears in a feed of nearby complaints sorted by proximity/recency, viewable by anyone.
  4. Each complaint has a unique, opaque ID and can be opened directly via search-by-ID or its permalink URL.

**Plans**: 12/12 plans executed
**Wave 1**

- [x] 01-01-PLAN.md — Project scaffold, PostGIS data layer + shared type contract, opaque IDs, test harness (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Walking-skeleton tracer: live capture → GPS → R2 upload → geometry insert → SSR proximity feed (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Capture hardening: overlay burn-in, orientation-safe canvas, GPS wait-for-fix, permission hard-block, category picker (Wave 3)
- [x] 01-04-PLAN.md — Feed discovery: proximity feed + infinite scroll + states, search-by-ID, /c/{id} permalink (Wave 3)

**Gap Closure** *(from 01-UAT.md — G-01-3 blocker, G-01-4 cosmetic, G-01-EXTRA-1 blocker)*

- [x] 01-05-PLAN.md — Capture fixes: route real camera/GPS denial into the hard-block (G-01-3) + uniform 2-col category grid (G-01-4) (Gap Wave 1)
- [x] 01-06-PLAN.md — DB client hardening: postgres.js ssl/prepare:false + surface real feed-query error (G-01-EXTRA-1 code fix) (Gap Wave 1)
- [x] 01-07-PLAN.md — Production feed verify: DATABASE_URL pooler + redeploy human-verify checkpoint (G-01-EXTRA-1 closure) (Gap Wave 2, blocked on 01-06)

**Gap Closure — Round 2** *(from 01-VERIFICATION.md re-verification — CR-01 blocker, overlay word-wrap drops burned-in timestamp)*

- [x] 01-08-PLAN.md — Overlay fix: correct wrapOverlayLines break condition so the burned-in timestamp is retained (D-02) + add missing wrapOverlayLines unit coverage (CR-01) (Gap Wave 1)

**Gap Closure — Round 3** *(from 01-VERIFICATION.md re-verification — residual CR-01: wrapOverlayLines silently drops the burned-in timestamp when overlay text needs 3+ wrap lines)*

- [x] 01-09-PLAN.md — Overlay truncation fix: a break-triggered wrap-truncation always leaves a visible "…" signal instead of silently dropping trailing content (D-02) + content-based (not length-only) unit assertions (Gap Wave 1)

**Gap Closure — Round 4** *(from 01-UAT.md test 9 — G-01-9 major: after capture the live camera keeps playing with no captured-photo feedback)*

- [x] 01-10-PLAN.md — Capture confirmation: replace live feed with a static captured-photo preview + stop the stream + distinct "Photo captured — Retake?" control (G-01-9), and add the missing post-capture 'populated' state to 01-UI-SPEC.md (Gap Wave 1)

**Gap Closure — Round 5** *(from 01-UAT.md test 2 — G-01-2 blocker: production capture→upload→publish blocked; R2 bucket CORS AllowedOrigins never included the production origin + raw upload error leaked to UI)*

- [x] 01-11-PLAN.md — R2 CORS production origin (human infra step + README docs) + sanitize CameraCapture upload-error message with forced-failure e2e coverage (G-01-2) (Gap Wave 1)

**Gap Closure — Round 6** *(from 01-VERIFICATION.md re-verification — CR-01 blocker: submitComplaint leaks raw DB errors to the UI; WR-08 blocker: permalink page has no photo-404 fallback)*

- [x] 01-12-PLAN.md — One shared `sanitizeError` utility applied to the publish path (G-01-CR-01) + retrofitted into the 3 prior ad-hoc sanitization sites (camera/geo, feed route, upload); separate permalink photo-404 category-tile fallback (G-01-WR-08) (Gap Wave 1)

**UI hint**: yes

Notes:

- Capture GPS with a brief "wait-for-fix" window and store `coords.accuracy` alongside the coordinate (Pitfall 4) — downstream geocoding/dedup will depend on it.
- Feed location display can be raw distance ("2.3 km away") until Phase 3 adds human-readable addresses.

### Phase 2: Real Authentication & Write-Gating

**Goal**: Replace the stub identity with a real Google OAuth account normalized to one internal `user_id`, gate all write actions behind login, and keep feed browsing fully anonymous. Phone OTP (AUTH-02) is deferred out of this phase (Phase 2 discussion, 2026-07-28) — see `02-CONTEXT.md` D-01.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-03, AUTH-04 (AUTH-02 deferred, unscheduled)
**Success Criteria** (what must be TRUE):

  1. A user can sign up / log in with Google OAuth.
  2. A logged-in user stays logged in across a browser refresh/return.
  3. Anyone can browse the complaint feed without logging in, but submitting a complaint requires an account (login gate fires on entry to `/capture`, before camera/GPS permission is requested).

**Plans**: 3/3 plans executed

**Wave 1**

- [x] 02-01-PLAN.md — Better Auth foundation: legitimacy gate, install, Google-only config, push user/session/account/verification schema, adapter round-trip (A1) (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Tracer write-gate slice: `/capture` Server Component gate → `/login` (Google sign-in) + CaptureClient move + session-seeding e2e harness (AUTH-01, AUTH-03) (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Identity swap + defense-in-depth: submitComplaint/`upload-url` session gates, delete device-id, anonymous-browse assertions (AUTH-01, AUTH-04) (Wave 3)

**UI hint**: yes

Notes:

- **Spike (blocking for Phase 4): AI provider cost benchmarking.** Measure actual per-image token cost across candidate vision models (e.g., Gemini Flash-Lite vs. GPT-4o vs. a self-hosted open model) using real phone-camera-resolution photos, not demo images (Pitfall 5). Run it here so results are ready before provider selection in Phase 4.
- Phone OTP (AUTH-02) is deferred, not built even as scaffold — no Credentials provider, no phone schema field, no SMS vendor integration. Keep the Auth.js setup and `submitterId` schema shape provider-agnostic so OTP can be added later without a data migration.
- No device-id → real-account data migration needed — no real users exist yet on the current deployment.

### Phase 3: Location Pipeline — Geocoding & Duplicate Threading

**Goal**: Stand up the async processing pipeline that turns a raw submission into a geocoded, deduplicated feed item — resolve the lowest-available Indian address level for display, and thread same-category, same-location reports onto the original instead of cluttering the feed with visual duplicates.
**Mode:** mvp
**Depends on**: Phase 2 (hard technical dependency is the Phase 1 core loop; sequenced after auth per architecture build order)
**Requirements**: SUBM-04, DEDUP-01, DEDUP-02, DEDUP-03
**Success Criteria** (what must be TRUE):

  1. A published complaint shows a human-readable Indian locality/ward/pincode instead of raw coordinates.
  2. Submitting a same-category complaint within ~200m of an existing one threads it onto the original rather than creating a new top-level feed post.
  3. The original complaint visibly shows how many people have reported/confirmed the same issue.
  4. A reporter whose complaint was wrongly merged can split it back out into its own post.

**Plans**: TBD
**UI hint**: yes

Notes:

- **Spike: Nominatim India accuracy.** Validate self-hosted Nominatim + India pincode-polygon fallback against real dense-urban, medium-density, and rural coordinates; design for ±50m GPS tolerance and honest ward/locality-level precision (Pitfalls 4).
- **Spike: 200m dedup radius validation.** Test 200m + category against real dense-metro India data; if the false-positive match rate exceeds ~20-30%, explore DBSCAN-style density clustering and/or perceptual-hash photo-similarity as a second signal (Pitfall 3).
- This is the phase where "submit" stops being instant-publish (status transitions to `pending`); back the spatial query with a PostGIS GiST index and a `category =` pre-filter.

### Phase 4: AI Verification, Photo Privacy & Abuse Prevention

**Goal**: Make the feed trustworthy before it can go public — automatically blur faces and license plates, run the AI pre-publish gate (photo-category match, location plausibility, overall genuineness), rate-limit/block abusive submission patterns, and publish only what passes.
**Mode:** mvp
**Depends on**: Phase 3 (verification depth branches on the dedup outcome; also requires Phase 2 real auth for meaningful rate-limiting)
**Requirements**: SUBM-05, VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05
**Success Criteria** (what must be TRUE):

  1. Faces and license plates in a submitted photo are automatically blurred before the photo is ever published (default, not opt-in).
  2. A photo that doesn't match its selected category, has an implausible location, or reads as spam/junk is rejected and never appears on the public feed.
  3. A user or device submitting an excessive number of complaints in a short window is rate-limited/blocked.

**Plans**: TBD

Notes:

- Use the Phase 2 cost benchmark to finalize the provider; downscale/compress images server-side before the vision-model call; run a two-tier funnel (cheap first pass, escalate only borderline cases) and instrument cost-per-submission from day one (Pitfall 5).
- Location plausibility is defense-in-depth: cross-check GPS against IP-geolocation and flag implausible account-level submission velocity, not a single per-photo signal (Pitfall 2).
- Automated blurring (SUBM-05) is required in v1 for privacy/legal reasons (Section 66E exposure) and must be verified live before the Phase 6 public-launch gate.

### Phase 5: Social Engagement, Ranking & Moderation

**Goal**: Turn the verified feed into a living social product — upvote/"me too," comments, a social-style ranked feed, and the report affordance + moderation queue that both abuse prevention and IT Rules due-diligence require from day one.
**Mode:** mvp
**Depends on**: Phase 4 (engagement builds on the Phase 1 feed and Phase 2 auth; ranking blends engagement signals available once the pipeline is mature)
**Requirements**: FEED-02, ENGAGE-01, ENGAGE-02, ENGAGE-03
**Success Criteria** (what must be TRUE):

  1. A logged-in user can upvote / "me too" a complaint, with vote weighting resistant to trivial sockpuppet inflation.
  2. A logged-in user can comment on a complaint.
  3. Any user can report a complaint or comment, sending it to a moderation queue.
  4. The nearby feed is ranked by a blend of recency, proximity, and engagement rather than a flat chronological list.

**Plans**: TBD
**UI hint**: yes

Notes:

- Report affordances ship alongside the first version of upvote/comment, not later — they feed the moderation queue that Phase 6's takedown workflow acts on (Pitfall 9). The admin takedown action itself lands in Phase 6.

### Phase 6: Compliance, Privacy & Launch Readiness

**Goal**: The blocking gate before the public feed is promoted — an operational takedown workflow that acts within a defined response window, a bystander privacy/takedown request path, the legal scaffolding required to claim IT Rules 2021 safe harbor, and a non-empty first-run experience for new areas.
**Mode:** mvp
**Depends on**: Phase 5 (report affordance + moderation queue) and Phase 4 (blur pipeline to verify)
**Requirements**: ENGAGE-04
**Success Criteria** (what must be TRUE):

  1. A member of the public can request takedown of a specific complaint or photo (e.g., their own incidentally-captured face/plate/property) directly from the post.
  2. An admin can act on reported/takedown-requested content, and a valid takedown takes effect within the defined response window.
  3. A user opening the feed in an area with no complaints yet sees an inviting "be the first to report here" empty state, not a blank/broken screen.

**Plans**: TBD
**UI hint**: yes

Launch checklist (pre-public-launch gate — required before wide promotion, beyond the formal v1 requirement above):

- [ ] Published Privacy Policy + Terms of Service (IT Rules 2021 Rule 3 due diligence)
- [ ] Visible grievance/complaint-about-content contact mechanism (grievance officer path)
- [ ] Documented takedown SLA (≤36-hour "actual knowledge" response) with a named owner/process
- [ ] Confirm the automated face/plate blur (Phase 4) is active on every published photo
- [ ] Consider external India-law review of IT Rules 2021 compliance before public promotion
- [ ] Anchor-city/ward seeding strategy chosen (3-5 cities via founder network / local civic groups) before wide promotion — product stays country-wide open, but seed density first to avoid the cold-start empty-feed death spiral (Pitfall 6)
- [ ] Density metrics tracked per city/ward from day one (e.g., complaints/week per 10k population)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Capture-to-Feed Skeleton | 12/12 | Complete    | 2026-07-28 |
| 2. Real Authentication & Write-Gating | 3/3 | In Progress|  |
| 3. Location Pipeline — Geocoding & Duplicate Threading | 0/TBD | Not started | - |
| 4. AI Verification, Photo Privacy & Abuse Prevention | 0/TBD | Not started | - |
| 5. Social Engagement, Ranking & Moderation | 0/TBD | Not started | - |
| 6. Compliance, Privacy & Launch Readiness | 0/TBD | Not started | - |
