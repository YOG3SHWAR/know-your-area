# Phase 2: Real Authentication & Write-Gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-28
**Phase:** 2-Real Authentication & Write-Gating
**Areas discussed:** OTP SMS provider & dev setup, Google + phone identity linking, Legacy anonymous complaints (Phase 1), Write-gating UX flow

---

## OTP SMS provider & dev setup

| Option | Description | Selected |
|--------|-------------|----------|
| Mock/bypass in dev | Dev/test accepts a fixed code or logs OTP to console; production uses real vendor | |
| Real vendor account always | Every environment, including dev, sends real SMS | |

**User's choice:** Free text — "we can skip otp login, we can only use google auth for now"
**Notes:** This reframed the question entirely — the user isn't choosing an OTP dev strategy, they're deferring OTP out of the phase altogether. Confirmed as a follow-up (see below).

---

## Scope confirmation: defer AUTH-02 entirely

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, defer OTP entirely | Phase 2 = Google OAuth only; AUTH-02 moves out of Phase 2 traceability | ✓ |
| Build OTP scaffold now, wire up later | Add Credentials provider shape + phone schema field now, leave SMS vendor unintegrated | |

**User's choice:** Yes, defer OTP entirely
**Notes:** REQUIREMENTS.md and ROADMAP.md updated accordingly (AUTH-02 marked deferred/unscheduled; Phase 2 requirements/success-criteria trimmed to Google OAuth only).

---

## Google + phone identity linking

**Status:** Resolved as moot without further questions — since only Google OAuth exists this phase, there's no cross-provider identity-linking problem to solve (D-02 in CONTEXT.md). Revisit when phone OTP is actually built.

---

## Legacy anonymous complaints (Phase 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-claim on first login | Re-attribute device-id complaints to the new user_id on first login | |
| Leave orphaned, no claiming | Old device-id complaints stay disconnected from any account | |

**User's choice:** Free text — "the website isnt being used by anyone, i will clear all the data"
**Notes:** No real users/data exist yet; user will clear existing complaint data. No claim/migration logic needed (D-03 in CONTEXT.md).

---

## Write-gating UX flow

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to /login, bounce back | Anonymous user hitting Submit is redirected to /login, returned after auth | |
| Inline modal over current screen | Login modal pops up without navigating away | |

**User's choice:** Free text — "anonymous user should be prmomted to login on going to caputure only, no need to capture then ask to login"
**Notes:** Clarified that the gate must fire at entry to `/capture`, before camera/GPS permission is requested — not after a photo is captured and the user tries to submit.

### Follow-up: gate mechanism at /capture

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate redirect to /login | Anonymous visitor hitting /capture is redirected straight to /login with a callback back to /capture | ✓ |
| "Log in to report" screen at /capture | /capture renders for anonymous users but shows a login prompt instead of the camera | |

**User's choice:** Immediate redirect to /login
**Notes:** Captured as D-04/D-05 in CONTEXT.md.

---

## Claude's Discretion

- Google OAuth session strategy (JWT vs. DB-backed session) and cookie configuration.
- How `submitter_id`/`user_id` interplay with the existing `kya_device_id` cookie post-login (clear it, ignore it, or leave it).
- Keeping the Auth.js provider setup and `submitterId` schema shape provider-agnostic for a future OTP addition (no explicit user requirement, but flagged as a design nudge).

## Deferred Ideas

- **Phone number + OTP login (AUTH-02)** — deferred out of Phase 2 entirely. Belongs in a future phase. When it returns, revisit identity-linking (Google + phone same person).
- **Device-id → account claiming** — deferred; no real user data exists yet to migrate. Would need its own design pass if ever revisited.
