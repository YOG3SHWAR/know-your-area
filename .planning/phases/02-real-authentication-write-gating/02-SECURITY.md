---
phase: 02
slug: real-authentication-write-gating
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-30
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry → build | Third-party package code (`better-auth`) enters the app's trust boundary at install time | Executable code |
| browser → `/api/auth/*` | Unauthenticated HTTP requests reach the Better Auth catch-all handler | Credentials, session cookies |
| app → Postgres | Session/user/account reads and writes cross into the database | User identity, session tokens |
| anonymous browser → `/capture` | Untrusted request attempts to reach the gated camera/GPS surface | Session cookie (or absence) |
| browser → `/login` → Google | OAuth redirect round-trip carrying a `callbackUrl` param | OAuth state, callback URL |
| Google → `/api/auth/callback/google` | OAuth callback returns to the app | Authorization code, state param |
| any caller → `submitComplaint` / `POST /api/upload-url` | Write-performing Server Action / Route Handler reachable independent of the `/capture` page | Session cookie, complaint data |
| anonymous browser → `/`, `/c/[id]`, `/api/feed` | Public read surfaces that must remain ungated | None (read-only) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-SC | Tampering | `npm install better-auth` / `@better-auth/cli` | high | mitigate | Blocking-human legitimacy checkpoint completed before install (02-01-SUMMARY); packages confirmed official org/repo | closed |
| T-02-01 | Spoofing | Session cookie signing (`BETTER_AUTH_SECRET`) | high | mitigate | `requireEnv("BETTER_AUTH_SECRET")` fails fast on missing/empty value (`src/lib/auth.ts:20`) — no silent fallback to a predictable default; secret generated via CSPRNG (`@better-auth/cli secret`) | closed |
| T-02-07 | Information Disclosure | Google client secret | high | mitigate | `GOOGLE_CLIENT_SECRET` read only via `requireEnv` inside `src/lib/auth.ts`, a server-only module — confirmed absent from any client component / browser bundle | closed |
| T-02-08 | Tampering | Drizzle adapter SQL dialect (A1) | medium | mitigate | `tests/e2e/auth-adapter.spec.ts` re-run live against real Postgres — session endpoint round-trips correctly | closed |
| T-02-01b | Spoofing | `/capture` Server Component gate | high | mitigate | `src/app/capture/page.tsx` is an `async` Server Component (no `"use client"`) calling `auth.api.getSession()` — a real DB-backed lookup, not cookie-presence-only — and `redirect()`s before `CaptureClient` mounts; live e2e confirms | closed |
| T-02-02 | Tampering | OAuth callback CSRF / state param | high | mitigate | No hand-rolled OAuth state/PKCE handling — `authClient.signIn.social` / Better Auth's internal callback flow performs state-param + PKCE verification; `grep` confirms no custom OAuth code | closed |
| T-02-04 | Tampering | Open redirect via `callbackUrl` | medium | mitigate | Verified against installed `better-auth` source (`dist/api/middlewares/origin-check.mjs`, `dist/context/helpers.mjs`): every `callbackURL` passed to `signIn.social` is validated server-side by `originCheckMiddleware` against `trustedOrigins`, which defaults to `[origin-of-BETTER_AUTH_URL]` only (no wildcard, no env override configured) — an attacker-supplied `callbackUrl=https://evil.com` is rejected with 403 `INVALID_CALLBACK_URL` before any redirect happens; relative paths are further restricted by regex to block `//`, `\`, and encoded-slash bypass forms | closed |
| T-02-09 | Information Disclosure | Flash of gated content | low | accept | Server Component redirect fires before any client paint — structurally no content to flash | closed (accepted) |
| T-02-03 | Elevation of Privilege | `submitComplaint` + `POST /api/upload-url` called directly (gate bypass) | high | mitigate | Each handler independently calls `auth.api.getSession()` and rejects before any work (defense-in-depth, not reliant on the `/capture` page); unit tests re-run, both no-session-401 cases pass | closed |
| T-02-10 | Elevation of Privilege | device-id fallback identity re-entering the write path | high | mitigate | `src/lib/device-id.ts` deleted; `grep -rn "device-id\|getOrCreateDeviceId" src` returns no matches | closed |
| T-02-11 | Information Disclosure | Internal `user.id` exposure (IDOR) | low | accept | `session.user.id` written only to the server-side `submitter_id` column; `src/lib/feed.ts` comment + query confirm `submitter_id`/internal serial `id` are never selected into any client-facing payload | closed (accepted) |
| T-02-12 | Denial of Service | AUTH-04 regression — gate accidentally applied to feed | medium | mitigate | Explicit e2e "not redirected to /login" assertions on `feed.spec.ts` / `permalink.spec.ts` / `search.spec.ts`; `grep -rnE "getSession" src/app/page.tsx src/app/c src/app/api/feed` returns no matches | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-09 | Flash-of-gated-content is structurally impossible given the Server Component redirect architecture (D-05) — no code path exists for it to occur, so no further mitigation is actionable | Plan 02-02 (D-05) | 2026-07-30 |
| AR-02-02 | T-02-11 | `session.user.id` is confined to server-side write paths only (`submitter_id` column); the existing IDOR discipline from Phase 01 (opaque `publicId`, never internal serial `id`, on client payloads) already covers this surface — no new client-visible identifier introduced | Plan 02-03 | 2026-07-30 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-30 | 12 | 12 | 0 | Claude (gsd-secure-phase, orchestrator-verified — register authored at plan time across 02-01/02-02/02-03-PLAN.md, ASVS L1, short-circuit path per workflow step 3) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-30
