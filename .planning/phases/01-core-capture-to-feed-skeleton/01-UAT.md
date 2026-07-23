---
status: testing
phase: 01-core-capture-to-feed-skeleton
source: [01-VERIFICATION.md]
started: 2026-07-23T10:34:18Z
updated: 2026-07-23T10:34:18Z
---

## Current Test

number: 1
name: Design system renders correctly on a real mobile browser
expected: |
  shadcn new-york/neutral tokens and Geist Sans/Mono fonts render as specified — no fallback-font flash, no broken oklch tokens.
awaiting: user response

## Tests

### 1. Design system renders correctly on a real mobile browser
expected: shadcn new-york/neutral tokens and Geist Sans/Mono fonts render as specified — no fallback-font flash, no broken oklch tokens.
result: [pending]

### 2. Real iOS Safari: photo orientation and overlay legibility
expected: Capture a photo in portrait orientation on real iOS Safari — not rotated/skewed, burned-in overlay text upright, legible, wraps/truncates gracefully at a narrow aspect ratio (RESEARCH.md Pitfall 3 explicitly evades emulation).
result: [pending]

### 3. Real device: permission-denial hard block
expected: On a real device, deny camera or location permission — the exact UI-SPEC hard-block copy appears with settings guidance and no submit path is reachable.
result: [pending]

### 4. Real device: category picker touch targets and double-tap guard
expected: The 5-category picker shows amber-selected chips at 44px touch targets, comfortably tappable; rapid double-tapping Publish cannot create two complaints.
result: [pending]

### 5. Forced photo 404 renders a placeholder, not a broken image
expected: Editing a card's photo_key to a nonexistent key renders a category-colored placeholder tile with an icon in the feed/permalink, not a broken-image icon.
result: [pending]

### 6. Forced feed query failure shows the error banner, not a blank feed
expected: A transient DB/network failure on the feed query shows the "Couldn't load reports…" banner with a Retry button; the feed area is not blank.
result: [pending]

### 7. Feed pagination sentinel stops cleanly at the end of the list
expected: Publishing >20 complaints near the same fixture location and scrolling to the end — the IntersectionObserver sentinel stops firing once the server returns a null cursor; no perpetual loading spinner.
result: [pending]

### 8. Sign off: no rate limiting yet is an accepted Phase 1 gap
expected: Confirm that the absence of rate limiting on /api/upload-url and submitComplaint is an intentional, documented Phase 1 scope gap (WR-07), deferred to Phase 4 — not a regression to fix now.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
