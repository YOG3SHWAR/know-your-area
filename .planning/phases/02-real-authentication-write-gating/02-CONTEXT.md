# Phase 2: Real Authentication & Write-Gating - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Phase 1 stub identity (`kya_device_id` cookie) with a real Google OAuth account, normalized to one internal `user_id`, and gate the submit-complaint write action behind login. Feed browsing stays fully anonymous — no change there. Phone OTP (AUTH-02) is explicitly out of this phase's scope (see D-01) — it moves to a future phase.

Requirements covered this phase: AUTH-01, AUTH-03, AUTH-04. AUTH-02 (phone OTP) is deferred — see Claude's Discretion / Deferred.

</domain>

<decisions>
## Implementation Decisions

### Auth Provider Scope
- **D-01:** Phase 2 ships Google OAuth only. Phone number + OTP (AUTH-02) is formally deferred out of this phase — no Credentials provider scaffold, no phone-number schema field, no MSG91/2Factor integration is built now, not even as an unwired placeholder. — **Reversibility:** reversible — Auth.js supports adding a Credentials provider later without restructuring the OAuth path; this is a scope-timing decision, not an architectural one.
- **D-02:** Because only one provider exists this phase, there is no "same person via two providers" identity-linking problem to solve yet. Skip building any account-merge/link logic now — revisit when phone OTP is actually added.

### Legacy Anonymous Data
- **D-03:** No claim/migration logic for Phase 1's `kya_device_id`-attributed complaints. The app has no real users yet — the user will clear existing complaint data before/around Phase 2 shipping, so there's nothing to reconcile. Do not build device-id → user_id claiming.

### Write-Gating UX
- **D-04:** The login gate fires at the entry to `/capture`, before any camera/GPS permission is requested — not after a photo is captured and the user tries to submit. An anonymous visitor must never reach the point of using the camera/GPS only to then be blocked.
- **D-05:** Gating mechanism is an immediate redirect: an anonymous visitor hitting `/capture` is redirected straight to `/login` with a callback back to `/capture` (post-auth return-to-place, e.g. Auth.js `callbackUrl`). No inline "log in to report" screen is rendered at `/capture` itself.

### Claude's Discretion
- Exact Google OAuth session strategy (JWT vs. DB-backed session), cookie settings for the session, and how `submitter_id`/`user_id` interplay with the existing `kya_device_id` cookie post-login (e.g. whether the device-id cookie is cleared, ignored, or left alone) are left to research/planning — no user preference expressed beyond "no migration logic needed."
- Phone number / OTP is deferred, but the researcher/planner should keep the `submitterId` schema field and the Auth.js provider setup shaped so a future Credentials provider can be added later without a data migration (same spirit as Phase 1's D-05, now one level up the stack).

### Folded Todos
None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Constraints
- `.claude/CLAUDE.md` — Auth section: Auth.js (NextAuth) v5 recommendation, Google OAuth as first-class built-in provider, phone OTP as a hand-rolled Credentials provider (now deferred per D-01), and the "no contributor should need a paid API key" bias that motivated deferring OTP rather than half-building it.

### Project Definition
- `.planning/PROJECT.md` — Core value, constraints, and Key Decisions log (browse-anonymous/post-requires-account decision).
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-04 acceptance criteria. **Note:** AUTH-02 traceability should be updated to reflect deferral out of Phase 2 (see confirm_creation summary).
- `.planning/ROADMAP.md` §Phase 2 — Phase goal, success criteria, and the "normalize both auth providers into one identity shape" architecture note (now only applies once OTP is actually added).

### Prior Phase Context
- `.planning/phases/01-core-capture-to-feed-skeleton/01-CONTEXT.md` — D-05 (stub `kya_device_id` identity designed to map cleanly onto a real `user_id`) and D-06 (no fake username shown) — directly informs how the real `user_id` should slot into the existing schema and feed display.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/device-id.ts` — `getOrCreateDeviceId()`: current stub identity source. Its cookie (`kya_device_id`) and pattern (CSPRNG-generated, httpOnly, 2-year maxAge) is the precedent to follow for real session cookie hygiene, even though it's being superseded as the write-path identity.
- `src/actions/submit-complaint.ts` — Server Action currently calls `getOrCreateDeviceId()` and assigns the result to `submitterId`. This is the exact integration point where real auth's `user_id` must be substituted (or gate-checked before this Server Action runs).
- `src/lib/db/schema.ts` — `complaints.submitterId` is a plain `text` column (not a foreign key yet) — no `users` table exists. This phase will need to introduce a `users` table and decide whether to formalize `submitterId` as a FK.

### Established Patterns
- IDOR mitigation pattern: internal serial `id` never exposed, only opaque `publicId` — same discipline should extend to any new `users.id` if it's ever referenced client-side.
- `sanitizeError` (from Phase 1, 01-12) is the single shared error-sanitization utility for user-facing error messages — any new auth-related error paths (failed login, gate redirect edge cases) should route through it rather than a new ad-hoc handler.

### Integration Points
- `/capture` route (or its layout/page) is where the D-04/D-05 login gate must be enforced — likely a server-side auth check before the page renders, redirecting unauthenticated visitors to `/login`.
- `submit-complaint.ts` Server Action must switch from `getOrCreateDeviceId()` to reading the authenticated session's real `user_id` (and should reject if no session, as defense-in-depth behind the route-level gate).

</code_context>

<specifics>
## Specific Ideas

- No app-specific UX styling requirements were expressed beyond the gate mechanics (redirect-with-return, not a modal). Standard Google OAuth consent flow is acceptable.

</specifics>

<deferred>
## Deferred Ideas

- **Phone number + OTP login (AUTH-02)** — deferred out of Phase 2 entirely per D-01. Belongs in a future phase (or reopened within Phase 2's scope later if priorities change). When it returns: re-open the identity-linking question (D-02) for users who sign in with both Google and phone.
- **Device-id → account claiming** — deferred per D-03 because there's no real user data yet. If this ever becomes relevant again (e.g. a future "anonymous draft, claim on login" flow), it would need its own design pass.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 2-Real Authentication & Write-Gating*
*Context gathered: 2026-07-28*
