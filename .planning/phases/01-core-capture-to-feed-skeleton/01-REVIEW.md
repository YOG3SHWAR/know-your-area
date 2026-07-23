---
phase: 01-core-capture-to-feed-skeleton
reviewed: 2026-07-23T00:00:00Z
depth: standard
files_reviewed: 39
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
  - src/lib/env.ts
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
  warning: 6
  info: 6
  total: 13
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-23
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

Fresh full pass over the complete current phase-01 file set, including the three gap-closure plans (01-05 permission-escalation hard-block wiring, 01-06 DB client TLS/pooler hardening, 01-07 production feed verification). This supersedes the prior `01-REVIEW.md` pass over plans 01-01–01-04.

Good news first: nearly every finding from the prior review pass has since been genuinely fixed and verified in the current code — `submitComplaint` now calls `photoExists()` (an R2 `HeadObjectCommand`) before inserting, `accuracy` is now `.finite().max(100_000)`, the device-id cookie is now `secure` in production, `requireEnv` replaced the blind `!` env-var assertions in `db/client.ts` and `r2.ts`, both `/api/feed` and the SSR feed path now log caught errors, `formatRelativeTime` now clamps to `0`, `PermissionGate`'s cleanup now clears `onchange` handlers, and the presigned-URL expiry is now 300s (was 60s). These are not re-reported here.

This pass found one new BLOCKER: the overlay line-wrapping logic in `src/lib/overlay.ts` silently drops words once a second line starts, meaning the burned-in timestamp — the core artifact the D-02 anti-fraud overlay feature exists to produce — can be missing from the stored photo whenever the coordinate/accuracy text alone fills the first line. No test (unit or e2e) currently exercises this path.

