# Pitfalls Research

**Domain:** Civic problem-reporting webapp (geo-tagged, photo-verified, social-feed) — India
**Researched:** 2026-07-22
**Confidence:** MEDIUM (web-sourced, cross-checked across multiple independent sources per topic; no India-specific civic-app postmortems were found publicly, so several findings are extrapolated from adjacent domains — marked LOW where applicable)

## Critical Pitfalls

### Pitfall 1: Relying on EXIF for "live capture" verification (it won't be there)

**What goes wrong:**
Team builds a "verify this photo was actually taken live, not uploaded from gallery" check that reads EXIF GPS/timestamp tags from the uploaded image — then discovers in testing that most or all photos captured through the mobile browser have no EXIF at all, or lose it the moment the app touches the image.

**Why it happens:**
Two independent facts compound: (1) browser `getUserMedia`/`<input capture>` camera captures frequently don't populate full EXIF (GPS especially requires an explicit permission grant and OS-level embedding that many mobile browsers skip), and (2) any client-side processing step (resize, compress, crop, watermark) that touches the image via `<canvas>` + `toBlob()`/`toDataURL()` **strips all metadata unconditionally** — this is a documented, long-standing Canvas API limitation, not a bug that will be fixed. So even if EXIF existed, the moment you re-encode the photo for upload (which you almost certainly will, for size), it's gone.

**How to avoid:**
Never treat EXIF as the verification mechanism. Instead:
- Capture geolocation via the JS `Geolocation` API at the moment of submission (not by parsing image metadata) and bind it server-side to the upload in the same request/transaction.
- Use a server-generated timestamp for "when," not any client-embedded one.
- If you want device/liveness signals, use the `MediaStream` from `getUserMedia` directly (proves a live camera stream was active) rather than depending on file metadata after the fact.
- If genuineness scoring wants EXIF as one input, treat its *absence* as neutral, not as a fraud signal — flagging every photo as "suspicious" because EXIF is missing will produce enormous false-positive rates.

**Warning signs:**
Verification logic references `exif.gps` or `exif.dateTaken` anywhere in the pipeline; QA finds >50% of real live-captured test photos have empty/partial EXIF.

**Phase to address:**
Photo capture + verification pipeline design phase (before building the "genuineness" AI check) — this is a foundational architecture decision, not a bug fix later.

---

### Pitfall 2: Trusting client-reported GPS coordinates without server-side skepticism

**What goes wrong:**
Location spoofing (Android mock-location apps/developer settings, browser DevTools sensor overrides, GPS-spoofing extensions) lets a bad actor submit a complaint "from" any coordinates they want, undermining the entire premise of geo-verified reporting — e.g., posting a fake complaint in a rival's neighborhood, or manufacturing a cluster of complaints to trigger media attention.

**Why it happens:**
The Geolocation API returns whatever the OS/browser reports, and neither iOS nor Android nor browsers give web apps a "this location is real" guarantee. Spoofing tools are trivial to install and widely documented; mock-location detection APIs exist on native Android but are **not exposed to web browsers at all**, so a pure web app has strictly fewer defenses than a native app would.

