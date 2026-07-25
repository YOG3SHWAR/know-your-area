---
phase: 01-core-capture-to-feed-skeleton
reviewed: 2026-07-26T00:00:00Z
depth: standard
files_reviewed: 37
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
  warning: 14
  info: 7
  total: 21
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

This is a fresh re-review after gap-closure plans 01-05 through 01-09 landed. Every finding below was re-verified directly against the current source (not carried forward from the prior `01-REVIEW.md` on trust) — findings from that prior round that are no longer accurate have been dropped or updated; findings that are still accurate have been re-confirmed against current line numbers.

**CR-01 is now confirmed closed.** I hand-traced `wrapOverlayLines` (`src/lib/overlay.ts:50-110`) against both trigger scenarios from `tests/unit/overlay.test.ts`: the 2-line case (`"12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03"` at `maxWidth=23`) and the 3+-line case forced by a long accuracy value (`"±123457m"` at `maxWidth=20`). In both traces, the `truncated` flag correctly (a) prevents the dangling `current` fragment from a break-truncation ever being appended as a phantom extra line, and (b) forces the last *retained* line to be ellipsized whenever a break-truncation occurred, regardless of that line's own measured width. Content is still cut in the 3-line scenario (the trailing "2026, 14:03" doesn't survive), but it is never cut *silently* — a visible `…` is always left behind. That was the actual CR-01 requirement ("never silent," not "never truncated"), and it's met. No remaining Critical finding for this phase.

