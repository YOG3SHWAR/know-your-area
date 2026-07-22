# Research Summary: Know Your Area

**Project:** Civic problem-reporting webapp for India with social-feed mechanics  
**Research Date:** 2026-07-22  
**Synthesized From:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

Know Your Area is a civic problem-reporting product that combines the information-gathering utility of FixMyStreet/Swachhata with the engagement mechanics of Reddit/Instagram — users report infrastructure problems (potholes, garbage, broken lights) via live photo capture, and the app surfaces verified, deduplicated complaints as a ranked social feed. The core value proposition is **visibility over bureaucracy**: citizens see what others are reporting in their area without waiting for official channels to respond.

The recommended approach prioritizes **photo integrity over user friction** — enforcing live camera capture (never gallery uploads), combining spatial duplicate detection with AI verification to prevent fake/reused photo attacks, and front-loading location/geocoding work early so deduplication and ranking are reliable from day one. This architecture trades off some submission speed (async verification pipeline) to guarantee feed quality and cost control (per-submission AI cost is bounded via cheap pre-filters and image downscaling).

**Key risks are geo-specific, legal, and cost-related:** GPS accuracy degrades significantly in India's dense urban cores (10-50m error in city centers), requiring tolerance in dedup logic; privacy law exposure from incidentally-captured faces/license plates is real and requires automated blurring before publish; and AI verification cost can spike 10-100x without deliberate provider benchmarking and image optimization. Mitigation requires dedicated research/validation phases for geocoding accuracy (Phase 2), AI cost modeling (Phase 4), and a pre-launch compliance/privacy checklist (Phase 6) before any public feed goes live.

---

## Key Findings

### Technology Stack (STACK.md)

**Core Recommendation:** Next.js 15 (App Router) + React 19 + TypeScript with Drizzle ORM on PostgreSQL + PostGIS for spatial queries.

**Database & Storage:**
- **Postgres 15/16 + PostGIS 3.4+:** PostGIS's ST_DWithin function enables the 200m same-category duplicate detection query — required for the product's core dedup mechanic.
- **Drizzle ORM 0.36+** (not Prisma): Prisma explicitly does not support PostGIS geometry types; Drizzle has native geometry support.
- **Cloudflare R2 for photo storage** (zero egress fees): Bandwidth is the cost driver for feed-heavy products.
- **Upstash Redis:** Serverless HTTP-based rate limiting, free tier sufficient for MVP.

**Auth & Cost-Critical Choices:**
- **Auth.js v5 + Google OAuth + phone OTP via local SMS aggregator (MSG91):** Local SMS aggregator (~₹0.15–0.25 per SMS) beats Firebase Phone Auth by 10-30x.
- **Gemini 2.5 Flash-Lite for AI verification:** Costs $0.00003–0.00005 per image. At 100k submissions/month, stays under ~$5.
- **Self-hosted Nominatim + India pincode polygon join:** Free, no API key dependency. Accuracy tied to OpenStreetMap coverage.

**Confidence:** MEDIUM-HIGH. Architecture patterns are HIGH; specific pricing should be re-verified at implementation time.

---

### Features & MVP Scope (FEATURES.md)

**Table Stakes:**
- Photo + category + location on every complaint
- Auto geo-tagging from device GPS
- Reverse geocoding to human-readable place name
- Public feed browsable without login
- Account required to post
- Upvote / "me too" and comments
- Shareable permalink per complaint
- Duplicate detection with 200m + category match
- Staleness signal ("reported N days ago")

**Differentiators:**
- **Live-capture-only enforcement:** No gallery uploads. Solves Swachhata's known failure mode (reused/stock photos).
- **Twitter-style duplicate threading:** Visible threaded replies ("5 more people reported this"), not just duplicate flags.
- **AI verification engine:** Automated pre-publish gate checking authenticity, location plausibility, photo-category relevance.
- **ID-searchable complaints:** Public, opaque IDs enable citations without login.
- **Social-feed-style ranking:** Recency + proximity + upvotes, not gov-queue style.
- **Zero-friction anonymous browse:** Critical adoption lever.

