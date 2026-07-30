---
status: testing
phase: 02-real-authentication-write-gating
source: [02-VERIFICATION.md]
started: 2026-07-30T08:49:50Z
updated: 2026-07-30T08:49:50Z
---

## Current Test

number: 1
name: Real Google OAuth click-through
expected: |
  Click "Sign in with Google" on /login with real Google credentials (not the e2e
  testUtils-seeded fixture session) and complete the actual OAuth consent flow.
  Google's consent screen appears; approving it returns the browser to /capture
  authenticated. Signing in again with the same Google account does not create a
  second user row (Better Auth's account table is keyed by provider+accountId).
awaiting: user response

## Tests

### 1. Real Google OAuth click-through
expected: |
  Click "Sign in with Google" on /login with real Google credentials (not the e2e
  testUtils-seeded fixture session) and complete the actual OAuth consent flow.
  Google's consent screen appears; approving it returns the browser to /capture
  authenticated. Signing in again with the same Google account does not create a
  second user row (Better Auth's account table is keyed by provider+accountId).
result: [pending]

### 2. Sign-in button loading-state visual transition
expected: |
  Click "Sign in with Google" on /login and observe the button state transition.
  The button immediately disables and the Google "G" logo is replaced by a
  spinner + "Redirecting to Google…" label before the browser navigates away,
  per UI-SPEC.
result: [pending]

### 3. Failed-OAuth-callback error UI
expected: |
  Force a failed OAuth callback (deny consent on Google's screen, or otherwise
  trigger onAPIError.errorURL) and observe /login. The page shows "Something
  went wrong signing you in. Please try again." in destructive/red styling
  above a still-clickable "Sign in with Google" button — no raw 500 or blank
  page.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
