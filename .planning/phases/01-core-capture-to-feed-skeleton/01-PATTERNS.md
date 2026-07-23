# Phase 1: Core Capture-to-Feed Skeleton - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 15 (new files, all greenfield)
**Analogs found:** 0 / 15 (no application source code exists in this repository yet)

## Greenfield Notice

This repository currently contains only `.git/`, `.planning/`, `.claude/`, and `graphify-out/` (a knowledge-graph artifact directory unrelated to application code). There is **no existing Next.js scaffold, no components, no schema, no API routes, and no test files** to draw analogs from. A repo-wide search confirms this:

```
$ find . -maxdepth 2 -not -path './.git*' -not -path './.planning*' -not -path './graphify-out*'
.
./.claude
./.claude/CLAUDE.md
./.claude/settings.json
```

Because there are zero in-repo analogs, this PATTERNS.md does **not** fabricate pattern-file pairings. Instead, for every file the planner will create, the "analog" is the concrete code example already vetted in `01-RESEARCH.md` (cited from official docs / cross-checked tutorials) — the planner should copy these excerpts directly rather than inventing new approaches. Once Phase 1 lands, its files become the analogs for Phase 2+.

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|-----------------|----------------|
| `src/lib/db/schema.ts` | model | CRUD | none in-repo — use RESEARCH.md Pattern 2 | no-analog (research-sourced) |
| `src/lib/db/client.ts` | config | CRUD | none in-repo — standard `drizzle-orm/postgres-js` init | no-analog (research-sourced) |
| `src/lib/ids.ts` | utility | transform | none in-repo — use RESEARCH.md Pattern 3 | no-analog (research-sourced) |
| `src/lib/device-id.ts` | utility | request-response | none in-repo — use RESEARCH.md Pattern 4 | no-analog (research-sourced) |
| `src/lib/geolocation.ts` | utility | event-driven | none in-repo — use RESEARCH.md "GPS wait-for-fix hook" | no-analog (research-sourced) |
| `src/lib/r2.ts` | service | file-I/O | none in-repo — use RESEARCH.md Pattern 1 | no-analog (research-sourced) |
| `src/types/complaint.ts` | model | transform | none in-repo — zod schema, see Validation note | no-analog (research-sourced) |
| `src/app/api/upload-url/route.ts` | route | request-response | none in-repo — use RESEARCH.md Pattern 1 (Route Handler half) | no-analog (research-sourced) |
| `src/actions/submit-complaint.ts` | controller | CRUD | none in-repo — use RESEARCH.md Pattern 3 (retry loop) + Pattern 2 (schema) | no-analog (research-sourced) |
| `src/app/page.tsx` | component | request-response | none in-repo — use RESEARCH.md Pattern 2 (`nearbyFeed`) + Architecture Diagram step 10-12 | no-analog (research-sourced) |
| `src/app/capture/page.tsx` | component | streaming | none in-repo — use RESEARCH.md "Canvas capture with orientation-safe sizing" | no-analog (research-sourced) |
| `src/app/c/[id]/page.tsx` | component | request-response | none in-repo — SSR-by-unique-index lookup, standard Next.js App Router pattern | no-analog (research-sourced) |
| `src/components/feed/FeedList.tsx` | component | event-driven | none in-repo — use RESEARCH.md "Infinite scroll" code example | no-analog (research-sourced) |
| `src/components/feed/SearchById.tsx` | component | request-response | none in-repo — simple client redirect on submit | no-analog (research-sourced) |
| `src/components/capture/CameraCapture.tsx` | component | streaming | none in-repo — combines `getUserMedia`, `captureBestFix`, `captureFrame` | no-analog (research-sourced) |

## Pattern Assignments

Since there are no in-repo analogs, each assignment below points to the exact RESEARCH.md pattern/example the planner should copy verbatim (adjusting only names/paths), rather than a codebase file+line-range citation.

### `src/lib/db/schema.ts` (model, CRUD)

**Source:** `01-RESEARCH.md` Pattern 2 ("Drizzle `geometry(point)` column + `::geography` cast")

```typescript
import { pgTable, serial, text, geometry, index, integer, timestamp } from "drizzle-orm/pg-core";

export const complaints = pgTable(
  "complaints",
  {
    id: serial("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    submitterId: text("submitter_id").notNull(),
    category: text("category").notNull(),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    accuracy: integer("accuracy_m"),
    photoKey: text("photo_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("complaints_location_gist").using("gist", t.location)],
);
```

**Verification note:** after running `drizzle-kit generate`, inspect the generated SQL to confirm the SRID is correctly `4326` in the column definition (Assumption A3 in RESEARCH.md — third-party-reported migration bug, not officially confirmed against `drizzle-kit 0.31.10`).

---

### `src/lib/db/client.ts` (config, CRUD)

