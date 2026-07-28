---
phase: 01-core-capture-to-feed-skeleton
reviewed: 2026-07-28T00:00:00Z
depth: standard
files_reviewed: 42
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
  - src/components/feed/ComplaintPhoto.tsx
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
  - src/lib/sanitize-error.ts
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
  - tests/unit/sanitize-error.test.ts
  - tests/unit/submit-complaint-sanitization.test.ts
  - tests/unit/submit-schema.test.ts
findings:
  critical: 0
  warning: 15
  info: 9
  total: 24
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

This is a re-review of the capture -> upload -> submit -> feed -> permalink skeleton, against the source as it stands today (not against a diff). A prior review round on this same phase (dated 2026-07-27) flagged one Critical (raw DB error leaking to the client from `submitComplaint`) and twelve Warnings; the git history shows a dedicated gap-closure pass ("shared sanitizeError utility + permalink photo-404 fallback") landed since then. Verifying directly against the current source: **two of those findings are now fixed** — `submitComplaint` and every other UI-facing catch site now route through the shared `sanitizeError()` utility (confirmed via `tests/unit/sanitize-error.test.ts` and `tests/unit/submit-complaint-sanitization.test.ts`), and the permalink page now has a `ComplaintPhoto` component with the same broken-image -> category-tile fallback `FeedCard` already had.

