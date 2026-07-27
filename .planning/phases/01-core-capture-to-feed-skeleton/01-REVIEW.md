---
phase: 01-core-capture-to-feed-skeleton
reviewed: 2026-07-27T00:00:00Z
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
  critical: 1
  warning: 12
  info: 7
  total: 20
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Reviewed the full capture → upload → submit → feed → permalink slice (Server Actions, API routes, DB schema/client, capture UI, feed UI, and supporting libs/tests). The deliberately-hardened paths hold up well: opaque `public_id` IDOR mitigation, presigned-URL key/content-type pinning, camera-only capture, server-side category/coordinate re-validation, parameterized SQL via `sql` tag templates, no hardcoded secrets, no `eval`/`innerHTML`/XSS surface. No SQL injection or auth-bypass vector was found.

What remains is one real information-disclosure inconsistency, and a cluster of correctness/robustness gaps that this pass could independently verify against the source (not just infer from comments):

- `submitComplaint`'s retry loop sanitizes only the unique-violation error path; every other DB failure rethrows the raw driver error, which Next.js Server Actions forward to the client as-is — the exact class of leak `/api/feed/route.ts` explicitly guards against elsewhere in this same codebase.
- An empty `lat=`/`lng=` query string (`Number("") === 0`, not `NaN`) is silently accepted as a real coordinate in three separate call sites, producing a fake `(0, 0)` fix that the project's own `LocationRequester` comment says must never happen (D-07).
- `photoKey` has no single-use enforcement — one legitimate photo upload can back unlimited complaint rows if `submitComplaint` is invoked directly, bypassing the camera entirely and undermining the "live camera capture only" anti-abuse premise (SUBM-01).
- Several smaller gaps: `photoExists` collapses all R2/SDK errors into "not found"; `/api/upload-url` has no rate limiting; `R2_PUBLIC_BASE_URL` bypasses the codebase's own `requireEnv` fail-fast pattern; `FeedList`'s infinite scroll has no in-flight guard or error handling; the initial migration doesn't self-provision the PostGIS extension.

None of these crash the app outright, but several are provable logic/security defects, not style preferences, and should be fixed before this ships as the stable base for later phases.

## Critical Issues

### CR-01: Raw DB/internal error messages can leak to the client from `submitComplaint`

**File:** `src/actions/submit-complaint.ts:50-77` (read together with `src/app/capture/page.tsx:61-69`)
**Issue:** The insert retry loop only special-cases `isUniqueViolation(err)`:
```ts
} catch (err) {
  lastError = err;
  if (isUniqueViolation(err) && attempt < MAX_ID_ATTEMPTS - 1) continue;
  throw err;   // any other error (connection reset, timeout, unexpected
               // constraint violation, driver error) is rethrown as-is
}
```
This thrown `Error` propagates out of the `"use server"` Server Action. Next.js forwards a Server Action's thrown `Error.message` (not a redacted digest) to the caller. `capture/page.tsx` then does:
```ts
setError(err instanceof Error ? err.message : "Couldn't publish your report. ...");
```
and renders `error` directly in the UI. So any non-unique-violation failure during the insert (a Postgres connection reset, a pool-exhaustion timeout, or a future schema/constraint error) displays the raw driver/DB error text to the end user — the same category of leak `/api/feed/route.ts` explicitly guards against:
```ts
// T-01-09: log full error detail server-side only ...; the
// client-facing response stays a fixed generic message with no DB internals.
```
`submit-complaint.ts` has no equivalent server-side-log + generic-client-message pattern for this class of error, and the final `throw lastError` fallback (line 74-76) has the same problem.
**Fix:**
```ts
} catch (err) {
  lastError = err;
  if (isUniqueViolation(err) && attempt < MAX_ID_ATTEMPTS - 1) continue;
  console.error("submitComplaint insert failed", err);
  throw new Error("Couldn't publish your report. Check your connection and try again.");
}
```
Apply the same sanitization to the trailing `throw lastError instanceof Error ? lastError : ...` fallback.