**Source:** implied by `drizzle-orm/postgres-js` + `postgres` driver combination named in RESEARCH.md Standard Stack table (no example code given — standard init is `drizzle(postgres(process.env.DATABASE_URL!))`). No further pattern beyond package docs; flag as light-risk/no-example area for the planner to fill from Drizzle's own quickstart.

---

### `src/lib/ids.ts` (utility, transform)

**Source:** `01-RESEARCH.md` Pattern 3 ("Opaque ID generation with collision-safe retry")

```typescript
import { customAlphabet } from "nanoid";

const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 32 symbols, ambiguous chars excluded
const generateSuffix = customAlphabet(alphabet, 7); // 7 chars, not 5 — see collision-math note

export async function generatePublicId(): Promise<string> {
  return `KYA-${generateSuffix()}`;
}
```

**Retry-on-conflict loop** (goes in `submit-complaint.ts`, not `ids.ts` itself):
```typescript
for (let attempt = 0; attempt < 5; attempt++) {
  const publicId = await generatePublicId();
  try {
    return await db.insert(complaints).values({ ...rest, publicId }).returning();
  } catch (err) {
    if (isUniqueViolation(err) && attempt < 4) continue;
    throw err;
  }
}
```

**Critical deviation from D-11's literal example:** D-11 says "~6-8 characters" and shows `KYA-7F3X2` (5 chars after prefix). RESEARCH.md's collision-math note demonstrates 5 chars over a 32-symbol alphabet hits a 1% collision risk at only ~820 IDs — **use 7 characters**, not 5, to satisfy both D-11's stated 6-8 char range and RESEARCH's collision-safety recommendation.

---

### `src/lib/device-id.ts` (utility, request-response)

**Source:** `01-RESEARCH.md` Pattern 4 ("Device-ID stub identity via cookie")

```typescript
import { cookies } from "next/headers";

export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get("kya_device_id")?.value;
  if (existing) return existing;
  const id = crypto.randomUUID(); // CSPRNG — never Math.random()
  store.set("kya_device_id", id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365 * 2,
  });
  return id;
}
```

---

### `src/lib/geolocation.ts` (utility, event-driven)

**Source:** `01-RESEARCH.md` "GPS wait-for-fix hook" code example

```typescript
export function captureBestFix(waitMs = 4000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
      },
      (err) => {
        if (!best) reject(err);
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

**Pair with D-03's hard-block-on-denial requirement:** use `navigator.permissions.query({name:"geolocation"})` (and `{name:"camera"}`) to proactively detect `denied` state per RESEARCH.md Pitfall 5, rather than waiting for a failed capture attempt.

---

### `src/lib/r2.ts` (service, file-I/O)

**Source:** `01-RESEARCH.md` Pattern 1 ("Direct-to-R2 presigned upload")

```typescript
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
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: 60 });
}
```

**Security requirement (RESEARCH.md Pitfall 6 + Security Domain):** the object key must be generated server-side (e.g. `complaints/${publicId}.jpg}`), never accepted from the client; `ContentType` must be restricted to `image/jpeg`/`image/webp` before minting the URL.

---

### `src/app/api/upload-url/route.ts` (route, request-response)

**Source:** `01-RESEARCH.md` Architecture Diagram step 4 + Pattern 1's Route Handler half. No in-repo Route Handler exists; standard Next.js 15 App Router `route.ts` shape (`export async function POST(req: Request)`) calling `presignPhotoUpload` from `src/lib/r2.ts`.

---

### `src/actions/submit-complaint.ts` (controller, CRUD)

**Source:** combines `01-RESEARCH.md` Pattern 3 (ID retry loop), Pattern 2 (schema/insert shape), Pattern 4 (`getOrCreateDeviceId`), and the zod validation requirement from Security Domain V5.

**Core pattern:** zod-validate payload → `getOrCreateDeviceId()` → ID-generation retry loop → `db.insert(complaints).values(...)`.

**Validation note (zod v4 caveat):** RESEARCH.md flags zod v4 (`4.4.3`) as a major-version jump from CLAUDE.md's `3.x` reference (Assumption A2). Do not copy v3-era `.errorMap`/`.default()` snippets from memory — verify current v4 syntax before writing the schema.

---

### `src/app/page.tsx` (component, request-response) — feed page

**Source:** `01-RESEARCH.md` Pattern 2's `nearbyFeed()` query + Architecture Diagram steps 10-12.

```typescript
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
    .orderBy(sql`${complaints.location} <-> ${point}`)
    .limit(limit);
}
```

**Fallback (D-07):** if visitor location is denied, fall back to `ORDER BY created_at DESC` with no geometry query at all — never default to `(0,0)`.

---

### `src/app/capture/page.tsx` + `src/components/capture/CameraCapture.tsx` (component, streaming)

**Source:** `01-RESEARCH.md` "Canvas capture with orientation-safe sizing + overlay burn-in" example.

```typescript
function captureFrame(video: HTMLVideoElement, overlayText: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
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
  ctx.fillText(overlayText, 12, canvas.height - 24);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.85),
  );
}
```

**Critical pitfall (RESEARCH.md Pitfall 3):** must be tested on real iOS Safari, not Chrome DevTools emulation — canvas orientation bugs specifically evade emulation.

---

### `src/app/c/[id]/page.tsx` (component, request-response) — permalink page

**Source:** no example code given in RESEARCH.md beyond Architecture Diagram step 13 ("direct unique-ID lookup bypassing geo query"). Standard Next.js App Router dynamic-segment SSR page (`params.id` → `db.query.complaints.findFirst({ where: eq(complaints.publicId, id) })`). Security requirement: never expose the internal serial `id`, only `publicId`.

---

### `src/components/feed/FeedList.tsx` (component, event-driven) — infinite scroll

**Source:** `01-RESEARCH.md` "Infinite scroll (client) against a cursor-paginated feed API" example.

```typescript
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
          setCursor(undefined);
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

