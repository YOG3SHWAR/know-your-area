---
status: partial
phase: 01-core-capture-to-feed-skeleton
source: [01-VERIFICATION.md]
started: 2026-07-23T10:34:18Z
updated: "2026-07-23T11:19:17.443Z"
---

## Current Test

[testing paused — 2 items outstanding]

## Tests

### 1. Design system renders correctly on a real mobile browser

expected: shadcn new-york/neutral tokens and Geist Sans/Mono fonts render as specified — no fallback-font flash, no broken oklch tokens.
result: pass

### 2. Real iOS Safari: photo orientation and overlay legibility

expected: Capture a photo in portrait orientation on real iOS Safari — not rotated/skewed, burned-in overlay text upright, legible, wraps/truncates gracefully at a narrow aspect ratio (RESEARCH.md Pitfall 3 explicitly evades emulation).
result: skipped

### 3. Real device: permission-denial hard block

expected: On a real device, deny camera or location permission — the exact UI-SPEC hard-block copy appears with settings guidance and no submit path is reachable.
result: issue
reported: "The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission."
severity: blocker

### 4. Real device: category picker touch targets and double-tap guard

expected: The 5-category picker shows amber-selected chips at 44px touch targets, comfortably tappable; rapid double-tapping Publish cannot create two complaints.
result: issue
reported: "chips not arranged properly (uneven wrap: some chips full-width alone, others paired) — camera flip complaint withdrawn by user, confirmed intentional rear-camera-only design"
severity: cosmetic

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

## Summary

total: 8
passed: 4
issues: 2
pending: 0
skipped: 2
blocked: 0

## Gaps

- gap_id: G-01-4
  truth: "The 5-category picker shows amber-selected chips at 44px touch targets, comfortably tappable."
  status: failed
  reason: "User reported: chips not arranged properly — CategoryPicker.tsx uses flex-wrap sized to label text, so longer labels (Pothole/Road damage, Garbage/Sanitation) each occupy a full row alone while shorter ones pair up, producing an uneven/inconsistent wrap."
  severity: cosmetic
  test: 4
  artifacts:

    - path: "src/components/capture/CategoryPicker.tsx"
      issue: "flex-wrap layout produces inconsistent row grouping across the 5 chips"
  missing: []

- gap_id: G-01-3
  truth: "On a real device, deny camera or location permission — the exact UI-SPEC hard-block copy appears with settings guidance and no submit path is reachable."
  status: failed
  reason: "User reported: The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission."
  severity: blocker
  test: 3
  artifacts: []
  missing: []

- gap_id: G-01-EXTRA-1
  truth: "The public feed loads real complaint data on normal page load (not just under a forced/simulated failure — see test 6)."
  status: failed
  reason: "Ad-hoc finding during test 3: on https://know-your-area.vercel.app/ (production deploy) the home feed unconditionally shows 'Couldn't load reports. Check your connection and try again.' Confirmed via curl: GET /api/feed returns HTTP 500 {\"error\":\"Couldn't load reports.\"} on every request, not just intermittently. User confirms the feed loads fine on localhost, so this looks like a production-deployment/env-config issue (e.g. DB connection string, Supabase pause) rather than an application code bug. Server-side error is swallowed (console.error only) in src/app/api/feed/route.ts:36, so exact root cause is not yet known."
  severity: blocker
  test: ad-hoc
  artifacts:

    - path: "src/app/api/feed/route.ts"
      issue: "Catch-all 500 handler swallows the real error server-side; feed is unconditionally broken in production"
  missing: []
