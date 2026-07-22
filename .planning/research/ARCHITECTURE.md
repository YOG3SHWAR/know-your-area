# Architecture Research

**Domain:** Geo-tagged, photo-verified civic/municipal problem-reporting webapp (India)
**Researched:** 2026-07-22
**Confidence:** MEDIUM (component boundaries and pipeline ordering are well-established patterns cross-checked against multiple sources; India-specific geocoding/AI-cost specifics are deferred to STACK.md)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT (mobile web)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │ Camera+GPS   │ │  Feed / Map  │ │ Auth UI       │ │ Detail/     │  │
│  │ Capture      │ │  (nearby)    │ │ (OAuth/OTP)   │ │ Search-by-ID│  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘  │
└─────────┼────────────────┼────────────────┼────────────────┼─────────┘
          │                │                │                │
┌─────────┴────────────────┴────────────────┴────────────────┴─────────┐
│                     API / EDGE LAYER                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ API Gateway: token verification, rate-limit gate, request       │  │
│  │ validation (blocks non-camera image uploads at this boundary)   │  │
│  └────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────┤
│                     APPLICATION SERVICES                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐ ┌──────────────────┐ │
│  │ Auth Svc  │ │ Submission│ │ Feed/Ranking  │ │ Engagement Svc    │ │
│  │ (Google   │ │ Svc       │ │ Svc (nearby,  │ │ (upvote, comment, │ │
│  │ OAuth,    │ │ (accepts, │ │ search by ID) │ │ share permalink)  │ │
│  │ phone OTP)│ │ acks fast)│ │               │ │                   │ │
│  └───────────┘ └─────┬─────┘ └───────────────┘ └──────────────────┘ │
├───────────────────────┼────────────────────────────────────────────┤
│                     ASYNC PIPELINE (job queue, worker pool)          │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  ┌─────────────┐│
│  │ Reverse    │→ │ Spatial    │→ │ AI Verification│→ │ Publish /   ││
│  │ Geocode    │  │ Dedup      │  │ + Abuse Rate-  │  │ Reject /    ││
│  │ Worker     │  │ Worker     │  │ Limit Worker   │  │ Thread      ││
│  │ (address)  │  │ (ST_DWithin│  │ (photo-category│  │ Worker      ││
│  │            │  │  200m)     │  │  match+genuine)│  │             ││
│  └────────────┘  └────────────┘  └───────────────┘  └─────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│                     DATA LAYER                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ Postgres +   │ │ Object       │ │ Job Queue    │ │ Cache/Geo    │ │
│  │ PostGIS      │ │ Storage      │ │ (Redis-      │ │ Index (Redis │ │
│  │ (complaints, │ │ (photos)     │ │  backed)     │ │ GEO or       │ │
│  │ users, votes)│ │              │ │              │ │ PostGIS GiST)│ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴──────────────────────────────────────┐
│                     EXTERNAL INTEGRATIONS                            │
│  Google OAuth │ SMS/OTP provider │ Reverse geocoding API │ AI model  │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Client (camera+GPS capture) | Force live capture via `getUserMedia`/`capture` attribute, block gallery picking, read device GPS at the moment of capture, upload photo+coords+category | PWA-style responsive web app; `navigator.geolocation` + `<input capture>` or MediaStream API |
| API Gateway | AuthN/Z token check, request shape validation, first-line abuse rate-limit gate (before any expensive work happens) | Reverse proxy / edge middleware with a Redis-backed rate limiter (sliding window or token bucket) |
| Auth Service | Normalizes Google OAuth and phone OTP into one internal identity; issues session/JWT; anonymous sessions get read-only scope | OAuth 2.0 Authorization Code + PKCE for Google; SMS OTP provider for phone; single internal `user_id` regardless of method |
| Submission Service | Accepts a new complaint fast (store raw photo + GPS + category, mark `status=pending`, return ID to client immediately), enqueues async pipeline job | Thin write API; never blocks on geocode/dedup/AI |
| Reverse Geocode Worker | Converts raw lat/lng into locality/ward/pincode address levels for display | Async worker calling a geocoding API/service, geohash-bucketed cache for nearby-point reuse |
| Spatial Dedup Worker | Queries existing complaints of the same category within 200m of the new point; flags candidate duplicate or clears as novel | PostGIS `ST_DWithin(geography, point, 200)` against a GiST-indexed geometry/geography column |
| AI Verification + Abuse Worker | Confirms photo-category relevance and general "genuineness," runs at variable depth depending on dedup outcome (full check for new posts, lighter corroboration check for duplicates); also evaluates submission-velocity abuse signals | Hybrid moderation: cheap classifier/rules first, escalate ambiguous cases to a stronger (costlier) model only when needed |
| Publish/Reject/Thread Worker | Final state transition: publish as new top-level post, attach as a threaded duplicate reply on the existing post, or reject with a reason surfaced to the user | Single state-machine transition, updates search index / feed cache |
| Feed/Ranking Service | Serves "nearby" feed sorted by a blend of distance, recency, and engagement; supports search by unique complaint ID | Geo query (PostGIS GiST or Redis GEO) + engagement score blend; feed is read-only and works for anonymous users |
| Engagement Service | Upvote/"me too," comments, permalink generation | Separate write path, no interaction with the verification pipeline (an already-published post accepts engagement immediately) |

