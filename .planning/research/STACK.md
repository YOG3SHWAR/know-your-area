# Technology Stack

**Project:** Know Your Area — civic/municipal problem-reporting webapp (India)
**Researched:** 2026-07-22
**Confidence:** MEDIUM-HIGH (architecture patterns HIGH; specific pricing/vendor numbers MEDIUM — verify against live pricing pages before committing budget, prices change often)

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js (App Router) | 15.x + React 19 | Full-stack framework — SSR public feed, API routes, single deployable | One codebase for the public SSR feed (good for SEO/shareable permalinks) and authenticated write actions (submit, upvote, comment). Free-tier-friendly on Vercel. Dominant choice for this app shape in 2025-2026. Confidence: HIGH |
| TypeScript | 5.x | Type safety across API routes, DB schema, client | Non-negotiable for a project other OSS contributors will touch — catches shape mismatches between DB, API, and UI. Confidence: HIGH |
| PostgreSQL + PostGIS extension | Postgres 15/16, PostGIS 3.4+ | Primary datastore + spatial "within 200m + same category" duplicate detection | PostGIS is the open-source standard for geospatial queries (`ST_DWithin`, GiST index) — mature, free, and directly answers the duplicate-detection requirement without inventing custom geohash logic. Confidence: HIGH |
| Drizzle ORM | 0.36+ | Type-safe DB access layer, including geometry columns | **Prisma explicitly does not support PostGIS geometry/geography types** — it can only treat spatial columns as `Unsupported`, meaning no type-safe queries or migrations for the location column, the one column this app depends on most. Drizzle has native (if still-evolving) support for `geometry(Point)` columns and works fine with raw SQL for `ST_DWithin` when needed. Confidence: HIGH |

### Database / Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase (managed Postgres) | Free tier to start | Hosted Postgres with PostGIS pre-installable, plus built-in Google OAuth | Supabase's free tier ships Postgres with the PostGIS extension toggleable from the dashboard, plus native Google OAuth — covers DB + half of auth in one free service. Known limit: free projects **pause after 7 days of inactivity** and cap at 500MB DB / 1GB storage — fine for MVP, plan to upgrade (~$25/mo Pro) once real traffic starts. Confidence: HIGH (well documented, but check current limits before committing — they shift) |
| Cloudflare R2 | — | Object storage for complaint photos | Photos are the core artifact of this product and will be viewed repeatedly on a public feed — egress (bandwidth to serve images) is the real cost driver, and **R2 has zero egress fees** plus 10GB free storage, vs. Supabase Storage's tighter 1GB free / paid egress. Use R2 for photos from day one; keep Supabase Storage only if you want everything in one vendor for simplicity at very low traffic. Confidence: MEDIUM (pricing pages checked, but egress-at-scale numbers are illustrative not exact) |
| Upstash Redis | Free tier | Rate limiting for submissions (spam control) | Serverless, HTTP-based, works natively at the edge with Next.js/Vercel, free tier is generous for a rate-limiter workload (each check = 1 command). Pairs with `@upstash/ratelimit` for sliding-window limits on "submit complaint" / "request OTP" endpoints. Confidence: HIGH |

### Auth

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Auth.js (NextAuth) v5 | 5.x (beta/RC channel, stable enough for App Router) | Unified session/auth layer for Google OAuth + custom phone OTP | Google OAuth is a first-class built-in provider. Phone/SMS OTP is **not** a built-in provider anywhere in the OSS auth ecosystem (Auth.js, Supabase Auth) — it must be hand-rolled via a `Credentials` provider: your endpoint calls an SMS API to send a code, verifies it server-side, then Auth.js issues the session. This is a standard, well-documented pattern (same shape as email magic-links), not a gap unique to this project. Confidence: MEDIUM (pattern verified, but v5 is still officially "beta" — pin the exact version and expect occasional churn) |
| MSG91 or 2Factor (India SMS OTP aggregator) | — | Sends the actual OTP SMS for phone auth | This is the single biggest cost lever in the whole stack. Indian aggregators price OTP SMS at roughly **₹0.15–0.25 (~$0.002–0.003) per SMS**, dropping further at volume — versus Firebase Phone Auth (~$0.01–0.07/verification for India, and requires the Blaze pay-as-you-go plan even to use the "free" allotment) or Twilio Verify (~$0.05–0.10/verification). For an India-only launch, a local aggregator is 10-30x cheaper than the global "batteries included" providers. Confidence: MEDIUM (pricing from vendor marketing pages, not independently verified — negotiate real invoiced rates before launch) |
| Cap or ALTCHA (open-source proof-of-work CAPTCHA) | — | Bot/spam gate on signup and complaint submission | Both are MIT/Apache-licensed, self-hostable, free, and require no API key from a third party — unlike reCAPTCHA (Google) or hCaptcha (partly paid, vendor-dependent). Directly satisfies the "no paid API keys for contributors" constraint while still deterring basic bots before an OTP SMS (which costs money) or an AI verification call (which costs money) is triggered. Confidence: MEDIUM |

