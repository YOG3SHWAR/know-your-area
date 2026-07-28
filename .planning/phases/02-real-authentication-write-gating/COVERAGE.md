# Phase 2 — External API Coverage Matrix

**API integrated:** Google OAuth 2.0 / OIDC, via the `better-auth` library (Google `socialProviders` + the `/api/auth/[...all]` catch-all handler).
**Baseline:** Full coverage by default — every capability starts as INTEGRATE; each row below is a subtraction record with a reason.

| capability | decision | reason |
|---|---|---|
| authorization-code sign-in (`signIn.social` → Google consent) | INTEGRATE | AUTH-01 core — the "Sign in with Google" button on `/login` |
| OAuth callback handling (`/api/auth/callback/google`) | INTEGRATE | Mounted by the Better Auth catch-all handler; completes the sign-in round-trip |
| ID-token / userinfo → `user` row mapping (keyed by Google `sub`) | INTEGRATE | The "one internal user_id per Google account" requirement — Better Auth `user`/`account` tables |
| session creation (DB-backed `session` row + signed cookie) | INTEGRATE | AUTH-01/AUTH-03 — persistent login |
| session validation (`auth.api.getSession`) | INTEGRATE | The gate + defense-in-depth checks (Patterns 3/5/6) |
| session persistence across refresh (rolling `updateAge`) | INTEGRATE | AUTH-03 — session survives reload (Better Auth default) |
| sign-out / session revocation endpoint (`/api/auth/sign-out`) | INTEGRATE | Endpoint is auto-mounted by the catch-all handler (available, DB-revocable) |
| sign-out UI (a visible "log out" control) | OPT-OUT | No account/sign-out UI ships this phase — out of scope per 02-CONTEXT.md Specifics ("the only write action gated is complaint submission") |
| account linking / multiple providers per user | OPT-OUT | Deferred per D-01/D-02 — only Google exists this phase, so there is no second-provider identity to link; revisit when phone OTP (AUTH-02) is added |
| Credentials / phone-OTP provider | OPT-OUT | Explicitly deferred (D-01) — no Credentials provider, phone field, or SMS vendor is built, not even as a placeholder |
| additional Google scopes / incremental auth | OPT-OUT | Only default `openid`/`email`/`profile` identity scopes are needed; the app calls no other Google APIs |
| Google offline access / refresh-token storage for API calls | OPT-OUT | Google is used for identity only — no Google API is called on the user's behalf, so no offline refresh token is stored |
| email-verification flow | OPT-OUT | Google accounts are already provider-verified; no email/password provider exists this phase to verify |
| token revocation at Google (RFC 7009) | OPT-OUT | Local session revocation via the DB `session` table is sufficient for this phase's needs; no sign-out UI ships to trigger it |