## Recommended Project Structure

```
src/
├── client/                    # mobile-responsive web frontend
│   ├── capture/                # camera + GPS capture components, capture-only enforcement
│   ├── feed/                   # nearby feed, map/list view, search-by-ID
│   ├── auth/                   # Google OAuth + phone OTP UI flows
│   └── detail/                 # complaint detail, thread view, comments, upvote, share
├── api/                        # API gateway / edge layer
│   ├── middleware/              # auth token verification, rate-limit gate, validation
│   └── routes/                  # submission, feed, engagement, auth endpoints
├── services/
│   ├── auth/                    # identity normalization (OAuth + OTP → internal user)
│   ├── submission/               # fast-ack write path, enqueues pipeline job
│   ├── feed/                      # ranking/query logic
│   └── engagement/                 # upvote/comment/permalink
├── pipeline/                     # async worker chain (one file/module per stage)
│   ├── geocode-worker.ts
│   ├── dedup-worker.ts
│   ├── verification-worker.ts
│   └── publish-worker.ts
├── data/
│   ├── db/                       # Postgres+PostGIS schema, migrations
│   ├── storage/                   # photo object storage client
│   └── queue/                      # job queue client/config
└── integrations/                  # thin adapters around external services
    ├── geocoding-provider.ts
    ├── ai-verification-provider.ts
    ├── oauth-provider.ts
    └── otp-provider.ts
```

### Structure Rationale

- **`pipeline/` is isolated from `services/`:** submission is a fast synchronous write; everything expensive (geocode, dedup, AI) happens off the request path in a worker chain. This boundary is what keeps the mobile upload experience fast regardless of how slow AI verification is.
- **`integrations/` wraps every external provider behind a narrow interface:** this project defers geocoding/AI provider choice to STACK.md research and is open source (MIT) — swapping providers later (e.g., self-hosted vision model vs. hosted API) should touch one adapter file, not the pipeline logic.
- **`auth/` normalizes identity before it reaches anything else:** downstream services (submission, dedup, verification, rate-limiting) should only ever see one `user_id` shape, never "is this a Google user or an OTP user."

## Architectural Patterns

### Pattern 1: Fast-ack, async-verify submission

**What:** Client uploads photo+GPS+category; server immediately persists the raw submission with `status=pending` and returns a complaint ID; all expensive verification work (geocode, dedup, AI check) happens in a background worker chain that later flips status to `published`, `rejected`, or `threaded`.
**When to use:** Any pipeline where verification cost/latency (AI inference, spatial queries) would otherwise block the user-facing request.
**Trade-offs:** Requires a "pending" UI state and a job queue; but avoids timeouts and wasted AI cost on submissions the user abandons mid-flow.

**Example:**
```typescript
// submission service — synchronous part
async function submitComplaint(input: SubmissionInput) {
  await rateLimiter.assertAllowed(input.userId); // cheap gate, first
  const complaint = await db.complaints.insert({
    ...input, status: "pending"
  });
  await queue.enqueue("verify-complaint", { complaintId: complaint.id });
  return complaint.id; // client gets an ID immediately
}
```

### Pattern 2: Cheap-before-expensive pipeline ordering

