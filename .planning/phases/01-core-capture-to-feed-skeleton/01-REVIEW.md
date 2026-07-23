---
phase: 01-core-capture-to-feed-skeleton
reviewed: 2026-07-23T10:05:37Z
depth: standard
files_reviewed: 36
files_reviewed_list:
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
  - tests/unit/distance.test.ts
  - tests/unit/ids.test.ts
  - tests/unit/overlay.test.ts
  - tests/unit/submit-schema.test.ts
  - drizzle/0000_next_pete_wisdom.sql
findings:
  critical: 1
  warning: 8
  info: 4
  total: 13
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-23T10:05:37Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Reviewed the full capture -> upload -> submit -> feed -> permalink vertical slice. The spatial/pagination SQL (`ST_DWithin`-free but deterministic tie-broken cursors), zod re-validation of the submission payload, IDOR-safe column selection (never the internal serial id), and the CSPRNG-based device-id cookie are all solid and match the documented threat model in the code comments.

However, the single most important stated invariant of this product — **"only live in-app camera capture is allowed"** (`CLAUDE.md` Constraints; `SUBM-01` referenced throughout the capture code) — is enforced **only in the browser UI**. The server-side `submitComplaint` action never verifies that `photoKey` corresponds to an object actually uploaded to R2; it only regex-validates the *shape* of the string. Combined with the complete absence of rate limiting on both the presign and submit endpoints, this means the public, unauthenticated write path can be used to inject arbitrary fake "photo-verified" complaints into the public feed without ever touching a camera or GPS — this is a BLOCKER given the product's entire value proposition rests on photo-verified authenticity.

Beyond that, several smaller robustness/quality gaps were found: a permission-change listener leak in `PermissionGate`, a missing `.finite()` guard on the `accuracy` input that can trigger an unhandled DB integer-overflow error, silent env-var non-null assertions with no startup validation, silently-swallowed errors with no server-side logging, and a handful of duplicated helper functions across files.

## Critical Issues

### CR-01: `submitComplaint` never verifies the photo was actually uploaded — public feed can be spammed with fake, non-existent-photo complaints

**File:** `src/actions/submit-complaint.ts:28-64` (root cause), compounded by `src/types/complaint.ts:27-30` and `src/app/api/upload-url/route.ts:21-34`

**Issue:** `submissionSchema.photoKey` only checks the *format* of the key via regex:
```ts
photoKey: z.string().regex(/^complaints\/KYA-[A-Z0-9]{7}\.(jpe?g|webp)$/),
```
It never confirms the object actually exists in R2. `submitComplaint` (a Next.js Server Action, callable directly over HTTP with an arbitrary JSON body, entirely bypassing `CameraCapture`/`PermissionGate`/`captureBestFix`) inserts the row as soon as this regex passes:
```ts
const [row] = await db.insert(complaints).values({
  publicId, submitterId, category: parsed.category, location: point,
  accuracyM: Math.round(parsed.accuracy), photoKey: parsed.photoKey,
}).returning(...)
```
Any caller can POST a synthetic `photoKey` like `"complaints/KYA-AAAAAAA.jpg"` (never produced by `/api/upload-url`, never uploaded to R2) together with any category and any India-bounding-box lat/lng, and the row is published to the public feed immediately — no camera, no GPS, no CAPTCHA, no rate limit. `FeedCard`'s broken-image fallback (`imgError` -> category tile) means this doesn't even crash the UI, so the fake reports render seamlessly as "photo-verified" civic complaints. This directly contradicts the project's stated core constraint ("Only live in-app camera capture is allowed; gallery/file uploads must be blocked to reduce fake/old photo abuse") and the code's own threat-model comments (`SUBM-01`, `T-01-02`, `T-01-03`).

**Fix:** Before inserting, verify the object exists in R2 (e.g. a `HeadObjectCommand` against the exact `photoKey`, rejecting the submission if it 404s), or — better — have `/api/upload-url` persist a short-lived, single-use "pending upload" record (Redis/DB row keyed by the minted `key`, with a TTL) that `submitComplaint` must consume-and-delete atomically, guaranteeing a 1:1 relationship between a real presigned upload and a complaint row:
```ts
// upload-url/route.ts: after minting `key`, also record it as pending
await pendingUploads.set(key, { expiresAt: Date.now() + 5 * 60_000 });

// submit-complaint.ts: before insert
const pending = await pendingUploads.consume(parsed.photoKey); // delete-and-return
if (!pending) throw new Error("photo not found or already used");
```
This should ship together with basic rate limiting on both endpoints (see WR-07).

