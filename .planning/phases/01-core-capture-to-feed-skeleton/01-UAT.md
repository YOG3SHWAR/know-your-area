---
status: testing
phase: 01-core-capture-to-feed-skeleton
source: [01-VERIFICATION.md]
started: 2026-07-23T10:34:18Z
updated: "2026-07-26T01:40:00Z"
---

## Current Test

number: 2
name: Real iOS Safari: photo orientation and overlay legibility
expected: |
  Capture a photo in portrait orientation on real iOS Safari — not rotated/skewed, burned-in overlay text upright, legible, wraps/truncates gracefully at a narrow aspect ratio. Now that the residual CR-01 truncation gap is closed (plan 01-09), also confirm a visible "…" appears if the overlay wraps past 2 lines on a narrow real device — never a silently-clean-looking-but-incomplete line.
awaiting: user response

[testing resumed after gap-closure plans 01-05..01-09 — 3 items outstanding: tests 2, 5, and a new double-tap concurrency test below]

## Tests

### 1. Design system renders correctly on a real mobile browser

expected: shadcn new-york/neutral tokens and Geist Sans/Mono fonts render as specified — no fallback-font flash, no broken oklch tokens.
result: pass

### 2. Real iOS Safari: photo orientation and overlay legibility

expected: Capture a photo in portrait orientation on real iOS Safari — not rotated/skewed, burned-in overlay text upright, legible, wraps/truncates gracefully at a narrow aspect ratio (RESEARCH.md Pitfall 3 explicitly evades emulation).
result: skipped

### 3. Real device: permission-denial hard block

expected: On a real device, deny camera or location permission — the exact UI-SPEC hard-block copy appears with settings guidance and no submit path is reachable.
result: resolved
reported: "The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission."
severity: blocker
resolved_by: "Plan 01-05: routed CameraCapture's getUserMedia()/getCurrentPosition() denial back through PermissionGate's shared hard-block state (deniedRef latch), instead of rendering raw err.message. Verified via tests/e2e/capture.spec.ts denial specs (currently passing) and phase 01-VERIFICATION.md re-verification pass. Not re-tested live on a real device since the fix; e2e coverage + code re-verification are the evidence of closure."

### 4. Real device: category picker touch targets and double-tap guard

expected: The 5-category picker shows amber-selected chips at 44px touch targets, comfortably tappable; rapid double-tapping Publish cannot create two complaints.
result: resolved
reported: "chips not arranged properly (uneven wrap: some chips full-width alone, others paired) — camera flip complaint withdrawn by user, confirmed intentional rear-camera-only design"
severity: cosmetic
resolved_by: "Plan 01-05: CategoryPicker.tsx switched from flex-wrap to a fixed grid (grid grid-cols-2), giving every chip a uniform cell regardless of label length while keeping the 44px touch target. Verified via tests/e2e/capture.spec.ts 'category picker renders uniform-width chips (G-01-4)' (currently passing). The double-tap-guard half of this test is tracked separately below (test 9) — it was never actually exercised by this test, only the chip layout was reported broken."

### 5. Forced photo 404 renders a placeholder, not a broken image

expected: Editing a card's photo_key to a nonexistent key renders a category-colored placeholder tile with an icon in the feed/permalink, not a broken-image icon.
result: skipped

### 6. Forced feed query failure shows the error banner, not a blank feed

expected: A transient DB/network failure on the feed query shows the "Couldn't load reports…" banner with a Retry button; the feed area is not blank.
result: pass
reason: "Verified via the production /api/feed 500 observed during test 3 — banner + Retry rendered correctly, feed area was not blank (see G-01-EXTRA-1)."

### 7. Feed pagination sentinel stops cleanly at the end of the list

expected: Publishing >20 complaints near the same fixture location and scrolling to the end — the IntersectionObserver sentinel stops firing once the server returns a null cursor; no perpetual loading spinner.
result: pass

### 8. Sign off: no rate limiting yet is an accepted Phase 1 gap

expected: Confirm that the absence of rate limiting on /api/upload-url and submitComplaint is an intentional, documented Phase 1 scope gap (WR-07), deferred to Phase 4 — not a regression to fix now.
result: pass

### 9. Rapid double-tap Publish cannot create two complaints

expected: On the /capture page, after a photo is captured and a category chosen, tap "Publish Report" twice in rapid succession (near-simultaneous, faster than a render cycle). Exactly one complaint is created; the second tap is a no-op.
result: pending
why_pending: "Carried forward from phase 01-VERIFICATION.md's behavior_unverified_items: the guard (`if (!photoKey || !category || publishPhase !== \"idle\") return;` in src/app/capture/page.tsx:37) is present and correct by construction, but no concurrency/race test (unit or e2e) exercises two near-simultaneous clicks — a state-transition/ordering invariant that static code reading cannot prove holds under real double-tap timing."

## Summary

total: 9
passed: 4
resolved: 2
issues: 0
pending: 1
skipped: 2
blocked: 0

## Gaps