## Warnings

### WR-01: Empty `lat`/`lng` query params silently resolve to a fake `(0, 0)` fix

**File:** `src/app/page.tsx:99-101`, `src/app/c/[id]/page.tsx:42-44`, `src/app/api/feed/route.ts:24-27`
**Issue:** All three location-parsing call sites use the same pattern, e.g.:
```ts
const lat = params.lat !== undefined ? Number(params.lat) : undefined;
```
For a URL like `/?lat=&lng=`, Next.js gives `params.lat === ""`, not `undefined`. `Number("")` evaluates to `0`, not `NaN`, so `hasLocation` becomes `true` with `lat = 0, lng = 0`. This directly contradicts the invariant documented in `LocationRequester.tsx` ("never a fake (0,0) coordinate", D-07) and would cause `nearbyFeed` / the permalink's `ST_Distance` query to sort/report distance from Null Island instead of falling back to the recency/no-distance path. It's reachable by any hand-crafted or malformed link, and duplicated identically in three files, so a fix in one place won't fix the others.
**Fix:** Treat empty string the same as absent:
```ts
const lat = params.lat !== undefined && params.lat !== "" ? Number(params.lat) : undefined;
```
or centralize this parsing into one shared helper used by all three call sites instead of re-implementing it independently.

### WR-02: `photoKey` is not single-use — one uploaded photo can back unlimited complaints

**File:** `src/actions/submit-complaint.ts:39-41`, `src/lib/db/schema.ts:38`
**Issue:** `submitComplaint` only checks that the photo *exists* in R2 (`photoExists`) — never that it hasn't already been attached to a prior complaint. `photo_key` has no `UNIQUE` constraint, and no query guards against reuse. Since Server Actions are reachable as plain POST endpoints, anyone can call `submitComplaint` directly with the exact same valid `photoKey` from one earlier legitimate upload, varying `category`/`lat`/`lng`, and generate unlimited "photo-verified" complaint rows without touching the camera again — directly undermining the "live camera capture only" anti-abuse premise (SUBM-01, CLAUDE.md constraints).
**Fix:** Add a `UNIQUE` constraint on `photo_key` (simplest — "one photo → one complaint") and let the existing unique-violation handling surface a clear rejection, or explicitly check for prior use before insert.

### WR-03: `CameraCapture.handleCapture` has no reentrancy guard

**File:** `src/components/capture/CameraCapture.tsx:79-188`
**Issue:** `handlePublish` in `capture/page.tsx` explicitly implements a "single-flight guard" (`publishPhase !== "idle"`) to stop a double-tap from creating two complaints. `handleCapture` has no equivalent guard — the Capture button's `disabled` prop depends on React state (`status`) that only updates after the async function has started running, so two rapid clicks before the first re-render could both pass the `!video || !stream` check and run concurrently (two GPS reads, two canvas draws, two uploads to two different R2 keys).
**Fix:** Add a ref-based in-flight guard mirroring the pattern already used for publish:
```ts
const capturingRef = useRef(false);
async function handleCapture() {
  if (capturingRef.current) return;
  capturingRef.current = true;
  try { /* existing body */ } finally { capturingRef.current = false; }
}
```

### WR-04: `photoExists` treats every R2/SDK error as "photo not found"

**File:** `src/lib/r2.ts:46-53`
**Issue:**
```ts
export async function photoExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}
```
This catches *every* exception — a real 404, but also transient network errors, throttling, or credential/permission errors — and treats them identically. `submitComplaint` maps `false` here to "Photo not found — please retake and upload the photo before submitting," so a user hitting a transient R2/network blip is told to redo the entire capture flow (including a fresh GPS wait) even though their photo uploaded fine.
**Fix:** Narrow the catch to the actual "not found" case (AWS SDK v3 throws with `name === "NotFound"` / `$metadata.httpStatusCode === 404`) and rethrow anything else so it surfaces as a generic/transient submission error instead of a misleading "retake your photo" message.