### AI Verification (photo-category match + genuineness/spam judgment)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Gemini 2.5 Flash-Lite (Google AI Studio API) | current | Primary hosted vision LLM for the verification step | **This is the cost-critical recommendation.** Flash-Lite prices images at the *same token rate as text* — $0.10/M input, $0.40/M output tokens — with no per-image surcharge, working out to roughly **$0.00003–0.00005 per verification call**. At 10,000 complaints/month that's under $1/month in raw API cost; even 100,000/month stays under ~$5. It also has a usable free tier for development/testing. This beats every other hosted option found and comfortably beats self-hosting at any realistic early-stage volume. Confidence: MEDIUM (pricing is current as researched but Gemini's model lineup and free-tier quotas have changed multiple times through 2025-2026 — re-verify at implementation time) |
| GPT-4o-mini (OpenAI API) | current | Secondary/fallback vision LLM | Slightly pricier (~$0.00005–0.0002/image depending on resolution) but very strong instruction-following for structured JSON output — good as a fallback provider or for A/B-testing verification quality against Gemini. Keep the integration behind a thin provider-agnostic interface so swapping is a config change, not a rewrite. Confidence: MEDIUM |
| **Not recommended for MVP:** self-hosted open-source VLM (Qwen2.5-VL, LLaVA-NeXT) | — | — | A dedicated GPU capable of running these models costs roughly **$1,000+/month** (e.g., ~$1.50/hr A100 run 24/7) — this is a *fixed* cost regardless of volume, and would need well over 10-20 million verification calls/month against Gemini Flash-Lite pricing to break even. For a bootstrapped OSS project at realistic early volume (thousands to low hundreds-of-thousands of complaints/month), pay-per-call hosted APIs are dramatically cheaper. Revisit self-hosting only if volume grows into the millions/month *and* you already have GPU access (e.g., via a sponsor or existing infra) — even then, a shared/serverless GPU inference host (e.g., Modal, RunPod serverless) beats a dedicated instance. Confidence: MEDIUM |
| Pre-filters before the paid AI call | — | Reduce number of billed AI verification calls | Layer cheap, non-AI checks first so the paid vision-LLM call only fires on plausible submissions: (1) rate limiting (Upstash) + CAPTCHA (Cap/ALTCHA) on the submit endpoint, (2) perceptual-hash duplicate check (see below) to catch resubmitted/reused photos before invoking AI, (3) the PostGIS 200m+category spatial duplicate check (see below) which should run *before* AI verification so duplicates get threaded without ever hitting the AI step. Confidence: HIGH (sound engineering practice, not vendor-specific) |