**How to avoid:**
- Layer defenses rather than relying on one: cross-check the reported GPS coordinate's plausibility against IP-geolocation (do they roughly agree — same city/state?), check the reported GPS accuracy value (`coords.accuracy`) and treat unusually "too perfect" or unusually poor accuracy as a soft signal.
- Rate-limit and pattern-detect at the account level (same account posting across implausibly distant locations in a short time window is a strong spoofing signal, cheaper to compute than any per-photo check).
- Do not promise or imply cryptographic location proof to users/media — communicate it as "best-effort verification," since a purely browser-based product cannot fully defeat a determined spoofer (native mock-location detection APIs aren't available to web apps).
- Accept some irreducible risk here as a v1 tradeoff (documented, not hidden) — this is a known limitation of "no native app" as a platform constraint already in PROJECT.md.

**Warning signs:**
No plausibility cross-check exists between GPS and IP-geo; no rate limiting keyed on "distance between consecutive submissions ÷ time elapsed."

**Phase to address:**
Verification engine phase (location plausibility check is already an explicit requirement in PROJECT.md — make sure it's designed as defense-in-depth, not single-signal).

---

### Pitfall 3: Fixed-radius duplicate detection breaks in dense Indian urban geography

**What goes wrong:**
A flat "200m + same category" rule either (a) merges genuinely distinct problems into one thread in dense areas — e.g., in a crowded Indian market street, 200m can span a dozen different potholes, garbage points, or streetlights, so real reports get silently absorbed into the wrong parent and lost — or (b) fails to merge true duplicates when GPS drift (very real in dense urban cores — see Pitfall 4) puts two reports of the same pothole 150m apart on paper.

**Why it happens:**
Fixed-radius geofencing is a known weak method: buffers on this scale commonly produce **30-40% false-positive match rates** in mixed-use/dense environments, because a static distance threshold can't adapt to local density. India's ecosystem is bimodal — dense urban wards where 200m is huge, and sparse rural/peri-urban stretches of road where 200m is nothing — a single global constant can't serve both well.

**How to avoid:**
- Do not hard-code one global radius. Consider adaptive clustering (e.g., DBSCAN-style density-based clustering rather than fixed-radius) so the "same issue" threshold tightens automatically in dense areas and loosens in sparse ones.
- Combine spatial proximity with **photo similarity** (perceptual hashing of the image, not just coordinates + category) as a second signal — two "pothole" reports 40m apart with visually similar/matching photos of the same actual pothole is a much stronger duplicate signal than distance alone.
- Log every auto-merge decision with a way for either reporter to dispute/split a wrongly-merged thread — treat dedup as probabilistic, not final, especially in v1.
- Tune per-category, not just per-distance: a "streetlight out" issue is a single point; a "road damage" issue can be linear and span 200m legitimately (don't merge two potholes 150m apart on the same stretch of genuinely bad road into a false single point if they're materially different damage).

**Warning signs:**
Support/feedback reports of "my complaint got merged into someone else's unrelated issue" or "I reported the same pothole twice and it made two separate posts."

**Phase to address:**
Duplicate-detection design phase — should be scoped as its own spike/prototype phase with real Indian urban test coordinates (e.g., a dense Mumbai/Bangalore ward) before locking the algorithm, not assumed correct from the PROJECT.md's "200m" starting point.

---

### Pitfall 4: Underestimating GPS drift/error in Indian dense urban environments

**What goes wrong:**
Reverse-geocoding and dedup logic assume GPS accuracy of ~5-10m (typical open-sky consumer GPS spec), but real-world accuracy in dense city cores is far worse, causing wrong-ward geocoding, missed duplicate matches, and user confusion when the app's displayed address doesn't match where they're standing.

**Why it happens:**
"Urban canyon" effects — tall, closely packed buildings blocking/reflecting satellite signals — routinely push GPS error to **10-50 meters**, even in good conditions, due to multipath reflection and reduced satellite visibility. This is a physical signal-propagation limitation common to any dense city, and many Indian metros (Mumbai, Delhi, Bangalore, Kolkata) have exactly this dense high-rise + narrow-street geometry in their busiest, most complaint-heavy areas.

**How to avoid:**
- Design reverse-geocoding to be tolerant of ±50m error at the "granular address" level — don't over-promise "exact building" precision in dense zones; ward/locality level is more honest and more achievable.
- Use `coords.accuracy` returned by the Geolocation API and surface/store it — treat a submission with poor reported accuracy (e.g., >50m) as needing coarser deduping radius or a "please confirm this is the right location" UI nudge rather than blind trust.
- Consider a brief "wait for GPS fix" UX pattern (get a few readings over 1-3 seconds and average/pick best-accuracy) rather than taking the very first `getCurrentPosition()` callback, which is often the least accurate.

**Warning signs:**
QA testing in a dense urban test area shows repeated captures of the same physical spot returning coordinates 30-80m apart.

**Phase to address:**
Location capture + reverse-geocoding phase; feed into Pitfall 3's dedup radius design (they are the same root cause from two angles).

---

### Pitfall 5: AI verification cost scaling unmanaged, killing the "keep it free/open" model

**What goes wrong:**
A per-submission vision-LLM call for photo-category match + genuineness judgment looks cheap in a demo (fractions of a cent) but at real scale (thousands of daily submissions across an all-India launch, plus retries/appeals) becomes an unbounded, unmonitored operating cost that can spike 10-100x depending on model/provider choice and image size — a serious risk for an MIT-licensed open-source project with no committed revenue.

**Why it happens:**
Vision-model image tokenization cost varies wildly by provider (the same JPEG can cost 87 tokens on one provider vs. 6,636 tokens on another depending on resolution-handling policy) — teams that pick a model based on a demo, without benchmarking image-token cost specifically, can be off by two orders of magnitude at scale. Real-time (synchronous) API calls are also priced far higher than batch/async tiers for the same model.

**How to avoid:**
- Benchmark actual per-image token cost (not just "$/1M tokens" headline pricing) across candidate providers before committing, using representative photo sizes/resolutions from real phone cameras.
- Downscale/compress images server-side to the minimum resolution the verification model actually needs *before* sending to the API — most vision models don't need full 12MP phone photos to judge "is this a pothole."
- Prefer budget/flash-tier vision models for the bulk pass, escalating to a stronger (more expensive) model only for borderline/appealed cases — a two-tier verification funnel, not one model for every submission.
- Where submission volume allows async processing (i.e., verification doesn't have to block publish latency-critically), use batch-priced APIs, which can be 5-10x cheaper than synchronous calls for the same model.
- Evaluate self-hosted open-vision models (per the AI/verification cost constraint in PROJECT.md) for the cheap first-pass filter, reserving hosted APIs for edge cases — this also aligns with the "open source, no forced paid keys" project constraint.
- Instrument cost-per-submission as a first-class metric from day one, not an afterthought discovered after a bill.

**Warning signs:**
No per-image cost benchmark exists before choosing a provider; verification calls send full-resolution unprocessed images; no cost-per-submission dashboard/alerting.

**Phase to address:**
Verification engine phase — cost modeling should be part of the initial design spike, not bolted on after a scale surprise. Flag this phase for deeper phase-specific research (model/provider comparison) at roadmap time.

---

### Pitfall 6: Cold-start empty-feed death spiral from launching all-India at once

**What goes wrong:**
Because v1 is scoped "country-wide at launch, not a single-city pilot" (per PROJECT.md), a new user in most towns/wards will open the feed and see nothing nearby — a classically fatal marketplace failure mode. Empty feeds cause immediate churn, and churned users don't return to see whether density improved later, so early growth in any one area never has a chance to compound.

**Why it happens:**
This is a textbook two-sided marketplace/social-feed liquidity problem: content-creation supply (people willing to report) must reach local critical mass before content-consumption demand (people who browse to see local issues) has anything to look at, and vice versa — social/feed products additionally need enough activity for upvotes/comments to feel alive, or the product reads as "dead." Every successful hyperlocal/marketplace precedent studied (Uber, Airbnb, DoorDash, OfferUp) deliberately constrained initial launch geography to build density city-by-city rather than spreading thin nationally — spreading supply too thin across too many locations is called out repeatedly as a common killer.

**How to avoid:**
- Even though the stated scope is "country-wide," design the *rollout/growth strategy* to seed density in a handful of anchor cities/wards first (e.g., via founder's own network, local WhatsApp/Twitter civic groups, or partnering with existing local citizen groups) rather than relying on organic country-wide discovery.
- Consider a "no complaints near you yet — be the first" empty-state that reframes the empty feed as an invitation rather than a dead product (copy/UX detail, cheap to do, meaningfully reduces bounce).
- Track density metrics per city/ward from day one (complaints/week per 10k population, or similar) so you can see and react to "dead zone" areas rather than discovering the problem anecdotally.
- Consider seeding initial content from public data sources (e.g., scraping/importing known unresolved issues from official MyGov/Swachhata channels the founder mentioned, with clear labeling) to avoid a truly blank feed in new areas — this also reinforces the "we surface what official channels hide" value prop.

**Warning signs:**
Analytics show new users in low-density areas bouncing within one session; a city has near-zero submissions weeks after any marketing push there.

**Phase to address:**
Should influence the *roadmap phase ordering itself* (consider an explicit "seed density in launch cities" phase or growth-loop phase early, even though scope says country-wide) — flag for the roadmap-level SUMMARY.md as a phase-ordering implication, not just an engineering pitfall.

---

### Pitfall 7: Publishing photos/locations creates privacy and legal exposure for bystanders, not just for the reported infrastructure

**What goes wrong:**
Photos captured "live" of a pothole/garbage pile/broken streetlight will incidentally and routinely capture people's faces, house numbers, shopfronts, and vehicle license plates in frame — publishing these at a precise geo-tagged location on a public, unauthenticated feed creates real privacy exposure the team didn't design a policy for, and can draw individual complaints/takedown demands even though the *primary* subject (infrastructure) is legitimate public-interest content.

**Why it happens:**
India's Supreme Court (Puttaswamy judgment) recognizes privacy as part of the Article 21 fundamental right; Section 66E of the IT Act specifically criminalizes capturing/publishing images of a person's private area without consent, and more generally, publishing someone's identifiable image without consent carries civil/reputational risk even for content taken in public. Because this app's core feature is "publish precise location + unmoderated live photo immediately," it structurally has *no* pre-publish human review step to catch this — unlike traditional civic-reporting workflows that route through a government office first.

**How to avoid:**
- Add automated face/license-plate blurring as a pre-publish processing step (this is a well-solved computer-vision problem with cheap open models — YOLO-family face/plate detectors) rather than relying on users to self-censor or moderators to catch it after the fact.
- Make this a *default*, not an opt-in setting — the burden should not be on the reporting user to remember to blur.
- Add a "report this photo" / "request blur or takedown" flow visible on every post so a bystander who is captured incidentally has a fast, low-friction path to get their face/plate/property blurred or removed — this also helps satisfy IT Rules due-diligence takedown obligations (see Pitfall 8).
- Write a clear, published privacy policy addressing "what if I'm incidentally in someone else's photo" — required due-diligence content under IT Rules regardless.
- Treat this as security/legal-relevant, not merely a UX nicety — cite it explicitly in any threat-model/secure-phase review.

**Warning signs:**
No face/plate detection exists anywhere in the pipeline before publish; no visible "report/request removal" affordance on a complaint post.

**Phase to address:**
Photo capture/verification pipeline phase (technical blurring) + a legal/compliance pass before public launch (policy + takedown flow) — flag as needing its own review, likely warrants a dedicated `gsd-secure-phase` pass before v1 goes live.

---

### Pitfall 8: Treating IT Rules 2021 intermediary safe-harbor compliance as optional or "do it later"

**What goes wrong:**
Team builds and launches the public feed without the due-diligence scaffolding (published rules/privacy policy, grievance officer contact, takedown process, actual-knowledge response process) required to claim Section 79 safe-harbor protection — meaning the platform (and potentially its operators personally, for an open-source/community project without a clear corporate shield) could be treated as directly liable for user-published defamatory or unlawful content rather than protected as a neutral intermediary.

**Why it happens:**
Safe harbor under India's IT Act Section 79 is **conditional**, not automatic — it requires observable due diligence (Rule 3 of the IT Rules 2021/2022/2026 amendments): publishing rules & privacy policy, having a grievance/removal process, and removing unlawful content within 36 hours of "actual knowledge" (e.g., a court order or a proper notice). A scrappy MVP launch easily skips all of this because none of it is a "feature" users asked for, and the legal requirement is easy to miss for a first-time founder building an open-source side project without a compliance background.

**How to avoid:**
- Before public launch (not "eventually"), publish: Terms of Service, Privacy Policy, and a clearly visible grievance/complaint-about-content contact mechanism — this is table-stakes due diligence, not a nice-to-have.
- Build a takedown/moderation workflow that can act within 36 hours of a valid complaint about a specific post (defamatory content, privacy violation, etc.) — doesn't need to be automated in v1, but must exist as an operational process with an owner.
- If/when user counts approach the "Significant Social Media Intermediary" threshold (5 million+ registered users in India), revisit — additional obligations (Indian-resident Chief Compliance Officer, 24x7 nodal contact, monthly compliance reports) kick in at that scale; not a v1 concern but worth flagging for future-you.
- Because posts are about *government infrastructure*, defamation risk is comparatively low when complaints describe conditions/problems rather than name-and-blame specific officials or private contractors (truth + public-interest defenses are strong for infrastructure criticism) — but the moderation workflow should still watch for posts that cross from "this road is bad" into personal accusations against named individuals, which lose that protection.

**Warning signs:**
No published privacy policy/ToS at launch; no visible way for a member of the public to report/flag a specific post for removal; no documented internal process for who handles a takedown request and how fast.

**Phase to address:**
Should be an explicit pre-launch compliance checklist item, likely its own lightweight phase or a checklist gate before the "public launch" milestone — not folded silently into the moderation/feature phases.

---

### Pitfall 9: Moderation and abuse tooling built as an afterthought, not from day one

**What goes wrong:**
Because the write path requires an account (Google OAuth/phone OTP) but the feed is public and unauthenticated to browse, the team may assume "auth = low abuse" and defer moderation tooling — then discovers abuse patterns are about *volume and coordination*, not just anonymous trolling: spam accounts submitting fake/duplicate complaints to inflate visibility, coordinated brigading of upvotes on a post to push a political/personal agenda, or targeted harassment via the comment feature, none of which auth alone prevents.

**Why it happens:**
Requiring login only raises the cost of abuse, it doesn't eliminate it — phone OTP and Google OAuth are both cheap to acquire in bulk (disposable SIMs, bulk Google accounts) relative to the payoff of manipulating a public civic feed. General research on automated content moderation confirms that rule-based/automated systems scale well for volume but struggle with nuanced, nation/community-specific abuse patterns, meaning a v1 that ships with *zero* human moderation review capability is fragile the moment growth happens. No public documented case studies of civic-app-specific abuse were found in this research pass (flag: LOW confidence on specifics, though the general pattern is well established across social platforms).

**How to avoid:**
- Build basic anti-abuse primitives early even if simple: per-account rate limits on submissions/upvotes/comments, shadow-rate-limiting of clearly bot-like patterns, and an admin/moderator queue (even a manual one) for flagged content — don't wait until abuse is observed to start building the tooling.
- Design upvote/"me too" logic to be resistant to simple sockpuppet inflation (e.g., account-age or activity-history weighting on votes, not just raw count) since upvote count directly drives feed ranking (per PROJECT.md's "ranked like a social feed" requirement) and is therefore the most gameable/high-value target for abuse.
- Add user-facing "report" affordances on every complaint and every comment from day one, feeding the moderation queue required for IT Rules due diligence anyway (see Pitfall 8) — this doubles as both an abuse-mitigation and legal-compliance feature.
- Since this is open source (MIT), consider that moderation tooling/policies will need to be maintainable by a community of contributors, not just the founder — document moderation policy publicly early so contributors know the rules of the road.

**Warning signs:**
No rate limiting configured on submission/upvote/comment endpoints; no report/flag button anywhere in the UI; no moderator role/queue exists even in skeleton form.

**Phase to address:**
Should be built alongside the core social features (upvote/comment/feed ranking), not deferred to a "trust & safety" phase after launch — flag for roadmap as a cross-cutting concern touching the account, feed, and moderation phases.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping automated face/plate blurring for v1 launch | Faster ship, less CV pipeline complexity | Privacy complaints, potential Section 66E exposure, reputational risk once photos with visible faces circulate | Only if launch is invite-only/very limited scale with manual review of every photo before publish — never acceptable at open public-feed scale |
| Single hard-coded 200m dedup radius (as literally stated in initial requirements) | Simple to implement and reason about first pass | High false-merge/false-miss rate in dense vs. sparse areas (Pitfall 3) | Acceptable for a single-city pilot with manual radius tuning; not acceptable for "country-wide launch" without at least per-density-tier tuning |
| Using the first/cheapest available vision-LLM without cost benchmarking | Fast to integrate, works in demo | Runaway per-submission cost at scale (Pitfall 5), possibly 10-100x more than a benchmarked alternative | Only acceptable pre-launch/pre-scale; must be revisited before any real user-acquisition push |
| No moderation queue/report button at MVP | Less to build before shipping core feature | Abuse and IT-Rules-compliance debt compounds quickly once feed is public (Pitfalls 8, 9) | Never acceptable once the feed is publicly browsable, even pre-scale — this is a legal minimum, not a scaling nicety |
| Deferring privacy policy / ToS publication until "we have more users" | Saves a bit of legal-writing effort pre-launch | Loses IT Rules Section 79 safe-harbor argument from day one of public launch | Never acceptable — must exist before any public user-generated content goes live |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Browser Geolocation API | Trusting the first `getCurrentPosition()` callback as final/accurate | Take a short window of readings, prefer the one with best `coords.accuracy`, and store the accuracy value alongside the coordinate for downstream dedup/geocoding logic |
| Vision-LLM verification API | Sending full-resolution phone photos (often 8-12MP) to the API by default | Downscale/compress server-side to the minimum resolution the model needs before the API call, cutting per-call token cost significantly |
| Reverse geocoding provider | Assuming any provider returns Indian ward/locality-level granularity out of the box | Verify granularity specifically for Indian administrative levels (locality/ward/pincode) during provider evaluation — many global geocoders default to city/district level only for India |
| Google/Phone-OTP auth | Treating "verified account" as "trusted account" for abuse purposes | Layer rate-limiting and pattern detection on top of auth; don't treat account creation as the only abuse gate |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous per-submission vision-LLM call in the publish critical path | Publish latency grows and cost scales linearly/unpredictably with submission volume | Two-tier verification funnel (cheap fast pass, escalate only borderline cases); consider async/batch processing where publish doesn't need to block on final verification | Becomes visible in the hundreds-to-thousands of daily submissions range, well within a "country-wide launch" trajectory |
| Fixed-radius spatial query without a spatial index | Dedup/duplicate lookups slow down as complaint density grows in any one area | Use a proper geospatial index (e.g., PostGIS GIST index or equivalent) from the start rather than naive lat/lng range scans | Becomes noticeable once any single ward/locality accumulates thousands of complaints |
| Feed ranking computed live/unindexed at request time | Feed load time degrades as total complaint volume grows nationally | Precompute/cache ranked feed per locality with incremental updates, rather than recomputing ranking across the whole dataset per request | Breaks down once national complaint volume reaches the tens-of-thousands+ range |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No face/license-plate redaction pipeline | Section 66E exposure, privacy complaints, reputational damage from a viral "app published my face/plate" incident | Automated blur pipeline before publish (Pitfall 7), plus fast user-facing takedown request flow |
| No server-side GPS plausibility check | Fake/spoofed-location complaints undermine trust in the entire "geo-verified" premise | Cross-check GPS against IP-geolocation and submission-pattern rate limits (Pitfall 2) |
| No published moderation/grievance process | Loses IT Rules Section 79 safe harbor, exposes platform to direct liability for user content | Publish policy + build takedown workflow before public launch (Pitfall 8) |
| Treating account creation (OAuth/OTP) as sufficient anti-abuse gate | Sockpuppet/bulk-account abuse of upvotes and submissions | Rate-limit and pattern-detect independent of auth status (Pitfall 9) |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blank/empty feed with no explanation in low-density areas | New users assume the app is dead/broken and churn immediately | Reframe empty state as an invitation ("be the first to report in your area") and/or seed initial content (Pitfall 6) |
| Silent auto-merge of a user's report into an unrelated existing thread | User feels their report "disappeared"; erodes trust in the core reporting feature | Show users what their report was merged into, with a visible "this isn't the same issue, split it out" action (Pitfall 3) |
| Over-promising location precision ("exact address") in dense urban zones | Users lose trust when the displayed address doesn't match reality due to GPS drift | Set honest precision expectations (ward/locality-level) especially in dense metro cores (Pitfall 4) |
| No feedback loop after submission (does anything happen to my complaint?) | Repeats the exact "citizen complains -> silence -> distrust" failure pattern the founder is trying to fix relative to official channels | Even without an official-resolution workflow (out of scope for v1), give visible in-app engagement signals (view count, upvotes, comments, "still an issue" re-confirmations) so the complaint feels alive, not published-and-forgotten |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Live-capture verification:** Often relies on EXIF that browsers don't reliably produce — verify the pipeline actually uses Geolocation API + server timestamp, not image metadata parsing (Pitfall 1)
- [ ] **Duplicate detection:** Often tested only with a handful of synthetic coordinates — verify it's been tested against real dense-urban-India test data with realistic GPS drift, not idealized coordinates (Pitfalls 3, 4)
- [ ] **AI verification cost:** Often benchmarked only in a demo with a handful of test images — verify actual per-image token cost has been measured with real phone-camera resolution images before committing to a provider (Pitfall 5)
- [ ] **Privacy/moderation compliance:** Often deferred as "not core feature work" — verify a published privacy policy, grievance contact, and takedown process exist *before* the public feed goes live, not after (Pitfalls 7, 8)
- [ ] **Anti-abuse on social features:** Often assumed covered by "requires login" — verify rate limiting and vote-manipulation resistance exist independent of auth status (Pitfall 9)
- [ ] **Face/plate redaction:** Often assumed "we'll add it later if it's a problem" — verify an automated blur step (or at minimum a mandatory pre-publish manual review) exists before any public photo goes live (Pitfall 7)

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| EXIF-based verification shipped, discovered broken (Pitfall 1) | LOW | Swap verification signal source to Geolocation-API-at-submit-time; no data migration needed since this is a submit-time capture change, not a stored-data change |
| Fixed 200m dedup radius causing bad merges/misses in production (Pitfall 3) | MEDIUM | Introduce adaptive/density-based radius or photo-similarity signal; requires a backfill/re-cluster job to fix already-merged threads, plus a user-facing "split this thread" tool to unwind bad merges |
| AI verification costs spike unexpectedly (Pitfall 5) | LOW-MEDIUM | Immediately downscale images pre-API-call and add a cheap first-pass filter; can usually be deployed same-day as a config/pipeline change without downtime |
| Public launch without privacy policy/moderation process (Pitfall 8) | MEDIUM-HIGH | Publish policy and stand up takedown process retroactively; risk is that any liability incurred *before* the policy existed isn't retroactively cured — treat as urgent, not routine |
| No face/plate blur, incident occurs (Pitfall 7) | HIGH | Emergency retroactive blur pass across all published photos (compute cost + engineering time), plus direct outreach/apology to affected individuals if identified; reputational damage may not be fully recoverable |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| EXIF unreliable for live-capture verification (1) | Photo capture & verification pipeline phase | Confirm verification logic never reads EXIF; confirm Geolocation API reading is bound server-side at submit time |
| GPS spoofing (2) | Verification engine phase (location plausibility) | Confirm IP-geo cross-check and submission-pattern rate limiting exist, not just raw coordinate storage |
| Fixed-radius dedup false pos/neg in dense India (3) | Duplicate-detection design/spike phase | Test dedup logic against real dense-urban-India coordinate sets before locking radius/algorithm |
| GPS drift in urban canyons (4) | Location capture & reverse-geocoding phase | Confirm `coords.accuracy` is captured/used, and reverse-geocoding precision claims match realistic GPS error bounds |
| AI verification cost blowout (5) | Verification engine phase | Confirm a per-image cost benchmark exists across candidate providers before final provider selection; flag for deeper phase-specific research |
| Cold-start empty feed (6) | Growth/rollout strategy — should surface as a phase-ordering decision in the roadmap, not just an engineering task | Confirm a launch-city/seeding strategy exists, not a "we'll go country-wide and see" default |
| Privacy exposure from unredacted photos (7) | Photo pipeline phase + pre-launch compliance pass | Confirm automated blur exists and a user-facing report/takedown flow is live before public launch |
| IT Rules 2021 safe-harbor compliance (8) | Pre-launch compliance checklist/phase | Confirm privacy policy, ToS, grievance contact, and takedown workflow are published and operational before the public feed goes live |
| Moderation/abuse tooling as afterthought (9) | Core social features phase (feed/upvote/comment), not a separate later phase | Confirm rate limiting, report buttons, and a moderation queue exist alongside the first version of upvote/comment, not after |

## Sources

- [Approov: Stop Geo-Spoofing with Secure API Integration for Mobile Application](https://approov.io/blog/stop-geo-spoofing-with-secure-api-integration-for-mobile-application)
- [DeepID SDK: GPS Spoofing Detection: Protect Location-Based Apps](https://deepidsdk.com/blog/gps-spoofing-detection)
- [WHATWG mailing list: Add EXIF metadata support in Canvas.toBlob?](https://lists.whatwg.org/pipermail/whatwg-whatwg.org/2013-June/082008.html)
- [ExifExodus (GitHub, Dan Motzenbecker)](https://github.com/dmotz/ExifExodus)
- [arXiv: Data Leakage Detection and De-duplication in Large Scale Geospatial Image Datasets](https://arxiv.org/pdf/2304.02296)
- [GSDSI: A Geospatial & Location Data Quality Framework](https://www.gsdsi.com/resources/geospatial-data-quality-framework)
- [Roboflow: What does it cost to process an image with a vision model?](https://blog.roboflow.com/image-token-cost-vlm/)
- [TLDL: LLM API Pricing (July 2026)](https://www.tldl.io/resources/llm-api-pricing)
- [RaftLabs: Why Two-Sided Marketplaces Fail After Launch](https://www.raftlabs.com/blog/two-sided-marketplace-failure-rate)
- [Xoibit: Bootstrapping New Markets: Solving the Cold-Start Liquidity Problem](https://www.xoibit.com/blog/bootstrapping-new-markets-solving-the-coldstart-liquidity-problem)
- [The Marketplace Guide: The Marketplace Survival Map](https://themarketplaceguide.com/articles/the-marketplace-survival-map-solving-the-nine-structural-problems-that-kill-most-platforms-before-they-scale/)
- [RestTheCase: Right to Privacy in India: Legal Framework](https://restthecase.com/knowledge-bank/right-to-privacy-in-india)
- [RestTheCase: Photo Use Laws in India: Copyright, Privacy & Penalties](https://restthecase.com/knowledge-bank/what-happens-if-you-use-someone-s-photo-without-permission)
- [PRS India: Explained — Draft amendments to the IT Rules 2021](https://prsindia.org/theprsblog/explained-draft-amendments-to-the-it-rules-2021)
- [PRS India: The Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021](https://prsindia.org/billtrack/the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021)
- [TaxGuru: Intermediary Liability Guidelines and Due Diligence in India](https://taxguru.in/corporate-law/intermediary-liability-guidelines-due-diligence-india.html)
- [Mondaq: AI Generated Content, Safe Harbour And Due Diligence — 2026 IT Rules](https://www.mondaq.com/india/new-technology/1760556/ai-generated-content-safe-harbour-and-due-diligence-how-the-2026-it-rules-recast-intermediary-obligations-in-india)
- [iPleaders: Defamation law in India](https://blog.ipleaders.in/defamation-law-in-india/)
- [Mondaq: Defamation Laws And Social Media Platforms: The Legal Implications](https://www.mondaq.com/india/libel-defamation/1598646/defamation-laws-and-social-media-platforms-the-legal-implications)
- [MapScaping: How Accurate Is GPS](https://mapscaping.com/how-accurate-is-gps/)
- [DXOMark: GPS on smartphones — Testing the accuracy of location positioning](https://www.dxomark.com/gps-on-your-smartphone-why-youre-not-always-there-when-it-says-youre-there/)
- [The Better India: Digital Andhra — PuraSeva app](https://thebetterindia.com/149828/digital-andhra-puru-seva-app/)
- [Newsband: KDMC 24x7 civic complaint app](https://www.newsband.in/article_detail/report-civic-problems-theres-an-app-for-that-says-kdmc)
- [arXiv: From Inquisitorial to Adversarial — Using Legal Theory to Redesign Online Reporting Systems](https://arxiv.org/pdf/2506.07041)

**Note on gaps:** No public postmortems specific to FixMyStreet or SeeClickFix failures were found (searches returned only general platform-feature descriptions). No documented case studies of civic-app-specific brigading/vote-gaming abuse were found — Pitfall 9's general pattern is extrapolated from broader social-platform moderation research (LOW confidence on India-civic-app-specific manifestation, MEDIUM confidence on the general pattern applying).

---
*Pitfalls research for: Civic problem-reporting webapp (India)*
*Researched: 2026-07-22*
