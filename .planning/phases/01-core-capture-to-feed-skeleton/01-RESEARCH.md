# Phase 1: Core Capture-to-Feed Skeleton - Research

**Researched:** 2026-07-23
**Domain:** Browser camera/GPS capture, PostGIS proximity queries via Drizzle, opaque ID generation, direct-to-object-storage uploads, Next.js App Router SSR feed — all in a greenfield Next.js 15 project
**Confidence:** HIGH (implementation patterns are well-documented, cross-checked against official docs and multiple independent sources); MEDIUM on a few Drizzle/PostGIS edge behaviors (see Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Camera Capture Experience**
- **D-01:** Use full `getUserMedia()` live in-page camera preview + capture-to-`<canvas>`, not the simpler `<input capture="environment">` fallback. Proves the actual riskiest mechanic now rather than deferring it. — **Reversibility:** costly — switching later means rebuilding the capture UI and losing the overlay-burn pipeline (D-02) built around canvas access.
- **D-02:** Burn a visible geotag + timestamp overlay onto the captured photo at capture time (rendered onto the canvas before it becomes the final image), not just invisible metadata. Signals "captured live, right here, right now" the way FixMyStreet/SeeClickFix-style apps do.
- **D-03:** If camera or GPS permission is denied, hard-block submission with a clear explanation and guidance to re-enable access in browser settings. No submission is possible without both — consistent with the "no gallery, no EXIF" anti-abuse design. There is no degraded/fallback submission path.
- **D-04:** Wait briefly (~3-5s) for the browser to refine the GPS fix, then submit with whatever accuracy is available at that point — store `coords.accuracy` alongside the coordinate per the roadmap note, so downstream phases (geocoding, dedup) can judge fix quality. Do not block submission on hitting a specific accuracy threshold.

**Stub Identity Model**
- **D-05:** Represent the Phase 1 "dev identity" as a per-browser anonymous device ID, generated on first visit and stored in a cookie/localStorage. This maps cleanly onto a real `user_id` when Phase 2 replaces the stub with Google OAuth / phone OTP — no login screen needed in this phase. — **Reversibility:** reversible — Phase 2 swaps this for a real `user_id`; keep the schema field generic enough (e.g. `submitter_id`) that the swap doesn't require a data migration beyond backfilling real IDs.
- **D-06:** Do not show a fake username on feed cards or complaint pages. Use a generic label (e.g. "Reported by a nearby resident") or omit poster identity entirely, rather than inventing an anon handle that Phase 2 would need to retcon.

**Feed Behavior & Content**
- **D-07:** Loading the public feed requests the browser's live location (even for anonymous, non-logged-in visitors) to sort by proximity. If location is denied, still render a feed (e.g. most recent overall / default view) rather than blocking browsing entirely — preserves "browse without an account" as a hard requirement even without location.
- **D-08:** Each feed card shows: the photo (with its burned-in geotag overlay visible), a category icon/badge, raw distance ("2.3 km away" — no human-readable address until Phase 3), and relative timestamp ("5m ago").
- **D-09:** Use infinite scroll to load more complaints as the user scrolls, matching the Reddit/Instagram social-feed reference point.
- **D-10:** "Nearby" has no hard distance cutoff for this phase — sort all complaints by distance (recency/engagement blending comes later in Phase 5). Avoids empty feeds in low-density areas before anchor-city seeding (Phase 6). A real radius/city-scoping can be tuned later once real density data exists.

**Complaint ID & Permalink Format**
- **D-11:** Complaint IDs are short opaque alphanumeric codes (~6-8 characters, e.g. `KYA-7F3X2`) — not UUIDs and not sequential integers. Easy to read aloud, type into a search box, or write on a physical sign, while staying non-guessable/non-sequential. — **Reversibility:** one-way — the ID format is embedded in every published permalink from day one; changing format later breaks already-shared links unless a redirect/alias layer is added.
- **D-12:** Permalink URL structure is `/c/{id}` — short, Twitter-style path.
- **D-13:** Search-by-ID (FEED-03) is a visible search box on the feed/landing page where anyone can paste or type a complaint ID and jump straight to it — not URL-only access.

### Claude's Discretion
None — every gray area discussed reached an explicit user decision (no "you decide" selections were taken).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep suggestions came up during this discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| SUBM-01 | User can capture a live photo in-app (camera only — gallery/file-picker upload is blocked) | Pattern 1 (capture flow diagram), `getUserMedia`/canvas code example, Pitfall 3 (iOS orientation), Anti-Pattern (mirrored canvas draw) |
| SUBM-02 | User selects one of 5 fixed categories when submitting | V5 Input Validation (Security Domain) — server-side zod enum re-validation, never trust client-only enforcement |
| SUBM-03 | App auto-captures the user's GPS location at submission time (read live from the browser, not from image EXIF) | Pattern "GPS wait-for-fix hook" code example, Pitfall 4 (accuracy/wait window), Pitfall 5 (permission denial handling) |
| SUBM-06 | Each complaint receives a unique, opaque, searchable ID upon submission | Pattern 3 (opaque ID generation + collision math), Don't Hand-Roll (nanoid vs hand-rolled), Security Domain (IDOR mitigation via opaque publicId) |
| FEED-01 | Landing page shows a feed of complaints near the user's current location | Pattern 2 (Drizzle geometry + `::geography` distance query), Pitfall 2 (geometry vs geography cast), Architectural Responsibility Map (feed query tiering) |
| FEED-03 | User can search for a complaint by its ID | Architecture diagram step 13 (direct unique-ID lookup bypassing geo query), Architectural Responsibility Map |
| FEED-04 | Each complaint has a shareable permalink | Recommended Project Structure (`app/c/[id]/page.tsx`), Architectural Responsibility Map (SSR permalink page) |
</phase_requirements>

## Summary

Phase 1 is a thin, end-to-end vertical slice: live camera capture with a burned-in geotag overlay → GPS read with a wait-for-fix window → direct-to-R2 upload → complaint row with an opaque ID and PostGIS point → an anonymous, distance-sorted feed with infinite scroll → a shareable `/c/{id}` permalink and ID search box. Nothing here is architecturally novel by itself, but three mechanics are genuinely risky and deserve the most planning attention: (1) `getUserMedia()` + `<canvas>` capture has real mobile Safari orientation/rotation quirks that must be handled before the overlay is burned in, (2) Drizzle ORM's PostGIS support is for the `geometry` type, not `geography` — every `ST_DWithin`/distance query needs an explicit `::geography` cast via raw `sql` template, and (3) uploading a full-resolution phone photo through a Next.js Server Action or Route Handler will hit Vercel's hard 4.5MB payload ceiling, so photos must go client → R2 directly via a presigned URL, never proxied through the app server.

The stub identity (D-05), opaque ID (D-11), and infinite-scroll feed (D-09) are all standard, low-risk patterns — the research below is prescriptive rather than exploratory for those. The one area needing explicit planner attention is opaque-ID collision handling: the D-11 example format (`KYA-` + 5 chars) has a smaller collision-safe ceiling than it looks at first glance, so the schema needs a `UNIQUE` constraint plus a retry-on-conflict insert loop from day one, not "the ID space is big enough."

**Primary recommendation:** Build the capture flow as `getUserMedia` → `<canvas>` draw-with-overlay → `canvas.toBlob()` → client-side PUT to an R2 presigned URL → server action that inserts the complaint row (opaque ID via `nanoid` `customAlphabet`, `geometry(point, xy, srid:4326)` column, `coords.accuracy` stored) → SSR feed page that reads the visitor's `geometry` via `ST_Distance`/`<->` ordering, with an anonymous `device_id` cookie set on first visit for both submission attribution and future Phase 2 identity migration.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live camera preview + capture-to-canvas | Browser / Client | — | `getUserMedia`/`<canvas>` are browser-only APIs; no server involvement until the final blob is ready |
| Geotag + timestamp overlay burn-in | Browser / Client | — | Must happen before the image leaves the device (D-02); canvas draw operations are client-side only |
| GPS read with wait-for-fix window | Browser / Client | — | `navigator.geolocation` is a browser API; the "wait 3-5s, take best accuracy" logic runs entirely client-side |
| Photo upload to object storage | CDN / Static (R2) | API / Backend (presign only) | The backend's only job is minting a short-lived presigned PUT URL; the actual bytes flow client → R2 directly to avoid Vercel's 4.5MB body-size ceiling |
| Stub device identity (cookie) | Browser / Client | Frontend Server (SSR reads it) | Generated/stored client-side on first visit; the Next.js server only reads the cookie to attach `submitter_id` on writes — no auth service exists yet |
| Complaint creation (opaque ID, row insert) | API / Backend | Database | Server Action/Route Handler validates payload (zod), generates opaque ID, inserts the geometry point row |
| Category enum validation | API / Backend | Browser / Client (UI constraint) | Client UI limits choice to 5 categories, but the server must re-validate — never trust client-supplied enum values |
| Duplicate-free unique ID enforcement | Database | API / Backend (retry loop) | DB `UNIQUE` constraint is the actual enforcement; API layer catches the conflict and retries generation |
| Nearby feed query (distance sort) | Database (PostGIS) | API / Backend | `ST_Distance`/`<->` ordering is pushed into the SQL query, not computed in application code, so the GiST index is used |
| Feed page render (initial load) | Frontend Server (SSR) | — | SSR gives the permalink/feed pages their SEO and social-share-preview value (per CLAUDE.md's Next.js rationale) |
| Infinite scroll pagination (subsequent pages) | Browser / Client | API / Backend (paginated query) | Client-side `IntersectionObserver` triggers fetches of subsequent pages; server just serves cursor-paginated results |
| Complaint permalink page `/c/{id}` | Frontend Server (SSR) | — | Needs to be a real, crawlable, shareable URL — SSR by ID lookup (primary key/unique index, not a geo query) |
| Search-by-ID | API / Backend | Browser / Client (input box) | Simple unique-index lookup; client just redirects to `/c/{id}` on submit |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.5.21 (latest stable 15.x) | App Router, SSR feed/permalink pages, Server Actions/Route Handlers | Already locked in `.claude/CLAUDE.md`. Verified current 15.x is `15.5.21`; `16.x` (`16.2.11`) now exists on npm as the newer major — see State of the Art note. [VERIFIED: npm registry] |
| react / react-dom | 19.2.8 | Required by Next 15 App Router | [VERIFIED: npm registry] |
| typescript | 5.x | Type safety | [VERIFIED: npm registry] |
| drizzle-orm | 0.45.2 | Schema + query builder, including `geometry(point)` columns | [VERIFIED: npm registry] — jumped from the `0.36+` figure in CLAUDE.md; geometry-point support has stabilized further since. |
| drizzle-kit | 0.31.10 | Migration generation | [VERIFIED: npm registry] |
| postgres | 3.4.9 | Postgres driver Drizzle uses under the hood (`drizzle-orm/postgres-js`) | [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | 6.0.0 | Opaque complaint ID generation via `customAlphabet` | Every complaint insert (D-11); pure ESM, works fine in Next.js server code. [VERIFIED: npm registry] |
| @aws-sdk/client-s3 | 3.1092.0 | S3-compatible client pointed at R2 (`endpoint` override) | Presigned URL generation for direct photo upload | [VERIFIED: npm registry, manually confirmed — see Package Legitimacy Audit] |
| @aws-sdk/s3-request-presigner | 3.1092.0 | `getSignedUrl()` for the PUT presigned URL | Same upload flow | [VERIFIED: npm registry, manually confirmed] |
| zod | 4.4.3 | Runtime validation of the submission payload (category enum, lat/lng bounds, accuracy) | On every write endpoint — CLAUDE.md already specifies this | [VERIFIED: npm registry] — major-version jump from the `3.x` figure in CLAUDE.md; confirm v4 API (`z.object` syntax largely compatible, but re-check breaking changes before pinning). |
| sharp | 0.35.3 | Server-side image resize/re-encode before/after storage (thumbnail generation), strips residual metadata | If Phase 1 needs a feed thumbnail size distinct from the full capture — otherwise defer to a later phase if not required by success criteria | [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client → R2 direct presigned upload | Proxy upload through a Next.js Route Handler | Simpler code (one request), but hits Vercel's hard 4.5MB serverless body limit on typical 3-8MB phone photos — not viable on the free/Vercel-hosted tier CLAUDE.md targets. Do not use. |
| `nanoid` `customAlphabet` for opaque IDs | `crypto.randomUUID()` truncated, or a sequential ID with a Hashid-style obfuscation | UUID-derived truncation loses nanoid's collision-probability tooling and isn't designed for truncation; sequential+obfuscation reintroduces a "reversible to sequence" risk. `nanoid` `customAlphabet` is purpose-built for this exact use case. |
| `geometry(point, xy, srid:4326)` + `::geography` cast for `ST_DWithin`/distance | Store two separate `lat`, `lng` numeric columns and compute Haversine in application code | Loses GiST spatial indexing entirely — every "nearby" query becomes a full table scan computed in JS, which will not scale past a trivial complaint count. Rejected. |

**Installation:**
```bash
npm install next@15.5.21 react@19.2.8 react-dom@19.2.8 typescript
npm install drizzle-orm postgres
npm install -D drizzle-kit
npm install nanoid
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install zod
npm install sharp
```

**Version verification:** All versions above were checked live against the npm registry on 2026-07-23 via `npm view <pkg> version`. `next` was pinned to the latest **stable 15.x** release (`15.5.21`), not the newer `16.x` line, to honor the CLAUDE.md-locked "Next.js 15.x + React 19" stack decision — see State of the Art for the drift note.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| nanoid | npm | created 2017-08-06 (~9 yrs); latest version published 2026-07-12 | 223.9M/week | github.com/ai/nanoid | Automated check: [SUS] ("too-new" — false positive, see note) | **Approved** — manually verified via `npm view nanoid time.created` (2017) and npm downloads API (223.9M/wk). The automated heuristic flagged the *latest version's* publish date, not package age. |
| @aws-sdk/client-s3 | npm | created 2020-01-14 (~6 yrs) | 36.2M/week | github.com/aws/aws-sdk-js-v3 | Automated check: [SUS] ("unknown-age/downloads/no-repository" — tool lookup failure on scoped package) | **Approved** — manually verified via `npm view` and npm downloads API; official AWS SDK package, scoped-package lookup artifact in the automated checker. |
| @aws-sdk/s3-request-presigner | npm | created 2019-07-12 (~7 yrs) | 16.6M/week | github.com/aws/aws-sdk-js-v3 | Automated check: [SUS] ("too-new" — same false positive as nanoid) | **Approved** — manually verified, same official AWS SDK repo as above. |
| drizzle-orm | npm | latest published 2026-03-27 | 15.5M/week | github.com/drizzle-team/drizzle-orm | OK | Approved |
| drizzle-kit | npm | latest published 2026-03-17 | 12.9M/week | github.com/drizzle-team/drizzle-orm | OK | Approved |
| postgres | npm | latest published 2026-04-05 | 12.8M/week | github.com/porsager/postgres | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS] by the automated check:** `nanoid`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` — all three were manually cross-verified against `npm view <pkg> time.created` and the npm downloads API and are long-established, high-download, officially-repo'd packages. The automated "too-new" signal in this run measures the *latest published version's* date, not the package's registry age, which produces false positives for actively-maintained packages that shipped a release recently (nanoid 6.0.0, e.g., was a routine version bump). No `postinstall` scripts were found on any of the six packages checked (`npm view <pkg> scripts.postinstall` returned empty for all).

*No packages in this phase's stack were discovered exclusively via WebSearch without cross-verification — all six were confirmed against the npm registry directly by this research pass.*

## Architecture Patterns

### System Architecture Diagram

```
[Browser: capture page]
   │ 1. getUserMedia({video:{facingMode:"environment"}})
   │    → live <video> preview
   ▼
[User taps capture]
   │ 2. draw video frame to <canvas>
   │    → draw geotag+timestamp overlay text on top
   │    → canvas.toBlob(jpeg/webp)
   ▼
[Browser: GPS read]
   │ 3. navigator.geolocation.getCurrentPosition / watchPosition
   │    wait ~3-5s, keep best-accuracy reading, capture coords.accuracy
   ▼
[Browser: request presigned upload URL]
   │ 4. POST /api/upload-url {contentType} → {url, key}
   ▼                                            │
[Next.js Route Handler]                          │
   │ mints PutObjectCommand + getSignedUrl        │
   │ (server never touches the photo bytes)       │
   ▼                                            ▼
[Browser: PUT photo blob directly to R2] ◄───────┘
   │ 5. fetch(presignedUrl, {method:"PUT", body: blob})
   ▼
[Browser: submit complaint]
   │ 6. Server Action: {photoKey, category, lat, lng, accuracy, deviceId cookie}
   ▼
[Next.js Server Action]
   │ 7. zod-validate payload
   │ 8. generate opaque ID (nanoid customAlphabet), retry on unique-conflict
   │ 9. insert row: geometry(point,4326), category, submitter_id=deviceId,
   │    accuracy, photo_key, created_at
   ▼
[Postgres + PostGIS]
   │ row now query-able for feed
   ▼
[Browser: feed page /]
   │ 10. request visitor geolocation (or fall back to recency-only)
   ▼
[Next.js SSR page]
   │ 11. SELECT ... ORDER BY location <-> visitor_point LIMIT N
   ▼
[Feed renders: photo (R2 CDN URL) + category + distance + relative time]
   │ 12. IntersectionObserver near bottom → fetch next cursor page (client)
   ▼
[Browser: complaint detail /c/{id} or search-by-ID box]
   │ 13. direct unique-ID lookup (bypasses geo query entirely)
```

### Recommended Project Structure
```
src/
├── app/
│   ├── page.tsx                 # feed page (SSR, distance-sorted)
│   ├── capture/page.tsx         # camera+GPS capture flow (client component)
│   ├── c/[id]/page.tsx          # complaint permalink (SSR by unique ID)
│   └── api/
│       └── upload-url/route.ts  # presigned R2 PUT URL minting
├── actions/
│   └── submit-complaint.ts      # Server Action: validate, generate ID, insert
├── components/
│   ├── capture/                 # camera preview, canvas overlay, capture button
│   ├── feed/                    # feed card, infinite-scroll list, search-by-id box
│   └── shared/
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle table defs incl. geometry(point) column
│   │   └── client.ts             # postgres-js + drizzle client
│   ├── ids.ts                    # customAlphabet(...) opaque ID generator
│   ├── device-id.ts               # cookie read/set for stub identity
│   ├── geolocation.ts              # wait-for-fix helper (watchPosition wrapper)
│   └── r2.ts                        # S3Client configured for R2 + presign helper
└── types/
    └── complaint.ts               # shared zod schema + inferred types
```

### Pattern 1: Direct-to-R2 presigned upload (never proxy the photo through the app server)

**What:** The Next.js server only ever mints a short-lived (e.g. 60s) presigned `PutObjectCommand` URL; the browser PUTs the photo blob straight to R2.
**When to use:** Any file upload where the file can plausibly exceed a few MB — always true for phone camera photos.
**Example:**
```typescript
// Source: aws-sdk-js-v3 pattern, cross-checked against dev.to/ahadcommit tutorial + CLAUDE.md's R2 rationale
// lib/r2.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function presignPhotoUpload(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType, // client PUT must send the same Content-Type or signature fails
  });
  return getSignedUrl(r2, command, { expiresIn: 60 });
}
```
```typescript
// Client side: PUT the blob directly, never through Next.js
const { url, key } = await fetch("/api/upload-url", {
  method: "POST",
  body: JSON.stringify({ contentType: blob.type }),
}).then((r) => r.json());

