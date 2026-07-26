---
phase: 01-core-capture-to-feed-skeleton
reviewed: 2026-07-26T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - drizzle/0000_next_pete_wisdom.sql
  - src/actions/submit-complaint.ts
  - src/app/api/feed/route.ts
  - src/app/api/upload-url/route.ts
  - src/app/c/[id]/not-found.tsx
  - src/app/c/[id]/page.tsx
  - src/app/capture/page.tsx
  - src/app/globals.css
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/components/capture/CameraCapture.tsx
  - src/components/capture/CategoryPicker.tsx
  - src/components/capture/PermissionGate.tsx
  - src/components/feed/FeedCard.tsx
  - src/components/feed/FeedList.tsx
  - src/components/feed/LocationRequester.tsx
  - src/components/feed/SearchById.tsx
  - src/lib/db/client.ts
  - src/lib/db/schema.ts
  - src/lib/device-id.ts
  - src/lib/distance.ts
  - src/lib/feed.ts
  - src/lib/geolocation.ts
  - src/lib/ids.ts
  - src/lib/overlay.ts
  - src/lib/r2.ts
  - src/types/complaint.ts
  - tests/e2e/capture.spec.ts
  - tests/e2e/feed.spec.ts
  - tests/e2e/fixtures.ts
  - tests/e2e/permalink.spec.ts
  - tests/e2e/search.spec.ts
  - tests/unit/db-client-options.test.ts
  - tests/unit/distance.test.ts
  - tests/unit/feed-route-logging.test.ts
  - tests/unit/ids.test.ts
  - tests/unit/overlay.test.ts
  - tests/unit/submit-schema.test.ts
findings:
  critical: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Reviewed the full capture -> upload -> submit -> feed -> permalink slice (server actions, API routes, DB schema/client, capture UI, feed UI, and unit/e2e tests). The security-sensitive paths that were clearly a deliberate design focus — IDOR via opaque `public_id`, presigned-URL key/content-type pinning, camera-only capture, server-side category/coordinate re-validation, parameterized SQL via `sql` tag templates, no hardcoded secrets, no `eval`/`innerHTML` — all hold up under inspection. No SQL injection, XSS, or auth-bypass vectors were found; the CR-01 fixes referenced in comments (photo-existence check, overlay truncation) are genuinely present in the code, not just claimed in a comment.

What remains is a set of edge-case correctness bugs and a couple of quietly-missing invariants that the design docs explicitly care about but the code doesn't fully enforce:

- An empty `lat=`/`lng=` query string is silently coerced to `(0, 0)` in three separate places, violating the documented "never a fake (0,0) coordinate" invariant (D-07).
- `photoKey` has no single-use enforcement, so one uploaded photo can be attached to unlimited complaint rows by calling the Server Action directly.
- `R2_PUBLIC_BASE_URL` is read raw in two files instead of through the `requireEnv` pattern the rest of the codebase just introduced (WR-04 in-code) for exactly this failure mode.
- `photoExists` collapses "object truly missing" and "any other R2/network error" into the same `false`, which can wrongly reject legitimate submissions.
- `FeedList`'s infinite-scroll fetch has no dedupe/catch, allowing a duplicate-cursor fetch or an unhandled rejection under specific scroll/network conditions.

None of these are exploitable security holes and none crash the app, but several are real, provable logic defects that should be fixed before this ships as a stable base for later phases.

## Warnings

### WR-01: Empty `lat`/`lng` query params silently resolve to Null Island (0, 0)

**File:** `src/app/page.tsx:99-101`, `src/app/c/[id]/page.tsx:42-44`, `src/app/api/feed/route.ts:24-27`

**Issue:** All three location-parsing call sites use the same pattern:
```ts
const lat = params.lat !== undefined ? Number(params.lat) : undefined;
```
For a URL like `/?lat=&lng=` (or `/api/feed?lat=&lng=`), Next.js gives `params.lat === ""` — not `undefined`. `Number("")` evaluates to `0`, not `NaN`, so `hasLocation` becomes `true` with `lat = 0, lng = 0`. This directly contradicts the documented invariant in `LocationRequester.tsx` ("never a fake (0,0) coordinate", D-07) and would cause `nearbyFeed`/the permalink's `ST_Distance` query to sort/report distance from a point off the coast of West Africa instead of falling back to recency/no-distance. It's reachable by any user or crawler visiting a hand-crafted or malformed link, and it's duplicated identically in three files, so a fix in one place won't fix the others.