Hand-tracing the same function against an input shape none of the shipped tests cover did surface one **new, narrower gap in the same function** (WR-11 below): the ellipsize step only ever inspects the *last* retained line, so an unbreakable overlong word that lands on a non-last line is never truncated and can render past the overlay bar's edge. This is Warning-, not Critical-, severity — it's a visual overflow bug, not a silent-data-loss bug (CR-01's core concern), and it's very unlikely to trigger given the app's actual overlay text format — but it's a real, demonstrable logic gap in the exact function that received three rounds of dedicated hardening this phase, so it's called out explicitly rather than left for a fourth round to rediscover independently.

Beyond the overlay function, this pass re-verified — by reading current source directly, not by assuming the prior review's line numbers or claims still held — that **all ten Warning-level and five of six Info-level findings from the prior review round remain present and unfixed** (the gap-closure plans this round were scoped to CR-01 only). Those are carried forward below with corrected/re-confirmed file:line references. This pass also found four genuinely new issues not previously flagged: the overlay non-last-line overflow gap already mentioned, an `Number("")` coercion bug that lets an empty-but-present `lat`/`lng` query param be silently treated as a real `(0, 0)` coordinate instead of falling back to the documented "never a fake coordinate" path, a raw-DB-error information-disclosure gap in `submitComplaint` distinct from the previously-flagged `photoExists()` issue, and an API-boundary type-safety gap where `FeedItem.createdAt` is typed `Date` but is actually delivered as a `string` once it round-trips through `/api/feed`'s JSON response.

## Warnings

### WR-01: `FeedList`'s infinite-scroll fetch has no concurrency guard — risk of duplicate cards

**File:** `src/components/feed/FeedList.tsx:55-67`
**Issue:** The `IntersectionObserver` callback invokes `fetchNext(cursor)` directly whenever `entries[0]?.isIntersecting` is true, with no check against the `loading` state, and `fetchNext` itself (lines 34-53) has no in-flight guard either. The observer/effect only re-subscribes when `cursor` changes (i.e. after a fetch resolves), so while one fetch is in flight the same observer keeps watching the sentinel with the same stale `cursor` closure value. If the intersection callback fires again before the in-flight request resolves (plausible on fast scrolling, or multiple queued intersection entries), `fetchNext` runs a second time with the *identical* cursor; both responses get appended via `setItems((prev) => [...prev, ...page.items])`, producing duplicate `FeedCard` entries and a duplicate React `key={item.publicId}`.
**Fix:**
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !loading) {
    fetchNext(cursor);
  }
});
```
(adding `loading` to the effect's dependency array), or add an in-flight `useRef` guard inside `fetchNext` itself.

### WR-02: `FeedList`'s infinite-scroll fetch failure fails silently with no retry path

**File:** `src/components/feed/FeedList.tsx:34-53`
**Issue:** On a non-OK response (`if (!res.ok) return;`) or a thrown error, `fetchNext` exits via `finally` with no user-visible feedback, and critically no state change — `cursor` stays the same. Because the observer-owning `useEffect` only re-subscribes when `cursor` changes, a failed fetch with the sentinel still on-screen means no further attempt is made until the sentinel scrolls out of and back into view. The user experience is a feed that silently stops loading more items after one transient network blip.
**Fix:** Track fetch failures in state and render a retry affordance near the sentinel, wired to re-invoke `fetchNext(cursor)`.

### WR-03: `CameraCapture.handleCapture` has no guard around a possibly-empty video track array

**File:** `src/components/capture/CameraCapture.tsx:79-80`
**Issue:**
```ts
const track = stream.getVideoTracks()[0];
const { width, height } = track.getSettings();
```
If `stream.getVideoTracks()` returns an empty array (e.g. the track ended because the user revoked camera access mid-session, or the device disconnected between `getUserMedia` resolving and the user tapping "Capture Photo"), `track` is `undefined` and `track.getSettings()` throws synchronously inside this `async` handler invoked from an unaticipated `onClick`. This becomes an unhandled promise rejection: no `error` state is set, `status` never leaves `"ready"`, and "Capture Photo" silently does nothing on tap — unlike every other failure path in this component, which all surface a friendly message.
**Fix:**
```ts
const track = stream.getVideoTracks()[0];
if (!track) {
  setError("Couldn't capture the photo. Try again.");
  setStatus("error");
  return;
}
const { width, height } = track.getSettings();
```

### WR-04: `PermissionGate`'s `Promise.all` permission check fails open for *both* permissions if either query throws

**File:** `src/components/capture/PermissionGate.tsx:66-96`
**Issue:**
```ts
const [queriedCamera, queriedLocation] = await Promise.all([
  navigator.permissions.query({ name: "camera" }),
  navigator.permissions.query({ name: "geolocation" }),
]);
```
`Promise.all` rejects as soon as either query rejects (a browser that doesn't support the `"camera"` permission name via the Permissions API at all is a real, documented cross-browser gap). The surrounding `catch` unconditionally does `if (!cancelled && !deniedRef.current) setState("ok")`. So if the `camera` query throws while `geolocation` is genuinely `"denied"`, the whole proactive check falls back to `"ok"` — the real geolocation denial is never surfaced by this proactive path. (Partially mitigated because `CameraCapture`'s own `captureBestFix` call will still hit a real `PERMISSION_DENIED` and escalate — but only after the user has already gotten past the camera step, defeating the point of a *proactive* gate.)
**Fix:** Query independently so one unsupported/erroring permission name can't suppress a genuine `denied` result on the other:
```ts
const [camResult, locResult] = await Promise.allSettled([
  navigator.permissions.query({ name: "camera" }),
  navigator.permissions.query({ name: "geolocation" }),
]);
camera = camResult.status === "fulfilled" ? camResult.value : undefined;
location = locResult.status === "fulfilled" ? locResult.value : undefined;
```

### WR-05: `photoUrl()` reads `R2_PUBLIC_BASE_URL` without validation, unlike every other R2 env var

**File:** `src/lib/feed.ts:6-8`, `src/app/c/[id]/page.tsx:15-17`
**Issue:** `src/lib/r2.ts` consistently wraps every R2-related env var in `requireEnv(...)` so a missing value fails fast at module load. Both `photoUrl()` definitions instead read `process.env.R2_PUBLIC_BASE_URL` directly with no check. If this var is ever unset, every photo URL silently becomes `"undefined/complaints/xyz.jpg"` — broken images across the entire feed and every permalink — instead of failing loudly at startup like the rest of the R2 config.
**Fix:**
```ts
import { requireEnv } from "@/lib/env";