## Warnings

### WR-01: `PermissionGate` leaks `onchange` listeners and updates state after unmount

**File:** `src/components/capture/PermissionGate.tsx:59-69`
**Issue:** `camera.onchange = evaluate;` and `location.onchange = evaluate;` are assigned inside `check()`, but the effect's cleanup only sets a local `cancelled` flag — it never clears these handlers (`camera.onchange = null`), and `evaluate()` itself never checks `cancelled` before calling `setState`. If the component unmounts (e.g. user navigates away from `/capture`) and the browser later fires a permission-change event, `setState` runs on an unmounted component.
**Fix:**
```ts
const evaluate = () => {
  if (cancelled) return;
  if (camera.state === "denied") setState("camera-denied");
  else if (location.state === "denied") setState("location-denied");
  else setState("ok");
};
evaluate();
camera.onchange = evaluate;
location.onchange = evaluate;

return () => {
  cancelled = true;
  camera.onchange = null;
  location.onchange = null;
};
```

### WR-02: `accuracy` input has no upper/finite bound — `Infinity` passes validation and crashes the insert

**File:** `src/types/complaint.ts:26`
**Issue:** `accuracy: z.number().nonnegative()` accepts `Infinity` (a valid JS `number` that is `>= 0`). `submitComplaint` then does `Math.round(parsed.accuracy)` -> `Infinity`, which Postgres rejects for an `integer` column (`accuracy_m`) with an out-of-range error, surfacing as an unhandled 500 instead of a clean 400 validation error.
**Fix:**
```ts
accuracy: z.number().finite().nonnegative().max(100_000),
```

### WR-03: Device-id cookie is not marked `secure`

**File:** `src/lib/device-id.ts:17-21`
**Issue:** `store.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", maxAge: TWO_YEARS_SECONDS })` omits `secure`, so the cookie can be transmitted over a plaintext HTTP connection if one is ever reachable (e.g. a misconfigured preview/staging URL, a downgrade attack).
**Fix:** Add `secure: process.env.NODE_ENV === "production"` (or unconditionally `true`, since dev over `localhost` still works with `secure`).

### WR-04: Required env vars are accessed with blind `!` assertions, no startup validation

**File:** `src/lib/db/client.ts:6`, `src/lib/r2.ts:8-15,23`
**Issue:** `postgres(process.env.DATABASE_URL!)` and the R2 client's `R2_ACCOUNT_ID!`, `R2_ACCESS_KEY_ID!`, `R2_SECRET_ACCESS_KEY!`, `R2_BUCKET_NAME!` all use non-null assertions. If any is missing/misspelled in an environment, failure happens deep inside a third-party library at request time with an opaque error (e.g. a literal `"undefined"` in the R2 endpoint URL) instead of a clear, early "missing required env var X" failure.
**Fix:** Validate required env vars once at module load (e.g. a small `assertEnv(name)` helper or a `zod` env schema) and throw a descriptive error immediately.

### WR-05: Errors are silently swallowed with no server-side logging

**File:** `src/app/api/feed/route.ts:29-37`, `src/app/page.tsx:67-75`
**Issue:** Both `catch { return NextResponse.json({ error: "Couldn't load reports." }, { status: 500 }); }` and `catch { return <FeedErrorBanner />; }` discard the actual error object entirely — no `console.error`, no logging call of any kind. In production this makes real failures (DB outage, bad SQL, connection pool exhaustion) invisible to operators; the only signal is a generic user-facing message.
**Fix:** Log the caught error before returning the fallback response, e.g. `catch (err) { console.error("feed query failed", err); return ...; }` (or route through whatever structured logger the project adopts).

### WR-06: `formatRelativeTime` can render a negative duration on clock skew

**File:** `src/lib/distance.ts:10-17`
**Issue:** `diffMin = Math.round((Date.now() - d.getTime()) / 60_000)` is never clamped to `0`. If the querying server's clock is even slightly behind the DB server's `now()` (used for `created_at` via `defaultNow()`), or immediately after insert with sub-second skew rounding up, this can render `-1m ago` on the feed/permalink.
**Fix:**
```ts
const diffMin = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
```

### WR-07: No rate limiting or abuse quota on the presign and submit endpoints