### WR-05: Cursor pagination compares a UTC ISO string against a timezone-less `timestamp` column

**File:** `src/lib/feed.ts:24-43, 140-145`; `src/lib/db/schema.ts:39`
**Issue:** `created_at` is declared as `timestamp("created_at")` (no `withTimezone`), so Postgres stores it without an explicit offset. The pagination cursor encodes `new Date(row.created_at).toISOString()` — always UTC with a trailing `Z` — and splices that string back into a raw SQL comparison (`created_at < ${decoded.createdAt}`). Relying on an implicit text→timestamp cast for a value that's canonically UTC, against a column type that has no timezone concept, is a correctness footgun: it depends on the DB session's timezone setting matching UTC to behave as intended, with no test verifying that assumption. If it ever doesn't, pagination can silently skip or duplicate rows at page boundaries.
**Fix:** Change the column to `timestamp("created_at", { withTimezone: true })` (Postgres `timestamptz`) for an unambiguous UTC representation regardless of session timezone, with a follow-up migration.

### WR-06: `/api/upload-url` has no rate limiting or auth, and doesn't validate uploaded content

**File:** `src/app/api/upload-url/route.ts`
**Issue:** Any caller (no auth, no CAPTCHA, no rate limit — despite `@upstash/ratelimit` being this project's own documented spam-control plan) can repeatedly POST here to mint unlimited presigned R2 PUT URLs, each valid for 300s. R2 doesn't enforce that uploaded bytes actually match the pinned `Content-Type`, so an attacker can use these presigned URLs to store arbitrary (non-image, arbitrarily large, repeated) content under the `complaints/` prefix without ever calling `submitComplaint` — pure storage/cost abuse.
**Fix:** Add a rate limiter (per-IP and/or per-device-id cookie) in front of this route before minting a presigned URL.

### WR-07: `R2_PUBLIC_BASE_URL` bypasses the project's fail-fast env validation

**File:** `src/lib/feed.ts:6-8`; `src/app/c/[id]/page.tsx:15-17`
**Issue:** Every other R2 config value (`R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in `src/lib/r2.ts`) and the DB URL (`src/lib/db/client.ts`) go through `requireEnv`, which fails fast at module load if unset. `photoUrl()` instead reads `process.env.R2_PUBLIC_BASE_URL` directly with no validation, duplicated verbatim in both files:
```ts
function photoUrl(photoKey: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${photoKey}`;
}
```
If this var is ever unset, the app doesn't fail at startup — every photo URL across the entire feed and every permalink silently becomes `"undefined/complaints/...jpg"`, a much harder failure to diagnose in production than a boot-time crash.
**Fix:** `const R2_PUBLIC_BASE_URL = requireEnv("R2_PUBLIC_BASE_URL");` at module scope, ideally centralized into one shared `photoUrl` helper imported by both files (see IN-02).

### WR-08: Permalink page has no broken-image fallback (inconsistent with the feed card)

**File:** `src/app/c/[id]/page.tsx:74-83` vs. `src/components/feed/FeedCard.tsx:41-70`
**Issue:** `FeedCard` implements an `imgError` state with a category-tile placeholder, explicitly documented as a "UI-SPEC backstop item" for a broken/404 image URL. The permalink page's `<Image>` has no `onError` handling at all — a missing/expired/misconfigured photo on a shared permalink (arguably the more important, publicly-shared surface) renders a bare broken-image box instead of the same graceful fallback the feed already provides.
**Fix:** Reuse the same `imgError` pattern (or extract a shared `PhotoTile` component consumed by both `FeedCard` and the permalink page).

### WR-09: No DB-level constraint on `category`; UI assumes it's always one of the 5 known values

**File:** `src/lib/db/schema.ts:20` (`category: text("category").notNull()`, no enum/CHECK); `src/components/feed/FeedCard.tsx:44`, `src/components/capture/CategoryPicker.tsx:30`
**Issue:** Category validity is enforced only by the zod `submissionSchema` at the Server Action boundary — nothing at the DB layer prevents an out-of-range value from ever landing in the `category` column (a future direct-DB write, a fix-up script, or any later insert path that bypasses `submitComplaint`). If that happens, `CATEGORY_ICONS[item.category]` resolves to `undefined`, and rendering `<Icon />` with an undefined component throws ("Element type is invalid"), crashing that feed row — contradicting the project's own "never crash" bar (already honored elsewhere, e.g. the dedicated not-found page for bad permalink IDs).
**Fix:** Add a DB CHECK constraint (`category IN ('pothole','garbage','streetlight','water','traffic_light')`) as defense-in-depth, and/or guard the icon lookups with a fallback (`CATEGORY_ICONS[item.category] ?? TriangleAlert`).

### WR-10: `formatDistance` boundary-rounding produces a confusing "1000 m away"

**File:** `src/lib/distance.ts:5-8`
**Issue:**
```ts
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m away`;
  return `${(distanceM / 1000).toFixed(1)} km away`;
}
```
A raw value like `999.6` takes the meters branch (`999.6 < 1000` is true), but `Math.round(999.6)` produces `1000`, so the displayed string is `"1000 m away"` — right at the boundary where the km format should apply. This reads as a display bug at exactly the 1km threshold the UI-SPEC calls out.
**Fix:** Round before branching:
```ts
const rounded = Math.round(distanceM);
if (rounded < 1000) return `${rounded} m away`;
return `${(distanceM / 1000).toFixed(1)} km away`;
```

### WR-11: `FeedList`'s infinite-scroll fetch has no in-flight guard and no error handling

**File:** `src/components/feed/FeedList.tsx:34-53, 55-67`
**Issue:** The `IntersectionObserver` callback calls `fetchNext(cursor)` on every intersection with no check on the `loading` flag:
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting) {
    fetchNext(cursor);
  }
});
```
If the sentinel leaves and re-enters the viewport while an earlier fetch for the same `cursor` is still in flight (a real scroll-bounce scenario), a second identical request fires and both responses append the same page, producing visible duplicate cards. Separately, `fetchNext`'s `try { ... } finally { setLoading(false) }` has no `catch` — a `fetch()` failure becomes an unhandled promise rejection (the observer callback calls `fetchNext(cursor)` without `.catch()`), leaving the user stuck on a "Loading more…" indicator with no retry affordance.
**Fix:**
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !loading) {
    fetchNext(cursor).catch(() => {/* surface a retry affordance */});
  }
});
```
and include `loading` in the effect's reasoning (via a ref, to avoid re-subscribing the observer on every state change).

### WR-12: Initial migration doesn't self-provision the PostGIS extension

**File:** `drizzle/0000_next_pete_wisdom.sql:1-13`
**Issue:** The migration declares `geometry(point, 4326)` and a `gist` index with no preceding `CREATE EXTENSION IF NOT EXISTS postgis;`. On any Postgres instance where PostGIS hasn't already been enabled out-of-band (a contributor's local Postgres that isn't the `postgis/postgis` image, or a fresh Supabase project before the dashboard toggle is flipped), this migration fails outright with "type \"geometry\" does not exist" — with no signal in the migration itself about the missing prerequisite.
**Fix:** Prepend an idempotent extension bootstrap:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "complaints" ( ... );
```

