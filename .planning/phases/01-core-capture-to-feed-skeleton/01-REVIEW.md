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
  critical: 1
  warning: 10
  info: 6
  total: 17
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Fresh full pass over the phase's current file scope, verified directly against the code as it stands today (not assumed from any prior review pass).

Confirmed first: the previously-flagged CR-01 off-by-one in `wrapOverlayLines`'s loop-break condition (`=== OVERLAY_MAX_LINES - 1` → `>= OVERLAY_MAX_LINES`) is genuinely fixed, exported, and covered by a passing regression test. That specific defect is resolved.

However, direct execution tracing of `wrapOverlayLines` (verified by running the function standalone, not just reading it) surfaced a **new, still-present defect in the same function** that reproduces the exact same failure mode — silent loss of the burned-in geotag/timestamp overlay text — under a different trigger condition (overlay text that needs more than `OVERLAY_MAX_LINES` physical lines to wrap). This is filed below as CR-01 in this review pass and is the one Critical finding.

Beyond that, this pass independently re-verified against current source and confirmed several other real, provable gaps: a missing concurrency guard in `FeedList`'s infinite scroll (duplicate-card risk), a silent-failure/no-retry path in the same component, an unguarded `track.getSettings()` call in `CameraCapture` that can leave the capture button permanently inert, a `Promise.all`-based permission check in `PermissionGate` that fails open when either query throws, a DB client instantiated with no dev-mode singleton guard, an env var read that bypasses the codebase's own `requireEnv` fail-fast convention, an overly broad catch in `photoExists()` that conflates "not found" with "couldn't check," an unvalidated DB-sourced category rendered through an icon lookup with no fallback, inconsistent server-side error logging between two code paths handling the same failure, and the still-open lack of rate limiting on both write endpoints. None of these are theoretical — each was confirmed by reading the exact current code, not inferred.

## Critical Issues

### CR-01: `wrapOverlayLines` silently drops content beyond 2 physical lines instead of truncating it