- gap_id: G-01-4
  truth: "The 5-category picker shows amber-selected chips at 44px touch targets, comfortably tappable."
  status: resolved
  reason: "User reported: chips not arranged properly — CategoryPicker.tsx uses flex-wrap sized to label text, so longer labels (Pothole/Road damage, Garbage/Sanitation) each occupy a full row alone while shorter ones pair up, producing an uneven/inconsistent wrap."
  severity: cosmetic
  test: 4
  root_cause: "CategoryPicker.tsx renders chips in a flex flex-wrap container with intrinsic-width buttons (no fixed/grid-cell sizing). The 5 category labels span 14-22 characters, so flexbox's greedy line-packing produces uneven row groupings at mobile widths — expected CSS behavior, not a JS/state bug. 01-UI-SPEC.md constrains touch-target size and color states but has no grid/column layout contract for the picker (a spec gap, not a violation)."
  artifacts:

    - path: "src/components/capture/CategoryPicker.tsx"
      issue: "flex-wrap container with intrinsic-width chip buttons has no grid/fixed-cell constraint, causing uneven row packing when label lengths vary"
  missing:

    - "Replace the flex-wrap layout with a fixed grid (e.g. grid grid-cols-2 gap-2) so every chip occupies a uniform cell regardless of label length, keeping min-h-11 for the 44px touch target"
  debug_session: ".planning/debug/category-chip-uneven-wrap.md"
  resolved_by: "Plan 01-05. Re-verified passing in phase 01-VERIFICATION.md (tests/e2e/capture.spec.ts 'category picker renders uniform-width chips')."

- gap_id: G-01-3
  truth: "On a real device, deny camera or location permission — the exact UI-SPEC hard-block copy appears with settings guidance and no submit path is reachable."
  status: resolved
  reason: "User reported: The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission."
  severity: blocker
  test: 3
  root_cause: "CameraCapture.tsx's own getUserMedia() catch handler sets error state to err.message and renders the raw browser NotAllowedError text directly, with no connection to PermissionGate's dedicated hard-block UI. PermissionGate additionally fails open (renders children unconditionally) when navigator.permissions.query is unsupported for a given name (documented Safari/WebKit gap) or when permission state is still 'prompt' at mount (any first-ever visit) — in both cases CameraCapture's own getUserMedia() is what actually triggers the native prompt, and its denial is handled independently of PermissionGate's hard-block state."
  artifacts:

    - path: "src/components/capture/CameraCapture.tsx"
      issue: "getUserMedia() catch handler renders raw err.message directly in a <p> tag instead of triggering the shared hard-block UI"

    - path: "src/components/capture/PermissionGate.tsx"
      issue: "Proactive Permissions API check fails open when query is unsupported (Safari) or state is still 'prompt' at mount, letting CameraCapture render and independently trigger + handle the native prompt"
  missing:

    - "Route the getUserMedia()/getCurrentPosition() rejection in CameraCapture back through a shared callback/context keyed on err.name === 'NotAllowedError' so denial triggers PermissionGate's existing hard-block state instead of rendering err.message directly"
  debug_session: ".planning/debug/permission-hard-block-not-shown.md"
  resolved_by: "Plan 01-05 (deniedRef latch in PermissionGate). Re-verified passing in phase 01-VERIFICATION.md (tests/e2e/capture.spec.ts denial specs)."

- gap_id: G-01-EXTRA-1
  truth: "The public feed loads real complaint data on normal page load (not just under a forced/simulated failure — see test 6)."
  status: resolved
  reason: "Ad-hoc finding during test 3: on https://know-your-area.vercel.app/ (production deploy) the home feed unconditionally shows 'Couldn't load reports. Check your connection and try again.' Confirmed via curl: GET /api/feed returns HTTP 500 {\"error\":\"Couldn't load reports.\"} on every request, not just intermittently. User confirms the feed loads fine on localhost, so this looks like a production-deployment/env-config issue (e.g. DB connection string, Supabase pause) rather than an application code bug. Server-side error is swallowed (console.error only) in src/app/api/feed/route.ts:36, so exact root cause is not yet known."
  severity: blocker
  test: ad-hoc
  root_cause: "INCONCLUSIVE without Vercel function logs / production env dashboard access (both unavailable to the investigating agent). src/lib/db/client.ts instantiates postgres(requireEnv('DATABASE_URL')) with zero connection options (no ssl, no prepare, no pooler awareness) — the common root of the top 3 ranked hypotheses: (1) most plausible — Supabase's direct-connection host is IPv6-only while Vercel serverless functions lack IPv6 egress, so DATABASE_URL should use Supabase's pooler (Supavisor, port 6543) instead of the direct host; (2) missing explicit ssl config on the postgres.js client causes every TLS handshake to fail against Supabase; (3) if already pointed at a transaction-mode pooler, postgres.js's default prepared statements are incompatible with it and need { prepare: false }; (4) DATABASE_URL simply not set/scoped to Vercel's Production environment. Local success proves nothing about the connection layer since local Postgres is plaintext, unpooled, and IPv4-only — none of the properties a hosted Supabase instance has."
  artifacts:

    - path: "src/lib/db/client.ts"
      issue: "postgres.js client instantiated with no ssl/prepare/pooler-aware options — needs explicit config for Supabase's hosted-connection requirements rather than relying on connection-string defaults"

    - path: "src/app/api/feed/route.ts"
      issue: "catch-all swallows the real exception into a generic console.error, making the actual failure mode undiagnosable without Vercel log access — should log err.message/err.code even while still returning the generic user-facing message"
  missing:

    - "Check Vercel's function logs for the actual thrown error to disambiguate the ranked hypotheses"
    - "Cross-reference the DATABASE_URL host/port in Vercel's Production env scope against Supabase's Direct vs Session Pooler vs Transaction Pooler connection strings"
    - "Add explicit ssl and prepare:false options to the postgres.js client defensively, since they are correct regardless of which hypothesis is confirmed"
  debug_session: ".planning/debug/production-feed-500.md"
  resolved_by: "Plan 01-06 (defensive client.ts hardening + real error logging) + Plan 01-07 (confirmed/repaired Vercel DATABASE_URL pooler config and redeployed). STATE.md: 'Production feed 500 root cause resolved via Vercel DATABASE_URL/Supabase pooler config + redeploy.'"