function photoUrl(photoKey: string): string {
  return `${requireEnv("R2_PUBLIC_BASE_URL")}/${photoKey}`;
}
```

### WR-06: `photoExists()` conflates "doesn't exist" with "couldn't check"

**File:** `src/lib/r2.ts:46-53`
**Issue:** `catch { return false; }` treats *any* error from `HeadObjectCommand` — a genuine 404, but also a transient network failure, an R2 outage, a credentials/config problem, or a timeout — identically as "photo not found." `submitComplaint` then surfaces this as `"Photo not found — please retake and upload the photo before submitting."` A user whose photo *did* upload successfully would see a confusing, incorrect "please retake" message during a transient R2/auth hiccup, and a real misconfiguration (e.g. wrong bucket name) masquerades as user error rather than surfacing as an ops-visible failure.
**Fix:**
```ts
export async function photoExists(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (err instanceof Error && (err.name === "NotFound" || status === 404)) {
      return false;
    }
    console.error("photoExists check failed unexpectedly", err);
    throw err;
  }
}
```

### WR-07: `FeedCard` renders an unvalidated DB-sourced category through an icon lookup with no fallback, risking a hard crash

**File:** `src/components/feed/FeedCard.tsx:12-18, 44, 55, 74`
**Issue:** `item.category` originates from a DB row (`src/lib/feed.ts` casts `row.category as Category` with no runtime check). `categoryLabel()` degrades gracefully via `?? category`, but `CATEGORY_ICONS[item.category]` has no fallback — `const Icon = CATEGORY_ICONS[item.category]` becomes `undefined` for any value outside the 5 known categories, and `<Icon .../>` then throws `Element type is invalid`, crashing the card render. Currently unreachable in practice (the DB column is only ever written via `submissionSchema`'s `z.enum` validation), so this is defense-in-depth rather than an active bug — but it's the only place in the card-rendering path with no graceful fallback, directly conflicting with the "never a crash" invariant stated elsewhere in this codebase for the public feed.
**Fix:**
```ts
const Icon = CATEGORY_ICONS[item.category] ?? TriangleAlert;
```

### WR-08: Postgres client is instantiated at module load with no dev-mode singleton guard

**File:** `src/lib/db/client.ts:32-35`
**Issue:**
```ts
const databaseUrl = requireEnv("DATABASE_URL");
const queryClient = postgres(databaseUrl, buildClientOptions(databaseUrl));
export const db = drizzle(queryClient, { schema });
```
This opens a real `postgres.js` connection pool as a side effect of importing the module, with no `globalThis` caching guard for local development (the standard mitigation used by both Prisma's and Drizzle's own guides for exactly this scenario). Without it, iterating on files that transitively import this module during local development (hot reload re-evaluating modules) can accumulate connections against Supabase's free-tier connection cap — a constraint this codebase's own CLAUDE.md explicitly calls out.
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

### WR-09: Inconsistent server-side error logging between the feed API route and the SSR feed page

**File:** `src/app/page.tsx:73-76`
**Issue:** `src/app/api/feed/route.ts:36-46` deliberately logs only `err.name`, `err.message`, and `err.code` (per its own inline comment referencing threat T-01-09, "greppable in Vercel function logs"). `FeedContent` in `src/app/page.tsx` instead does `console.error("feed query failed", err)`, dumping the raw `Error` object via `console.error`'s default formatting — a divergent, less-controlled logging pattern for the exact same underlying failure class the sibling route explicitly designed around.
**Fix:**
```ts
} catch (err) {
  if (err instanceof Error) {
    const code = (err as Error & { code?: unknown }).code;
    console.error("feed query failed", err.name, err.message, code);
  } else {
    console.error("feed query failed", String(err));
  }
  return <FeedErrorBanner />;
}
```

### WR-10: No server-side rate limiting on photo-upload URL minting or complaint submission

**File:** `src/app/api/upload-url/route.ts:21-34`, `src/actions/submit-complaint.ts:29-77`
**Issue:** Neither the presigned-upload-URL endpoint nor the `submitComplaint` server action has any throttling. Both are reachable by any unauthenticated client (only a device-id cookie, no login) and both trigger real cost/state: `POST /api/upload-url` mints a real R2 presigned PUT URL on every call with no cap, and `submitComplaint` inserts a DB row (after only a cheap `HeadObjectCommand` check) with no per-device/IP submission cap — and nothing marks a `photoKey` as "consumed" after first use, so one real uploaded photo could be replayed across many `submitComplaint` calls. CLAUDE.md calls this out explicitly as required spam control on exactly these code paths.
**Fix:** If intentionally deferred to a later phase, record that explicitly as a known gap; otherwise add a limiter (`@upstash/ratelimit`) in front of both endpoints, keyed on the device-id cookie and/or IP, and consider marking a `photoKey` consumed after its first successful `submitComplaint` use.

### WR-11: `wrapOverlayLines` only ellipsizes the *last* line — an unbreakable overflowing word on an earlier line renders unclipped

**File:** `src/lib/overlay.ts:70-109`
**Issue:** The truncation/ellipsize step at the end of `wrapOverlayLines` only inspects `lines[lines.length - 1]`. Every word is unconditionally accepted as the *first* word of a new line (`if (current === "" || ...)` short-circuits the width check for the first word of any line accumulation, not just the very first line of the whole text). If that first word alone exceeds `maxWidth` and is later displaced from being the "last" line — because enough trailing text exists to fill a subsequent line that fits within `maxWidth` without itself triggering the break-truncation path — the oversized line is pushed to `lines` verbatim and never ellipsized. Hand-traced repro with the same `stubCtx()` helper already used in `tests/unit/overlay.test.ts`:
```ts
const lines = wrapOverlayLines(stubCtx(), "bbbbbbbbbbbbbb c d e", 5);
// lines = ["bbbbbbbbbbbbbb", "c d e"]
// lines[0] is 14 "chars" wide against a maxWidth of 5 and is never ellipsized —
// only lines[1] ("c d e", which fits) is checked by the post-loop step.
```
In production this line would render past the edge of the semi-opaque overlay bar drawn in `drawOverlay` (`src/lib/overlay.ts:117-141`), since `ctx.fillText` has no width clamp of its own. This is unlikely to trigger with the app's actual overlay text (`lat, lng · ±Nm · date` — the first token is bounded to roughly 11 chars by the India bounding-box + `toFixed(4)` formatting), so it's Warning- not Critical-severity, but it's a real gap in the exact function this phase's CR-01 gap-closure rounds targeted, with no test guarding against it.
**Fix:** Ellipsize every line that individually overflows `maxWidth` at the moment it's pushed, not only the final retained line:
```ts
function ellipsizeLine(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string {
  if (ctx.measureText(line).width <= maxWidth) return line;
  let s = line;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}
// ...inside the word loop, right before `lines.push(current)`:
lines.push(ellipsizeLine(ctx, current, maxWidth));
```
and add a regression test mirroring the repro above (single overlong first word on a non-last line).

### WR-12: Empty-string `lat`/`lng` query params are coerced to `0` instead of falling back to the "no location" path

**File:** `src/app/api/feed/route.ts:24-27`, `src/app/page.tsx:99-101`, `src/app/c/[id]/page.tsx:42-44`
**Issue:** All three call sites use the same pattern:
```ts
const lat = latParam !== null ? Number(latParam) : undefined;
const hasLocation = lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng);
```
`Number("")` evaluates to `0`, not `NaN`. A request like `GET /api/feed?lat=&lng=` (empty but present values — trivially producible by a malformed client or a stripped query string) is not filtered out by `!Number.isNaN`, so `hasLocation` becomes `true` with `lat=0, lng=0`, and `nearbyFeed`/the permalink's proximity query silently runs against the Gulf of Guinea instead of falling back to `recentFeed`/no-distance rendering. This directly contradicts the documented invariant in `src/lib/feed.ts:128-130` ("D-07 fallback... never a query against a fake (0,0) coordinate") — that invariant is only actually enforced for the *absent*-param case, not the *empty-string*-param case.
**Fix:**
```ts
const lat = latParam ? Number(latParam) : undefined; // falsy "" is skipped
```
or centralize this in a shared `parseCoordParam(raw: string | null): number | undefined` helper used by all three call sites.

### WR-13: `submitComplaint` leaks raw DB/driver error messages to the client

**File:** `src/actions/submit-complaint.ts:67-71` (consumed at `src/app/capture/page.tsx:61-69`)
**Issue:** `/api/feed`'s route handler explicitly logs full error detail server-side and returns only a fixed generic message to the client (T-01-09). `submitComplaint` does not follow the same discipline: on the final `MAX_ID_ATTEMPTS` retry (5 consecutive public-ID collisions — rare but real) and on any non-unique-violation DB error (connection drop, pool exhaustion, constraint issue, etc.), it does `throw err;` — the raw driver/Postgres error object. Next.js Server Actions forward a thrown `Error`'s `.message` to the client by default, and `CapturePage.handlePublish`'s catch block renders that message verbatim (`err instanceof Error ? err.message : ...`). This can surface internal details (constraint names, column names, driver-specific error text) the project's own threat model treats as worth guarding against on the sibling read path.
**Fix:**
```ts
} catch (err) {
  lastError = err;
  if (isUniqueViolation(err) && attempt < MAX_ID_ATTEMPTS - 1) continue;
  console.error("submitComplaint failed", err);
  throw new Error("Couldn't publish your report. Please try again.");
}
```

### WR-14: `FeedItem.createdAt` is typed `Date` but is actually delivered as a `string` by `/api/feed`'s JSON response

**File:** `src/types/complaint.ts:36-42`, `src/components/feed/FeedList.tsx:43-47`
**Issue:** `FeedItem.createdAt` is typed `Date`. That's accurate for the SSR path (`src/app/page.tsx` passes `nearbyFeed`/`recentFeed`'s return value — real `Date` objects — directly into `FeedList` as `initialItems`). But `FeedList.fetchNext` types its parsed response as `{ items: FeedItem[]; ... } = await res.json()`. `NextResponse.json(page)` in `src/app/api/feed/route.ts` serializes `Date` objects to ISO strings via `JSON.stringify` — there is no `Date` type in JSON. After the first infinite-scroll page loads, `items` silently contains a mix of real `Date` objects (SSR) and strings (client-side pagination) despite the single declared `FeedItem.createdAt: Date` type. This doesn't crash today only because `formatRelativeTime` (`src/lib/distance.ts:10-17`) defensively accepts `Date | string` — a workaround for the API boundary's type inaccuracy, not a fix for it. Any future caller trusting the declared type (e.g. `item.createdAt.getTime()`) will crash on paginated items.
**Fix:** Make the boundary type-accurate — change `FeedItem.createdAt` to `string` (ISO) everywhere and have SSR call sites convert once, or split into a `FeedApiItem` (string) / `FeedItem` (Date) pair with a single normalizing mapper.

## Info

### IN-01: Unreachable code after the retry loop in `submitComplaint`

**File:** `src/actions/submit-complaint.ts:74-76`
**Issue:** Every iteration of the `for` loop either `return`s (successful insert) or `throw`s in `catch` (immediately, or via `continue` looping back until the final attempt, where `attempt < MAX_ID_ATTEMPTS - 1` is false and forces a `throw`). There is no path where the loop completes without returning or throwing, so `throw lastError instanceof Error ? lastError : new Error(...)` after the loop can never execute.
**Fix:** Remove it, or leave a comment noting it's unreachable-by-design. Resolving WR-13 above naturally removes this too.

### IN-02: Duplicated `categoryLabel`/`CATEGORY_ICONS`/`photoUrl` definitions across files

**File:** `src/components/feed/FeedCard.tsx:12-18, 32-34`, `src/components/capture/CategoryPicker.tsx:8-14`, `src/app/c/[id]/page.tsx:11-13, 15-17`, `src/lib/feed.ts:6-8`
**Issue:** `CATEGORY_ICONS` is defined identically in `FeedCard.tsx` and `CategoryPicker.tsx`; `categoryLabel()` is defined identically in `FeedCard.tsx` and `src/app/c/[id]/page.tsx`; `photoUrl()` is defined identically in `src/lib/feed.ts` and `src/app/c/[id]/page.tsx`. Each pair has to be kept in sync by hand.
**Fix:** Extract `categoryLabel`, `CATEGORY_ICONS`, and `photoUrl` into shared modules (e.g. `src/lib/category.ts`; fold the WR-05 `requireEnv` fix into `photoUrl` and import it from `c/[id]/page.tsx` instead of redefining).

### IN-03: `photoKey` schema regex is both looser and more permissive than the real upload flow

**File:** `src/types/complaint.ts:27-29`, cross-referenced against `src/lib/ids.ts:5` and `src/app/api/upload-url/route.ts:7-14`
**Issue:** `submissionSchema.photoKey` uses `/^complaints\/KYA-[A-Z0-9]{7}\.(jpe?g|webp)$/`, but this diverges from what the system can actually produce: (1) `generatePublicId()` only ever emits characters from the ambiguity-free alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (excluding `0`, `O`, `1`, `I`, `L`), so the broader `[A-Z0-9]{7}` accepts shapes no real upload could produce; (2) `jpe?g` accepts `.jpeg`, but `CameraCapture` always requests `{ ext: "jpg" }` and `upload-url/route.ts` only ever mints `jpg` or `webp` keys — `.jpeg` is unreachable dead validation surface. Neither is independently exploitable (the real security guarantee is `photoExists()` against R2), but both make the schema a misleading description of what it actually guarantees.
**Fix:** Tighten to `/^complaints\/KYA-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}\.(jpg|webp)$/` to match reality.

### IN-04: Captured photo (with burned-in overlay) is never shown to the user before Publish

**File:** `src/components/capture/CameraCapture.tsx:163-193`
**Issue:** After a successful capture (`status === "captured"`), the component still renders the live `<video>` element — the actual captured frame (with the geotag/timestamp overlay burned in) is never displayed. The user has no way to visually confirm the photo, or the overlay text (relevant given the CR-01/WR-11 history above), before tapping "Publish Report" on the parent page.
**Fix:** Render the captured blob (e.g. `URL.createObjectURL(blob)` into an `<img>`) once `status === "captured"`, replacing the live preview, so the user can confirm the photo before submitting.

### IN-05: A malformed or partially-typed `cursor` is silently treated as "first page" rather than an error

**File:** `src/lib/feed.ts:28-43`
**Issue:** `decodeCursor` catches any JSON-parse failure and returns `null`, which `nearbyFeed`/`recentFeed` treat identically to "no cursor supplied" (restart from page 1) — a corrupted/tampered `cursor` silently resets pagination instead of surfacing a `400`. Separately, `decodeCursor` validates that `createdAt` and `publicId` are strings but never checks that `distanceM`, when present, is actually a `number` — a cursor with `distanceM: "nope"` passes validation and is later bound as a SQL parameter in `nearbyFeed`'s `cursorFilter` (lines 81-88), producing a Postgres type-coercion error that surfaces as an opaque generic 500 rather than a validation error. (Not a SQL-injection risk either way — values are bound as query parameters, not interpolated.) Combined with WR-01's missing concurrency guard, a client unexpectedly getting a resurfaced first page mid-scroll can end up with duplicate `key={item.publicId}` entries in `FeedList`.
**Fix:** Add `typeof parsed.distanceM === "number" || parsed.distanceM === undefined` to `decodeCursor`'s validation, and have `/api/feed` return `400 Bad Request` when a `cursor` is present but fails to decode, rather than silently falling back to page 1.

### IN-06: `webp` upload support is fully wired server-side but never used by the client

**File:** `src/components/capture/CameraCapture.tsx:126-140`, cross-referenced against `src/app/api/upload-url/route.ts:7-14`
**Issue:** `canvas.toBlob` always encodes `"image/jpeg"` and the upload request always sends `{ ext: "jpg" }`, so the `webp` branch in `CONTENT_TYPE_BY_EXT` and the schema's `webp` regex alternative are unreachable dead capability from the only real client.
**Fix:** Either wire up a `webp` capture path (smaller file size — relevant given the India mobile-network constraints noted elsewhere in this codebase) or remove the unused `webp` support until it's actually needed.

### IN-07: `ComplaintPage` duplicates the same SQL query with only the distance expression differing

**File:** `src/app/c/[id]/page.tsx:46-59`
**Issue:** The `hasLocation` branch and the fallback branch each write out the full `SELECT ... FROM complaints WHERE public_id = ${id} LIMIT 1` query, differing only in the `distance_m` column expression (`ST_Distance(...)` vs. `NULL::double precision`). A future change to the shared columns/WHERE clause has two places to update in sync.
**Fix:** Factor out the shared column list and build only the `distance_m` expression conditionally via a single template with an interpolated `sql` fragment.

---

_Reviewed: 2026-07-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
