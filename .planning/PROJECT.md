# Know Your Area

## What This Is

A mobile-responsive webapp for reporting civic/municipal problems (potholes, garbage, broken streetlights, water/drainage issues, malfunctioning traffic lights) in India. Users capture a live photo of a problem, which is automatically geo-tagged and reverse-geocoded to the most granular address level available (locality/ward/pincode). The landing page is a Reddit/Instagram-style feed of complaints near the user, publicly browsable without an account.

## Core Value

Make civic problem reporting dead simple and visible — so people who don't know (or don't trust) official government reporting channels can still report and see local issues, with photo-verified, deduplicated, publicly visible complaints.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can sign up/log in via Google OAuth or phone number + OTP
- [ ] User can browse the complaint feed without an account
- [ ] Logged-in user can submit a complaint with a live-captured photo (gallery/file uploads are blocked)
- [ ] Complaint is automatically geo-tagged from device GPS at submission time
- [ ] Complaint location is reverse-geocoded to the lowest available address level (locality/ward/pincode)
- [ ] User selects a category for the complaint (Pothole/Road damage, Garbage/Sanitation, Streetlight/Electrical, Water/Drainage, Traffic lights)
- [ ] System detects duplicate complaints (same category, within 200m) and threads them onto the original instead of creating a new top-level post
- [ ] Verification engine checks photo authenticity, location plausibility, photo-category relevance, and overall genuineness before a complaint is published
- [ ] Verification engine rate-limits/blocks spammy submission patterns
- [ ] Each complaint has a unique, searchable ID
- [ ] User can search for complaints by ID
- [ ] Landing feed shows complaints near the user's current location, ranked like a social feed
- [ ] User can upvote / "me too" a complaint
- [ ] User can comment on a complaint
- [ ] User can share a complaint via a permalink

### Out of Scope

- Official/authority resolution workflow (status updates by government staff) — v1 is public visibility only; no integration with any government body yet
- Native mobile apps — v1 is mobile-responsive web only
- Complaint categories beyond the initial 5 — kept small deliberately for v1 moderation simplicity
- Any country other than India — geocoding/localization decisions are India-specific for launch

## Context

- Motivated by personal frustration: the founder didn't even know official government complaint channels (e.g., MyGov, Swachhata) existed — the core insight is that visibility/discoverability matters as much as the reporting mechanism itself.
- Modeled loosely on FixMyStreet/SeeClickFix (civic reporting) crossed with Reddit/Instagram (social feed, upvotes) and Twitter (duplicate reports threaded under the original).
- Project will be fully open source (MIT license) — this should bias tool/service choices toward options that don't require contributors to hold paid API keys where a reasonably good open/free alternative exists.
- Geographic scope: India, country-wide at launch (not a single-city pilot).

## Constraints

- **Platform**: Mobile-responsive web only — no native apps, no desktop-specific UI; live camera capture must work via browser (getUserMedia / capture attribute)
- **Photo capture**: Only live in-app camera capture is allowed; gallery/file uploads must be blocked to reduce fake/old photo abuse
- **License**: MIT — project is open source; prefer open/free-tier-friendly dependencies for geocoding and maps where a good alternative exists
- **AI/verification cost**: Minimize per-request cost for the AI verification step (photo-category match, genuineness judgment) — evaluate budget-tier hosted models vs. self-hosted open models during research
- **Region**: India-only for launch — reverse geocoding and address formatting must handle Indian administrative levels (locality/ward/pincode)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Browse anonymous, post requires account (Google OAuth or phone OTP) | Balances low-friction discovery with abuse deterrence on write actions | — Pending |
| Duplicate complaints thread onto the original (Twitter-style) instead of creating new posts | Keeps the feed clean and boosts visibility of real recurring issues | — Pending |
| No official/authority resolution workflow in v1 | Founder's core insight is visibility/awareness, not government integration — keep v1 scope tight | — Pending |
| MIT license, open source from the start | Lowest-friction license for contributors | — Pending |
| AI verification provider deferred to research, optimizing for cost | User wants minimum cost; needs comparison of hosted vs. self-hosted options | — Pending |
| Reverse geocoding/maps provider deferred to research | Tradeoff between open-source-friendliness and India address accuracy needs investigation | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-22 after initialization*