Beyond that, review surfaced new robustness gaps (a missing concurrency guard in `FeedList`'s infinite scroll, an unguarded synchronous canvas-capture path in `CameraCapture`, a DB client with no dev-mode singleton guard, a `Promise.all`-based permission check that can fail open for both permissions together) plus several carried-forward, still-unresolved Info-level items from the prior pass (duplicated `photoUrl`/`categoryLabel`/`CATEGORY_ICONS` helpers, a dead `.jpeg` validation branch, silent handling of a malformed pagination cursor, and unused server-side `webp` support) and the still-open rate-limiting gap on the two write endpoints.

## Critical Issues

### CR-01: Overlay line-wrapping silently drops words after the second line starts, losing the burned-in timestamp

**File:** `src/lib/overlay.ts:59-68`
**Issue:** `wrapOverlayLines` is meant to wrap the geotag+timestamp string onto up to `OVERLAY_MAX_LINES` (2) lines. The loop body is:

```js
for (const word of words) {
  const candidate = current ? `${current} ${word}` : word;
  if (current === "" || ctx.measureText(candidate).width <= maxWidth) {
    current = candidate;
    continue;
  }
  lines.push(current);
  current = word;
  if (lines.length === OVERLAY_MAX_LINES - 1) break;   // fires as soon as line 2 STARTS
}
if (current) lines.push(current);
```

`OVERLAY_MAX_LINES - 1` is `1`. The moment the first line is completed and pushed (`lines.length` becomes `1`), the loop immediately `break`s — but at that point `current` has only just been set to the single word that overflowed line 1. Every subsequent word in `words` is never visited again; the loop doesn't continue accumulating the second line, it just stops. The post-loop `if (current) lines.push(current)` then pushes that lone leftover word as "line 2", and the rest of the string is silently discarded.

Concretely, for the real overlay string produced by `formatOverlayText` (e.g. `"12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03"`), if the first line fills up around `"12.9716, 77.5946 · ±18m"`, the second line ends up being just `"·"` and the entire date/time (`"23 Jul 2026, 14:03"`) is dropped from the rendered overlay — the "graceful truncation" logic further down never catches this because it only ellipsizes a line that itself overflows `maxWidth`, and a 1-word line rarely does.

This directly undermines the CLAUDE.md/D-02 requirement to "burn a visible/embedded geotag+timestamp overlay onto the image at the moment of capture" — the exact artifact this feature exists to guarantee (a verifiable, non-spoofable timestamp+location baked into the image bytes) can be silently missing whenever wrapping to a second line is triggered, which is a common case given the string's length relative to typical mobile photo widths. `tests/unit/overlay.test.ts` only exercises `formatOverlayText` (pure string formatting) — `wrapOverlayLines`/`drawOverlay` (which need canvas metrics) have no test coverage, which is exactly why this shipped undetected.

**Fix:** Remove the premature `break`, or change the exit condition to only stop once the *last allowed* line is itself full, not the moment it starts:

```js
for (const word of words) {
  const candidate = current ? `${current} ${word}` : word;
  if (current === "" || ctx.measureText(candidate).width <= maxWidth) {
    current = candidate;
    continue;
  }
  lines.push(current);
  current = word;
  if (lines.length >= OVERLAY_MAX_LINES) break;
}
if (current) lines.push(current);
if (lines.length > OVERLAY_MAX_LINES) lines.length = OVERLAY_MAX_LINES;
```

Add a unit test (with a minimal stub `CanvasRenderingContext2D`-like object providing `measureText`) that asserts a long overlay string retains its date/time substring on the second line rather than losing words when the coordinate/accuracy prefix alone fills line 1.

## Warnings

### WR-01: `FeedList`'s infinite-scroll fetch has no concurrency guard — risk of duplicate cards

**File:** `src/components/feed/FeedList.tsx:34-67`
**Issue:** The `IntersectionObserver` callback calls `fetchNext(cursor)` directly whenever `entries[0]?.isIntersecting` is true, with no check against the existing `loading` state:

```js
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting) {
    fetchNext(cursor);
  }
});
```

The observer/effect is only re-created when `cursor` changes (i.e., after a fetch resolves), so while a fetch is in flight the same observer keeps watching the sentinel with the same stale `cursor` value. If the intersection callback fires again before the in-flight request resolves (plausible while the user keeps scrolling, or if the browser re-fires for the same visibility transition), `fetchNext` is invoked a second time with the identical cursor, and both responses get appended via `setItems((prev) => [...prev, ...page.items])` — producing duplicate `FeedCard` entries and a duplicate React `key={item.publicId}`.
**Fix:**
```js
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !loading) {
    fetchNext(cursor);
  }
});
```
(adding `loading` to the effect's dependency array), or track an in-flight ref inside `fetchNext` itself so a duplicate call with the same cursor is a no-op.

### WR-02: `CameraCapture.handleCapture` has no error handling around the synchronous canvas-capture setup

**File:** `src/components/capture/CameraCapture.tsx:69-91`
**Issue:**
```js
const track = stream.getVideoTracks()[0];
const { width, height } = track.getSettings();
const canvas = document.createElement("canvas");
canvas.width = width ?? video.videoWidth;
canvas.height = height ?? video.videoHeight;
const ctx = canvas.getContext("2d");
if (!ctx) { ... }
ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
```
If `stream.getVideoTracks()` returns an empty array (e.g. the track ended after the user revoked camera access mid-session, or the device disconnected), `track` is `undefined` and `track.getSettings()` throws synchronously. Because `handleCapture` is an async function invoked from an `onClick` handler without being awaited by the caller, this becomes an unhandled promise rejection: no `error` state is set, `status` never leaves `"ready"`, and the user is left with a "Capture Photo" button that silently does nothing — unlike every other failure path in this component, which surfaces a friendly message. The later `ctx` null-check is already guarded; this earlier block is not.
**Fix:**
```js
const track = stream.getVideoTracks()[0];
if (!track) {
  setError("Couldn't capture the photo.");
  setStatus("error");
  return;
}
```

### WR-03: Postgres client is instantiated at module load with no dev-mode singleton guard

**File:** `src/lib/db/client.ts:32-35`
**Issue:**
```js
const databaseUrl = requireEnv("DATABASE_URL");
const queryClient = postgres(databaseUrl, buildClientOptions(databaseUrl));
export const db = drizzle(queryClient, { schema });
```
This opens a real `postgres.js` connection pool as a side effect of importing the module, with nothing caching it across Next.js dev-server module re-evaluations. The standard mitigation (used by Prisma/Drizzle guides for exactly this reason) is to stash the client on `globalThis` in development so Next.js Fast Refresh reuses the same pool instead of opening a new one on repeated re-imports. Without it, active local development can exhaust Postgres connection limits (especially relevant against Supabase's free-tier connection caps, called out elsewhere in this same codebase's CLAUDE.md).
**Fix:**
```ts
declare global {
  // eslint-disable-next-line no-var
  var __kyaPgClient: ReturnType<typeof postgres> | undefined;
}
const queryClient =
  process.env.NODE_ENV === "production"
    ? postgres(databaseUrl, buildClientOptions(databaseUrl))
    : (globalThis.__kyaPgClient ??= postgres(databaseUrl, buildClientOptions(databaseUrl)));
```

### WR-04: Duplicated `photoUrl` helper bypasses the project's own `requireEnv` fail-fast convention

**File:** `src/lib/feed.ts:6-8`, `src/app/c/[id]/page.tsx:15-17`
**Issue:** Both files independently define an identical function:
```js
function photoUrl(photoKey: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${photoKey}`;
}
```
`process.env.R2_PUBLIC_BASE_URL` is read directly with no validation — unlike every other required env var in this codebase (`R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `DATABASE_URL`), which all go through `requireEnv` (added, per its own comment in `src/lib/env.ts`, specifically to stop "a literal `undefined` baked into" a URL from failing silently deep inside a request). If `R2_PUBLIC_BASE_URL` is unset or misconfigured, every photo in the feed and every permalink silently renders `undefined/complaints/...` (a broken image, no error) instead of failing fast at startup like its sibling env vars — reintroducing the exact class of bug `requireEnv` was written to prevent.
**Fix:** Extract one shared helper (e.g. into `src/lib/r2.ts`) using `requireEnv("R2_PUBLIC_BASE_URL")`, and import it from both `feed.ts` and `c/[id]/page.tsx`:
```js
export function photoUrl(photoKey: string): string {
  return `${requireEnv("R2_PUBLIC_BASE_URL")}/${photoKey}`;
}
```