await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
// then call the Server Action with { photoKey: key, ... }
```

### Pattern 2: Drizzle `geometry(point)` column + `::geography` cast for distance queries

**What:** Drizzle's native PostGIS support targets the `geometry` type (planar), not `geography` (ellipsoidal/meters-native). To get `ST_DWithin`/meter-accurate distance sorting for the "nearby" feed, cast to `::geography` inline in a raw `sql` fragment.
**When to use:** Every proximity query in this phase (feed sort).
**Example:**
```typescript
// Source: orm.drizzle.team/docs/guides/postgis-geometry-point (official docs, CITED)
import { pgTable, serial, text, geometry, index, integer, timestamp } from "drizzle-orm/pg-core";

export const complaints = pgTable(
  "complaints",
  {
    id: serial("id").primaryKey(),               // internal PK — never exposed
    publicId: text("public_id").notNull().unique(), // opaque ID, D-11 (KYA-7F3X2 style)
    submitterId: text("submitter_id").notNull(),     // device-id cookie value (D-05)
    category: text("category").notNull(),             // validated against 5-value enum server-side
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    accuracy: integer("accuracy_m"),                    // coords.accuracy, meters (D-04)
    photoKey: text("photo_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("complaints_location_gist").using("gist", t.location)],
);
```
```typescript
// Source: orm.drizzle.team official docs (distance-order pattern) + mustkeemk.com blog (ST_DWithin cast, CITED)
import { sql } from "drizzle-orm";

export async function nearbyFeed(lng: number, lat: number, limit: number, cursor?: string) {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  return db
    .select({
      id: complaints.publicId,
      category: complaints.category,
      createdAt: complaints.createdAt,
      distanceM: sql<number>`ST_Distance(${complaints.location}::geography, ${point}::geography)`,
    })
    .from(complaints)
    .orderBy(sql`${complaints.location} <-> ${point}`) // KNN operator uses the GiST index
    .limit(limit);
}
```
**Note:** if visitor location is denied (D-07), fall back to `ORDER BY created_at DESC` — no geometry query at all — rather than defaulting to `(0,0)` or any fake coordinate.

### Pattern 3: Opaque ID generation with collision-safe retry

**What:** `nanoid`'s `customAlphabet` generates the ID; the DB `UNIQUE` constraint is the actual correctness guarantee, with a bounded retry loop on conflict.
**When to use:** Every complaint insert.
**Example:**
```typescript
// Source: github.com/ai/nanoid README (customAlphabet usage, CITED) + standard retry-on-unique-violation pattern
import { customAlphabet } from "nanoid";

// Exclude ambiguous characters (0/O, 1/I/L) — D-11 requires "easy to read aloud / write on a sign"
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 32 symbols
const generateSuffix = customAlphabet(alphabet, 7); // see collision-math note below

export async function generatePublicId(): Promise<string> {
  return `KYA-${generateSuffix()}`;
}

// in the insert action:
for (let attempt = 0; attempt < 5; attempt++) {
  const publicId = await generatePublicId();
  try {
    return await db.insert(complaints).values({ ...rest, publicId }).returning();
  } catch (err) {
    if (isUniqueViolation(err) && attempt < 4) continue; // regenerate and retry
    throw err;
  }
}
```
**Collision-math note [VERIFIED: computed]:** D-11's example (`KYA-7F3X2`, 5 random chars) over a 32-symbol alphabet gives a space of `32^5 ≈ 33.5M`. By the birthday-paradox approximation (`n ≈ √(2·N·p)`), a 1% chance of at least one collision is already reached at only ~820 generated IDs, and 50% at ~6,800. **Recommend 7 random characters** (`32^7 ≈ 34.4 billion`; 1% collision risk at ~830,000 IDs, 50% at ~6.9 million) to comfortably outlive this MVP phase, while keeping the DB-unique-constraint-plus-retry pattern regardless — never rely on ID-space size alone for correctness.

### Pattern 4: Device-ID stub identity via cookie

**What:** A `crypto.randomUUID()`-generated ID, set as an httpOnly cookie on first visit, read by Server Actions to attach `submitter_id`.
**When to use:** Every write path in Phase 1 (submission) — this is what Phase 2 swaps for a real OAuth/OTP `user_id` (D-05).
**Example:**
```typescript
// lib/device-id.ts — Next.js 15 App Router cookies() API
import { cookies } from "next/headers";

export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get("kya_device_id")?.value;
  if (existing) return existing;
  const id = crypto.randomUUID(); // Web Crypto API, cryptographically random — do not use Math.random()
  store.set("kya_device_id", id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365 * 2, // 2 years
  });
  return id;
}
```

### Anti-Patterns to Avoid
- **Proxying photo uploads through a Server Action / Route Handler body:** hits Vercel's hard 4.5MB payload limit on real phone photos (see Pitfall below) — always presign-and-PUT-direct-to-R2.
- **Reading EXIF for location or "liveness":** canvas re-encoding strips it unconditionally, and mobile browsers frequently never populate it in the first place — always read `navigator.geolocation` live, never `photo.exif.gps`.
- **Exposing the DB serial `id` in the permalink URL:** use the opaque `publicId` as the only externally-visible identifier; the integer PK should never appear in a URL or API response (sequential IDs leak submission volume and are trivially enumerable).
- **Mirroring the canvas capture frame with `scaleX(-1)`:** that CSS trick is for the *preview* `<video>` element only (typically front camera). If applied to the canvas draw itself, the burned-in geotag overlay text renders backwards. Rear camera (`facingMode:"environment"`, the primary capture mode here) is not mirrored by convention anyway — do not mirror the canvas draw for this app's capture flow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Nearby" distance sort | Haversine formula in JS over all rows | PostGIS `ST_Distance(...::geography, ...)` + GiST index + `<->` KNN operator | JS-side Haversine can't use a spatial index — becomes a full table scan; PostGIS is the standard tool for exactly this. |
| Opaque unique ID generation | Custom base62 encoder over a counter, or `Math.random()`-based string | `nanoid` `customAlphabet` | `nanoid` uses `crypto.getRandomValues` internally and has a maintained, audited collision-probability model; hand-rolled `Math.random()` IDs are neither cryptographically random nor collision-modeled. |
| "Is this really a live camera stream" signal | Parsing image EXIF for camera-make/model tags | The `MediaStream` object from `getUserMedia` itself is the liveness proof — the app already knows a live stream was active because it drew a frame from it | EXIF is stripped by canvas re-encoding regardless (see Pitfall 1). |
| Presigned upload URL signing | Hand-written HMAC-SHA256 signing of the S3/R2 request | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`'s `getSignedUrl()` | AWS SigV4 signing has many easy-to-get-wrong edge cases (canonical request formatting, clock skew); the SDK is the standard, battle-tested implementation and R2 is fully S3-API-compatible. |