**File:** `src/app/api/upload-url/route.ts` (whole file), `src/actions/submit-complaint.ts` (whole file)
**Issue:** Neither endpoint enforces any per-IP/per-device quota. `/api/upload-url` mints an R2 presigned PUT URL for any caller, unlimited times (storage-cost amplification vector even without CR-01). `submitComplaint` accepts unlimited inserts from a single device/browser with no cooldown. The project's own stack decisions (`CLAUDE.md` — Upstash Redis + `@upstash/ratelimit`) call this out as required spam control on exactly these endpoints, but no rate limiting is wired up yet.
**Fix:** Wrap both handlers with a sliding-window limiter keyed on `submitterId`/IP before any downstream work (presign mint, DB insert).

### WR-08: 60-second presigned URL expiry may be too short for the target network conditions

**File:** `src/lib/r2.ts:27`
**Issue:** `getSignedUrl(r2, command, { expiresIn: 60 })` gives the browser only 60 seconds to complete the PUT after the URL is minted. Given the product is explicitly India-only and mobile-first (per `CLAUDE.md` Constraints), where 3G/congested-4G upload speeds are common, a multi-MB JPEG (canvas-captured, `0.85` quality, potentially large `videoWidth`/`videoHeight`) can plausibly exceed 60s, causing the upload PUT to fail with an expired-signature error even though the user did nothing wrong.
**Fix:** Increase `expiresIn` to something more generous (e.g. 300s), or downscale the captured canvas before `toBlob` to bound upload size.

## Info

### IN-01: `photoUrl`, `categoryLabel`, and `CATEGORY_ICONS` are each duplicated verbatim across files

**File:** `src/lib/feed.ts:6-8` vs `src/app/c/[id]/page.tsx:15-17`; `src/components/feed/FeedCard.tsx:32-34` vs `src/app/c/[id]/page.tsx:11-13`; `src/components/capture/CategoryPicker.tsx:8-14` vs `src/components/feed/FeedCard.tsx:12-18`
**Issue:** Three small helpers/constants are copy-pasted identically rather than shared, so a future change (e.g. adding a trailing-slash guard to `photoUrl`, or adding a 6th category) requires remembering to update every copy in lockstep — exactly the kind of drift risk that produced the env-var/config duplication elsewhere.
**Fix:** Extract `photoUrl` into `src/lib/r2.ts` (or a new `src/lib/photo-url.ts`), `categoryLabel` and `CATEGORY_ICONS` into `src/types/complaint.ts` or a shared `src/lib/category.ts`, and import from both call sites.

### IN-02: `photoKey` schema regex accepts a `.jpeg` extension that the upload flow never produces

**File:** `src/types/complaint.ts:29`
**Issue:** The regex `\.(jpe?g|webp)$` allows `jpg`, `jpeg`, and `webp`, but `CONTENT_TYPE_BY_EXT` in `src/app/api/upload-url/route.ts:7-10` and `bodySchema` (`z.enum(["jpg", "webp"])`) only ever mint `jpg` or `webp` keys — `jpeg` is dead validation surface, exercised only by the unit test, never reachable through the real flow.
**Fix:** Tighten the regex to `\.(jpg|webp)$` to match what the system actually produces, or intentionally support `jpeg` end-to-end if there's a reason to keep it.

### IN-03: A malformed `cursor` query param is silently treated as "first page" instead of an error

**File:** `src/lib/feed.ts:28-43`
**Issue:** `decodeCursor` catches any parse failure and returns `null`, which both `nearbyFeed`/`recentFeed` treat identically to "no cursor supplied" (i.e., restart from page 1). Since `/api/feed` is a public GET endpoint that accepts an arbitrary `cursor` string from any caller, a corrupted/tampered cursor silently resets pagination rather than surfacing a `400`. If `FeedList`'s client-side append logic (`setItems((prev) => [...prev, ...page.items])`) is ever hit with a resurfaced first page, this produces duplicate `key={item.publicId}` entries in the rendered list.
**Fix:** Return a `400 Bad Request` from `/api/feed` when `cursor` is present but fails to decode, rather than silently falling back.

### IN-04: `webp` upload support is fully wired server-side but never used by the client

**File:** `src/components/capture/CameraCapture.tsx:101-115`
**Issue:** `canvas.toBlob` always encodes `"image/jpeg"` and the upload request always sends `{ ext: "jpg" }`, so the `webp` branch in `CONTENT_TYPE_BY_EXT` (`src/app/api/upload-url/route.ts`) and the schema's `webp` regex alternative are unreachable dead capability from the only real client.
**Fix:** Either wire up a `webp` capture path (smaller file size, relevant given WR-08's network concern) or remove the unused `webp` support to reduce surface area until it's needed.

---

_Reviewed: 2026-07-23T10:05:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
