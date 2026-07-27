---
status: diagnosed
trigger: "G-01-2: Production capture flow broken on real devices — after capturing a photo on knowyourarea.in (production deploy) on a real device (phone browser), the photo preview shows \"Load failed\" text instead of the captured image, and the \"Publish Report\" button stays disabled/grayed out, blocking the user from ever publishing. The exact same capture flow works correctly on localhost. The user just merged the latest code from the feature branch into main shortly before this was observed."
created: 2026-07-27T00:00:00Z
updated: 2026-07-27T00:20:00Z
---

## Current Focus

hypothesis: CONFIRMED (see Resolution) — R2 bucket CORS AllowedOrigins only permits http://localhost:3000; the production origin https://knowyourarea.in was never added, so the browser-side presigned PUT to R2 fails as a CORS-blocked network error. Safari's fetch() surfaces this specific network failure as `TypeError: Load failed`, which CameraCapture.tsx's catch-all handler renders verbatim to the UI (`setError(err.message)`), and because the catch block returns before `onCaptured(key)` is ever called, `photoKey` in page.tsx stays null forever, keeping "Publish Report" disabled.
test: Static code read of CameraCapture.tsx (upload path + catch block), page.tsx (Publish disabled condition), src/lib/r2.ts + api/upload-url/route.ts (presign flow, no proxying), plus grep of all planning docs and README for any CORS/production-origin config; cross-referenced against Safari's documented fetch() CORS error message.
expecting: If CORS is the cause, docs would show CORS was only ever configured for localhost with no later step adding the production origin, and the client code would have no error-message sanitization on the upload catch path (unlike the camera/geolocation paths, which do translate raw browser errors into friendly copy).
next_action: N/A — goal is find_root_cause_only. Report ROOT CAUSE FOUND to caller. Fix requires (a) an infra action (add https://knowyourarea.in — and any relevant www/preview-deployment origins — to the R2 bucket's CORS AllowedOrigins via `wrangler r2 bucket cors set` or the Cloudflare dashboard) and (b) a code fix (stop leaking raw `err.message` to the UI in CameraCapture.tsx's upload catch block; render a friendly message like the camera/geolocation paths already do, and add a retry affordance).

## Symptoms

expected: Capture a photo in portrait orientation on a real device — the captured photo renders as a static preview, burned-in overlay is upright and legible, and the Publish Report button becomes enabled so the report can be submitted.
actual: On production (knowyourarea.in), on a real device, after tapping "Capture Photo" the preview area shows the video feed frozen, but red/error text "Load failed" appears below it instead of the captured image, and the "Publish Report" button remains disabled (grayed out). The same flow works fine on localhost against the same underlying code.
errors: "Load failed" — application-rendered (not a raw browser dialog), appearing where the photo preview/error text would be. No console/network trace captured by the human tester; only a screenshot.
reproduction: On a real phone, navigate to https://knowyourarea.in/capture, grant camera/location permissions, tap "Capture Photo", pick a category. "Load failed" shows instead of a usable preview and Publish never enables.
started: Discovered during UAT re-check of Phase 01 (Test 2 — real-device photo orientation test) on 2026-07-27, immediately after merging the feature branch into main. Not present before this merge on localhost — but see Evidence: the underlying CORS gap predates the merge and was never exercised by a real-device production test before now.

## Eliminated

- hypothesis: previewUrl is a remote/signed URL that fails to load due to CORS/env mismatch (i.e., the `<img>` itself is what's failing to load).
  evidence: previewUrl is always a client-local `canvas.toDataURL("image/jpeg", 0.85)` data URI (CameraCapture.tsx lines 106 and 143) — never a network URL. It cannot fail due to network/CORS/env differences between localhost and production; a data URI `<img>` render is 100% local. The `<img>` tag also has no `onError` handler anywhere in the file, so it cannot be the source of literal "Load failed" text even if it did fail to decode.
  timestamp: 2026-07-27T00:05:00Z

- hypothesis: Code regression introduced by the just-merged commits (Plan 01-10 / G-01-9 fix itself broke something).
  evidence: `git log` shows the merged commits (f51b378 "feat(01-10): show captured-photo preview + stop stream + Retake", plus prior history) only touch the preview/Retake UX and don't change the upload fetch/catch logic in a way that would newly introduce a network-origin dependency. The catch-all `setError(err.message)` pattern for the upload path predates this merge (present since the original tracer/Plan 01-03 upload wiring) — it is not new. The CORS gap (see Evidence below) has existed since Plan 01-02's original R2 setup and was never revisited for a production origin. The merge is coincidental timing (this was simply the first real-device test against production), not the causal trigger.
  timestamp: 2026-07-27T00:15:00Z

## Evidence

- timestamp: 2026-07-27T00:05:00Z
  checked: src/components/capture/CameraCapture.tsx (full file)
  found: `previewUrl` is set via `canvas.toDataURL(...)` (local, no network). The upload path is separate: `fetch("/api/upload-url", ...)` (same-origin, POST) followed by `fetch(url, { method: "PUT", body: blob, headers: {"Content-Type": "image/jpeg"} })` where `url` is the presigned R2 URL (cross-origin — R2's own domain, not knowyourarea.in). Both fetches are wrapped in one try/catch; on any failure (`!res.ok` or a thrown network TypeError) the catch block runs `setError(err instanceof Error ? err.message : "Couldn't upload the photo.")`, `setStatus("error")`, `setPreviewUrl(null)` — and critically, returns without ever calling `onCaptured(key)`.
  implication: Any failure of the second (cross-origin) fetch — including a CORS-blocked request — will surface as whatever `err.message` is, verbatim, in the UI's red destructive-text `<p>{error}</p>`. No onCaptured() call means the page-level `photoKey` state can never be set.

- timestamp: 2026-07-27T00:07:00Z
  checked: src/app/capture/page.tsx (full file)
  found: `<Button ... disabled={!photoKey || !category || publishing}>` — Publish Report is disabled whenever `photoKey` is null. `photoKey` is only ever set via `<CameraCapture onCaptured={setPhotoKey} />`, and `onCaptured` is only called (with a real key) after both upload fetches succeed.
  implication: Confirms the causal chain — if the R2 PUT fails, `photoKey` stays null forever and Publish Report is permanently disabled, exactly as reported.

- timestamp: 2026-07-27T00:09:00Z
  checked: src/lib/r2.ts and src/app/api/upload-url/route.ts (full files)
  found: The server only mints a presigned `PutObjectCommand` URL (`getSignedUrl`, 300s expiry) pointed at `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`. The actual photo bytes are PUT directly from the browser to this R2 endpoint — this is a genuinely cross-origin request from whatever page origin loaded the app (`http://localhost:3000` in dev, `https://knowyourarea.in` in production).
  implication: This PUT is subject to the R2 bucket's CORS policy, which is bucket-level infra configuration, not app code — and is entirely capable of behaving differently per-origin (localhost vs. production) independent of any app code change.

- timestamp: 2026-07-27T00:12:00Z
  checked: README.md and .planning/phases/01-core-capture-to-feed-skeleton/01-02-{PLAN,SUMMARY}.md, COVERAGE.md
  found: README.md step 2 explicitly instructs: "On the R2 bucket, add a CORS rule allowing PUT (with the Content-Type header) from `http://localhost:3000` so the browser → R2 direct upload succeeds." 01-02-SUMMARY.md's checkpoint-resolution notes record the coordinator actually doing this: "setting a CORS policy allowing PUT+Content-Type from `http://localhost:3000` (via `wrangler r2 bucket cors set`)". COVERAGE.md lists "bucket CORS configuration" as `user_setup`, i.e. a manual one-time infra step, never codified in the repo (no wrangler.toml, no CORS config file, no CI/CD step found anywhere in the repo).
  implication: The R2 bucket's CORS AllowedOrigins was deliberately set to `http://localhost:3000` only, during Plan 01-02's initial tracer setup. Nothing in any plan, summary, README, or the codebase references `https://knowyourarea.in` (grep across all planning docs + README for "knowyourarea" returns zero matches) or any step to add the production origin to this CORS policy before/after deploying to Vercel.
  implication_2: Because this is infra state (Cloudflare R2 bucket settings) that lives outside the git repo entirely, it would not be touched by "merging the feature branch into main" — explaining why the code is identical between localhost and production, yet behavior differs by origin. This also explains why this was never caught by any of the many e2e/Playwright test rounds in this phase's history (Playwright's local dev server always runs on `http://localhost:3000`/`:3001`-style origins, which the CORS rule already permits) and was only caught now, on the first genuine real-device test against the live production origin.

- timestamp: 2026-07-27T00:18:00Z
  checked: Web search — Safari/WebKit fetch() error semantics for CORS/network failures
  found: Safari's Fetch API throws `TypeError: Load failed` as its generic network-level error (distinct from Chrome's "Failed to fetch" / Firefox's "NetworkError when attempting to fetch resource") for causes including CORS blocks, unreachable servers, and mixed content. Corroborated by Apple Developer Forums threads and multiple JS-error-tracking vendor docs (TrackJS, Sentry) describing "Load failed" specifically as Safari's fetch-failure message.
  implication: The literal string "Load failed" reported by the human tester is not applicaton copy the team wrote deliberately — it is Safari's own `TypeError.message` for the failed cross-origin PUT, passed through unchanged by `setError(err.message)`. This is strong corroborating evidence (not just plausible theory) given the phase's stated real-device test target is "real iOS Safari."

## Resolution

root_cause: "R2 bucket CORS AllowedOrigins is configured for `http://localhost:3000` only (set during Plan 01-02's initial infra setup, documented in README.md/01-02-SUMMARY.md, never revisited for the production domain) — so the browser's cross-origin presigned PUT to R2 is CORS-blocked on knowyourarea.in, causing the upload fetch to reject; Safari renders this network failure as `TypeError: Load failed`, which CameraCapture.tsx's upload-path catch block surfaces verbatim via `setError(err.message)` instead of a sanitized message (contributing/compounding cause — code); because the catch block returns before `onCaptured(key)` runs, `photoKey` never gets set, permanently disabling Publish Report."
fix: "NOT YET APPLIED (find_root_cause_only mode). Two-part fix needed: (1) infra — add `https://knowyourarea.in` (and any other production/preview origins in use, e.g. Vercel preview deployment URLs) to the R2 bucket's CORS AllowedOrigins via `wrangler r2 bucket cors set` or the Cloudflare dashboard; (2) code — in CameraCapture.tsx's upload catch block, stop passing raw `err.message` through to the UI (mirror the existing pattern already used for camera/geolocation errors, which translate raw browser errors into user-facing copy) and consider a distinct 'Couldn't upload — check your connection and try again' message with a retry action."
verification: "Not yet performed — this session stops at root-cause diagnosis per goal: find_root_cause_only."
files_changed: []