**File:** `src/lib/overlay.ts:50-90` (the interaction between the loop's `break` at line 71 and the post-loop code at lines 73-74)

**Issue:** The previously-fixed off-by-one break condition is correctly in place — the loop now only stops once `OVERLAY_MAX_LINES` full lines have actually been pushed. But the code that runs *after* the loop breaks is still wrong: when the `break` fires, `current` already holds the start of what would be a 3rd physical line (a word that didn't fit on line 2). The post-loop code unconditionally does `if (current) lines.push(current)`, adding that 3rd line, and then `if (lines.length > OVERLAY_MAX_LINES) lines.length = OVERLAY_MAX_LINES` truncates the array back down — which silently **discards** that 3rd line's content instead of running it through the "ellipsize the last line" logic a few lines below. Words *after* the one held in `current` at break time are worse off still: the `for` loop has already exited, so they are never even considered.

Net effect: whenever the formatted overlay text (`"{lat}, {lng} · ±{accuracy}m · {date}"`) needs 3+ word-wrapped lines to fit `maxWidth` (a realistic scenario for a narrow capture canvas width, e.g. a low-resolution "environment" camera track, or a long accuracy string like `±123457m` from a poor GPS fix), the trailing portion of the overlay — which very often *is* the timestamp — vanishes from the burned-in image with **no ellipsis, no truncation indicator, nothing** signaling that content was cut. This is the exact same failure mode the original CR-01 finding described (silently dropped D-02 anti-fraud timestamp), just triggered by a different input shape.

Confirmed by direct execution (not just static reading):
```js
// maxWidth=9 "chars", OVERLAY_MAX_LINES=2
wrapOverlayLines(stubCtx, "aaaa bbbb cccc dddd eeee ffff", 9)
// => ["aaaa bbbb", "cccc dddd"]   <-- "eeee" and "ffff" vanish entirely, no ellipsis

// realistic overlay shape with a long accuracy value, maxWidth=20
wrapOverlayLines(stubCtx, "12.9716, 77.5946 · ±123457m · 23 Jul 2026, 14:03", 20)
// => ["12.9716, 77.5946 ·", "±123457m · 23 Jul"]   <-- "2026, 14:03" (the timestamp) is gone
```
The existing regression test (`tests/unit/overlay.test.ts` "caps wrapped output at OVERLAY_MAX_LINES (2) even for longer text") only asserts `lines.length <= 2` — it does not check that content is preserved/ellipsized, so it passes despite this bug and does not guard against it.

**Fix:** Don't let the loop's `break` leave a dangling `current` that gets silently discarded. Track that truncation happened and force-ellipsize the last *retained* line so there's a visible signal, instead of appending-then-chopping a whole extra line:

```ts
export function wrapOverlayLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current === "" || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= OVERLAY_MAX_LINES) {
      truncated = true;
      break; // do NOT push `current` below — it belongs to a dropped line
    }
  }
  if (!truncated && current) lines.push(current);

  const lastIndex = lines.length - 1;
  const last = lines[lastIndex];
  if (last && (truncated || ctx.measureText(last).width > maxWidth)) {
    let base = last;
    let candidate = `${base}…`;
    while (base.length > 1 && ctx.measureText(candidate).width > maxWidth) {
      base = base.slice(0, -1);
      candidate = `${base}…`;
    }
    lines[lastIndex] = candidate;
  }

  return lines;
}
```
Also extend `tests/unit/overlay.test.ts` to assert on *content* (not just `length`) for the "longer text" case — e.g. that the last line ends with `…` when truncation occurs, or that no word is silently dropped without a truncation marker — so this class of regression is caught automatically going forward.

## Warnings

### WR-01: `FeedList`'s infinite-scroll fetch has no concurrency guard — risk of duplicate cards

**File:** `src/components/feed/FeedList.tsx:55-67`
**Issue:** The `IntersectionObserver` callback invokes `fetchNext(cursor)` directly whenever `entries[0]?.isIntersecting` is true, with no check against the `loading` state, and `fetchNext` itself (lines 34-53) has no in-flight guard either:
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting) {
    fetchNext(cursor);
  }
});
```
The observer/effect only re-subscribes when `cursor` changes (i.e. after a fetch resolves), so while one fetch is in flight, the same observer keeps watching the sentinel with the same stale `cursor` closure value. If the intersection callback fires again before the in-flight request resolves (plausible on fast scrolling, or if the browser queues multiple intersection entries), `fetchNext` runs a second time with the *identical* cursor; both responses get appended via `setItems((prev) => [...prev, ...page.items])`, producing duplicate `FeedCard` entries and a duplicate React `key={item.publicId}`.
**Fix:**
```ts
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !loading) {
    fetchNext(cursor);
  }
});
```
(adding `loading` to the effect's dependency array), or add an in-flight `useRef` guard inside `fetchNext` itself so a duplicate call with the same cursor is a no-op.

### WR-02: `FeedList`'s infinite-scroll fetch failure fails silently with no retry path

**File:** `src/components/feed/FeedList.tsx:34-53`
**Issue:** On a non-OK response (`if (!res.ok) return;`) or a thrown error, `fetchNext` simply exits via `finally` with no user-visible feedback, and — critically — no state change (`cursor` stays the same). Because the observer-owning `useEffect` only re-subscribes when `cursor` changes, a failed fetch with the sentinel still on-screen means no further attempt will be made until the sentinel scrolls out of and back into view (the only other event that re-fires the observer callback). The user experience is a feed that silently stops loading more items after one transient network blip, with the "Loading more…" indicator simply disappearing and nothing replacing it.
**Fix:** Track fetch failures in state and render a retry affordance:
```ts
const [loadError, setLoadError] = useState(false);
// ...
} catch {
  setLoadError(true);
} finally {
  setLoading(false);
}
```
and render a "Couldn't load more — Retry" control near the sentinel when `loadError` is true, wired to re-invoke `fetchNext(cursor)`.

### WR-03: `CameraCapture.handleCapture` has no guard around a possibly-empty video track array

**File:** `src/components/capture/CameraCapture.tsx:79-84`
**Issue:**
```ts
const track = stream.getVideoTracks()[0];
const { width, height } = track.getSettings();
```
If `stream.getVideoTracks()` returns an empty array (e.g. the track ended because the user revoked camera access mid-session, or the device disconnected between `getUserMedia` resolving and the user tapping "Capture Photo"), `track` is `undefined` and `track.getSettings()` throws synchronously inside this `async` handler. Since `handleCapture` is invoked from an `onClick` without the caller awaiting it, this becomes an unhandled promise rejection: no `error` state is set, `status` never leaves `"ready"`, and the "Capture Photo" button silently does nothing on tap — unlike every other failure path in this component (missing canvas context, upload failure, location failure), which all surface a friendly message.
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
`Promise.all` rejects as soon as either query rejects (e.g. a browser that doesn't support the `"camera"` permission name via the Permissions API at all — this is a real, documented cross-browser gap, not hypothetical). The surrounding `catch` unconditionally does `if (!cancelled && !deniedRef.current) setState("ok")`. So if the `camera` query throws while `geolocation` is genuinely `"denied"`, the whole proactive check falls back to `"ok"` — the real geolocation denial is never surfaced by this proactive, no-interaction path, and the capture UI briefly renders as usable. (It's partially mitigated in practice because `CameraCapture`'s own `captureBestFix` call will still hit a real `PERMISSION_DENIED` and escalate via `reportDenied("location")` — but only once the user has already gotten past the camera step and attempted a capture, defeating the whole point of a *proactive* gate.)
**Fix:** Query independently so one unsupported/erroring permission name doesn't suppress a genuine `denied` result on the other:
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
**Issue:** `src/lib/r2.ts` consistently wraps every R2-related env var in `requireEnv(...)` so a missing value fails fast at module load. Both `photoUrl()` definitions instead read `process.env.R2_PUBLIC_BASE_URL` directly with no check. If this var is ever unset in an environment, every photo URL silently becomes `"undefined/complaints/xyz.jpg"` — broken images across the entire feed and every permalink — instead of failing loudly at startup like the rest of the R2 config.
**Fix:**
```ts
import { requireEnv } from "@/lib/env";