**Anti-Features to Avoid:**
- Official authority resolution workflow (future milestone, not v1)
- Gallery photo uploads (conflicts with live-capture)
- Native mobile apps (web PWA sufficient)
- Aadhaar/DigiLocker verification (adds friction)
- Unlimited categories (breaks AI + dedup)
- Real-time live map (overkill)
- Broader social features (profiles, DMs) — scope creep

**Confidence:** MEDIUM. Civic-reporting landscape well-documented; AI verification patterns need phase-specific research.

---

### Architecture & Build Order (ARCHITECTURE.md)

**Core Pattern: Fast-Ack, Async-Verify Pipeline**

Submission is synchronous (returns ID immediately); verification is asynchronous (reverse geocode → spatial dedup → AI verify). Keeps mobile UX responsive and reduces wasted AI cost.

**Recommended Build Order:**

1. **Slice 0 — Core capture/feed loop:** Live camera + GPS → upload → store → nearby feed + ID search. Validates riskiest parts.

2. **Slice 1 — Real auth:** Google OAuth + phone OTP, normalized to user_id. Gate write actions.

3. **Slice 2 — Reverse geocoding:** Async pipeline converts lat/lng to locality/ward/pincode for display.

4. **Slice 3 — Spatial dedup:** Async pipeline with status=pending states, ST_DWithin 200m + category check, threading.

5. **Slice 4 — AI verification + abuse prevention:** Photo-category + genuineness gate, two-tier funnel, face/plate blurring.

6. **Slice 5 — Engagement & ranking:** Upvote, comments, sharing. Blend recency/proximity/engagement into ranking.

7. **Slice 6 — Compliance & privacy (pre-launch gate):** Privacy policy/ToS, grievance/takedown flow, automated blurring verification.

8. **Slice 7 — Growth/rollout:** Anchor-city seeding, density metrics, "be the first" UX.

**Confidence:** MEDIUM. Patterns well-established; provider agnostic.

---

### Critical Pitfalls & Mitigation (PITFALLS.md)

**Pitfall 1: EXIF unreliable for live-capture verification**
- Mitigation: Use Geolocation API at submission, never EXIF.

**Pitfall 2: GPS spoofing via mock-location apps**
- Mitigation: Cross-check against IP-geolocation, use coords.accuracy, rate-limit suspicious patterns.

**Pitfall 3: Fixed 200m dedup radius breaks in dense urban India**
- Mitigation: Test against real dense-urban data. Consider DBSCAN or photo-similarity signals. Allow user dispute/split.
- Flag: Dedicated spike required.

**Pitfall 4: GPS drift 10-50m in dense urban cores**
- Mitigation: Design for ±50m tolerance. Capture and use coords.accuracy field.

**Pitfall 5: AI verification cost scaling unmanaged**
- Mitigation: Benchmark per-image token cost before provider selection. Downscale images. Two-tier funnel. Instrument cost from day one.
- Flag: Critical AI provider benchmarking required in Phase 2.

**Pitfall 6: Cold-start empty-feed death spiral**
- Mitigation: Seed density in anchor cities first. Reframe empty feed as invitation. Track density metrics.
- Roadmap implication: Should influence phase ordering.

**Pitfall 7: Privacy exposure from unredacted photos**
- Mitigation: Automated face/license-plate blurring as default. User-facing "report/request takedown" flow. Privacy policy.

**Pitfall 8: IT Rules 2021 safe-harbor compliance treated as optional**
- Mitigation: Before public launch, publish privacy policy/ToS, build takedown workflow (36-hour SLA). Must block public release.

**Pitfall 9: Moderation/abuse tooling built as afterthought**
- Mitigation: Build anti-abuse primitives early: rate limits, shadow-rate-limiting, report buttons, sockpuppet-resistant upvotes.

---

## Implications for Roadmap

### Suggested 8-Phase Structure

**Phase 1: Core Capture/Feed Technical Validation**
- Prove live camera capture, GPS reading, geo-sorted feed rendering work
- No reverse geocoding, dedup, or AI yet
- Rationale: Validates riskiest, least-standard parts first

