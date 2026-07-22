# Feature Research

**Domain:** Civic/municipal problem-reporting webapp (India) crossed with social feed (Reddit/Instagram/Twitter patterns)
**Researched:** 2026-07-22
**Confidence:** MEDIUM (civic-reporting product landscape is well-documented via mySociety/CivicPlus/Swachhata public docs and press; specific AI-verification implementation patterns are lower confidence — LOW — and will need phase-level validation)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist, drawn from both the civic-reporting genre (FixMyStreet, SeeClickFix, Swachhata) and the social-feed genre (Reddit, Instagram, Twitter). Missing these makes the product feel broken or unsafe to use.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Photo + category + location on every complaint | Every civic-reporting product (FixMyStreet, SeeClickFix, Swachhata) requires this triad; it's the minimum unit of a credible report | LOW | Already in PROJECT.md scope |
| Auto geo-tagging from device GPS | FixMyStreet and Swachhata both auto-capture or prompt for location at submission; manual pin-drop is a fallback, not the primary path anymore | LOW | Use `getCurrentPosition`/`watchPosition`; must handle permission-denied gracefully |
| Reverse geocoding to a human-readable place name | Raw lat/lng means nothing to a browsing user; every competitor shows a locality/address string, not coordinates | MEDIUM | India-specific: locality/ward/pincode granularity varies wildly by state/city; treat as a research/architecture concern, not just a feature |
| Category selection at submission | All three reference products (FixMyStreet, SeeClickFix, Swachhata) force category choice — it drives both routing (for them) and, for this product, deduplication and feed filtering | LOW | Fixed 5-category list already scoped |
| Public feed of nearby complaints | This is the core differentiator vs. official gov apps (visibility) and the core mechanic of Reddit/Nextdoor/Citizen-style products | MEDIUM | Needs a ranking/sort model (recency, proximity, or engagement) — decide in architecture, not features |
| Anonymous/no-login browsing | Citizen and Nextdoor both allow low-friction browse; requiring login to view is a top reason civic apps fail to get adopted (nobody installs an app just to look) | LOW | Already scoped: browse without account |
| Account required to post (upvote/comment/submit) | Every reference product gates write actions behind identity (SeeClickFix, Swachhata require login; Reddit/Twitter require an account to post) — necessary for spam/abuse accountability | LOW-MEDIUM | Google OAuth + phone OTP already scoped |
| Upvote / "me too" on a complaint | Swachhata explicitly has "vote up on complaints relevant to you"; Reddit's entire mechanic is upvote-driven ranking — users expect a lightweight "this affects me too" signal | LOW | Doubles as a duplicate/severity signal even outside full dedup threading |
| Comments on a complaint | Universal social-feed expectation (Reddit, Instagram, Twitter) — users expect to add context, confirm, or discuss | MEDIUM | Needs basic moderation (report/hide) even in v1, or comments become the abuse vector |
| Shareable permalink per complaint | Every feed product (Reddit post links, Twitter tweet links) supports this; without it, complaints can't be referenced outside the app (e.g. shared to a WhatsApp group, which is a realistic India distribution channel) | LOW | Trivial with unique complaint ID (already scoped) |
| Duplicate detection / "already reported" surfacing | FixMyStreet Pro and SeeClickFix both flag duplicates by location+category before/at submission — prevents a cluttered feed and wasted authority effort (even without an authority workflow, it prevents a cluttered public feed) | MEDIUM-HIGH | Depends on reverse geocoding + category; already scoped as 200m+category threading |
| Status/state on a complaint (open vs stale) | Even without an authority resolution workflow, users expect some visual signal of "is this old/stale" — pure timestamp-based staleness, not authority-driven status | LOW | Do NOT confuse this with the authority resolution workflow that's explicitly out of scope — a simple "reported N days ago" is enough |
| Basic abuse/spam prevention on submission | Not fully public in most reference apps' marketing, but Swachhata's known abuse problems (fake/reused gallery photos) and general civic-tech literature both flag this as necessary or the whole feed becomes untrustworthy | HIGH | This IS the AI verification engine already scoped — see differentiators below for why this project's approach is stronger than the norm |