function photoUrl(photoKey: string): string {
  return `${requireEnv("R2_PUBLIC_BASE_URL")}/${photoKey}`;
}
```

### WR-06: `photoExists()` conflates "doesn't exist" with "couldn't check"

**File:** `src/lib/r2.ts:46-53`
**Issue:** The `catch { return false; }` block treats *any* error from `HeadObjectCommand` — a genuine 404/NotFound, but also a transient network failure, an R2 outage, a credentials/config problem, or a timeout — identically as "photo not found." `submitComplaint` then surfaces this as `"Photo not found — please retake and upload the photo before submitting."` A user whose photo *did* upload successfully would see a confusing, incorrect "please retake" message during a transient R2/auth hiccup, and a real misconfiguration (e.g. wrong bucket name) would masquerade as user error rather than surfacing as an ops-visible failure.
**Fix:** Narrow the catch to the actual "not found" signal and rethrow/log anything else:
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

### WR-07: `FeedCard` renders an unvalidated DB-sourced category through a lookup with no fallback, risking a hard crash

**File:** `src/components/feed/FeedCard.tsx:12-18, 44, 55, 74`
**Issue:** `item.category` originates from a DB row (`src/lib/feed.ts` casts `row.category as Category` with no runtime check). `categoryLabel()` degrades gracefully via `?? category` for an unrecognized value, but `CATEGORY_ICONS[item.category]` has no such fallback — `const Icon = CATEGORY_ICONS[item.category]` becomes `undefined` for any value outside the 5 known categories, and `<Icon .../>` (lines 55 and 74) then throws `Element type is invalid: expected a string... but got: undefined`, crashing the card render rather than degrading. This directly conflicts with the project's own "never a crash" invariant for the public feed. `CategoryPicker.tsx` has the identical map but isn't reachable from untrusted/drifted data the way `FeedCard`'s DB-sourced value is, since its `value` is always local client state constrained to the enum.
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
This opens a real `postgres.js` connection pool as a side effect of importing the module, with no `globalThis` caching guard for local development. The standard mitigation for exactly this scenario (used by both Prisma's and Drizzle's own guides) is to stash the client on `globalThis` in development so Next.js module re-evaluation during active local editing reuses the same pool instead of opening additional ones. Without it, iterating on files that transitively import this module during local development can accumulate connections against Supabase's free-tier connection cap (a constraint this same codebase's CLAUDE.md explicitly calls out).
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
**Issue:** `src/app/api/feed/route.ts:40-45` deliberately logs only `err.name`, `err.message`, and `err.code` (per its own inline comment: "log full error detail server-side only... greppable in Vercel function logs" — T-01-09). `FeedContent` in `src/app/page.tsx` instead does `console.error("feed query failed", err)`, dumping the raw `Error` object (full stack trace, and whatever else the postgres.js error shape carries) via `console.error`'s default object formatting — a divergent, less-controlled logging pattern for the exact same underlying failure (a feed query failing) that the sibling route explicitly designed around.
**Fix:** Reuse the same structured shape:
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
**Issue:** Neither the presigned-upload-URL endpoint nor the `submitComplaint` server action has any throttling. Both are reachable by any unauthenticated client (only a device-id cookie, no login) and both trigger real cost/state: `POST /api/upload-url` mints a real R2 presigned PUT URL on every call with no cap, and `submitComplaint` inserts a DB row (after only a cheap `HeadObjectCommand` check) with no per-device/IP submission cap — and nothing marks a `photoKey` as "consumed" after first use, so one real uploaded photo could be replayed across many `submitComplaint` calls. This project's own CLAUDE.md calls this out explicitly as required spam control on exactly these code paths ("Wrap every endpoint that costs money downstream... with a sliding-window limiter").
**Fix:** If intentionally deferred to a later phase, that should be recorded explicitly as a known gap; otherwise add a limiter (e.g. `@upstash/ratelimit`) in front of both endpoints, keyed on the device-id cookie and/or IP, and consider marking a `photoKey` consumed after its first successful `submitComplaint` use.

## Info

### IN-01: Unreachable code after the retry loop in `submitComplaint`

**File:** `src/actions/submit-complaint.ts:74-76`
**Issue:** Every iteration of the `for` loop either `return`s (successful insert) or `throw`s (in `catch` — either immediately, or via `continue` looping back until the final attempt, where the guard `attempt < MAX_ID_ATTEMPTS - 1` is false and forces a `throw`). There is no path where the loop completes without returning or throwing, so `throw lastError instanceof Error ? lastError : new Error(...)` after the loop can never execute.
**Fix:** Remove it (adjusting the function to satisfy TypeScript's control-flow analysis another way), or leave a short comment noting it's unreachable-by-design so a future reader doesn't assume otherwise.

### IN-02: Duplicated `categoryLabel`/`CATEGORY_ICONS`/`photoUrl` definitions across files

**File:** `src/components/feed/FeedCard.tsx:12-18, 32-34`, `src/components/capture/CategoryPicker.tsx:8-14`, `src/app/c/[id]/page.tsx:11-13, 15-17`, `src/lib/feed.ts:6-8`
**Issue:** `CATEGORY_ICONS` is defined identically in `FeedCard.tsx` and `CategoryPicker.tsx`; `categoryLabel()` is defined identically in `FeedCard.tsx` and `src/app/c/[id]/page.tsx`; `photoUrl()` is defined identically in `src/lib/feed.ts` and `src/app/c/[id]/page.tsx`. Each pair has to be kept in sync by hand.
**Fix:** Extract `categoryLabel`, `CATEGORY_ICONS`, and `photoUrl` into a shared module (e.g. `src/lib/category.ts`; colocate `photoUrl` with the `requireEnv`-based fix from WR-05) and import from both call sites.

### IN-03: `photoKey` schema regex is both looser and more permissive than the real upload flow

**File:** `src/types/complaint.ts:27-29`, cross-referenced against `src/lib/ids.ts:5` and `src/app/api/upload-url/route.ts:7-14`
**Issue:** `submissionSchema.photoKey` uses `/^complaints\/KYA-[A-Z0-9]{7}\.(jpe?g|webp)$/`, but two things about this diverge from what the system can actually produce: (1) `generatePublicId()` only ever emits characters from the ambiguity-free alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (excluding `0`, `O`, `1`, `I`, `L`), so the broader `[A-Z0-9]{7}` accepts shapes no real upload could produce; (2) the `jpe?g` alternation accepts a `.jpeg` extension, but `CONTENT_TYPE_BY_EXT`/`bodySchema` in `upload-url/route.ts` only ever mint `jpg` or `webp` keys, and `CameraCapture` always requests `{ ext: "jpg" }` — `.jpeg` is unreachable dead validation surface. Neither is independently exploitable (the real security guarantee is `photoExists()` against R2), but both make the schema a misleading description of what it's actually guaranteeing.
**Fix:** Tighten to `/^complaints\/KYA-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}\.(jpg|webp)$/` to match reality.

### IN-04: Captured photo (with burned-in overlay) is never shown to the user before Publish

**File:** `src/components/capture/CameraCapture.tsx:163-193`
**Issue:** After a successful capture (`status === "captured"`), the component still renders the live `<video>` element — the actual captured frame (with the geotag/timestamp overlay burned in) is never displayed. The user has no way to visually confirm the photo, or the overlay text (relevant given CR-01 above), before tapping "Publish Report" on the parent page.
**Fix:** Render the captured blob (e.g. `URL.createObjectURL(blob)` into an `<img>`) once `status === "captured"`, replacing the live preview, so the user can confirm the photo before submitting.

### IN-05: A malformed `cursor` query param is silently treated as "first page" rather than an error

**File:** `src/lib/feed.ts:28-43`
**Issue:** `decodeCursor` catches any parse failure and returns `null`, which `nearbyFeed`/`recentFeed` treat identically to "no cursor supplied" (restart from page 1). Since `/api/feed` is a public GET endpoint accepting an arbitrary `cursor` string, a corrupted/tampered cursor silently resets pagination instead of surfacing a `400`. Combined with WR-01's missing concurrency guard, a client that unexpectedly gets a resurfaced first page mid-scroll can end up with duplicate `key={item.publicId}` entries in `FeedList`.
**Fix:** Return a `400 Bad Request` from `/api/feed` when `cursor` is present but fails to decode, rather than silently falling back to page 1.

### IN-06: `webp` upload support is fully wired server-side but never used by the client

**File:** `src/components/capture/CameraCapture.tsx:126-140`, cross-referenced against `src/app/api/upload-url/route.ts:7-14`
**Issue:** `canvas.toBlob` always encodes `"image/jpeg"` and the upload request always sends `{ ext: "jpg" }`, so the `webp` branch in `CONTENT_TYPE_BY_EXT` and the schema's `webp` regex alternative are unreachable dead capability from the only real client.
**Fix:** Either wire up a `webp` capture path (smaller file size — relevant given the India mobile-network constraints noted elsewhere in this codebase) or remove the unused `webp` support until it's actually needed.

---

_Reviewed: 2026-07-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