**Fix:** Treat empty string the same as absent, e.g.:
```ts
const latRaw = params.lat;
const lat = latRaw !== undefined && latRaw !== "" ? Number(latRaw) : undefined;
```
or centralize this parsing into one shared helper (e.g. `src/lib/geo-params.ts`) used by all three call sites instead of re-implementing it three times.

### WR-02: `photoKey` is not single-use — one uploaded photo can back unlimited complaints

**File:** `src/actions/submit-complaint.ts:39-41`, `src/lib/db/schema.ts:38`

**Issue:** `submitComplaint` only checks that the photo *exists* in R2 (`photoExists`), never that it hasn't already been attached to a prior complaint. `photo_key` has no `UNIQUE` constraint in the schema, and there's no query guarding against reuse. Since Server Actions are just POST endpoints, anyone can call `submitComplaint` directly (bypassing the UI and `CameraCapture`) with the exact same valid `photoKey` from an earlier legitimate upload, repeated with different `category`/`lat`/`lng`, and generate unlimited "photo-verified" complaint rows without ever touching the camera again. This undermines the "live camera capture only" anti-abuse premise the rest of the file's comments (SUBM-01, CR-01) are built around.

**Fix:** Either add a `UNIQUE` constraint on `photo_key` (simplest, matches "one photo -> one complaint") and let the existing unique-violation retry pattern handle the conflict with a clear error, or explicitly check `SELECT 1 FROM complaints WHERE photo_key = $1` before insert and reject with a clear message if it already exists.

### WR-03: `R2_PUBLIC_BASE_URL` bypasses the `requireEnv` fail-fast pattern

**File:** `src/lib/feed.ts:6-8`, `src/app/c/[id]/page.tsx:15-17`

**Issue:** `src/lib/env.ts`'s `requireEnv` was introduced specifically so a missing required env var fails loudly at module load instead of producing an opaque runtime artifact (per the WR-04 comment in `client.ts`/`r2.ts`). `R2_PUBLIC_BASE_URL` is read directly via `process.env.R2_PUBLIC_BASE_URL` in two separate files without going through `requireEnv`. If it's unset or misspelled in an environment, every photo URL silently becomes `"undefined/complaints/KYA-....jpg"` — broken images across the entire feed and every permalink — with no error surfaced anywhere, exactly the failure mode `requireEnv` exists to prevent. The identical `photoUrl` helper is also duplicated verbatim in both files instead of shared.

**Fix:**
```ts
// src/lib/photo-url.ts
import { requireEnv } from "@/lib/env";

export function photoUrl(photoKey: string): string {
  return `${requireEnv("R2_PUBLIC_BASE_URL")}/${photoKey}`;
}
```
Import this single helper from both `feed.ts` and `c/[id]/page.tsx`.

### WR-04: `photoExists` treats every R2 error as "photo missing"

**File:** `src/lib/r2.ts:46-53`

**Issue:** `photoExists` swallows *any* thrown error from `HeadObjectCommand` — including transient network failures, throttling, or credential/permission errors — and returns `false` uniformly. In `submitComplaint`, a `false` here is deliberately mapped to "Photo not found — please retake and upload the photo before submitting," even when the actual failure was a transient R2/network hiccup and the photo genuinely exists. This forces a legitimate user to redo the entire capture flow (including a fresh GPS wait) for a purely infrastructure-side error.

**Fix:** Narrow the catch to the actual "not found" case (the AWS SDK v3 throws an error with `name === "NotFound"` / `$metadata.httpStatusCode === 404` for a missing object) and re-throw anything else so it surfaces as a generic submission error rather than a misleading "retake your photo" message:
```ts
export async function photoExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "NotFound") return false;
    throw err;
  }
}
```

### WR-05: `FeedList`'s infinite-scroll fetch has no guard against a duplicate in-flight request and no error handling

**File:** `src/components/feed/FeedList.tsx:34-53, 55-67`