### Geocoding / Maps

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Self-hosted Nominatim (Docker) | current | Primary reverse geocoding (coordinates → street/locality address) | Open-source, no per-request API cost, no vendor API key required from contributors — directly satisfies the MIT/open-source constraint. Caveat: Nominatim's accuracy is only as good as OpenStreetMap's community data for a given area, which is **uneven across India** (dense/accurate in major metros, sparse in smaller towns). The public `nominatim.openstreetmap.org` endpoint is rate-limited to ~1 req/sec and unsuitable for production — self-host your own instance (official Docker image) against a planet or India-region OSM extract. Confidence: MEDIUM (general Nominatim behavior is well documented; India-specific accuracy is inferred, not measured — flag this for phase-specific validation with real test addresses before launch) |
| India Pincode Boundary open dataset (data.gov.in / AIKosh "All India Pincode Boundary GeoJSON") | current | Reliable PIN-code-level fallback/enrichment | Government open-data GeoJSON polygons for India's 6-digit PIN code boundaries — free, no API key, do a local point-in-polygon join against submitted coordinates as a reliable fallback/cross-check when Nominatim's OSM-derived locality data is thin. This hybrid (Nominatim for street/locality name + local pincode-polygon join for guaranteed PIN code) gets you both granularity and reliability without paying a commercial geocoder. Confidence: MEDIUM (dataset existence confirmed; freshness/update cadence not verified — check dataset's last-updated date before relying on it) |
| **Fallback only, not default:** Mappls (MapmyIndia) | — | India-specialized commercial reverse geocoding | Best-in-class India address/ward-level accuracy from a commercial India-focused provider, but pricing is not public (sales-quote only) and it's a paid third-party API key dependency — against the project's open-source/low-friction-for-contributors goal. Keep as a documented escape hatch only if Nominatim+pincode-polygon accuracy proves insufficient in production for specific regions, not as the default. Confidence: LOW (no pricing data found; recommendation is architectural, not cost-verified) |
| **Not recommended as default:** Google Maps Geocoding API, Mapbox Geocoding | — | — | Google Geocoding: 10,000 free requests/month post-March-2025 pricing change, then $2-7/1000 requests, and requires a billing account/credit card attached even for the free tier — a friction point for an OSS project where contributors run their own dev environments. Mapbox: the free 100k/month tier is "temporary" geocoding only (results **cannot be cached/stored**, which conflicts directly with storing an address on a complaint record) — "permanent" (storable) geocoding has no free tier at all. Both are viable *paid fallback* options later, not defaults. Confidence: MEDIUM |

### Spatial Duplicate Detection ("same category within 200m")

| Approach | Why |
|----------|-----|
| PostGIS `geography` column + GiST index + `ST_DWithin(location, ST_MakePoint(lng,lat)::geography, 200) AND category = $1` | `ST_DWithin` automatically uses the spatial index when available and returns only truly-in-radius rows — no post-filtering needed, and distances in a `geography` column are natively in meters, matching the "200m" requirement exactly. This is the standard PostGIS idiom for proximity queries and is a single, well-indexed SQL query — no separate data pipeline. Combine with the `category` equality filter in the same WHERE clause; Postgres will use the spatial index and the category filter together efficiently at this app's scale. Confidence: HIGH |
| **Not recommended:** geohashing | Geohash cells have a well-known boundary problem — a point 20m away across a cell edge can be missed unless you also query the 8 neighboring cells, and geohash-based radius search introduces "space amplification" producing false positives that then need a second, more expensive filtering pass. PostGIS with a proper spatial index avoids both problems outright. Geohashing only makes sense if you're *not* using a spatial-capable database at all (e.g., raw DynamoDB/Redis) — since Postgres+PostGIS is already the DB of choice here, adding geohashing on top is pure unneeded complexity. Confidence: HIGH |

### Live Camera Capture ("no gallery uploads")

| Approach | Why |
|----------|-----|
| `getUserMedia()` in-page live camera UI (primary) | Gives full control over the capture experience: force a live camera preview (never a static picker), capture the frame to a `<canvas>`, and — critically — burn a visible/embedded geotag+timestamp overlay onto the image *at the moment of capture*, which the "no gallery uploads" requirement implies you want anyway (harder to fake a photo that already has your app's overlay baked in). Requires explicit `getUserMedia` permission and more implementation work than the alternative below, but gives the strongest guarantee. Confidence: HIGH (well-established Web API pattern) |
| `<input type="file" accept="image/*" capture="environment">` (fallback/simpler alternative) | On Android and iOS, the `capture` attribute makes the browser open the native camera app *directly*, without exposing the gallery/file picker at all — a much smaller implementation than `getUserMedia` and effective for blocking gallery selection on the two mobile platforms that matter. It's ignored on desktop (falls back to a normal file picker there), which is an acceptable gap for a "mobile-responsive" app that expects camera-based submission primarily from phones. Use this if `getUserMedia` proves too complex for v1, or as a fallback for browsers that reject camera permission prompts. Confidence: HIGH |
| Read GPS via `navigator.geolocation.getCurrentPosition()` at capture time — do NOT rely on image EXIF GPS | Photos produced via `getUserMedia`+canvas (and often via the `capture` attribute path too) frequently have **no EXIF GPS data at all** — canvas re-encoding strips metadata, and mobile camera apps' EXIF GPS tagging is inconsistent and trivially spoofable anyway. The architecturally correct approach is to read the device's live GPS coordinates directly from the browser's Geolocation API at the moment of submission and attach them as complaint metadata server-side, entirely independent of whatever (if anything) is embedded in the image file. This is both more reliable and closes an obvious spoofing vector. Confidence: HIGH |
| sharp (Node.js) | High-performance server-side image library (resize, compress to WebP/JPEG for feed thumbnails, strip any residual EXIF for privacy/consistency before storing in R2). Already a near-universal dependency for Node image pipelines. Confidence: HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp-phash` or `blockhash-core` (npm) | current | Perceptual-hash near-duplicate photo detection | Cheap, non-AI pre-filter to catch a reused/resubmitted photo (same pothole photographed twice, or a screenshot of a photo) before invoking the paid AI verification call or even the spatial duplicate check. JS-native equivalents of Python's popular `imagehash` library, so no cross-language service needed in a Node/Next.js stack. |
| `@upstash/ratelimit` + `@upstash/redis` | current | Rate limiting on submit/OTP-request endpoints | Wrap every endpoint that costs money downstream (SMS send, AI verification call) with a sliding-window limiter — this is the cheapest possible spam control and should be the first line of defense. |
| `zod` | 3.x | Runtime validation of API payloads (complaint submission shape, OTP requests) | Validate before touching DB/AI — cheap correctness gate that also documents the API contract. |
| `date-fns` or native `Intl` | — | India-locale date/time formatting in the feed | Lightweight, avoids `moment.js` (legacy/deprecated). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose (local Postgres+PostGIS, local Nominatim) | Local dev parity with production spatial stack | Run `postgis/postgis` and `mediagis/nominatim` official images locally so contributors don't need cloud accounts to develop against real spatial queries — important for an OSS project where contributors self-serve their dev environment. |
| Drizzle Kit | Schema migrations | Pairs with Drizzle ORM; generates SQL migrations including the PostGIS geometry column definitions. |

## Installation

```bash
# Core
npm install next@15 react@19 react-dom@19 typescript

# Database / ORM
npm install drizzle-orm postgres
npm install -D drizzle-kit

# Auth
npm install next-auth@beta   # Auth.js v5

# Rate limiting / spam control
npm install @upstash/redis @upstash/ratelimit

# Image processing / duplicate pre-filter
npm install sharp sharp-phash

# Validation
npm install zod

# Dev dependencies
npm install -D @types/node @types/react
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|--------------|-------------|--------------------------|
| Next.js (App Router) | Vite + React SPA + separate Express/Fastify API | If the public feed's SEO/social-share-preview value turns out to be low priority and you want a simpler client/server split — but you lose SSR for permalinked complaint pages, which matters for a "share a complaint via permalink" requirement. |
| Drizzle ORM | Prisma + raw SQL escape hatch for spatial columns | Only if the team strongly prefers Prisma's DX elsewhere in the app and is willing to hand-write raw SQL for every geometry-touching query (inserts, `ST_DWithin` queries) since Prisma cannot type these columns. |
| Gemini 2.5 Flash-Lite | GPT-4o-mini as primary | If structured-JSON-output reliability or specific moderation behavior favors OpenAI in your own testing — keep the provider interface swappable either way. |
| Self-hosted Nominatim + India pincode polygon join | Mappls (MapmyIndia) commercial API | If production testing shows OSM coverage is too sparse in your target regions and budget allows a paid India-specialized geocoder — treat as an escalation path, not a v1 default. |
| MSG91/2Factor for OTP SMS | Firebase Phone Auth or Twilio Verify | If you want a single "batteries included" vendor for both OTP delivery and session management and are willing to pay a 10-30x SMS cost premium for that convenience — reasonable only if OTP volume stays very low. |
| Cap / ALTCHA (open-source CAPTCHA) | Cloudflare Turnstile | If you're comfortable adding a Cloudflare account dependency in exchange for Turnstile's stronger bot-detection heuristics (still free, but not self-hosted/OSS in the same sense). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Firebase Phone Auth as the primary/only OTP mechanism | Requires the Blaze billing plan attached even for "free" SMS, and India per-verification cost (~$0.01-0.07) is roughly 10-30x an Indian SMS aggregator's rate — a real recurring cost at any meaningful complaint volume. | MSG91 / 2Factor (or similar Indian aggregator) called directly, verified server-side, session issued via Auth.js Credentials provider. |
| Mapbox "temporary" Geocoding tier for this use case | Free tier results legally cannot be cached/stored in your database — but this app needs to persist the resolved address on every complaint record, which requires the paid "permanent" tier (no free allotment). | Self-hosted Nominatim (results are yours to store, no restriction) + India pincode-polygon fallback. |
| Prisma for the primary ORM given PostGIS columns are core to the schema | Prisma has no native geometry/geography type support — spatial columns become `Unsupported`, losing type safety and requiring raw SQL for every location-touching query, on the single column this app relies on most. | Drizzle ORM. |
| Geohashing for the 200m duplicate-detection radius query | Known boundary/edge-cell miss problem plus false-positive "space amplification" requiring a second filtering pass — solves a problem PostGIS's spatial index already solves natively. | PostGIS `ST_DWithin` + GiST index on a `geography` column. |
| Self-hosted open-source VLM (Qwen2.5-VL/LLaVA) for the MVP AI verification step | Fixed GPU cost (~$1,000+/month for a dedicated instance) vastly exceeds pay-per-call hosted API cost at any realistic early-to-mid volume; also lacks built-in moderation logic you'd have to build anyway. | Gemini 2.5 Flash-Lite (or GPT-4o-mini as fallback), pay-per-call. |
| Relying on image EXIF GPS data for location verification | Browser-based live capture (getUserMedia/canvas, and often the `capture`-attribute path) frequently produces images with no reliable EXIF GPS at all, and EXIF is trivially spoofable even when present. | `navigator.geolocation.getCurrentPosition()` read directly from the browser at submission time, stored as complaint metadata server-side. |
| Google reCAPTCHA / hCaptcha as the anti-spam gate | Introduces a mandatory paid/vendor-API-key dependency for every contributor running the app locally — conflicts with the project's "no contributor should need a paid API key" constraint. | Cap or ALTCHA (open-source, self-hostable, free, no third-party key). |

## Stack Patterns by Variant

**If early traffic stays low (MVP / first few months):**
- Use Supabase free tier (Postgres+PostGIS+Google OAuth) + Vercel free tier (hosting) + Cloudflare R2 free tier (photos) + Gemini free-tier quota for AI verification testing.
- Because this combination has $0 fixed infrastructure cost and only variable cost is OTP SMS (fractions of a cent each via a local aggregator) and any AI calls beyond the free quota (still sub-$5/month at MVP volumes).

**If traffic grows past free tiers (thousands of daily active users, tens of thousands of complaints/month):**
- Upgrade Supabase to Pro (~$25/mo) or migrate to a self-managed Postgres+PostGIS on a small VPS (DigitalOcean/Hetzner) for cost control at scale; keep R2 as-is (its pricing scales gently due to zero egress).
- Because Supabase's free-project auto-pause and 500MB cap become real constraints at this stage, while R2's cost curve stays flat.

**If Nominatim/OSM accuracy proves too weak in specific Indian regions during real-world testing:**
- Add Mappls as a paid, region-scoped fallback (only call it when the Nominatim+pincode-polygon result looks low-confidence, e.g., missing locality name) rather than replacing Nominatim wholesale.
- Because this keeps the open-source default path free while buying targeted accuracy only where actually needed, containing cost.

**If AI verification volume grows into the millions of calls/month:**
- Re-run the cost comparison between per-call hosted pricing and a dedicated/shared GPU self-hosted VLM (Qwen2.5-VL or similar) — the crossover point where self-hosting wins is realistically only reached at very high volume.
- Because at MVP-to-mid scale hosted budget-tier APIs remain cheaper; this is a "revisit later," not a v1 decision.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| Next.js 15 | React 19, Node 20 LTS | Next.js 15's App Router requires React 19 for latest features; pin Node to 20 LTS for hosting-provider compatibility (Vercel, Render both support it). |
| Drizzle ORM 0.36+ | PostgreSQL 15/16 + PostGIS 3.4+ | Geometry column support in Drizzle is still evolving — check the Drizzle changelog for the exact version that stabilized `geometry(Point)` support before pinning, and be prepared to drop to raw SQL via `sql\`...\`` for `ST_DWithin` queries regardless of ORM version. |
| next-auth (Auth.js) v5 | Next.js 15 App Router | v5 is the version built for the App Router; v4 targets the Pages Router and should not be used for a new App Router project. |
| Supabase Postgres | PostGIS extension | Enable explicitly via the Supabase dashboard's Extensions tab (not on by default) before writing any spatial migrations; schema-qualify geography columns to avoid tooling friction reported in Supabase's own issue tracker. |

## Sources

- Nominatim official docs (nominatim.org) — reverse geocoding behavior and known limitations. Confidence: MEDIUM
- Google Maps Platform pricing pages (via aggregated pricing breakdowns, March 2025 SKU change) — confirmed free tier (10k/mo) and Essentials per-1000 pricing. Confidence: MEDIUM
- Mapbox pricing page — confirmed temporary vs. permanent geocoding distinction and free tier terms. Confidence: MEDIUM
- Mappls/MapmyIndia developer docs — confirmed reverse geocoding product exists, pricing not public. Confidence: LOW (pricing)
- PostGIS official docs (postgis.net/documentation/tips/st-dwithin) — `ST_DWithin` index-usage guidance. Confidence: HIGH
- Alibaba Cloud Community engineering blog — geohash vs. PostGIS geometry+GiST tradeoffs. Confidence: MEDIUM
- Supabase official PostGIS guide (supabase.com/docs/guides/database/extensions/postgis) — extension support confirmed. Confidence: HIGH
- Google Gemini API pricing docs (ai.google.dev/gemini-api/docs/pricing) and aggregator pricing summaries — Flash-Lite token pricing and multimodal-no-surcharge claim. Confidence: MEDIUM (verify at implementation time; Gemini pricing/model lineup has changed multiple times in 2025-2026)
- OpenAI GPT-4o-mini pricing announcement and third-party pricing aggregators — per-image cost estimate. Confidence: MEDIUM
- Vendor blogs/engineering writeups on self-hosted VLM GPU cost (Qwen2.5-VL/LLaVA on A100) — cost comparison vs. hosted APIs. Confidence: MEDIUM (illustrative cost figures, not independently benchmarked)
- Firebase Authentication pricing docs and third-party breakdowns — India SMS verification cost. Confidence: MEDIUM
- Supabase Auth phone-login docs (supabase.com/docs/guides/auth/phone-login) — supported SMS provider list (Twilio, MessageBird, Vonage). Confidence: HIGH
- MSG91 India pricing page (msg91.com/in/pricing/otp) — India OTP SMS per-message rates. Confidence: MEDIUM (vendor-published, not independently invoiced)
- web.dev "Capturing an image from the user" + MDN/community writeups on `capture` attribute vs. `getUserMedia` — mobile camera-capture behavior. Confidence: HIGH
- Render, Railway, Fly.io, Vercel official docs/changelogs — free tier terms including Render's free-Postgres 30-day expiration policy. Confidence: HIGH
- Cloudflare R2 pricing page and third-party storage-cost comparisons — zero-egress model vs. S3/Supabase Storage. Confidence: MEDIUM
- Upstash official blog (upstash.com/blog/nextjs-ratelimiting) and `@upstash/ratelimit` GitHub — rate-limiting pattern for Next.js. Confidence: HIGH
- OpenAlternative.co directory and Cap/ALTCHA project sites — open-source CAPTCHA options. Confidence: MEDIUM
- Prisma GitHub issue #25768 and #2789 (PostGIS support requests) — confirms lack of native geometry/geography support. Confidence: HIGH
- Drizzle ORM official docs (orm.drizzle.team/docs/guides/postgis-geometry-point) and GitHub issues — confirms partial native geometry support. Confidence: MEDIUM
- sharp official docs/npm page (sharp.pixelplumbing.com) — image processing capabilities. Confidence: HIGH
- JohannesBuchner/imagehash GitHub (reference implementation informing the JS equivalents recommended) — perceptual hashing approach. Confidence: HIGH
- data.gov.in / AIKosh "All India Pincode Boundary GeoJSON" dataset listing — confirms open dataset exists for PIN-code polygon fallback. Confidence: MEDIUM (existence confirmed; freshness/licensing terms not independently verified)

---
*Stack research for: civic problem-reporting webapp (India), MIT-licensed, cost-minimized*
*Researched: 2026-07-22*