**What:** Order pipeline stages from cheapest/most-deterministic to most-expensive/AI-dependent: rate-limit gate → reverse geocode → spatial dedup query → AI verification. Dedup result changes the depth of AI verification (full genuineness pass for a new top-level post; a lighter photo-category corroboration pass for a submission that's already matched to an existing thread).
**When to use:** Whenever an AI/LLM call is the most expensive step in a pipeline and cost minimization is a stated constraint (as it is here).
**Trade-offs:** Slightly more pipeline branching logic, but directly reduces AI spend — the dedup check alone can shrink how much AI verification work is needed for "me too" reports of an already-known issue.

**Example:**
```typescript
async function verifyPipeline(complaintId: string) {
  const c = await db.complaints.get(complaintId);
  const address = await geocodingProvider.reverseGeocode(c.lat, c.lng);
  const dupCandidate = await db.complaints.findOne({
    category: c.category,
    // PostGIS: ST_DWithin(geog, point, 200) — uses spatial index
    where: sql`ST_DWithin(geog, ${point(c.lat, c.lng)}, 200)`,
  });
  const verification = await aiVerify(c.photoUrl, c.category, {
    mode: dupCandidate ? "corroboration" : "full",
  });
  if (!verification.passed) return reject(complaintId, verification.reason);
  return dupCandidate
    ? threadOnto(dupCandidate.id, complaintId)
    : publish(complaintId, address);
}
```

### Pattern 3: Identity normalization at the edge

**What:** Auth service issues one internal session/JWT regardless of whether the user came in through Google OAuth (Authorization Code + PKCE per Google's current guidance) or phone OTP. Anonymous requests get a read-only scope; write endpoints (submit, upvote, comment) require the normalized identity token.
**When to use:** Any app with multiple auth providers and a "browse free, write requires account" split.
**Trade-offs:** Small upfront cost to build the normalization layer, but every downstream service (rate limiting, abuse detection, submission attribution) stays provider-agnostic.

## Data Flow

### Submission Flow (camera capture → published feed item)

```
[Live camera capture + GPS read]
    ↓
[Client uploads: photo blob, lat/lng, category, auth token]
    ↓
[API Gateway: verify auth token, rate-limit gate]
    ↓
[Submission Service: store photo (object storage), insert row
 status=pending, return complaint ID to client — FAST, sub-second]
    ↓ (enqueue async job)
[Reverse Geocode Worker: lat/lng → locality/ward/pincode]
    ↓
[Spatial Dedup Worker: same category + ST_DWithin(200m) query
 against existing published complaints]
    ↓
[AI Verification Worker: photo-category match + genuineness
 (full pass if novel, lighter pass if duplicate candidate);
 also folds in abuse/rate-pattern signals]
    ↓
   ┌─────────────┬──────────────────┬───────────────┐
   ▼             ▼                  ▼
[Publish as   [Thread onto      [Reject —
 new post]     existing post]    surface reason
   │             │                to submitter]
   ▼             ▼
[Feed/Ranking Service indexes the published item —
 now visible in the nearby feed, searchable by ID,
 open for upvote/comment/share]
```

### Feed Read Flow

```
[Client requests nearby feed: current lat/lng, optional category filter]
    ↓
[Feed/Ranking Service: geo query (ST_DWithin / Redis GEOSEARCH) for
 published complaints near the point]
    ↓
[Blend distance + recency + engagement (upvotes/comments) into rank]
    ↓
[Return paginated feed — works with no auth token (anonymous browse)]
```

### Key Data Flows

1. **Write path (submit):** client → gateway (rate-limit + auth) → submission service (fast ack) → async pipeline (geocode → dedup → AI verify) → publish/reject/thread → feed index update. This is the pipeline the whole system is built around; every other flow is read-only or engagement-only against already-published data.
2. **Read path (feed/browse):** always anonymous-capable; never touches the submission pipeline; only reads `status=published` rows.
3. **Engagement path (upvote/comment):** requires auth (write action) but does **not** re-enter the verification pipeline — it only operates on already-published complaints.
4. **Search-by-ID path:** direct lookup by the complaint's unique ID, bypassing geo-ranking entirely; should work for both published and (to the original submitter only) pending/rejected states so a user can check their own submission's status.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users (India-wide launch, low volume) | Single Postgres+PostGIS instance handles both transactional and spatial queries; a simple Redis-backed job queue is enough for the async pipeline; no need for a dedicated search service — search-by-ID is a primary key lookup |
| 1k–100k users | Geo queries and dedup checks are the first thing to watch — confirm GiST index is in place and dedup query is bounded to a category + bounding-box pre-filter before `ST_DWithin`; move photo storage to object storage/CDN if not already; separate feed reads onto a read replica |
| 100k+ users | Consider a dedicated geo-index/cache (Redis GEO or a spatial cache layer) in front of Postgres for feed reads; AI verification worker pool needs horizontal scaling and priority queues (new-city launches should not starve steady-state traffic); dedup query may need geohash pre-bucketing to avoid full-table proximity scans |

### Scaling Priorities

1. **First bottleneck:** the spatial dedup query (`ST_DWithin` per submission) if it scans without a GiST index or without a `category =` pre-filter — fix by indexing and filtering by category before the spatial check.
2. **Second bottleneck:** AI verification worker throughput during viral/spiky adoption (e.g., a city goes viral on social media) — fix with a priority-queued worker pool and a cheap first-pass classifier that filters obvious pass/fail cases before invoking the costlier model.

## Anti-Patterns

### Anti-Pattern 1: Synchronous AI verification on the request path

**What people do:** Call the AI verification model inline during the submit request, making the client wait for a publish/reject decision before returning.
**Why it's wrong:** AI inference latency (and cost, if retried on client timeout/retry) is unpredictable; mobile users on Indian mobile networks will experience stalls or duplicate submissions from retry taps.
**Do this instead:** Fast-ack the submission with a `pending` status and ID, run verification asynchronously, and let the client poll or receive a push/refetch update.

### Anti-Pattern 2: Trusting photo EXIF GPS instead of live device GPS

**What people do:** Rely on EXIF metadata embedded in an uploaded photo for location, since it's "free" data already in the file.
**Why it's wrong:** EXIF GPS can be stripped, spoofed, or absent (many phones/apps strip EXIF on share); it also reopens the gallery-upload/fake-photo abuse vector the "live capture only" constraint exists to prevent.
**Do this instead:** Capture GPS coordinates directly from the browser Geolocation API at the moment of live capture and bind them server-side to that specific capture event, not to the image file's metadata.

### Anti-Pattern 3: Running dedup after publish instead of before

**What people do:** Publish every submission immediately and try to merge/deduplicate afterward (e.g., a periodic batch job or manual moderation pass).
**Why it's wrong:** The feed fills with visual duplicates in the interim, undermining the "clean feed, dupes threaded" product requirement, and retroactive merging is much harder once comments/upvotes have accumulated on the duplicate post.
**Do this instead:** Run the spatial dedup query as a required, blocking (but asynchronous, off the client's critical path) stage before the publish decision is made.

### Anti-Pattern 4: Coupling auth-provider specifics into business logic

**What people do:** Branch on "if Google OAuth user do X, if phone OTP user do Y" throughout submission, rate-limiting, and feed code.
**Why it's wrong:** Every new feature (rate limiting, abuse scoring, submission attribution) has to special-case two auth mechanisms forever, and it blocks adding new auth methods later.
**Do this instead:** Normalize both providers into one internal identity/session shape immediately after login; everything downstream only ever sees `user_id`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google OAuth | Authorization Code flow with PKCE, OpenID Connect for identity claims | Google's current guidance favors this over legacy implicit flow for web apps |
| Phone/SMS OTP provider | Send-OTP → verify-OTP request pair, short-lived code, rate-limited per number | Provider choice and India-specific SMS delivery deferred to STACK.md |
| Reverse geocoding API/service | Async call from geocode worker, geohash-bucketed cache to reuse results for nearby points | Must resolve to India's locality/ward/pincode granularity — provider selection deferred to STACK.md |
| AI verification model (photo-category + genuineness) | Async call from verification worker; hybrid pattern (cheap first-pass filter, escalate ambiguous cases) recommended to control cost | Provider/self-hosted-vs-hosted tradeoff deferred to STACK.md, but the architectural boundary (one `ai-verification-provider` adapter, swappable) should hold regardless of choice |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Submission Service ↔ Async Pipeline | Job queue (enqueue on write, workers consume) | Never a direct synchronous call — this is the boundary that keeps the client-facing submit fast |
| Async Pipeline ↔ Feed/Ranking Service | Feed service reads only `status=published` rows; pipeline writes status transitions | Feed never talks to geocode/dedup/AI directly |
| Auth Service ↔ everything else | Normalized identity token/session, verified once at the gateway | No other service should need to know which auth provider was used |
| Engagement Service ↔ Submission Pipeline | No direct coupling — engagement only operates on already-published complaints | Keeps upvote/comment simple and free of verification-pipeline concerns |

## Build Order (Vertical MVP Slices)

Given the project's preference for vertical, end-to-end slices over horizontal layers, the pipeline dependency structure suggests this order:

**Slice 0 — Thin end-to-end walking skeleton (highest technical risk first):**
Live camera capture + GPS read on mobile web → upload → store record with lat/lng + category, `status=published` immediately (no dedup, no AI verification, minimal/stub auth — e.g. a single dev-session identity) → nearby feed reads and renders it → complaint has a unique ID and is fetchable by that ID. This proves out the riskiest, least-standard parts of the whole system: forcing live-only capture in a mobile browser, reading GPS at capture time, and rendering a geo-sorted feed. Everything else in the architecture is comparatively well-trodden (auth, spatial queries, job queues).

**Slice 1 — Real auth, write-gating:**
Swap the stub identity for Google OAuth + phone OTP, normalized to one internal `user_id`; gate submit/upvote/comment behind it while feed browsing stays anonymous. Do this once the core loop is proven, not before — OAuth app registration/consent screens and an OTP/SMS provider are integration overhead you don't want blocking validation of the capture→feed loop.

**Slice 2 — Reverse geocoding into the pipeline:**
Move from "store raw lat/lng" to resolving locality/ward/pincode for display, asynchronously. Low risk, mostly an external API integration.

**Slice 3 — Spatial dedup:**
Introduce the async pipeline properly (status transitions to `pending`), add the `ST_DWithin`-based same-category-within-200m check, thread duplicates onto the original post instead of creating new top-level posts. This is the first slice where "submit" stops being instant-publish.

**Slice 4 — AI verification + abuse rate-limiting:**
Add the AI photo-category-match/genuineness gate and abuse rate-limiting as the final stage before publish, with the dedup outcome from Slice 3 determining verification depth (full vs. corroboration pass) to control AI cost. This slice depends on Slice 3 existing (verification mode branches on dedup result) and depends on Slice 1's real auth existing (rate-limiting needs a real, non-stub identity to be meaningful).

**Slice 5 — Engagement and ranking polish:**
Upvote/"me too," comments, share-by-permalink, and blending recency/engagement into feed ranking (beyond pure distance sort from Slice 0).

**Why this order:** dedup (Slice 3) is cheap and deterministic, so it should exist before AI verification (Slice 4) both to reduce AI cost (via verification-mode branching) and because it's lower risk to build first. Auth (Slice 1) is needed before abuse rate-limiting is meaningful (Slice 4) but is *not* needed to validate the core capture/feed technical risk (Slice 0) — a stub identity is sufficient for that first slice. Reverse geocoding (Slice 2) has no dependency on dedup/verification and could be reordered earlier or later without affecting the rest of the pipeline; it's placed early here mainly because address display is a product-visible feature users will notice missing.

## Sources

- [FixMyStreet.com — FAQ / SocietyWorks documentation](https://www.fixmystreet.com/faq) — LOW confidence (websearch synthesis, not directly verified against source docs) — reference architecture for civic reporting submission and duplicate-suggestion flow
- [PostGIS official docs — ST_DWithin tips](https://postgis.net/documentation/tips/st-dwithin/), [ST_DWithin reference](https://postgis.net/docs/ST_DWithin.html) — HIGH confidence (official project documentation, cross-checked) — canonical radius-query pattern for the 200m same-category dedup check
- [Content moderation pipeline architecture (Medium/dev.to, event-driven microservices, hybrid moderation)](https://medium.com/h7w/building-a-content-aware-image-moderation-pipeline-using-clarifai-and-kafka-in-a-spring-boot-2b8b840b0372) — LOW confidence (websearch synthesis) — async, event-driven pattern for photo verification pipelines
- [Geospatial system design patterns / location-based feed ranking](https://systemdr.substack.com/p/geospatial-system-design-patterns), [Redis-based location feed](https://oneuptime.com/blog/post/2026-03-31-redis-location-based-social-feed/view) — LOW confidence (websearch synthesis) — geo-indexing and proximity+engagement feed ranking pattern
- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server) — MEDIUM/HIGH confidence (official vendor documentation) — Authorization Code + PKCE recommendation for web apps
- [Async content-moderation pipeline / job queue architecture](https://dev.to/silentwatcher_95/content-moderation-in-nodejs-building-a-scalable-image-moderation-pipeline-with-minio-bullmq-f53) — LOW confidence (websearch synthesis) — fast-ack + async worker chain pattern, geohash-bucketed caching

**Note:** Provider selection for reverse geocoding and AI verification (hosted vs. self-hosted, cost tradeoffs) is intentionally left generic here and deferred to STACK.md — this document establishes the architectural boundary (a swappable adapter) rather than the specific technology choice.

---
*Architecture research for: Know Your Area — civic problem-reporting webapp (India)*
*Researched: 2026-07-22*