### WR-05: `PermissionGate`'s `Promise.all` permission check fails open for *both* permissions if either query throws

**File:** `src/components/capture/PermissionGate.tsx:66-96`
**Issue:**
```js
const [queriedCamera, queriedLocation] = await Promise.all([
  navigator.permissions.query({ name: "camera" }),
  navigator.permissions.query({ name: "geolocation" }),
]);
```
`Promise.all` rejects as soon as either query rejects. The `catch` block below unconditionally does `if (!cancelled && !deniedRef.current) setState("ok")`. So if, say, the `camera` query throws (an unsupported permission name on some browser/version) while `geolocation` is genuinely `denied`, the whole proactive check falls back to `"ok"` — the real geolocation denial is never surfaced by this proactive path at all, and the capture UI briefly renders as usable. In practice this is masked by the `reportDenied` escalation wired into `CameraCapture` (a real `getCurrentPosition`/`watchPosition` call will still fail and escalate), but the proactive, no-interaction check this component exists to provide has a silent blind spot whenever either permission name isn't queryable on a given browser.
**Fix:** Query independently so one unsupported/erroring permission name doesn't suppress a genuine `denied` result on the other:
```js
const [camResult, locResult] = await Promise.allSettled([
  navigator.permissions.query({ name: "camera" }),
  navigator.permissions.query({ name: "geolocation" }),
]);
camera = camResult.status === "fulfilled" ? camResult.value : undefined;
location = locResult.status === "fulfilled" ? locResult.value : undefined;
```

### WR-06: No server-side rate limiting on photo-upload URL minting or complaint submission (carried forward, still unresolved)

**File:** `src/app/api/upload-url/route.ts:21-34`, `src/actions/submit-complaint.ts:29-77`
**Issue:** Neither the presigned-upload-URL endpoint nor the `submitComplaint` server action has any throttling. Both are reachable by any unauthenticated client (only a device-id cookie, no login) and both trigger real cost/state: `POST /api/upload-url` mints a real R2 presigned PUT URL on every call with no cap, and `submitComplaint` inserts a DB row (after only a cheap `HeadObjectCommand` check, now that CR-01 from the prior review pass is fixed) with no per-device/IP submission cap. A scripted client can loop both endpoints to mint R2 credentials and/or flood the public feed with complaints (re-using one real uploaded photo across many `submitComplaint` calls, since nothing marks a `photoKey` as consumed after first use). CLAUDE.md's own stack decisions call this out explicitly as required spam control on exactly these code paths ("Wrap every endpoint that costs money downstream... with a sliding-window limiter").
**Fix:** If intentionally deferred to a later phase, record that explicitly in the phase's deferred-items log; otherwise add `@upstash/ratelimit` (or an equivalent limiter) in front of both `POST /api/upload-url` and `submitComplaint`, keyed on the device-id cookie and/or IP, and consider marking a `photoKey` consumed after its first successful `submitComplaint` use.

## Info

### IN-01: Inconsistent error-logging shape between the SSR feed path and the API feed route