**Issue:** The `IntersectionObserver` callback calls `fetchNext(cursor)` whenever the sentinel intersects, with no check on the `loading` flag:
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting) {
    fetchNext(cursor);
  }
});
```
If the sentinel leaves and re-enters the viewport (a real scroll-bounce scenario) while an earlier fetch for the same `cursor` is still in flight, a second identical request fires, and both responses append the same page of items to `items`, producing visible duplicate cards. Separately, `fetchNext` has a `try { ... } finally { setLoading(false) }` but no `catch` — a `fetch()` network failure propagates out of the async function uncaught, becoming an unhandled promise rejection (the caller invokes `fetchNext(cursor)` without `.catch()`), and the user is left with a silently-stuck "Loading more…" indicator with no retry affordance.

**Fix:**
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !loading) {
    fetchNext(cursor).catch(() => {
      // surface a retry affordance here instead of swallowing
    });
  }
});
```
(and add `loading` to the effect's dependency array, or track in-flight state in a ref to avoid re-subscribing the observer on every loading change).

### WR-06: Initial migration doesn't self-provision the PostGIS extension

**File:** `drizzle/0000_next_pete_wisdom.sql:1-13`

**Issue:** The migration declares `geometry(point, 4326)` and a `gist` index directly with no `CREATE EXTENSION IF NOT EXISTS postgis;` preceding it. On any Postgres instance where PostGIS hasn't already been enabled out-of-band (e.g. a contributor's local Postgres that isn't specifically the `postgis/postgis` image, or a fresh Supabase project before the dashboard toggle is flipped), this migration fails outright with "type \"geometry\" does not exist." CLAUDE.md's own stated goal is that contributors can self-serve their dev environment — a migration that silently depends on an external manual step undermines that for anyone who doesn't happen to read the schema.ts comment first.

**Fix:** Prepend the extension bootstrap to the migration (idempotent, safe to re-run):
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "complaints" ( ... );
```

## Info

### IN-01: Category icon/tile maps duplicated across components

**File:** `src/components/feed/FeedCard.tsx:12-18`, `src/components/capture/CategoryPicker.tsx:8-14`

**Issue:** `CATEGORY_ICONS: Record<Category, ComponentType<...>>` is defined identically in both `FeedCard.tsx` and `CategoryPicker.tsx`. Adding, renaming, or removing a category (`CATEGORIES` in `src/types/complaint.ts`) now requires remembering to update two more independent copies of this map (three, counting `CATEGORY_TILE_STYLES` in `FeedCard.tsx`), with only a TypeScript `Record<Category, ...>` exhaustiveness check to catch a miss — and only for the icon maps, not the tile-color map.

**Fix:** Move `CATEGORY_ICONS` (and ideally `CATEGORY_TILE_STYLES`) into `src/types/complaint.ts` alongside `CATEGORIES`, or a small `src/lib/category-ui.ts`, and import from both components.

### IN-02: `submitter_id` cookie value is trusted without any format validation

**File:** `src/lib/device-id.ts:11-24`

**Issue:** `getOrCreateDeviceId` reads the `kya_device_id` cookie and returns it verbatim if present, with no validation that it's a well-formed UUID (or any expected shape). Since the cookie is `httpOnly`, ordinary page JS can't rewrite it, but nothing stops a direct HTTP client from sending an arbitrary `Cookie: kya_device_id=anything` header, which is then persisted as-is into `submitter_id` on every complaint row. This has no exploitable effect today (submitter_id isn't used for authorization or display), but as Phase 2 layers real identity/rate-limiting onto this column, an unvalidated free-form value inherited from Phase 1 could complicate that migration.

**Fix:** Validate the cookie value looks like a UUID before trusting it; regenerate if not:
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const existing = store.get(COOKIE_NAME)?.value;
if (existing && UUID_RE.test(existing)) return existing;
```

### IN-03: `webp` support is validated end-to-end but never actually exercised by any client code path

**File:** `src/app/api/upload-url/route.ts:7-14`, `src/types/complaint.ts:27-29`

**Issue:** `CONTENT_TYPE_BY_EXT` in the upload-url route and the `photoKey` regex in `submissionSchema` both accept `webp` as a valid extension, but `CameraCapture.tsx` always calls `canvas.toBlob(..., "image/jpeg", 0.85)` and always POSTs `{ ext: "jpg" }` — there is no code path anywhere that produces or requests a `webp` upload. This isn't wrong, just dead/unverifiable surface: it can silently drift out of sync (e.g. a future contentType mismatch) without any test or usage ever exercising it.

**Fix:** Either wire up an actual `webp` capture path (e.g. as a smaller-payload option for slow networks, which the R2 presign already anticipates per the 300s timeout comment) or drop `webp` from the schema/route until it's used, to keep validated surface area matched to actual behavior.

---

_Reviewed: 2026-07-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