**However, the large majority of the previously-flagged Warnings and Info items were not addressed and are still present in the code today** — re-verified line-by-line below rather than assumed. Notably: query strings like `/?lat=&lng=` still resolve to a fake `(0, 0)` GPS fix in three independent call sites (violates the project's own documented "never a fake (0,0) coordinate" invariant); `photoKey` still has no single-use/uniqueness enforcement, so one uploaded photo can back unlimited complaint rows; `photoExists` still collapses every R2 error (including auth/network failures) into "photo not found" with no logging; `/api/upload-url` still has no rate limiting; and the initial migration still doesn't provision the `postgis` extension it depends on. This pass also found several new issues not previously reported: an inconsistency between `SearchById`'s existence-check request and its actual navigation (including a case-sensitivity gap that will falsely reject a validly-typed lowercase ID), a missing in-flight guard in `captureBestFix`'s geolocation watch, and a type-validation gap in the feed's cursor decoder that lets a malformed `cursor` query param reach a raw SQL comparison.

No new Critical/BLOCKER-tier issues were found this round — SQL is parameterized everywhere via Drizzle's `sql` tag, no hardcoded secrets, no `eval`/`innerHTML`/XSS surface, and the opaque-`public_id` IDOR mitigation holds up.

## Warnings

### WR-01: Empty `lat`/`lng` query params still silently resolve to a fake `(0, 0)` fix (unresolved from prior review)

**File:** `src/app/page.tsx:99-101`; `src/app/c/[id]/page.tsx:42-44`; `src/app/api/feed/route.ts:15-16,25-28`
**Issue:** All three location-parsing call sites use the same pattern, e.g. (`src/app/page.tsx`):
```ts
const lat = params.lat !== undefined ? Number(params.lat) : undefined;
const lng = params.lng !== undefined ? Number(params.lng) : undefined;
const hasLocation = lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng);
```
For a URL like `/?lat=&lng=`, `searchParams`/`URLSearchParams.get()` yields an empty string `""`, not `undefined`/`null`. `Number("")` evaluates to `0`, not `NaN`, so `hasLocation` becomes `true` with `lat = 0, lng = 0`. This directly contradicts the invariant documented in `LocationRequester.tsx` ("never a fake (0,0) coordinate", D-07) and causes `nearbyFeed`/the permalink's `ST_Distance` query to sort/report distance from "Null Island" instead of falling back to the recency/no-distance path. It's reachable via any hand-crafted or malformed link (e.g. a share link with a stripped query value), and duplicated identically in three files.
**Fix:** Treat empty string the same as absent at all three sites:
```ts
const lat = params.lat !== undefined && params.lat !== "" ? Number(params.lat) : undefined;
```
or centralize into one shared `parseLatLng(searchParams)` helper used everywhere instead of re-implementing it three times.

### WR-02: `photoKey` still has no single-use enforcement (unresolved from prior review)

**File:** `src/actions/submit-complaint.ts:44-46`; `src/lib/db/schema.ts:38`; `drizzle/0000_next_pete_wisdom.sql:8`
**Issue:** `submitComplaint` only checks that the photo *exists* in R2 (`photoExists`) — never that it hasn't already been attached to a prior complaint. `photo_key` has no `UNIQUE` constraint in either the Drizzle schema or the migration, and no query guards against reuse. Since Server Actions are reachable as plain POST endpoints, anyone can call `submitComplaint` directly with the exact same valid `photoKey` from one earlier legitimate upload, varying `category`/`lat`/`lng`, and generate unlimited "photo-verified" complaint rows without touching the camera again — undermining the "live camera capture only, no reused photos" anti-abuse premise (SUBM-01, CLAUDE.md constraints).
**Fix:** Add a `UNIQUE` constraint on `photo_key` and let the existing unique-violation handling in `submitComplaint` surface a clear rejection (note: this reuses the same `isUniqueViolation`/23505 code path already wired up for `public_id`).

### WR-03: `CameraCapture.handleCapture` has no reentrancy guard (unresolved from prior review)

**File:** `src/components/capture/CameraCapture.tsx:80-102,260-266`
**Issue:** `handlePublish` in `capture/page.tsx` explicitly implements a single-flight guard (`publishPhase !== "idle"`) to stop a double-tap from double-submitting. `handleCapture` has no equivalent guard — the Capture button's `disabled` prop depends on `status`, which only updates *after* the async function starts running (React state updates are not synchronous), so two rapid taps before the first re-render can both pass through and run concurrently: two GPS reads, two canvas draws, two presigned uploads to two different R2 keys, with the later `onCaptured(key)` call silently winning.
**Fix:** Add a ref-based in-flight guard mirroring the pattern already used for publish:
```ts
const capturingRef = useRef(false);
async function handleCapture() {
  if (capturingRef.current) return;
  capturingRef.current = true;
  try { /* existing body */ } finally { capturingRef.current = false; }
}
```

### WR-04: `photoExists` still collapses every R2/SDK error into "photo not found", with no logging (unresolved from prior review)

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
This catch is unconditional — a genuine 404 (`NotFound`), an R2 credential/permission misconfiguration (`AccessDenied`), a network timeout, or a transient 5xx are all indistinguishable and collapse to `false`. Because `submitComplaint` treats `false` as "reject the submission with 'Photo not found — please retake and upload the photo,'" a misconfigured or transiently-unreachable R2 endpoint would silently block **every** legitimate submission with a misleading message — and there is no `console.error`/logging anywhere in this path, so the real cause (e.g. bad credentials after a key rotation) leaves zero diagnostic trail in production logs. This is exactly the class of silent failure `sanitizeError` was introduced elsewhere in this codebase to avoid.
**Fix:**
```ts
export async function photoExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name !== "NotFound") {
      console.error("photoExists: unexpected R2 error", err);
    }
    return false;
  }
}
```

### WR-05: `created_at` has no timezone; cursor pagination compares a UTC ISO string against it via implicit cast (unresolved from prior review)

**File:** `src/lib/db/schema.ts:39`; `drizzle/0000_next_pete_wisdom.sql:9`; `src/lib/feed.ts:81-88,140-145`
**Issue:** `created_at` is declared as `timestamp("created_at")` with no `withTimezone: true`, so Postgres stores it without an explicit offset (`timestamp` not `timestamptz`). The pagination cursor encodes `new Date(row.created_at).toISOString()` — always UTC with a trailing `Z` — and splices that string into a raw SQL comparison (`created_at < ${decoded.createdAt}` / the analogous `nearbyFeed` tie-break). This relies on an implicit text→timestamp cast for a canonically-UTC value against a column with no timezone concept, which is correct only if the DB session's timezone is UTC. Nothing in this codebase enforces or tests that assumption; if the DB session timezone is ever anything else, pagination can silently skip or duplicate rows at page boundaries.
**Fix:** Change the column to `timestamp("created_at", { withTimezone: true })` (Postgres `timestamptz`) via a follow-up migration for an unambiguous UTC representation regardless of session timezone.

### WR-06: `/api/upload-url` still has no rate limiting/auth and doesn't validate uploaded content (unresolved from prior review)

**File:** `src/app/api/upload-url/route.ts:21-34`
**Issue:** This route is fully public with no auth, no CAPTCHA, and no per-IP/per-device throttling — despite `@upstash/ratelimit` being this project's own documented mitigation for exactly this kind of cost-triggering endpoint (CLAUDE.md). Any caller can repeatedly `POST` here to mint unlimited valid, 300-second presigned PUT URLs to the R2 bucket, and use each to write arbitrary bytes under `complaints/…` (R2 pins `Content-Type` via the signature, but nothing checks that the *body* is actually a valid JPEG/WebP) — independent of whether a complaint row is ever created for it. This is a real storage-cost/abuse vector with zero mitigation currently wired up.
**Fix:** Wire up rate limiting (per-IP and/or per-`kya_device_id`-cookie) on this route before it's exposed to real traffic.

### WR-07: `R2_PUBLIC_BASE_URL` still bypasses the project's own fail-fast env validation (unresolved from prior review)

**File:** `src/lib/feed.ts:6-8`; `src/app/c/[id]/page.tsx:15-17`
**Issue:** Every other required env var in this codebase (`DATABASE_URL` in `src/lib/db/client.ts`; `R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in `src/lib/r2.ts`) goes through `requireEnv()`, which throws a clear "Missing required environment variable" error at module load if unset — explicitly to prevent "a literal `undefined` baked into" a constructed URL (see `src/lib/env.ts`'s own doc comment). `R2_PUBLIC_BASE_URL` is the one exception, duplicated verbatim in two files:
```ts
function photoUrl(photoKey: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${photoKey}`;
}
```
If this var is ever unset/misconfigured, the app doesn't fail at startup — every photo URL across the entire feed and every permalink silently becomes `"undefined/complaints/....jpg"`. The existing `onError`-based category-tile fallback (`FeedCard`, `ComplaintPhoto`) masks this as an ordinary "broken photo" case, so a total misconfiguration could ship to production unnoticed.
**Fix:** Route this through `requireEnv("R2_PUBLIC_BASE_URL")` in a single shared `photoUrl` helper (see IN-02) instead of two independent raw `process.env` reads.

### WR-08: No DB-level constraint on `category`; an out-of-range value would crash a feed card's render (unresolved from prior review)

**File:** `src/lib/db/schema.ts:20`; `drizzle/0000_next_pete_wisdom.sql:5`; `src/components/feed/FeedCard.tsx:44`; `src/components/feed/ComplaintPhoto.tsx:43`
**Issue:** Category validity is enforced only by the zod `submissionSchema` at the `submitComplaint` boundary — nothing at the DB layer (no enum type, no `CHECK` constraint) prevents an out-of-range value from ever landing in the `category` column via any future direct-DB write or alternate insert path. If that happens, `CATEGORY_ICONS[item.category]` (in `FeedCard` and `ComplaintPhoto`) resolves to `undefined`, and rendering `<Icon />` with an undefined component throws ("Element type is invalid"), crashing that render — contradicting this project's own "never crash, always show a graceful fallback" bar it otherwise holds itself to (e.g. the dedicated not-found page for a bad permalink ID).
**Fix:** Add a DB `CHECK` constraint (`category IN ('pothole','garbage','streetlight','water','traffic_light')`) as defense-in-depth, and/or guard every icon lookup with a fallback (`CATEGORY_ICONS[item.category] ?? TriangleAlert`).

### WR-09: `formatDistance` rounds after branching, producing a confusing "1000 m away" at the 1km boundary (unresolved from prior review)

**File:** `src/lib/distance.ts:5-8`
**Issue:**
```ts
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m away`;
  return `${(distanceM / 1000).toFixed(1)} km away`;
}
```
A raw value like `999.6` takes the meters branch (`999.6 < 1000` is true), but `Math.round(999.6)` produces `1000`, so the rendered string is `"1000 m away"` — exactly at the boundary where the UI-SPEC's own km format should apply. `tests/unit/distance.test.ts` never exercises this specific boundary (it tests `449.6` and `2300`, not `999.5`-`999.99`), so this regression would ship silently.
**Fix:** Round before branching:
```ts
const rounded = Math.round(distanceM);
return rounded < 1000 ? `${rounded} m away` : `${(distanceM / 1000).toFixed(1)} km away`;
```

### WR-10: `FeedList`'s infinite-scroll fetch has no in-flight guard and no error handling (unresolved + extended from prior review)

**File:** `src/components/feed/FeedList.tsx:34-53,55-67`
**Issue:** The `IntersectionObserver` callback fires `fetchNext(cursor)` on every intersection with no check against the existing `loading` state:
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting) {
    fetchNext(cursor);
  }
});
```
If the sentinel re-triggers intersection (scroll bounce, resize/orientation change, or simply staying visible because an appended page didn't grow the list far enough) while an earlier fetch for the *same* `cursor` is still in flight, a second identical request fires before `cursor` has advanced — both responses append into `items`, producing duplicate `FeedCard`s with duplicate `key={item.publicId}` (a React key collision plus a visibly duplicated card). Separately, `fetchNext`'s `try { ... } finally { setLoading(false) }` has no `catch` — a network failure inside `fetch()` becomes an unhandled promise rejection (the observer callback never attaches `.catch()`), leaving the user stuck on "Loading more…" with no retry affordance.
**Fix:**
```ts
const loadingRef = useRef(false);
// ...inside fetchNext: loadingRef.current = true; ... finally { loadingRef.current = false; setLoading(false); }
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !loadingRef.current) {
    fetchNext(cursor).catch(() => {/* surface a retry affordance */});
  }
});
```

### WR-11: Initial migration doesn't provision the PostGIS extension it depends on (unresolved from prior review)

**File:** `drizzle/0000_next_pete_wisdom.sql:1-13`
**Issue:** The migration declares `geometry(point, 4326)` and a `gist` index with no preceding `CREATE EXTENSION IF NOT EXISTS postgis;`. On any Postgres instance where PostGIS hasn't already been enabled out-of-band (a contributor's local Postgres that isn't the `postgis/postgis` Docker image, or a fresh Supabase project before the dashboard extension toggle is flipped — both explicitly called out as required manual steps in CLAUDE.md's stack notes), this migration fails outright with `type "geometry" does not exist`, with no signal in the migration file itself about the missing prerequisite.
**Fix:** Prepend an idempotent extension bootstrap:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "complaints" ( ... );
```

### WR-12: `SearchById`'s existence-check request and its actual navigation use inconsistent URL encoding

**File:** `src/components/feed/SearchById.tsx:40-42`
**Issue:**
```ts
const res = await fetch(`/c/${encodeURIComponent(id)}`, { method: "GET" });
if (res.ok) {
  router.push(`/c/${id}`); // id is NOT encoded here
}
```
The existence check encodes `id`, but the subsequent navigation does not. For the normal `KYA-XXXXXXX` ID shape these are identical, so this is latent today — but `extractId` (below) accepts arbitrary typed text as a literal ID whenever it doesn't match the `/c/…` URL-segment pattern, so a value containing e.g. `/`, `?`, or `#` reaches this code path unencoded on navigation while the check ran against an encoded (and therefore different single-segment) URL — the two requests can resolve to different logical routes.
**Fix:** Reuse one encoded value for both operations:
```ts
const encoded = encodeURIComponent(id);
const res = await fetch(`/c/${encoded}`, { method: "GET" });
if (res.ok) router.push(`/c/${encoded}`);
```

### WR-13: `SearchById` performs a case-sensitive ID match — a validly-typed lowercase ID is falsely reported as not found

**File:** `src/components/feed/SearchById.tsx:14-18,40`; `src/app/c/[id]/page.tsx:51,57` (`WHERE public_id = ${id}`)
**Issue:** `generatePublicId()` (`src/lib/ids.ts`) always produces an uppercase suffix, and the permalink lookup (`WHERE public_id = ${id}`) is a case-sensitive Postgres `text` equality match. `extractId` only trims whitespace — it never normalizes case:
```ts
function extractId(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(PERMALINK_SEGMENT_RE);
  return match ? match[1] : trimmed;
}
```
A user who types their ID in lowercase (a natural way to transcribe an alphanumeric code read aloud, e.g. `kya-7f3xabc`) gets a false "We couldn't find a report with that ID" even though the report exists.
**Fix:** Normalize case in `extractId` (`.toUpperCase()` on the returned value), or perform a case-insensitive lookup (`WHERE public_id = UPPER(${id})`) as a second line of defense.

### WR-14: `captureBestFix`'s geolocation watch is not cleared on early rejection

**File:** `src/lib/geolocation.ts:27-31,36-48`
**Issue:** When the error callback fires before any position has been seen (`!best`), the code calls `reject(err)` immediately, but `navigator.geolocation.clearWatch(watchId)` only ever runs inside the `setTimeout` scheduled for the full `waitMs` later:
```ts
(err) => {
  if (!best) reject(err);   // the promise settles here...
},
...
setTimeout(() => {
  navigator.geolocation.clearWatch(watchId);   // ...but the watch isn't torn down until here
  ...
}, waitMs);
```
Between the early rejection and the deferred `clearWatch`, the browser's geolocation watch stays active for up to `waitMs` (4s default) with no purpose — wasted battery/location-hardware cycles against a promise that already settled.
**Fix:** Clear the watch (and the pending timeout) at the moment either outcome is decided, not just at the natural end of the window, e.g. by wrapping both `resolve`/`reject` call sites in a shared `settle()` helper that calls `clearWatch`/`clearTimeout` first.

### WR-15: `decodeCursor` doesn't validate `distanceM`'s type before it reaches a raw SQL comparison

**File:** `src/lib/feed.ts:28-43,81-88`
**Issue:** `decodeCursor` type-checks `createdAt` and `publicId` but never validates `distanceM`:
```ts
if (
  typeof parsed !== "object" ||
  parsed === null ||
  typeof parsed.createdAt !== "string" ||
  typeof parsed.publicId !== "string"
) {
  return null;
}
return parsed as FeedCursor;
```
`cursor` is a fully client-controlled, base64url-decoded, freely-editable value (`GET /api/feed?cursor=...`). A crafted cursor with a non-numeric `distanceM` (e.g. `{"createdAt":"...","publicId":"...","distanceM":"not-a-number"}`) passes this check and is interpolated directly into `nearbyFeed`'s `distance_m > ${decoded.distanceM}` comparison, which Postgres rejects with a type-cast error. The route's catch-all turns this into an opaque generic 500 rather than a clean "invalid cursor" response.
**Fix:** Reject cursors where `distanceM` is present but not a finite number:
```ts
if (
  ... ||
  (parsed.distanceM !== undefined &&
    (typeof parsed.distanceM !== "number" || !Number.isFinite(parsed.distanceM)))
) {
  return null;
}
```

## Info

### IN-01: Unreachable dead code after the retry loop in `submitComplaint`

**File:** `src/actions/submit-complaint.ts:56-86`
**Issue:** Every iteration of the `for` loop either `return`s (success) or `throw`s inside the `catch` (immediately for a non-unique-violation error, or unconditionally once `attempt === MAX_ID_ATTEMPTS - 1`). There is no path by which the loop completes and falls through to the trailing statement:
```ts
throw new Error(
  sanitizeError(lastError, SANITIZED_PUBLISH_MESSAGE, "submitComplaint exhausted id attempts"),
);
```
This exists only to satisfy TypeScript's control-flow analysis and can never actually execute.
**Fix:** Harmless as-is; consider a short comment noting it's unreachable TS-appeasement code, or restructure as `while (true)` with an explicit counter so the "always throws or returns" invariant is clearer to future readers.

### IN-02: `photoUrl()` duplicated verbatim between `feed.ts` and the permalink page

**File:** `src/lib/feed.ts:6-8`; `src/app/c/[id]/page.tsx:15-17`
**Issue:** Both files define an identical `photoUrl(photoKey)` helper. A future change to the photo-URL scheme (CDN prefix, signing, trailing-slash fix, or wiring up `requireEnv` per WR-07) requires remembering to update both copies.
**Fix:** Extract to a shared module (e.g. `src/lib/photo-url.ts`) and import from both call sites.

### IN-03: `CATEGORY_ICONS` / `categoryLabel` duplicated across four files

**File:** `src/components/capture/CategoryPicker.tsx:8-14`; `src/components/feed/FeedCard.tsx:12-18,32-34`; `src/components/feed/ComplaintPhoto.tsx:12-18`; `src/app/c/[id]/page.tsx:11-13`
**Issue:** `CATEGORY_ICONS` is copy-pasted verbatim in three components (the new `ComplaintPhoto.tsx` added since the last review round makes this a third copy, not just two); `categoryLabel()` is copy-pasted verbatim in `FeedCard.tsx` and `c/[id]/page.tsx`. Adding, renaming, or reordering a category now requires updating several independent copies in lockstep, with only TypeScript's `Record<Category, ...>` exhaustiveness check (and only for the icon maps, not the label helper) to catch a miss.
**Fix:** Extract into a shared `src/lib/category.ts` and import from all four call sites.

### IN-04: Feed page-size is a magic number duplicated in two places, and never passed explicitly on subsequent pages

**File:** `src/app/page.tsx:10` (`FEED_LIMIT = 20`); `src/app/api/feed/route.ts:6` (`DEFAULT_LIMIT = 20`); `src/components/feed/FeedList.tsx:34-53`
**Issue:** These constants happen to match today, but nothing enforces that, and `FeedList.fetchNext` never sends an explicit `limit` param on subsequent page requests — it silently relies on the route's default equaling the SSR page's initial limit.
**Fix:** Export one shared constant, have both the SSR page and the route import it, and have `FeedList` pass it explicitly rather than depending on the route's default.

### IN-05: `webp`/`.jpeg` are validated but never actually produced by any client code path, and the `photoKey` regex is looser than the real ID alphabet

**File:** `src/app/api/upload-url/route.ts:7-14`; `src/types/complaint.ts:27-29`; `src/lib/ids.ts:5`
**Issue:** `CONTENT_TYPE_BY_EXT` and the `photoKey` regex (`(jpe?g|webp)`) both accept `webp` and `.jpeg`, but `CameraCapture.tsx` always calls `canvas.toBlob(..., "image/jpeg", 0.85)` and always POSTs `{ ext: "jpg" }` — no code path currently produces or requests a `webp`/`.jpeg` upload, so that surface is unverified by any test. Separately, the regex's `[A-Z0-9]{7}` accepts any of 36 characters, while `generatePublicId`'s alphabet excludes `0`, `O`, `1`, `I`, `L` (32 symbols) — the validation is a strict superset of what can ever legitimately exist. Not currently exploitable (the R2 key is always server-derived), but worth tightening if this schema is ever reused somewhere the key becomes client-influenced.
**Fix:** Either wire up an actual `webp` capture path (smaller payload — relevant for the India/mobile-network target) or drop the unused extensions until exercised by a real code path and test; tighten the regex to the actual `ALPHABET` exported from `src/lib/ids.ts`.

### IN-06: `wrapOverlayLines` only ellipsizes the last retained line

**File:** `src/lib/overlay.ts:99-107`
**Issue:** The truncation/ellipsis pass only inspects `lines[lastIndex]`. A non-last line containing a single word wider than `maxWidth` (unlikely given the fixed overlay text format, but not structurally prevented) would never be truncated and could render past the overlay bar's edges — inconsistent with the function's own stated goal that "truncation is never silent."
**Fix:** Apply the same ellipsize-if-overflowing check to every line, not just the last one.

### IN-07: `CameraCapture.handleCapture` has no unmount/cancellation guard

**File:** `src/components/capture/CameraCapture.tsx:80-201`
**Issue:** The `getUserMedia` acquire effect uses a `cancelled` flag to avoid setting state after unmount, but the async `handleCapture` flow (GPS wait, canvas draw, presign fetch, PUT) has no equivalent guard — if the component unmounts mid-flight (fast navigation away from `/capture`), its continuation still calls `setStatus`/`setError`/`setPreviewUrl` on an unmounted component.
**Fix:** Track a mounted/cancelled ref (or an `AbortController`) shared with the acquire effect, and no-op the state updates once torn down.

### IN-08: `submitter_id` cookie value is trusted without format validation

**File:** `src/lib/device-id.ts:11-24`
**Issue:** `getOrCreateDeviceId` returns the `kya_device_id` cookie verbatim if present, with no check that it's a well-formed UUID. The cookie is `httpOnly` so ordinary page JS can't rewrite it, but a direct HTTP client can send an arbitrary `Cookie: kya_device_id=anything` header, which then persists as-is into `submitter_id` on every complaint row. No exploitable effect today (the column isn't used for authorization/display in this phase), but an unvalidated free-form value could complicate a future Phase-2 migration to real identity/per-user rate-limiting on this column.
**Fix:** Validate the cookie value looks like a UUID before trusting it; regenerate if not.

### IN-09: No consistency check between the capture-time overlay geotag and the publish-time persisted location

**File:** `src/components/capture/CameraCapture.tsx:111-147`; `src/app/capture/page.tsx:43-60`
**Issue:** The geotag+timestamp burned into the photo comes from a `captureBestFix()` call in `CameraCapture.handleCapture`; the coordinates actually persisted to the DB come from a second, independent `captureBestFix()` call in `capture/page.tsx`'s `handlePublish`, taken at a different time. This is a deliberate, documented trade-off (each read serves a different purpose), but there's no check that the two agree — if the device moves or GPS drifts meaningfully between the two ~4s windows, the visible "anti-fraud" geotag burned into the image can diverge from the location the complaint is actually filed/sorted under.
**Fix:** Consider a sanity check that flags (not necessarily blocks) a submission where the two reads differ by more than a reasonable threshold (e.g. > 200m), for future observability/moderation.

---

_Reviewed: 2026-07-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