## Info

### IN-01: `categoryLabel` / `CATEGORY_ICONS` / `CATEGORY_TILE_STYLES` duplicated across files

**File:** `src/components/capture/CategoryPicker.tsx:8-14`, `src/components/feed/FeedCard.tsx:12-18, 24-30, 32-34`, `src/app/c/[id]/page.tsx:11-13`
**Issue:** `CATEGORY_ICONS` is copy-pasted verbatim in `CategoryPicker.tsx` and `FeedCard.tsx`; `categoryLabel()` is copy-pasted verbatim in `FeedCard.tsx` and `c/[id]/page.tsx`. Adding/renaming a category now requires updating several independent copies, with only TypeScript's `Record<Category, ...>` exhaustiveness check (and only for the maps, not the helper function) to catch a miss.
**Fix:** Extract into a shared `src/lib/category.ts` and import from all call sites.

### IN-02: `photoUrl` duplicated between `feed.ts` and the permalink page

**File:** `src/lib/feed.ts:6-8`, `src/app/c/[id]/page.tsx:15-17`
**Issue:** Identical one-line function defined twice.
**Fix:** Move to a shared module (e.g. `src/lib/photo-url.ts`) and import in both places; also resolves WR-07 in one place.

### IN-03: Feed page-size is a magic number duplicated in two independent places