**Key insight:** every "don't hand-roll" item above has a well-known Postgres/npm-ecosystem answer that is a single dependency away — the risk in this phase isn't a missing library, it's wiring these pieces together correctly (the geometry/geography cast gap, the presigned-vs-proxy upload choice, the ID-collision retry loop).

## Common Pitfalls

### Pitfall 1: Vercel's 4.5MB body limit silently breaks proxy-style photo upload
**What goes wrong:** A Server Action or Route Handler that accepts the photo `Blob`/`FormData` directly works fine in local dev, then fails in production on Vercel with a `413`/`FUNCTION_PAYLOAD_TOO_LARGE`, or a Server Action fails *silently* past its own default ~1MB body-size config.
**Why it happens:** Vercel enforces a hard, non-configurable 4.5MB request/response body limit on serverless functions; Next.js Server Actions layer an additional, separately-configured default limit on top of that. [CITED: vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions]
**How to avoid:** Use the presigned-URL direct-to-R2 pattern (Pattern 1) — the photo bytes never touch a Next.js server function.
**Warning signs:** Upload works in `next dev` but fails only on the deployed Vercel preview/production URL; error shows as a generic network failure with no server-side stack trace (Server Action silent-fail case).

### Pitfall 2: Drizzle's native PostGIS support is `geometry`, not `geography` — distance queries need an explicit cast
**What goes wrong:** A team writes `ST_DWithin(location, point, 200)` directly against a Drizzle `geometry` column expecting meters, and either gets a Postgres type error or (worse) silently-wrong results measured in degrees of lat/lng rather than meters.
**Why it happens:** Drizzle ORM does not currently expose a native `geography` column type; `geometry` is planar (degree-based) unless explicitly cast. [CITED: orm.drizzle.team/docs/guides/postgis-geometry-point; github.com/drizzle-team/drizzle-orm issue #1315]
**How to avoid:** Always write `${column}::geography` inside the raw `sql` fragment for any distance/radius query (see Pattern 2). This phase only needs distance-sort, not a 200m `ST_DWithin` cutoff (D-10 explicitly has no radius cutoff yet) — but the cast is still required for `ST_Distance` to return meters rather than degrees.
**Warning signs:** Displayed distances that look like they're in the wrong unit (e.g., "0.02 km away" for something clearly 2km away), or a Postgres error mentioning `geometry`/`geography` operator mismatch.

### Pitfall 3: iOS/mobile Safari canvas capture orientation mismatch
**What goes wrong:** A photo captured in portrait mode via `getUserMedia` + canvas draw comes out sideways or the geotag overlay text is drawn along the wrong axis, specifically on iOS Safari.
**Why it happens:** Safari's `<img>`-level auto EXIF-orientation correction does **not** apply to `canvas.drawImage()` of a live video frame — the canvas gets the raw, unrotated frame while the video element itself may display correctly, causing dimension/orientation mismatches especially across orientation changes mid-session. [CITED: github.com/blueimp/JavaScript-Load-Image issue #97; Apple Developer Forums thread #776248]
**How to avoid:** Read `videoTrack.getSettings().width/height` (not assumed portrait/landscape dimensions) immediately before drawing to canvas, size the canvas to match, and re-check on every capture (don't cache orientation across the session). Test explicitly on a real iOS Safari device, not just Chrome DevTools device emulation, which does not reproduce this class of bug.
**Warning signs:** Captured photos appear correctly in the live preview but rotated/skewed once rendered from canvas; bug reports cluster on iPhone/iPad specifically.

### Pitfall 4: GPS accuracy and the "wait for fix" window (compounds with D-04)
**What goes wrong:** The very first `getCurrentPosition()` callback is often the least accurate reading (GPS module still "warming up"), especially in dense urban areas — submitting immediately on first callback can produce 50m+ errors.
**Why it happens:** Devices frequently return a fast, low-accuracy (often Wi-Fi/cell-tower-derived) fix first, then refine over the next few seconds as GPS satellites lock in; "urban canyon" effects in dense Indian metros make this worse. [CITED: LogRocket "what you need to know while using the Geolocation API"; dev.to "how to get an accurate position estimate"]
**How to avoid:** Implement D-04's 3-5s wait window using `watchPosition()` (not repeated `getCurrentPosition()` calls), keep the best-`accuracy` reading seen in that window, clear the watch, and submit with whatever accuracy resulted — storing `coords.accuracy` alongside the coordinate regardless (already locked in D-04).
**Warning signs:** QA testing shows the stored `accuracy_m` value is consistently the accuracy of the *first* reading rather than an improved one; repeated captures at the same physical spot show implausibly large accuracy variance.

### Pitfall 5: Geolocation/camera permission denial has no re-prompt — must route to browser settings
**What goes wrong:** After a user denies camera or GPS permission once, calling `getUserMedia`/`getCurrentPosition` again does **not** re-trigger the browser's permission prompt in most browsers — the app silently keeps failing with `PERMISSION_DENIED` unless it explicitly detects this and tells the user to change the setting in their browser (per D-03's "hard block with guidance to re-enable in browser settings").
**Why it happens:** Browsers treat a user's explicit "block" as a persistent site preference, not a per-request decision, specifically to prevent permission-prompt spam.
**How to avoid:** Use the `Permissions API` (`navigator.permissions.query({name:"geolocation"})` / `{name:"camera"}`) to detect `denied` state proactively and show settings-specific guidance immediately, rather than waiting for a failed capture attempt to discover it. [CITED: developer.mozilla.org/docs/Web/API/Permissions_API/Using_the_Permissions_API]
**Warning signs:** Users report "the app is stuck / nothing happens" after denying a permission prompt once — no error is visibly surfaced because the code path assumes another prompt will appear.

### Pitfall 6: Presigned upload URL trusts client-declared Content-Type unless explicitly locked
**What goes wrong:** A presigned PUT URL that doesn't pin `ContentType` in the signed `PutObjectCommand` will accept any file type the client sends — including a non-image file uploaded to what's meant to be a photo bucket, which becomes publicly servable from R2's CDN with no server-side validation in Phase 1 (no AI verification yet).
**Why it happens:** `PutObjectCommand`'s `ContentType` field is part of what gets signed; if it's included in the signature, R2 rejects mismatched `Content-Type` headers at upload time — but if omitted, anything goes.
**How to avoid:** Always set `ContentType` in the `PutObjectCommand` passed to `getSignedUrl` (see Pattern 1), restrict it server-side to `image/jpeg`/`image/webp` before minting the URL, and — since Phase 1 has no AI verification to catch a genuinely malformed image — consider a lightweight server-side sanity check (e.g., `sharp` attempting to read image metadata) before marking the complaint row as active, rather than trusting the upload blindly.
**Warning signs:** No `ContentType` restriction logic exists in the `/api/upload-url` handler; no validation happens between "upload succeeded" and "complaint row created."

## Code Examples

### GPS wait-for-fix hook
```typescript
// Source: pattern synthesized from dev.to "how to get an accurate position estimate from the Geolocation API" (CITED)
// lib/geolocation.ts
export function captureBestFix(waitMs = 4000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
      },
      (err) => {
        if (!best) reject(err); // only reject if we never got any reading
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: waitMs },
    );
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      best ? resolve(best) : reject(new Error("no-fix"));
    }, waitMs);
  });
}
```

### Canvas capture with orientation-safe sizing + overlay burn-in
```typescript
// Source: pattern synthesized from MDN "Taking still photos with getUserMedia()" + orientation pitfall research (CITED)
function captureFrame(video: HTMLVideoElement, overlayText: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  // read live track settings, don't assume portrait/landscape
  const track = (video.srcObject as MediaStream).getVideoTracks()[0];
  const { width, height } = track.getSettings();
  canvas.width = width ?? video.videoWidth;
  canvas.height = height ?? video.videoHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // never mirror this draw

  ctx.font = "24px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
  ctx.fillStyle = "white";
  ctx.fillText(overlayText, 12, canvas.height - 24); // e.g. "12.9716, 77.5946 · 23 Jul 2026, 14:03"

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.85),
  );
}
```

### Infinite scroll (client) against a cursor-paginated feed API
```typescript
// Source: pattern synthesized from freecodecamp "How to Implement Infinite Scroll in Next.js with Intersection Observer" (CITED)
"use client";
import { useEffect, useRef, useState } from "react";

export function FeedList({ initial, fetchMore }: { initial: FeedItem[]; fetchMore: (cursor: string) => Promise<FeedItem[]> }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initial.at(-1)?.id);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cursor) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting) {
        const next = await fetchMore(cursor);
        if (next.length) {
          setItems((prev) => [...prev, ...next]);
          setCursor(next.at(-1)?.id);
        } else {
          setCursor(undefined); // no more pages
        }
      }
    });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [cursor, fetchMore]);

  return (
    <>
      {items.map((item) => <FeedCard key={item.id} item={item} />)}
      <div ref={sentinelRef} />
    </>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Next.js 15.x (CLAUDE.md's pin) | Next.js 16.x now exists on npm (`16.2.11` latest stable) | 16.0 released after CLAUDE.md's stack research was written | Not a re-litigation of the locked stack decision — this research pins to latest-stable-15.x (`15.5.21`) to honor CLAUDE.md's explicit "15.x" pin. Flag for the user/planner: confirm whether to stay on 15.x for this greenfield build or move the locked decision to 16.x before scaffolding, since a brand-new project has no migration cost either way. |
| Node.js 20 LTS (CLAUDE.md's pin) | Node.js 24 is now Active LTS; Node 20 is in Maintenance LTS | Node release cadence, mid-2026 | Node 20 still works and is still supported (Maintenance LTS), so CLAUDE.md's pin isn't broken — but a greenfield project starting today has no reason not to start on Node 24 if the hosting target (Vercel) supports it. [ASSUMED — Vercel's supported Node runtime versions were not independently verified this session] |
| Supabase Postgres 15/16 (CLAUDE.md's figure) | Supabase currently documents support for Postgres 15 and 17 (plus an OrioleDB-17 variant) | Ongoing Supabase version rollout | Doesn't change anything actionable for Phase 1 — PostGIS enablement via the dashboard Extensions tab (already noted in CLAUDE.md) applies regardless of exact minor version. |
| zod 3.x (CLAUDE.md's pin) | zod 4.x is now current on npm (`4.4.3`) | zod v4 release | Zod v4 has some breaking changes from v3 (error customization API, `.default()` behavior in some cases) — re-verify the exact schema syntax used in Phase 1's submission validation against the v4 docs before writing the zod schema, don't copy v3-era examples verbatim. [ASSUMED — v4 breaking-change specifics not independently verified this session, flagged in Assumptions Log] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Node 24 is a safe default for a new project on Vercel (vs. staying on the CLAUDE.md-pinned Node 20) | State of the Art | Low — if Vercel's supported runtime list doesn't yet include Node 24 as GA, the planner should keep Node 20/22 instead; verify Vercel's Node runtime support page before pinning `package.json`'s `engines` field. |
| A2 | zod v4's schema-definition syntax for simple object/enum validation is close enough to v3 that the Pattern examples in this doc (not shown with actual zod code) will work unmodified | State of the Art / Standard Stack | Low-Medium — if the planner writes zod code assuming v3 semantics (e.g. old `.errorMap` API), it may not compile against v4; a quick check of the zod v4 changelog before writing the actual submission schema removes this risk cheaply. |
| A3 | The "Drizzle geometry column ignores the provided SRID in the generated migration" bug (from a third-party blog, not an official Drizzle changelog entry) still applies to `drizzle-kit 0.31.10` | Pattern 2 / Architecture | Low-Medium — if unresolved, the generated migration SQL may need a manual one-line fix (`geometry(point, 4326)` instead of a default/missing SRID) after running `drizzle-kit generate`; the planner should include a verification task ("inspect generated migration SQL for correct SRID") rather than trust the migration blindly. |
| A4 | Vercel's Node Route Handler / Server Action default body-size limits mentioned in Pitfall 1 are unchanged as of the current Next.js 15.x release used here | Common Pitfalls | Low — the underlying Vercel 4.5MB platform limit is the binding constraint regardless of Next.js's own configurable default, so this doesn't change the recommended architecture (direct-to-R2) either way. |

**If this table is empty:** N/A — see entries above; none of these change the recommended architecture, they only need a cheap verification step during planning/execution.

## Open Questions

1. **Does Phase 1 need a resized feed-thumbnail variant, or is the full captured photo (with overlay) shown directly in feed cards?**
   - What we know: `sharp` is in the recommended stack (from CLAUDE.md) for eventual thumbnail/re-encode work.
   - What's unclear: Whether Phase 1's success criteria require a distinct thumbnail size for feed performance, or whether serving the same R2-hosted image at both sizes (browser-resized via `<img>` `sizes`/`srcset` or Next.js `<Image>`) is sufficient for this MVP skeleton.
   - Recommendation: Default to no separate thumbnail pipeline in Phase 1 (use Next.js `<Image>` component's built-in responsive resizing against the single stored photo) — defer a true multi-resolution pipeline to a later performance-focused phase unless the planner has evidence feed load time is already a problem at MVP scale.

2. **Exact zod v4 syntax for the submission payload schema** — not independently verified this session (Assumption A2); the planner/implementer should check the current zod v4 docs when writing the actual schema rather than copying v3-era snippets from memory.

3. **Whether Supabase's currently-provisioned default Postgres major version (15 vs 17) affects any PostGIS/Drizzle behavior used here** — not independently verified; low risk since this phase only uses `ST_MakePoint`/`ST_SetSRID`/`ST_Distance`/GiST indexing, all long-stable PostGIS functions present across both versions.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next.js dev/build | — | — | Not probed on this machine — this research ran against the npm registry only, not a local dev environment. Planner should confirm a Node 20+ runtime is installed before scaffolding. |
| Docker (for local Postgres+PostGIS per CLAUDE.md's dev-parity recommendation) | Local dev DB with PostGIS | — | — | If unavailable, use Supabase's free-tier hosted Postgres directly for local dev instead of `postgis/postgis` Docker image — slower iteration but no local install needed. |
| Supabase project (PostGIS extension enabled) | Production/staging DB | — | — | Must be provisioned and PostGIS explicitly enabled via the dashboard Extensions tab (not on by default, per CLAUDE.md) before running the first migration. |
| Cloudflare R2 bucket + API token | Photo storage | — | — | No viable fallback within CLAUDE.md's constraints (Supabase Storage was explicitly rejected for cost/egress reasons) — this is a hard setup prerequisite before Phase 1's submit flow can work end-to-end. |

**Missing dependencies with no fallback:**
- Supabase project with PostGIS enabled, and a Cloudflare R2 bucket with API credentials — both must exist before Phase 1's submission flow can be executed/tested, even in dev. Flag as a setup/checkpoint task at the start of the plan.

**Missing dependencies with fallback:**
- Local Docker Postgres+PostGIS — can fall back to a Supabase dev project directly if Docker isn't available on the execution machine.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed yet (greenfield) — recommend Vitest (unit) + Playwright (E2E) |
| Config file | none — see Wave 0 |
| Quick run command | `npx vitest run` (unit) |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| SUBM-01 | Camera-only capture (no gallery picker path exists) | e2e (Playwright, fake camera device) | `npx playwright test tests/e2e/capture.spec.ts -g "camera only"` | ❌ Wave 0 |
| SUBM-02 | User selects one of 5 fixed categories on submit | unit + e2e | `npx vitest run tests/unit/submit-schema.test.ts` | ❌ Wave 0 |
| SUBM-03 | Live GPS captured at submit time (not EXIF) | unit (geolocation hook) + e2e (Playwright `context.setGeolocation`) | `npx playwright test tests/e2e/capture.spec.ts -g "geolocation"` | ❌ Wave 0 |
| SUBM-06 | Complaint gets a unique, opaque, searchable ID | unit (ID generator + collision-retry logic) | `npx vitest run tests/unit/ids.test.ts` | ❌ Wave 0 |
| FEED-01 | Landing page shows feed near user's location | e2e (Playwright, fake geolocation + seeded DB rows) | `npx playwright test tests/e2e/feed.spec.ts -g "nearby"` | ❌ Wave 0 |
| FEED-03 | Search complaint by ID | unit (lookup query) + e2e (search box → redirect) | `npx playwright test tests/e2e/search.spec.ts` | ❌ Wave 0 |
| FEED-04 | Complaint has a shareable permalink | e2e (`/c/{id}` renders correct complaint) | `npx playwright test tests/e2e/permalink.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` (fast unit checks — ID generation, schema validation, distance-formatting helpers)
- **Per wave merge:** `npx vitest run && npx playwright test` (full suite including camera/GPS-emulated E2E)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` + `npm install -D vitest` — no test framework installed yet
- [ ] `playwright.config.ts` with `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream` launch args configured on the Chromium project, so `getUserMedia` doesn't hang in headless test runs [CITED: playwright.dev/docs/emulation; medium.com "Simulating Webcam Access in Playwright"]
- [ ] `tests/e2e/fixtures.ts` — Playwright fixture that calls `context.grantPermissions(['geolocation'])` + `page.context().setGeolocation({...})` to drive location-dependent tests deterministically [CITED: playwright.dev/docs/emulation]
- [ ] `tests/unit/ids.test.ts`, `tests/unit/submit-schema.test.ts` — do not exist yet
- [ ] A seedable test database (docker-compose `postgis/postgis` service, per CLAUDE.md's dev-tooling recommendation) reachable from the Playwright E2E suite, with a reset/seed helper between test runs

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | Partial | No real auth exists yet (stub identity only, D-05) — but the device-ID cookie itself must be generated with `crypto.randomUUID()` (CSPRNG), not `Math.random()`, since it becomes the de facto identity token this phase relies on. |
| V3 Session Management | Partial | Device-ID cookie should be `httpOnly`, `SameSite=Lax`, reasonably long-lived (per D-05's "maps cleanly onto real user_id later") — not a full session system yet. |
| V4 Access Control | Minimal | Any device can submit; no ownership checks beyond "this cookie's device_id becomes submitter_id" — acceptable for this phase's explicit scope (no real accounts until Phase 2), but the schema field should be named generically (`submitter_id`, already reflected in Pattern 2) so Phase 2 doesn't require a migration. |
| V5 Input Validation | Yes | `zod` schema validates category (enum of exactly 5 values), lat/lng bounds (valid India-region range as a sanity check), `accuracy` as a positive number, and `photoKey` as a string matching the expected R2 key format server generated — never trust client-supplied free-form values for any of these. |
| V6 Cryptography | Yes | Both the device-ID cookie value and the opaque complaint ID must come from CSPRNG sources (`crypto.randomUUID()`, `nanoid`'s default `crypto.getRandomValues`-backed generator) — never hand-rolled or `Math.random()`-based. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| IDOR via guessable/sequential complaint ID | Information Disclosure | Never expose the DB serial `id` in any URL/response; the `publicId` (opaque nanoid) is the only externally visible identifier (Pattern 2/3). |
| Unrestricted upload type via a presigned PUT URL that doesn't pin `Content-Type` | Tampering | Always set `ContentType` inside the signed `PutObjectCommand` (Pitfall 6); optionally validate the uploaded object server-side before activating the complaint row. |
| Path traversal / object-key injection via a client-supplied R2 key | Tampering | The object key must be generated server-side (e.g. `complaints/${publicId}.jpg`) — never accept a client-supplied key path for the presign request. |
| Submission spam / abuse via the stub identity (trivially resettable by clearing cookies) | Denial of Service | Acknowledged as an explicit Phase 1 scope gap — no rate limiting is required yet per this phase's success criteria (VERIFY-04/Upstash rate limiting is Phase 4 scope per REQUIREMENTS.md traceability). Flag for the planner: do not silently add rate limiting scope-creep into Phase 1, but do not let a Phase 1 submission action skip the zod validation layer that keeps malformed payloads out of the DB regardless. |

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM — PostGIS geometry point guide](https://orm.drizzle.team/docs/guides/postgis-geometry-point) — official docs, fetched directly, geometry column + index + distance-order pattern
- [PostGIS official docs — ST_DWithin](https://postgis.net/documentation/tips/st-dwithin/) — canonical radius-query index-usage guidance (via project-level STACK.md research)
- [MDN — Using the Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API/Using_the_Permissions_API) — permission-denied detection pattern
- [Playwright — Emulation docs](https://playwright.dev/docs/emulation) — `context.setGeolocation`, fake media stream launch args
- npm registry (`npm view`) — live version/age/download verification for all 6 audited packages, 2026-07-23

### Secondary (MEDIUM confidence)
- [mustkeemk.com — Distance and radius in PostgreSQL with Drizzle ORM](https://mustkeemk.com/blogs/nestjs-tutorial/api-nestjs-distance-radius-postgresql-drizzle) — `::geography` cast pattern, SRID migration-bug note (third-party, cross-checked against official docs' column syntax)
- [dev.to/ahadcommit — Upload files from Next.js to S3 using presigned URLs](https://dev.to/ahadcommit/upload-files-from-nextjs-to-aws-s3-using-presigned-urls-50k9) — presigned PUT flow, R2 endpoint override pattern
- [Vercel Knowledge Base — How to bypass the 4.5MB body size limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) — official Vercel-published guidance
- [github.com/ai/nanoid README](https://github.com/ai/nanoid/blob/main/README.md) — `customAlphabet` usage, collision-probability calculator reference
- [github.com/blueimp/JavaScript-Load-Image issue #97](https://github.com/blueimp/JavaScript-Load-Image/issues/97) + [Apple Developer Forums #776248](https://developer.apple.com/forums/thread/776248) — iOS Safari canvas/video orientation quirks

### Tertiary (LOW confidence)
- General WebSearch synthesis (not independently source-verified beyond the search snippet) for: geolocation wait-for-fix UX pattern conventions, infinite-scroll Intersection Observer conventions, front-camera mirroring CSS convention — all standard/uncontroversial web-platform patterns, but flagged per protocol since no single authoritative doc was fetched for these specific claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version independently verified against the live npm registry this session.
- Architecture: HIGH — presigned-upload-vs-proxy and geometry/geography cast findings are both grounded in official docs plus a hard platform constraint (Vercel's body limit); direct-to-R2 pattern cross-checked against multiple independent tutorials in agreement.
- Pitfalls: MEDIUM-HIGH — mobile Safari orientation and GPS wait-for-fix pitfalls are well-documented general web-platform issues; the Drizzle SRID-migration-bug claim (Assumption A3) rests on one third-party blog post and should be spot-checked against the actual generated migration SQL during implementation.

**Research date:** 2026-07-23
**Valid until:** ~30 days for the architecture/pattern content (stable web-platform APIs, stable PostGIS/Drizzle idioms); ~7-14 days for the exact pinned package versions (this ecosystem — Next.js, zod, AWS SDK — has shown multiple major-version jumps even within the life of this project's own prior research pass, so re-verify versions at execution time via `npm view` rather than trusting this table months later).