### Differentiators (Competitive Advantage)

Features that set this product apart from both the civic-reporting genre and the social-feed genre. These should map directly to the Core Value in PROJECT.md ("photo-verified, deduplicated, publicly visible complaints").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live-capture-only photo submission (no gallery upload) | Directly solves a known failure mode: Swachhata allows gallery uploads, which enables reuse of old/stock photos to fake a complaint or pad severity. Enforcing camera-only capture is a genuine, verifiable differentiator vs. every reference app researched | MEDIUM | Requires `getUserMedia`/`capture` attribute enforcement + server-side check that the upload didn't come through a file picker (can't be fully proven client-side; pair with EXIF/metadata heuristics and the AI verification engine) |
| Twitter-style duplicate threading (not just "flag as duplicate") | FixMyStreet/SeeClickFix only *suggest* duplicates or block re-filing; they don't turn subsequent reports into a visible, growing thread under the original the way a Twitter reply chain does. This turns "5 people reported the same pothole" into a visible severity signal instead of 5 buried duplicate tickets | HIGH | Depends on: reverse geocoding (for the 200m radius) + category match; needs a clear UI pattern (collapsed replies, "X more people reported this") to avoid feeling like a demerit |
| AI verification engine (authenticity + location plausibility + photo-category relevance + genuineness) | Goes beyond every reference app's abuse handling found in research (which is mostly manual moderation or simple duplicate-blocking) — this is an automated pre-publish gate, closer to what civic-tech literature describes as an emerging pattern (GPS/timestamp watermarking + AI vision classification to reject off-topic images) but not yet standard in the mainstream products researched | HIGH | Depends on categories (photo-category relevance needs the category taxonomy) and geocoding (location plausibility needs a real place to check against); flagged for deeper phase-specific research — this is the highest-complexity, least-precedented feature in scope |
| ID-searchable complaints | None of FixMyStreet/SeeClickFix/Swachhata expose a simple "search by complaint ID" as a headline feature (SeeClickFix has internal ticket tracking, not a public ID search) — useful for a user citing their report to others (e.g. "check complaint #4821") without needing account/login state | LOW-MEDIUM | Low complexity technically, but must decide whether IDs are sequential (guessable, enables scraping/enumeration) or opaque — recommend opaque short IDs |
| Feed ranked like a social product, not a government queue | Every civic-gov app researched (Swachhata, SeeClickFix) presents complaints as a queue/ticket list organized by status. Presenting the same underlying data as a Reddit/Instagram-style ranked feed (recency + proximity + upvotes) is a genuine UX differentiator that serves the "visibility over bureaucracy" core value | MEDIUM | Depends on upvote feature + geocoding for proximity ranking |
| Anonymous browse, zero-friction discovery | Citizen's radius/map-first, low-identity-friction browsing is the closer analog than Nextdoor's identity-heavy model or the government apps' login-walled views (Swachhata requires the app + often a phone number even to view). Letting anyone browse without any account is a meaningful, differentiator-level trust/adoption lever for India's varied literacy/trust context | LOW | Already scoped; call out explicitly as strategic, not incidental |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but would either conflict with the explicit v1 scope in PROJECT.md or introduce disproportionate complexity/risk this early.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Official authority resolution workflow (status: acknowledged/assigned/resolved by government staff) | Every civic-gov reference product (Swachhata, SeeClickFix, FixMyStreet) centers on this — it feels like "the point" of civic reporting | Explicitly out of scope in PROJECT.md; requires government API integrations, authenticated staff roles, SLAs, and legal/data-sharing agreements — a huge scope and trust expansion the founder deliberately deferred | Keep v1 as pure visibility/awareness; if traction proves out, layer in an opt-in authority integration (Open311-style, as FixMyStreet does) as a distinct future milestone |
| Gallery/file photo uploads (with a "trust me" disclaimer or EXIF check) | Users without connectivity at the moment of the incident, or who want to submit from a photo they just took, will ask for this constantly | Directly reopens the abuse vector this project is deliberately closing (Swachhata's own gallery-upload feature is a known weak point for fake/reused photos); undermines the "live-photo-only" differentiator entirely | Live capture only, always; if offline capture is a real problem, solve it with local-queue-and-auto-submit-on-reconnect (capture happens live, submission is just delayed), not gallery access |
| Native mobile apps (iOS/Android) | Every established competitor (SeeClickFix, Swachhata, Citizen, Nextdoor) ships native apps, so it "looks like" table stakes | Explicitly out of scope in PROJECT.md; native apps roughly double the build/maintain surface and delay validating the core web concept; mobile-responsive web with `getUserMedia`/capture attribute covers the live-photo requirement well enough on modern Android/iOS browsers | Ship PWA-quality mobile web; revisit native only after the web version validates demand |
| Government login / Aadhaar / DigiLocker identity verification | Feels like it would add "official" trust and reduce fake accounts harder than OAuth/OTP | Adds major compliance, privacy, and friction burden disproportionate to a v1 non-government product; conflicts with the "no official integration in v1" decision and would slow adoption (many users won't want to link Aadhaar to an anonymous-feeling complaint app) | Google OAuth + phone OTP is sufficient identity friction for v1 abuse deterrence |
| Full authority-style ticket/status taxonomy (open/in-progress/resolved/closed/reopened) driven by anyone other than the system | Feels necessary because every reference app has a status field | With no authority resolution workflow, there's no legitimate actor to set "resolved" — allowing the *original reporter* or the crowd to mark something "resolved" invites gaming (e.g., someone marking a real problem "resolved" to suppress visibility) | Only a lightweight, system-computed staleness signal ("reported 12 days ago," possibly auto-archive after N days of inactivity) — not a manipulable status field |
| Unlimited/unbounded categories or free-text "other" category | Feels more flexible and "complete" | PROJECT.md explicitly caps categories at 5 for v1 moderation simplicity; free-text categories break both the AI photo-category-relevance check and the duplicate-detection logic (which depends on exact category match) | Keep the fixed 5-category taxonomy; revisit expansion only after the moderation/verification pipeline is proven at that scale |
| Real-time live map with continuously updating markers (like Citizen's live incident map) | Citizen's real-time, map-first feed is a genuinely engaging pattern worth noting | Civic problems (potholes, garbage, broken lights) are not time-critical the way public-safety incidents are — building real-time infra (websockets, live map re-render) is disproportionate engineering cost for a domain where "updated within the last few minutes" adds no real user value over a periodically-refreshed list | Simple feed with pull-to-refresh / periodic refetch; use a lightweight map view (pins on a static-refresh map) rather than a live socket-driven one |
| Full community/social features beyond the complaint (direct messages, user profiles with follower counts, groups, marketplace) | Nextdoor-style "neighborhood operating system" breadth looks appealing as a growth/retention lever | Scope creep well beyond "civic problem reporting"; Nextdoor's breadth is a multi-year evolution, and importing it in v1 dilutes focus and multiplies moderation surface (DMs and profiles are classic abuse vectors) | Keep the social layer minimal: upvote, comment, share-permalink only. Consider broader social features only as a post-validation v2+ direction, if at all |
| Manual human moderation queue as the primary abuse defense (instead of the AI verification engine) | Feels "safer"/more accurate than an automated gate, and is what most civic-gov apps effectively rely on informally | Doesn't scale to a country-wide, all-of-India launch with a presumably small/volunteer open-source team; becomes the bottleneck and reintroduces the "official channel is slow/opaque" problem this product exists to avoid | Automated AI verification engine as the primary gate, with manual review as a fallback/appeals path for edge cases and reported content — not the first line of defense |

## Feature Dependencies

```
Category selection (fixed 5-category taxonomy)
    └──requires──> (nothing; foundational)

Auto GPS geo-tagging
    └──requires──> (nothing; foundational, browser geolocation API)

Reverse geocoding (lowest available level: locality/ward/pincode)
    └──requires──> Auto GPS geo-tagging

Duplicate detection (same category + 200m radius)
    └──requires──> Category selection
    └──requires──> Reverse geocoding / precise coordinates

Twitter-style duplicate threading
    └──requires──> Duplicate detection

AI verification engine (authenticity, location plausibility, photo-category relevance, genuineness)
    └──requires──> Category selection (for photo-category relevance check)
    └──requires──> Reverse geocoding / coordinates (for location plausibility check)
    └──requires──> Live-capture-only photo submission (verification assumptions depend on capture being camera-only)

Live-capture-only photo submission
    └──enhances──> AI verification engine (narrows the fraud surface the AI must catch)

ID-searchable complaints
    └──requires──> Unique complaint ID generation (trivial, foundational)

Public feed ranking (social-feed style)
    └──requires──> Upvote feature (for engagement-based ranking signal)
    └──requires──> Reverse geocoding (for proximity-based ranking/filtering)

Upvote / "me too"
    └──requires──> Account (login required to write)

Comments
    └──requires──> Account (login required to write)

Anonymous browsing
    └──conflicts with──> Government login / Aadhaar-style identity verification (anti-feature)

Official authority resolution workflow (anti-feature, out of scope)
    └──conflicts with──> Manipulable "resolved" status set by non-authority actors (anti-feature)

Gallery photo uploads (anti-feature)
    └──conflicts with──> Live-capture-only photo submission (table stakes/differentiator)
    └──conflicts with──> AI verification engine's authenticity assumptions
```

### Dependency Notes

- **Duplicate detection requires reverse geocoding:** the 200m radius comparison needs precise, comparable coordinates per complaint; reverse geocoding is also what makes the *displayed* location (locality/ward name) meaningful to a user deciding whether "this looks like the same pothole." Reverse geocoding should land in an earlier phase than dedup/threading.
- **AI verification engine requires category selection and geocoding:** two of its four checks (photo-category relevance, location plausibility) are meaningless without a fixed category to compare against and a real place to sanity-check the GPS reading. This makes the verification engine a *late*-phase feature relative to category taxonomy and geocoding, not an early one — sequence it after both are stable.
- **Live-capture-only enhances (and partially substitutes for) the AI verification engine:** enforcing camera-only capture removes an entire class of fraud (stock/reused photos) before the AI engine ever has to detect it. Treat this as a cheap, high-leverage guard to build first, with the AI engine as defense-in-depth on top, not the sole line of defense.
- **Twitter-style threading requires duplicate detection, not the reverse:** threading is a UI/data-model decision layered on top of a working dedup match; don't attempt threading UI before the matching logic is validated with real data.
- **Anonymous browsing conflicts with heavy identity verification (anti-feature):** any temptation to add Aadhaar/DigiLocker-style verification later should be weighed against the explicit strategic bet that zero-friction anonymous browsing is a differentiator — don't let identity requirements creep into the read path.
- **Official resolution workflow conflicts with crowd-settable status (anti-feature):** if a future milestone ever adds authority integration, it must supersede rather than coexist with any interim crowd-settable "resolved" flag, to avoid two conflicting sources of truth about a complaint's real-world state.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md's Active requirements almost exactly; nothing added here beyond what's already scoped, confirming the scope is already appropriately minimal.

- [ ] Google OAuth / phone OTP account creation — required to gate all write actions
- [ ] Anonymous feed browsing — the core adoption/visibility lever, must work with zero login friction
- [ ] Live-capture-only photo submission — foundational anti-abuse feature and stated differentiator
- [ ] Auto GPS geo-tagging + reverse geocoding to lowest available level — required for both display and dedup
- [ ] Fixed 5-category selection — required for dedup and AI verification relevance checks
- [ ] Duplicate detection (category + 200m) with Twitter-style threading — the headline differentiator; must ship in v1 or the feed will visibly clutter with repeats immediately
- [ ] AI verification engine (authenticity, location plausibility, category relevance, genuineness) — without this, the "no gallery uploads" rule is the only abuse defense, which is necessary but not sufficient
- [ ] Unique, ID-searchable complaint — trivial to build, high value for sharing/reference
- [ ] Upvote / "me too" — cheap, high-value social signal and a secondary severity indicator alongside dedup count
- [ ] Comments — expected baseline social-feed feature; needs at minimum a report/hide moderation hook even in v1
- [ ] Shareable permalink per complaint — trivial, high distribution value (WhatsApp-share is a realistic India growth channel)
- [ ] Ranked nearby feed (recency + proximity, upvotes as a light-weight boost) — the core landing experience

### Add After Validation (v1.x)

Features to add once the core loop (submit → verify → dedup/thread → browse → engage) is proven to work and attract real usage.

- [ ] Richer feed ranking (weighted scoring combining recency, proximity, upvotes, and duplicate-thread size) — trigger: once there's enough submission volume that simple recency sort starts feeling stale or unfair to older-but-more-severe issues
- [ ] Basic user-facing moderation tools (report a complaint/comment, self-hide) — trigger: first real instances of abusive comments or bad-faith complaints surfacing post-launch
- [ ] Category-level analytics/heatmap view (e.g., "most-reported area this month") — trigger: once there's enough data density in at least one city/region to make aggregation meaningful
- [ ] Push/email notifications for upvoted-by-me or commented-on complaints — trigger: once retention data shows users aren't returning to check on complaints they engaged with

### Future Consideration (v2+)

Features to defer until product-market fit is established — deliberately excluded from early roadmapping to avoid diluting the core visibility/reporting loop.

- [ ] Opt-in official/authority integration (Open311-style routing to municipal systems) — defer until v1's pure-visibility model has proven demand; this is a substantial scope, trust, and partnership expansion
- [ ] Expanded category taxonomy beyond the initial 5 — defer until the fixed-taxonomy AI verification and dedup logic is proven reliable at the current scope
- [ ] Native mobile apps — defer until the mobile-responsive web version has validated the core concept and camera-capture UX
- [ ] Broader social features (profiles, follows, groups, DMs) — defer indefinitely unless clear evidence emerges that community-building (not just reporting/visibility) is what users actually want

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Live-capture-only photo submission | HIGH | LOW-MEDIUM | P1 |
| Auto GPS geo-tagging | HIGH | LOW | P1 |
| Reverse geocoding (lowest level) | HIGH | MEDIUM | P1 |
| Fixed category selection | HIGH | LOW | P1 |
| Duplicate detection + threading | HIGH | HIGH | P1 |
| AI verification engine | HIGH | HIGH | P1 |
| Account (Google OAuth / phone OTP) | HIGH | LOW-MEDIUM | P1 |
| Anonymous browsing | HIGH | LOW | P1 |
| Ranked nearby feed | HIGH | MEDIUM | P1 |
| ID-searchable complaints | MEDIUM | LOW | P1 |
| Upvote / "me too" | MEDIUM | LOW | P1 |
| Comments | MEDIUM | MEDIUM | P1 |
| Shareable permalink | MEDIUM | LOW | P1 |
| Weighted feed ranking (beyond simple recency/proximity) | MEDIUM | MEDIUM | P2 |
| User-facing moderation (report/hide) | MEDIUM | MEDIUM | P2 |
| Category-level analytics/heatmap | LOW-MEDIUM | MEDIUM | P3 |
| Notifications on engagement | MEDIUM | MEDIUM | P2 |
| Official authority integration (Open311-style) | HIGH (long-term) | HIGH | P3 |
| Native mobile apps | MEDIUM | HIGH | P3 |
| Expanded category taxonomy | LOW (short-term) | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | FixMyStreet (UK, mySociety) | Swachhata-MoHUA (India, Govt) | SeeClickFix (US, CivicPlus) | Our Approach |
|---------|------------------------------|-------------------------------|------------------------------|--------------|
| Photo capture | Photo upload allowed (not capture-restricted) | Photo capture or gallery upload allowed | Photo upload allowed | Live capture ONLY, gallery blocked — key differentiator |
| Location | Postcode entry or geolocation | Landmark text entry + location capture | Address entry or map click | Auto GPS + reverse geocode to lowest level, no manual entry required |
| Duplicate handling | Pro tier suggests duplicates by location+category; user can subscribe to existing report instead | Not surfaced publicly as a feature | Automated duplicate detection before submission | Automated detection AND Twitter-style visible threading (goes further than either) |
| Resolution workflow | Full authority routing/status via Open311 | Full authority assignment + resolution photo + reopen | Full status workflow: submitted → acknowledged → in-progress → resolved | Explicitly none in v1 — pure visibility, staleness signal only |
| Social engagement | None (utility tool, not a feed) | Upvote on relevant complaints only | Two-way citizen-staff comments, not peer-to-peer social | Full social layer: upvote, comment, share-permalink, ranked feed |
| Anonymous access | Reports and map are largely public/browsable without login (utility model) | Requires app + often phone number even to browse | Browsable via web/app, write requires account | Anonymous browse, account required only to write — explicit strategic bet |
| Abuse/fraud prevention | Manual moderation, Pro adds duplicate-suggestion only | Known weakness: gallery uploads enable reused/fake photos | Automated duplicate detection; moderation otherwise manual/staff-driven | AI verification engine (authenticity, location plausibility, category relevance, genuineness) + live-capture-only — most automated/robust approach researched |
| Search | No public complaint-ID search found | Complaint tracking is account/ticket-based, not public ID search | Ticket-based, staff/account-facing | Public, ID-searchable complaints without requiring login |

## Sources

- [FixMyStreet Pro – SocietyWorks](https://www.fixmystreet.com/pro/) — MEDIUM confidence, cross-checked across multiple mySociety/SocietyWorks pages
- [FixMyStreet Open311 API](https://www.fixmystreet.com/about/open311-api-info) — MEDIUM confidence
- [FixMyStreet.com FAQ](https://www.fixmystreet.com/faq) — MEDIUM confidence
- [SeeClickFix 311 CRM – CivicPlus](https://www.civicplus.com/seeclickfix-311-crm/) — MEDIUM confidence
- [SeeClickFix Automations Overview](https://www.civicplus.help/seeclickfix/docs/automations-overview) — MEDIUM confidence
- [Want to Report a Civic Issue in Your Area? Use the New Swachhata App! – The Better India](https://thebetterindia.com/96351/swachhtaa-app-ministry-of-urban-development/) — MEDIUM confidence
- [Swachhata-MoHUA – Google Play](https://play.google.com/store/apps/details?id=com.ichangemycity.swachhbharat&hl=en_IN) — MEDIUM confidence
- [Top 10 Features of the Swachhata App – The United Indian](https://www.theunitedindian.com/news/Swachhata-App) — MEDIUM confidence
- [Clean-up act! BMC acts on 44,500 complaints received through Swachhta app](https://www.pressreader.com/india/the-free-press-journal/20171229/281629600645761) — MEDIUM confidence
- [Smart Civic Issue Reporting System – ResearchGate](https://www.researchgate.net/publication/359118551_Smart_Civic_Issue_Reporting_System) — LOW confidence, single academic-adjacent source, not cross-verified
- [i-Witness: Civic Reporting – Google Play](https://play.google.com/store/apps/details?id=org.iwitness) — LOW confidence
- [Citizen Competitors & Alternatives – Product Hunt](https://www.producthunt.com/products/citizen/alternatives) — MEDIUM confidence
- [Nextdoor Competitors & Alternatives – Product Hunt](https://www.producthunt.com/products/nextdoor/alternatives) — MEDIUM confidence
- [7 Best Nextdoor Alternatives in 2026 – Closeby Blog](https://www.trycloseby.com/blog/nextdoor-alternatives) — MEDIUM confidence
- Domain knowledge (uncited, LOW-MEDIUM confidence, standard/well-known behavior): Reddit upvote-driven ranking, Instagram feed/comment patterns, Twitter reply-threading UX model — used as the "social feed" reference point per project brief, not independently re-verified via search this session

---
*Feature research for: Civic/municipal problem-reporting webapp (India)*
*Researched: 2026-07-22*