**File:** `src/app/page.tsx:10` (`FEED_LIMIT = 20`), `src/app/api/feed/route.ts:5` (`DEFAULT_LIMIT = 20`)
**Issue:** These constants happen to match today, but nothing enforces that; `FeedList.fetchNext` (`src/components/feed/FeedList.tsx:34-53`) never sends an explicit `limit` param to subsequent page fetches, silently relying on the route's default equaling the SSR page's initial limit.
**Fix:** Export one shared constant and have both the SSR page and the route import it; have `FeedList` pass it explicitly instead of relying on the route default.

### IN-04: `webp`/`.jpeg` surface is validated but never actually exercised by any client code path

**File:** `src/app/api/upload-url/route.ts:7-14`, `src/types/complaint.ts:27-29`
**Issue:** `CONTENT_TYPE_BY_EXT` and the `photoKey` regex (`(jpe?g|webp)`) both accept `webp` and `.jpeg`, but `CameraCapture.tsx` always calls `canvas.toBlob(..., "image/jpeg", 0.85)` and always POSTs `{ ext: "jpg" }` — no code path produces or requests a `webp` or `.jpeg` upload. This is dead/unverifiable validated surface area that can silently drift out of sync with actual behavior, with no test exercising it.
**Fix:** Either wire up an actual `webp` capture path (smaller payload for slow networks, matching the R2 presign's 300s-timeout rationale) or drop the unused extensions from the schema/route until exercised.

### IN-05: `wrapOverlayLines` only ellipsizes the last retained line

**File:** `src/lib/overlay.ts:99-107`
**Issue:** The truncation/ellipsis pass only inspects `lines[lastIndex]`. A non-last line containing a single word wider than `maxWidth` (theoretically possible, though unlikely given the fixed overlay text format) would never be truncated and could render past the overlay bar's edges — inconsistent with the function's own stated goal that "truncation is never silent."
**Fix:** Apply the same ellipsize-if-overflowing check to every line, not just the last one.

### IN-06: `CameraCapture.handleCapture` has no unmount/cancellation guard

**File:** `src/components/capture/CameraCapture.tsx:79-188`
**Issue:** The `getUserMedia` acquire effect uses a `cancelled` flag to avoid setting state after unmount, but the async `handleCapture` flow (GPS wait, canvas draw, presign fetch, PUT) has no equivalent guard — if the component unmounts mid-flight (fast navigation away from `/capture`), its continuation still calls `setStatus`/`setError`/`setPreviewUrl` on an unmounted component.
**Fix:** Track a mounted/cancelled ref (or an `AbortController`) and no-op the state updates once torn down.

### IN-07: `submitter_id` cookie value is trusted without format validation

**File:** `src/lib/device-id.ts:11-24`
**Issue:** `getOrCreateDeviceId` returns the `kya_device_id` cookie verbatim if present, with no check that it's a well-formed UUID. The cookie is `httpOnly` so ordinary page JS can't rewrite it, but a direct HTTP client can send an arbitrary `Cookie: kya_device_id=anything` header, which then persists as-is into `submitter_id` on every complaint row. No exploitable effect today (the column isn't used for authorization/display), but an unvalidated free-form value inherited from Phase 1 could complicate a future Phase-2 migration to real identity/rate-limiting on this column.
**Fix:** Validate the cookie value looks like a UUID before trusting it; regenerate if not.

---

_Reviewed: 2026-07-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