**Phase 2: Real Authentication & Cost Model**
- Google OAuth + phone OTP, rate-limit infrastructure
- **CRITICAL FLAG: AI provider benchmarking** — measure actual per-image token cost with real phone-camera resolution images across Gemini/GPT-4o/self-hosted candidates

**Phase 3: Reverse Geocoding & Location Pipeline**
- Self-hosted Nominatim + India pincode polygon fallback
- Geohash-bucketed caching
- **FLAG: Validate Nominatim accuracy** against real Indian coordinates (dense urban, medium-density, rural)

**Phase 4: Duplicate Detection & Thread UI**
- Async job queue, ST_DWithin 200m + category with GiST index
- Thread UI ("X more people reported this"), user-facing "split thread" dispute flow
- **FLAG: Dedicated spike** testing 200m + category against real dense-urban India test data; if false-rate > 20%, explore DBSCAN or photo-similarity signals

**Phase 5: AI Verification & Abuse Prevention**
- Gemini Flash-Lite photo-category + genuineness gate
- Image downscaling before API call (reduce token cost)
- Two-tier verification funnel, GPS plausibility checks, automated face/plate blurring
- Depends on Phase 2 (cost model) and Phase 4 (dedup to determine verification depth)

**Phase 6: Social Engagement & Ranking**
- Upvote/downvote with sockpuppet resistance, comments with moderation hooks
- Feed ranking (distance + recency + upvotes), permalink generation

**Phase 7: Compliance, Privacy & Moderation (Pre-Launch Gate)**
- Published Privacy Policy/ToS, visible grievance contact mechanism
- Takedown/moderation workflow (36-hour response SLA)
- User-facing "report this photo / request blur or takedown" flow
- **FLAG: Consider external India-law review** of IT Rules compliance before public launch

**Phase 8: Growth & Rollout (Anchor-City Seeding)**
- Anchor-city selection (3-5 cities with civic-consciousness)
- Density seeding via local citizen groups, civic associations
- Density metrics tracking, "be the first" empty-state UX
- Post-launch but inform day-one seeding strategy

### Phase Dependencies

Phase 1 → Phase 2 (auth + cost model) → Phase 3 (geocoding) → Phase 4 (dedup, includes spike research) → Phase 5 (AI verification) → Phase 6 (engagement) → Phase 7 (blocking gate before public) → Phase 8 (post-launch)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | MEDIUM-HIGH | Architecture patterns HIGH; specific pricing MEDIUM (verify at implementation). |
| **Features** | MEDIUM | Civic-reporting landscape HIGH; AI verification patterns LOW and need research. |
| **Architecture** | MEDIUM | Patterns well-established and cross-checked; provider agnostic. |
| **Pitfalls** | MEDIUM | Web-sourced and cross-checked. India-civic-app specifics MEDIUM. GPS in dense urban HIGH on physics, MEDIUM on local manifestation. |
| **Overall** | MEDIUM-HIGH | Sufficient to proceed to detailed roadmap. Open items flagged for phase-level research. |

---

## Must-Address Research Items

1. **AI Provider Benchmarking (Phase 2, blocking):** Measure actual per-image token cost with real phone-camera resolution images before finalizing provider selection.

2. **India-Specific Nominatim Accuracy Validation (Phase 3, spike):** Test against real coordinates from dense urban, medium-density, and sparse regions. Document accuracy expectations by region type.

3. **Duplicate Detection Algorithm Validation (Phase 4, spike):** Test 200m + category against real dense-urban India data. If false rates > 20%, explore DBSCAN or photo-similarity signals.

4. **GPS Accuracy in Dense Urban Cores (Phases 3 & 4):** QA testing in Mumbai/Delhi high-rise zones to confirm 30-50m variance. Inform dedup radius and reverse-geocoding precision.

5. **IT Rules 2021 Compliance Review (Phase 7):** Consider external India-law specialist review before public launch.

---

## Ready for Phase Planning

This research is sufficient to proceed to detailed roadmap creation and Phase 1 planning. All blocking items for each phase are explicitly flagged. The roadmapper can proceed to detailed phase specs and task breakdown.

**Synthesized:** 2026-07-22 | **Source files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
