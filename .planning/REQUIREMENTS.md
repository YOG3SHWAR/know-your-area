# Requirements: Know Your Area

**Defined:** 2026-07-22
**Core Value:** Make civic problem reporting dead simple and visible — so people who don't know (or don't trust) official government reporting channels can still report and see local issues, with photo-verified, deduplicated, publicly visible complaints.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can sign up/log in via Google OAuth
- [ ] **AUTH-02**: User can sign up/log in via phone number + OTP
- [ ] **AUTH-03**: User's session persists across browser refresh
- [ ] **AUTH-04**: User can browse the complaint feed without logging in

### Complaint Submission

- [x] **SUBM-01**: User can capture a live photo in-app (camera only — gallery/file-picker upload is blocked)
- [ ] **SUBM-02**: User selects one of 5 fixed categories when submitting (Pothole/Road damage, Garbage/Sanitation, Streetlight/Electrical, Water/Drainage, Traffic lights)
- [x] **SUBM-03**: App auto-captures the user's GPS location at submission time (read live from the browser, not from image EXIF)
- [ ] **SUBM-04**: Submitted location is reverse-geocoded to the lowest available address level (locality/ward/pincode)
- [ ] **SUBM-05**: Submitted photos are automatically processed to blur faces and license plates before publishing
- [ ] **SUBM-06**: Each complaint receives a unique, opaque, searchable ID upon submission

### Verification & Anti-Abuse

- [ ] **VERIFY-01**: AI verification engine checks that the submitted photo visually matches the selected category before publishing
- [ ] **VERIFY-02**: AI verification engine checks location plausibility (e.g., GPS not obviously spoofed/inconsistent)
- [ ] **VERIFY-03**: AI verification engine judges overall complaint genuineness (vs. spam/junk) before publishing
- [ ] **VERIFY-04**: System rate-limits/blocks a user or device from submitting an excessive number of complaints in a short time
- [ ] **VERIFY-05**: A complaint that fails verification is not published to the public feed

### Duplicate Detection

- [ ] **DEDUP-01**: System detects a new complaint as a likely duplicate when it shares category and is within 200m of an existing complaint
- [ ] **DEDUP-02**: A detected duplicate is threaded onto the original complaint (Twitter-style) instead of creating a new top-level feed post
- [ ] **DEDUP-03**: The original complaint visibly shows how many duplicate confirmations it has received

### Feed & Discovery

- [ ] **FEED-01**: Landing page shows a feed of complaints near the user's current location
- [ ] **FEED-02**: Feed is ranked using a combination of recency, proximity, and engagement (not a flat chronological list)
- [ ] **FEED-03**: User can search for a complaint by its ID
- [x] **FEED-04**: Each complaint has a shareable permalink

### Engagement & Moderation

- [ ] **ENGAGE-01**: Logged-in user can upvote / "me too" a complaint
- [ ] **ENGAGE-02**: Logged-in user can comment on a complaint
- [ ] **ENGAGE-03**: Logged-in user can report a complaint or comment for moderation review
- [ ] **ENGAGE-04**: A reported complaint/comment can be taken down by an admin within a defined response window

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Ranking & Analytics

- **RANK-01**: Weighted feed ranking algorithm (recency + proximity + upvotes + duplicate-thread size), beyond simple v1 ranking
- **RANK-02**: Category-level analytics/heatmap view (e.g., "most-reported area this month")

### Notifications

- **NOTIF-01**: Push/email notification when a complaint the user upvoted or commented on gets new activity

### Authority Integration

- **GOV-01**: Opt-in official/authority resolution workflow (Open311-style routing to municipal systems)
- **GOV-02**: Status field settable by verified government/authority accounts only

### Expansion

- **CAT-01**: Expanded category taxonomy beyond the initial 5
- **MOBILE-01**: Native mobile apps (iOS/Android)
- **SOCIAL-01**: Broader social features (user profiles, follows, groups)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Official authority resolution workflow (status set by government staff) | Core insight is visibility/awareness, not government integration — deliberately deferred to protect v1 scope and avoid partnership/legal dependencies |
| Native mobile apps | Mobile-responsive web only for v1 — avoids doubling the build/maintain surface before the core concept is validated |
| Aadhaar/DigiLocker government ID verification | Disproportionate compliance/privacy/friction burden vs. value for a non-government v1 product; Google OAuth + phone OTP is sufficient abuse deterrence |
| Real-time live map with continuously updating markers | Civic problems (potholes, garbage, lights) aren't time-critical like public-safety incidents — periodic refresh delivers the same user value at far lower engineering cost |
| Unbounded/free-text categories | Fixed 5-category taxonomy is required for the AI photo-category-relevance check and duplicate-detection logic to work; free-text breaks both |
| Manual moderation as the primary abuse defense | Doesn't scale to a country-wide launch with a small/volunteer OSS team; the AI verification engine is the primary gate, manual review (via ENGAGE-03/04) is a fallback, not the first line |
| Gallery/file photo uploads | Directly reopens the fake/reused-photo abuse vector the live-capture-only rule exists to close |
| Crowd-settable "resolved" status | With no official resolution workflow, there's no legitimate actor to set "resolved" — allowing the reporter or crowd to do so invites gaming (marking a real problem "resolved" to suppress visibility) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| SUBM-01 | Phase 1 | Gaps Found |
| SUBM-02 | Phase 1 | Gaps Found |
| SUBM-03 | Phase 1 | Gaps Found |
| SUBM-04 | Phase 3 | Pending |
| SUBM-05 | Phase 4 | Pending |
| SUBM-06 | Phase 1 | Gaps Found |
| VERIFY-01 | Phase 4 | Pending |
| VERIFY-02 | Phase 4 | Pending |
| VERIFY-03 | Phase 4 | Pending |
| VERIFY-04 | Phase 4 | Pending |
| VERIFY-05 | Phase 4 | Pending |
| DEDUP-01 | Phase 3 | Pending |
| DEDUP-02 | Phase 3 | Pending |
| DEDUP-03 | Phase 3 | Pending |
| FEED-01 | Phase 1 | Gaps Found |
| FEED-02 | Phase 5 | Pending |
| FEED-03 | Phase 1 | Gaps Found |
| FEED-04 | Phase 1 | Gaps Found |
| ENGAGE-01 | Phase 5 | Pending |
| ENGAGE-02 | Phase 5 | Pending |
| ENGAGE-03 | Phase 5 | Pending |
| ENGAGE-04 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 26 total
- Mapped to phases: 26 ✓
- Unmapped: 0 ✓

**Per-phase counts:**

- Phase 1 (Core Capture-to-Feed Skeleton): 7 — SUBM-01, SUBM-02, SUBM-03, SUBM-06, FEED-01, FEED-03, FEED-04
- Phase 2 (Real Authentication & Write-Gating): 4 — AUTH-01, AUTH-02, AUTH-03, AUTH-04
- Phase 3 (Location Pipeline — Geocoding & Duplicate Threading): 4 — SUBM-04, DEDUP-01, DEDUP-02, DEDUP-03
- Phase 4 (AI Verification, Photo Privacy & Abuse Prevention): 6 — SUBM-05, VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05
- Phase 5 (Social Engagement, Ranking & Moderation): 4 — FEED-02, ENGAGE-01, ENGAGE-02, ENGAGE-03
- Phase 6 (Compliance, Privacy & Launch Readiness): 1 — ENGAGE-04

---
*Requirements defined: 2026-07-22*
*Last updated: 2026-07-22 after roadmap creation (traceability mapped)*