**File:** `src/app/page.tsx:73-76`, `src/app/api/feed/route.ts:40-45`
**Issue:** Plan 01-06 specifically upgraded `GET /api/feed`'s catch block to log structured `name`/`message`/`code` fields server-side (to make a future production 500 greppable in Vercel logs, per G-01-EXTRA-1). `src/app/page.tsx`'s `FeedContent` server component has an equivalent `try/catch` around the same `nearbyFeed`/`recentFeed` calls but still does `console.error("feed query failed", err)` — logging the raw `Error` object rather than the same structured shape. If a future production incident manifests only on the SSR path (not the `/api/feed` route), diagnosis is inconsistent with the pattern just established elsewhere in this same phase.
**Fix:** Extract a shared `logFeedError(err: unknown)` helper used by both `route.ts` and `page.tsx`.

### IN-02: Captured photo (with burned-in overlay) is never shown to the user before Publish

**File:** `src/components/capture/CameraCapture.tsx:163-193`
**Issue:** After a successful capture (`status === "captured"`), the component still renders the live `<video>` element — the actual captured frame (with the geotag/timestamp overlay burned in) is never displayed. The user has no way to visually confirm the photo (or the overlay text, given CR-01 above) before tapping "Publish Report" on the parent page.
**Fix:** Consider rendering the captured blob (e.g. `URL.createObjectURL(blob)` into an `<img>`) once `status === "captured"`, replacing the live preview, so the user can confirm the photo before submitting.

### IN-03: `categoryLabel` and `CATEGORY_ICONS` are duplicated verbatim across files (carried forward, still unresolved)

**File:** `src/components/feed/FeedCard.tsx:12-18,32-34` vs `src/app/c/[id]/page.tsx:11-13`; `src/components/capture/CategoryPicker.tsx:8-14` vs `src/components/feed/FeedCard.tsx:12-18`
**Issue:** The `categoryLabel` lookup function and the `CATEGORY_ICONS` icon map are each copy-pasted identically in two places rather than shared, so a future change (e.g. adding a 6th category, changing an icon) requires remembering to update every copy in lockstep.
**Fix:** Extract `categoryLabel` and `CATEGORY_ICONS` into `src/types/complaint.ts` or a new shared `src/lib/category.ts`, and import from both call sites.

### IN-04: `photoKey` schema regex accepts a `.jpeg` extension that the upload flow never produces (carried forward, still unresolved)

**File:** `src/types/complaint.ts:29`
**Issue:** The regex `\.(jpe?g|webp)$` allows `jpg`, `jpeg`, and `webp`, but `CONTENT_TYPE_BY_EXT` in `src/app/api/upload-url/route.ts:7-10` and its `bodySchema` (`z.enum(["jpg", "webp"])`) only ever mint `jpg` or `webp` keys, and `CameraCapture` always sends `{ ext: "jpg" }`. `jpeg` is dead validation surface, exercised only by the unit test, never reachable through the real flow.
**Fix:** Tighten the regex to `\.(jpg|webp)$` to match what the system actually produces, or intentionally support `jpeg` end-to-end if there's a reason to keep it.

### IN-05: A malformed `cursor` query param is silently treated as "first page" instead of an error (carried forward, still unresolved)

**File:** `src/lib/feed.ts:28-43`
**Issue:** `decodeCursor` catches any parse failure and returns `null`, which both `nearbyFeed`/`recentFeed` treat identically to "no cursor supplied" (restart from page 1). Since `/api/feed` is a public GET endpoint that accepts an arbitrary `cursor` string from any caller, a corrupted/tampered cursor silently resets pagination rather than surfacing a `400`. Combined with WR-01's missing concurrency guard, a client that receives a resurfaced first page mid-scroll can end up with duplicate `key={item.publicId}` entries in `FeedList`.
**Fix:** Return a `400 Bad Request` from `/api/feed` when `cursor` is present but fails to decode, rather than silently falling back to page 1.

### IN-06: `webp` upload support is fully wired server-side but never used by the client (carried forward, still unresolved)

**File:** `src/components/capture/CameraCapture.tsx:126-140`
**Issue:** `canvas.toBlob` always encodes `"image/jpeg"` and the upload request always sends `{ ext: "jpg" }`, so the `webp` branch in `CONTENT_TYPE_BY_EXT` (`src/app/api/upload-url/route.ts`) and the schema's `webp` regex alternative are unreachable dead capability from the only real client.
**Fix:** Either wire up a `webp` capture path (smaller file size — relevant given the India mobile-network constraints noted elsewhere in this codebase) or remove the unused `webp` support until it's actually needed.

---

_Reviewed: 2026-07-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