---

### `src/components/feed/SearchById.tsx` (component, request-response)

**Source:** no example code in RESEARCH.md; described only in Architectural Responsibility Map ("Simple unique-index lookup; client just redirects to `/c/{id}` on submit"). Implement as a controlled input + `router.push(`/c/${id}`)` on submit, matching D-13.

---

## Shared Patterns

### Zod input validation (V5 Input Validation)
**Source:** RESEARCH.md Security Domain table + Standard Stack (`zod@4.4.3`)
**Apply to:** `src/types/complaint.ts` (schema definition), `src/actions/submit-complaint.ts` (server-side re-validation), `src/app/api/upload-url/route.ts` (content-type restriction)
**Rule:** never trust client-only enforcement of the 5-category enum or lat/lng bounds — always re-validate server-side with zod, using v4 syntax (verify against current docs, not v3 memory).

### CSPRNG for all identity/ID generation
**Source:** RESEARCH.md Security Domain V6 Cryptography
**Apply to:** `src/lib/device-id.ts` (`crypto.randomUUID()`), `src/lib/ids.ts` (`nanoid`'s `crypto.getRandomValues`-backed generator)
**Rule:** never `Math.random()`-based IDs anywhere in this phase.

### Opaque-ID-only exposure (IDOR mitigation)
**Source:** RESEARCH.md Security Domain "Known Threat Patterns" + Anti-Patterns
**Apply to:** `src/app/c/[id]/page.tsx`, `src/app/page.tsx` (feed query's selected columns), `src/actions/submit-complaint.ts` (`.returning()` shape)
**Rule:** the internal serial `id` (primary key) must never appear in any URL, API response, or client-visible payload — only `publicId`.

### Direct-to-R2 upload (never proxy through app server)
**Source:** RESEARCH.md Pattern 1 + Pitfall 1
**Apply to:** `src/lib/r2.ts`, `src/app/api/upload-url/route.ts`, capture flow's upload step in `src/components/capture/CameraCapture.tsx`
**Rule:** photo bytes flow browser → R2 directly via presigned PUT; the Next.js server only mints the URL. This is a hard platform constraint (Vercel's 4.5MB body limit), not a style preference.

### `::geography` cast for all distance queries
**Source:** RESEARCH.md Pattern 2 + Pitfall 2
**Apply to:** `src/app/page.tsx` (`nearbyFeed` query) — the only distance query in this phase
**Rule:** Drizzle's `geometry` column type is planar/degree-based; every `ST_Distance`/`<->` usage must cast `::geography` inline via raw `sql` to get meter-accurate results.

## No Analog Found

All 15 files in this phase have no in-repo analog — this is expected and correct for a Phase 1 greenfield build. Each has instead been mapped to a specific vetted example in `01-RESEARCH.md` above. The two files with genuinely no example code anywhere (planner should treat as light-risk, standard-library-shape territory):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/db/client.ts` | config | CRUD | Standard `drizzle-orm/postgres-js` + `postgres` driver init — no project-specific pattern needed, follow Drizzle's own quickstart docs |
| `src/components/feed/SearchById.tsx` | component | request-response | Described only architecturally in RESEARCH.md, no code example given — trivial controlled-input + redirect, low risk |

## Metadata

**Analog search scope:** entire repository (`find . -maxdepth 2`, excluding `.git`, `.planning`, `graphify-out`)
**Files scanned:** 3 (`.claude/CLAUDE.md`, `.claude/settings.json`, plus directory listing) — confirms zero application source code exists
**Pattern extraction date:** 2026-07-23
**Primary source for all pattern excerpts:** `.planning/phases/01-core-capture-to-feed-skeleton/01-RESEARCH.md` (all excerpts cross-checked against official docs per that file's Sources section)
