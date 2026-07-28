# Phase 2: Real Authentication & Write-Gating - Research

**Researched:** 2026-07-28
**Domain:** Web app authentication (Google OAuth), session management, and server-side route/action gating in Next.js 15 App Router
**Confidence:** MEDIUM-HIGH (stack recommendation required deviating from `.claude/CLAUDE.md`'s literal Auth.js v5 mention — see State of the Art — everything else is HIGH)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 2 ships Google OAuth only. Phone number + OTP (AUTH-02) is formally deferred out of this phase — no Credentials provider scaffold, no phone-number schema field, no MSG91/2Factor integration is built now, not even as an unwired placeholder. — Reversibility: reversible.
- **D-02:** Because only one provider exists this phase, there is no "same person via two providers" identity-linking problem to solve yet. Skip building any account-merge/link logic now — revisit when phone OTP is actually added.
- **D-03:** No claim/migration logic for Phase 1's `kya_device_id`-attributed complaints. The app has no real users yet — the user will clear existing complaint data before/around Phase 2 shipping, so there's nothing to reconcile. Do not build device-id → user_id claiming.
- **D-04:** The login gate fires at the entry to `/capture`, before any camera/GPS permission is requested — not after a photo is captured and the user tries to submit. An anonymous visitor must never reach the point of using the camera/GPS only to then be blocked.
- **D-05:** Gating mechanism is an immediate redirect: an anonymous visitor hitting `/capture` is redirected straight to `/login` with a callback back to `/capture` (post-auth return-to-place). No inline "log in to report" screen is rendered at `/capture` itself.

### Claude's Discretion
- Exact Google OAuth session strategy (JWT vs. DB-backed session), cookie settings for the session, and how `submitter_id`/`user_id` interplay with the existing `kya_device_id` cookie post-login (e.g. whether the device-id cookie is cleared, ignored, or left alone) are left to research/planning — no user preference expressed beyond "no migration logic needed."
- Phone number / OTP is deferred, but the researcher/planner should keep the `submitterId` schema field and the auth provider setup shaped so a future Credentials provider can be added later without a data migration (same spirit as Phase 1's D-05, now one level up the stack).

### Deferred Ideas (OUT OF SCOPE)
- **Phone number + OTP login (AUTH-02)** — deferred out of Phase 2 entirely per D-01. Belongs in a future phase. When it returns: re-open the identity-linking question (D-02) for users who sign in with both Google and phone.
- **Device-id → account claiming** — deferred per D-03 because there's no real user data yet.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign up/log in via Google OAuth | Standard Stack (Better Auth `socialProviders.google`), Code Examples §1-3, Architecture Pattern 1 |
| AUTH-03 | User's session persists across browser refresh | Architecture Pattern 2 (DB-backed session, default 7-day expiry with rolling refresh) |
| AUTH-04 | User can browse the complaint feed without logging in | Architectural Responsibility Map — feed route is untouched, no gate added there; Anti-Patterns (don't gate `/`, `/c/[id]`, `/api/feed`) |
</phase_requirements>

## Summary

Phase 2 replaces the Phase 1 stub identity (`kya_device_id` cookie) with a real, DB-backed Google OAuth identity, and gates two concrete write surfaces — the `/capture` route (server-side, before render) and both write-performing server endpoints (`submitComplaint` Server Action, `/api/upload-url` Route Handler) — behind that identity. Feed browsing (`/`, `/c/[id]`, `/api/feed`) is untouched and stays fully anonymous.

The single most important research finding is that **the project's own `.claude/CLAUDE.md` stack recommendation (Auth.js/NextAuth v5) is now stale**: as of September 2025, the Auth.js/NextAuth team folded the project into **Better Auth**, and Auth.js v5 is now in maintenance mode (security patches only, no new features), still permanently labeled beta after 2+ years [CITED: better-auth.com/blog/authjs-joins-better-auth, github.com/nextauthjs/next-auth Discussion #13252]. CLAUDE.md's own Auth.js entry flagged this exact risk ("expect occasional churn... re-verify at implementation time") — this research fulfills that instruction rather than overriding it. **Recommendation: use Better Auth (`better-auth` npm package), not `next-auth`.** Better Auth is actively developed, has first-class Next.js 15 App Router + React 19 support, a native Drizzle adapter that is compatible with the project's exact `drizzle-orm` version, defaults to DB-backed sessions (which trivially satisfies AUTH-03), and has a documented Google OAuth flow that produces exactly the "one internal `user_id` keyed by Google's `sub`" shape the phase needs out of the box via its `account` table.

The correct place for the D-04/D-05 login gate is a **Server Component check at the top of `src/app/capture/page.tsx`** (not middleware). Because Next.js App Router Server Components fully render server-side before any client component in the tree mounts, an `async` server `page.tsx` that calls `auth.api.getSession()` and `redirect()`s before rendering the (now child) client capture UI guarantees no camera/GPS permission prompt can fire for an anonymous visitor — no edge-runtime middleware is required to satisfy this requirement, and middleware would add complexity (Better Auth's own docs mark cookie-only middleware checks as "NOT SECURE," recommending exactly the per-page pattern already described).

**Primary recommendation:** Install `better-auth`, wire it with the existing `drizzle-orm`/`postgres` client via `drizzleAdapter(db, { provider: "pg" })`, add Google as the only social provider, gate `/capture` with a Server Component session check, defense-in-depth-gate `submitComplaint` and `/api/upload-url`, and delete the now-dead `src/lib/device-id.ts` module rather than leaving it to coexist.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Google OAuth redirect + callback handling | API / Backend | — | Better Auth's catch-all Route Handler (`/api/auth/[...all]`) owns the OAuth dance server-side; never touched by client code directly except via `authClient`. |
| `/capture` login gate (D-04/D-05) | Frontend Server (SSR) | — | Must run as part of the Server Component render of `capture/page.tsx`, before the client capture UI mounts — this is the only place that structurally guarantees "before any camera/GPS prompt." |
| Session persistence across refresh (AUTH-03) | Database / Storage | Browser / Client | Session record lives in Postgres (`session` table); browser only holds a signed, unguessable cookie token pointing at it — satisfies "survives refresh" without any client-side storage logic. |
| Sign-in UI ("Sign in with Google" button) | Browser / Client | — | `authClient.signIn.social({ provider: "google", callbackURL: "/capture" })` must run in a client component (`/login` page) — it triggers a `window.location` redirect to Google. |
| Write-path defense-in-depth (`submitComplaint`, `/api/upload-url`) | API / Backend | — | Both already run server-side; each must independently call `auth.api.getSession()` and reject before doing any work, regardless of whether the route-level gate was bypassed. |
| Feed browsing (`/`, `/c/[id]`, `/api/feed`) | Frontend Server (SSR) / API | — | Explicitly untouched — AUTH-04 requires these stay gate-free. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | 1.6.25 [VERIFIED: npm registry, published 2026-07-23] | Auth core: session management, OAuth provider handling, Drizzle-backed persistence | Actively developed (weekly releases), 6.18M weekly downloads [VERIFIED: npm registry], official successor to Auth.js/NextAuth per the maintainers' own Sept-2025 announcement [CITED: better-auth.com/blog/authjs-joins-better-auth]. Ships a `./adapters/drizzle` and `./next-js` subpath — no separate adapter package install needed [VERIFIED: `npm view better-auth exports`]. |
| `@better-auth/cli` | 1.4.21 [VERIFIED: npm registry, published 2026-03-01] | `generate`/`migrate` commands that emit the Drizzle schema for `user`/`session`/`account`/`verification` tables | Official schema-generation tool, ships a stable (not-newly-published) release so it passed the package legitimacy gate cleanly, unlike the newer `auth` CLI alias — see audit below. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` | 0.45.2 (already installed) | Drizzle instance passed into `drizzleAdapter` | Better Auth's peer dependency pins exactly `drizzle-orm: ^0.45.2` [VERIFIED: `npm view better-auth peerDependencies`] — matches the project's installed version exactly, zero upgrade needed. |
| `drizzle-kit` | 0.31.10 (already installed) | Generate/push the migration for Better Auth's new tables, same as `complaints` | Better Auth peer-requires `drizzle-kit >=0.31.4` — already satisfied. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Better Auth | Auth.js v5 (`next-auth@5.0.0-beta.32`) | This is what `.claude/CLAUDE.md` originally names. It is now in maintenance mode (security fixes only) and permanently beta [CITED: GitHub Discussion #13382 "How many more years of beta releases for v5?"]. Still viable — Google provider works fine, Drizzle adapter exists (`@auth/drizzle-adapter` 1.11.3) — but you'd be building on a project its own maintainers now redirect newcomers away from. Only choose this if the team has a hard reason to avoid Better Auth's ~1-week-old latest release (see Package Legitimacy Audit). |
| DB-backed session (Better Auth default) | JWT-only stateless session | JWT session would avoid a `session` table lookup per request, but Better Auth's own default (`compact` cookie-cache strategy over a DB session) already avoids hitting Postgres on every request via a short-lived signed cookie cache — so the JWT-only route buys little here while giving up server-side session revocation (can't force-logout a compromised account without a JWT-specific denylist). Not recommended for this app. |

**Installation:**
```bash
npm install better-auth
npm install -D @better-auth/cli
```

**Version verification:** `npm view better-auth version` → `1.6.25`, published 2026-07-23 [VERIFIED: npm registry]. `npm view better-auth peerDependencies` confirms `drizzle-orm: ^0.45.2`, `drizzle-kit: >=0.31.4`, `next: ^14.0.0 || ^15.0.0 || ^16.0.0`, `react: ^18.0.0 || ^19.0.0` [VERIFIED: npm registry] — every peer range covers this project's exact installed versions (Next 15.5.21, React 19.2.8).

## Package Legitimacy Audit

> Required — this phase installs `better-auth`.

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------|-----------|-------------|---------|-------------|
| `better-auth` | npm | 5 days | 6.18M/wk | github.com/better-auth/better-auth | SUS (heuristic: "too-new") | **Approved with checkpoint** — see note below |
| `@better-auth/cli` | npm | ~5 months | 237K/wk | github.com/better-auth/better-auth | OK | Approved |
| `next-auth` (Auth.js v5, alternative path) | npm | 8 days | 5.48M/wk | github.com/nextauthjs/next-auth | SUS (heuristic: "too-new") | Not selected — documented as alternative only |
| `auth` (docs-stated CLI alias for `npx auth@latest generate`) | npm | 5 days | 98K/wk | github.com/better-auth/better-auth | SUS (heuristic: "too-new") | Not selected — use `@better-auth/cli` instead (same functionality, OK verdict) |
| `@better-auth/drizzle-adapter` | npm | 5 days | 5.36M/wk | github.com/better-auth/better-auth | SUS (heuristic: "too-new") | **N/A — not a separate install.** Bundled as `better-auth`'s own `./adapters/drizzle` subpath export; do not add to `package.json`. |

**Note on the "too-new" verdicts:** the legitimacy heuristic flags a package as suspicious when its *most recently published version* is very recent — it does not track first-publish/package-age. `better-auth` publishes new patch versions roughly weekly (confirmed: 5.0.0-beta.32/next-auth 4.24.15/better-auth 1.6.25 all published within days of each other on 2026-07-20/23), so this is a release-cadence false positive, not a hallucination/slopsquat signal: the package has an official GitHub org repo, 6M+ weekly downloads (nearly 20x this baseline project's other "OK"-rated deps like `postgres`), and a maintained changelog. Per protocol, this is still tagged `[SUS]` and the planner **must** insert a `checkpoint:human-verify` task before the `npm install better-auth` step, even though the underlying signal is a cadence artifact rather than a real legitimacy concern.

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious [SUS]:** `better-auth`, `next-auth`, `auth`, `@better-auth/drizzle-adapter` — all for the same "too-new" cadence reason described above. Planner must gate the `better-auth` install behind `checkpoint:human-verify`.

## Architecture Patterns

### System Architecture Diagram

```
Anonymous visitor                     Logged-in visitor
       │                                     │
       ▼                                     ▼
  GET /capture  ─────────────────────►  GET /capture
       │ (Server Component render)          │ (Server Component render)
       ▼                                     ▼
  auth.api.getSession()                 auth.api.getSession()
  → null                                 → { user, session }
       │                                     │
       ▼                                     ▼
  redirect(`/login?callbackUrl=/capture`)   render <CaptureClient />
       │                                     │  (client component: camera + GPS
       ▼                                     │   permission prompts fire ONLY here)
  GET /login (client component)              │
       │                                     ▼
       ▼                              User captures photo, picks category
  authClient.signIn.social(                  │
    { provider: "google",                    ▼
      callbackUrl: "/capture" })       Client calls POST /api/upload-url
       │                                     │  (Route Handler: auth.api.getSession()
       ▼                                     │   check #1 — 401 if absent)
  Google OAuth consent screen                ▼
       │                              R2 presigned PUT issued → browser uploads photo
       ▼                                     │
  GET /api/auth/callback/google               ▼
  (Better Auth Route Handler:          Client calls submitComplaint() Server Action
   - upsert `user` row keyed              │  (auth.api.getSession() check #2 —
     by Google `sub`                      │   throws if absent, defense-in-depth)
   - upsert `account` row                 ▼
     {providerId:"google",           INSERT complaints (submitterId = session.user.id)
      accountId:<sub>}                    │
   - create `session` row               ▼
   - set signed session cookie)     router.push("/") → public feed (unauth'd, untouched)
       │
       ▼
  redirect back to callbackUrl (/capture)
       │
       ▼
  (loops back to "Logged-in visitor" path above)
```

### Recommended Project Structure
```
src/
├── lib/
│   ├── auth.ts              # betterAuth() server config — Google provider, Drizzle adapter
│   ├── auth-client.ts       # createAuthClient() — used by client components (/login button)
│   ├── db/
│   │   ├── schema.ts        # existing complaints table + new user/session/account/verification tables
│   │   └── client.ts        # unchanged — same `db` instance passed into drizzleAdapter
│   └── device-id.ts         # DELETE — fully superseded, no remaining callers after this phase
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...all]/route.ts   # toNextJsHandler(auth) — Better Auth's catch-all handler
│   │   └── upload-url/route.ts     # add auth.api.getSession() check (defense-in-depth)
│   ├── capture/
│   │   └── page.tsx                # becomes an async Server Component: session check + redirect,
│   │                                # then renders the (renamed) client capture UI
│   └── login/
│       └── page.tsx                # client component: "Sign in with Google" button
├── components/
│   └── capture/
│       └── CaptureClient.tsx        # today's capture/page.tsx body, moved here, unchanged internals
└── actions/
    └── submit-complaint.ts          # swap getOrCreateDeviceId() for auth.api.getSession()
```

### Pattern 1: Server config (`src/lib/auth.ts`)
**What:** Single Better Auth instance, Google-only provider, Drizzle adapter pointed at the existing Postgres client.
**When to use:** This is the one and only `betterAuth()` call in the app — imported by the Route Handler, every Server Component gate, and every Server Action/Route Handler defense-in-depth check.
```typescript
// Source: better-auth.com/docs/installation, better-auth.com/docs/authentication/google
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  // nextCookies() must be the LAST plugin — auto-sets cookies for Server
  // Action-driven auth calls (source: better-auth.com/docs/integrations/next).
  plugins: [nextCookies()],
});
```

### Pattern 2: Route Handler (`src/app/api/auth/[...all]/route.ts`)
**What:** Mounts every Better Auth endpoint (OAuth redirect, callback, session, sign-out) under one catch-all.
```typescript
// Source: better-auth.com/docs/integrations/next
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Pattern 3: `/capture` Server Component gate (D-04/D-05)
**What:** The exact mechanism that satisfies "redirect fires before any camera/GPS permission prompt."
**When to use:** Any route that must be fully login-gated before its client tree mounts.
```typescript
// Source: better-auth.com/docs/integrations/next (adapted)
// src/app/capture/page.tsx — now a Server Component (no "use client")
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { CaptureClient } from "@/components/capture/CaptureClient";

export default async function CapturePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login?callbackUrl=/capture");
  }

  return <CaptureClient />;
}
```

### Pattern 4: `/login` sign-in button (client component)
```typescript
// Source: better-auth.com/docs/authentication/google
"use client";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <button
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL: callbackUrl })}
    >
      Sign in with Google
    </button>
  );
}
```

### Pattern 5: Server Action defense-in-depth (`submitComplaint`)
```typescript
// Source: better-auth.com/docs/integrations/next, adapted to existing submit-complaint.ts shape
"use server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function submitComplaint(input: SubmissionInput): Promise<{ publicId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("You must be signed in to submit a report.");
  }
  const submitterId = session.user.id; // replaces getOrCreateDeviceId()
  // ...rest unchanged (photoExists check, insert-with-retry loop)
}
```

### Pattern 6: Route Handler defense-in-depth (`/api/upload-url`)
**What:** `/api/upload-url` is a write-adjacent action (mints a real R2 presigned PUT) reachable directly by any caller, independent of `/capture`'s page-level gate. It must carry its own check.
```typescript
// src/app/api/upload-url/route.ts — add before the existing body-parsing logic
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ...existing bodySchema parse / presignPhotoUpload logic unchanged
}
```

### Anti-Patterns to Avoid
- **Gating via `middleware.ts` cookie presence check alone:** Better Auth's own docs explicitly label this "NOT SECURE" — `getSessionCookie()` only checks that *a* cookie exists, not that it's a valid signed session, and can be trivially forged. If middleware is added later for a fast optimistic redirect, it must never be the *only* check — the page-level `auth.api.getSession()` call (which does a real DB lookup) remains mandatory.
- **Gating the feed (`/`, `/c/[id]`, `/api/feed`):** AUTH-04 explicitly requires these stay anonymous-accessible. Do not add any session check to these routes.
- **Letting the route-level gate be the only gate:** `/capture`'s Server Component check stops the UI from rendering, but `submitComplaint` and `/api/upload-url` are independently reachable (e.g., a replayed request, a direct `fetch` from devtools) — both need their own `auth.api.getSession()` check, not just a comment saying "the page already checked this."
- **Reusing `kya_device_id` as a fallback identity post-login:** Once `submit-complaint.ts` reads `session.user.id`, there is no code path where the device-id cookie is still consulted — don't add a fallback branch "if no session, use device-id," since that would silently defeat the entire write-gate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Google OAuth token exchange, PKCE, state/nonce CSRF protection | Custom `fetch`-based OAuth client hitting Google's token endpoint | Better Auth's `socialProviders.google` | OAuth's CSRF/replay protections (state param, PKCE) are exactly the kind of subtle security surface a hand-rolled implementation gets wrong; Better Auth implements the full RFC-compliant flow. |
| Mapping a Google account to one internal `user_id` | A hand-written `users` table + manual upsert-on-first-login logic keyed by email | Better Auth's built-in `user`/`account` table pair (account row: `{providerId:"google", accountId:<Google sub>}` → `userId`) | This is precisely the "normalize to one internal `user_id`" requirement from the phase goal — Better Auth's schema already models provider-account-to-user identity this way, and is shaped to add a second provider (future phone OTP) without restructuring, satisfying the "Claude's Discretion" note in CONTEXT.md. |
| Session token generation/signing/rotation | A custom signed-cookie scheme reusing `crypto.randomUUID()` (the `kya_device_id` pattern) | Better Auth's session management (HMAC-signed session tokens, DB-backed, configurable `expiresIn`/`updateAge`) | The device-id cookie's CSPRNG pattern was fine for an anonymous identifier, but a real auth session additionally needs signature verification, revocability (force-logout), and cache-cookie/DB-source-of-truth reconciliation — solved problems, not worth re-deriving. |

**Key insight:** everything this phase needs — provider-agnostic identity, DB-backed sessions that survive refresh, Google-specific OAuth mechanics — is exactly what an auth library's core job is. The only genuinely custom code in this phase is the *placement* of the gate (Pattern 3), which is app-specific and correctly left to the plan.

## Common Pitfalls

### Pitfall 1: E2E tests currently `page.goto("/capture")` with no login step — they will all break
**What goes wrong:** `tests/e2e/capture.spec.ts` (5 tests) navigates straight to `/capture` and expects the camera UI to render immediately. After this phase ships, every one of these tests will be server-redirected to `/login` and fail.
**Why it happens:** Phase 1 had no login concept; the fixture (`tests/e2e/fixtures.ts`) only grants camera/geolocation browser permissions, not an authenticated session.
**How to avoid:** Add a Wave 0 test-infra task: extend `fixtures.ts` (or a new fixture) to seed a valid Better Auth session before each capture test — via a test-only helper that inserts `user`/`account`/`session` rows directly through Drizzle (bypassing the real Google OAuth redirect, which cannot run headlessly in CI) and sets the resulting session cookie via Playwright's `context.addCookies()`. This is a well-established pattern for e2e-testing OAuth-gated apps [CITED: nelsonlai.dev/blog/e2e-testing-with-better-auth; GitHub Discussion #2125 "Is it possible to manually create a session in Better Auth?"] — the session token must be produced by Better Auth's own `auth.$context.internalAdapter.createSession()` (or an equivalent server-side call), not hand-signed, since the cookie value is an HMAC-signed token keyed by `BETTER_AUTH_SECRET`.
**Warning signs:** All 5 `capture.spec.ts` tests fail with a redirect-to-`/login` URL mismatch immediately after this phase's plans land, if this fixture work isn't done first.

### Pitfall 2: `submit-complaint-sanitization.test.ts` mocks `@/lib/device-id` — deleting the module breaks the mock
**What goes wrong:** `tests/unit/submit-complaint-sanitization.test.ts` does `vi.mock("@/lib/device-id", ...)`. If `src/lib/device-id.ts` is deleted (recommended — see Architecture Patterns) without updating this test, the mock target no longer exists and the test suite fails to even load the module graph.
**Why it happens:** Grep confirms `getOrCreateDeviceId` has exactly one caller (`submit-complaint.ts`) and one test mock — both must change together.
**How to avoid:** In the same plan/task that swaps `submit-complaint.ts` to `auth.api.getSession()`, update the test's mock to mock `@/lib/auth` (or the session-reading helper) instead of `@/lib/device-id`.
**Warning signs:** `vitest run` fails to resolve the mocked module path.

### Pitfall 3: `/api/upload-url` is a write-adjacent action with zero auth check today
**What goes wrong:** This Route Handler mints a real, usable R2 presigned PUT URL for anyone who POSTs to it — it is not covered by `/capture`'s page-level gate (an attacker can call it directly), and "gate all write actions behind login" (phase goal wording) implies it should be gated too, not just `submitComplaint`.
**Why it happens:** It was built in Phase 1 before any auth concept existed, and its only current protections are content-type/extension validation, not identity.
**How to avoid:** Add the same `auth.api.getSession()` check (Pattern 6) to this route in the same plan that gates `submitComplaint`. Confirmed via direct file read — no auth-adjacent code exists in `route.ts` today.
**Warning signs:** An anonymous `curl -X POST /api/upload-url` still returns a valid presigned URL after this phase ships.

### Pitfall 4: Auth.js v5 environment-variable naming footguns (if the alternative path is ever chosen)
**What goes wrong:** Auth.js v5 auto-detects `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` *or* `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` depending on how the provider is imported, and requires `AUTH_SECRET` (not `NEXTAUTH_SECRET`, its v4 name) — a common source of "works locally, breaks in prod" bugs when only some vars are set in Vercel's dashboard.
**Why it happens:** v4→v5 renamed several env vars; tutorials online are inconsistently versioned.
**How to avoid:** N/A if Better Auth (this research's recommendation) is used — its env vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are stable and non-versioned. Documented here only because CLAUDE.md's original recommendation was Auth.js v5 — if the planner deviates from this research's recommendation, this pitfall applies.
**Warning signs:** OAuth callback throws a generic "Configuration" error with no useful detail (a known Auth.js v5 symptom for missing/misnamed env vars).

### Pitfall 5: Google Cloud Console redirect URI must exactly match, including the environment
**What goes wrong:** Better Auth's callback URL is `[baseURL]/api/auth/callback/google` — this must be registered *exactly* in Google Cloud Console's OAuth client "Authorized redirect URIs" for both `http://localhost:3000` (dev) and the production domain (e.g., `https://knowyourarea.in`, per STATE.md's prior production-domain incident on the R2 CORS config). A mismatch (missing trailing behavior, wrong protocol, forgotten prod entry) produces a Google-side `redirect_uri_mismatch` error, not an app-side one.
**Why it happens:** Google validates the redirect URI server-side against its registered allowlist before ever reaching the app's callback handler.
**How to avoid:** Register both dev and prod redirect URIs in the same Google Cloud Console OAuth client up front (`checkpoint:human-verify` task — this is a console action, not code). Also set `BETTER_AUTH_URL` to the correct base URL per environment (Vercel env var for prod, `.env.local` for dev) — the project already has one prior incident (STATE.md, 01-07) where a prod-vs-dev config mismatch caused a silent production failure; this is the same class of risk.
**Warning signs:** Google shows "Error 400: redirect_uri_mismatch" instead of the consent screen.

### Pitfall 6: `auth.api.getSession()` needs a live DB connection — don't run it on the Edge runtime
**What goes wrong:** If the session check is ever moved into `middleware.ts` (not recommended by this research, see Pattern 3/Anti-Patterns) using the real (non-cookie-only) `auth.api.getSession()` call, it requires the Node.js runtime, not Edge — the Drizzle/`postgres` client this project uses is not Edge-compatible. Next.js only supports Node.js-runtime middleware starting at 15.2.0+ [CITED: search result, Next.js 15.5.21 satisfies this].
**Why it happens:** Real session validation is a DB read; Edge middleware historically couldn't do that without a separate edge-compatible driver (e.g., Neon's HTTP driver), which this project doesn't use.
**How to avoid:** This research recommends skipping middleware entirely for the primary gate (Pattern 3 already runs on the Node.js runtime by default as a Server Component) — this pitfall is documented so the planner doesn't reach for middleware as a "simpler" option and hit a runtime error.
**Warning signs:** A middleware-based session check throws a driver/connection error specific to the Edge runtime.

### Pitfall 7: `better-auth`'s Drizzle `provider: "pg"` option name doesn't require the `pg` npm package
**What goes wrong:** It's easy to assume `provider: "pg"` means the `drizzleAdapter` needs the `pg` (node-postgres) driver installed, since `pg` also appears as an optional peer dependency in `better-auth`'s own `package.json`.
**Why it happens:** The adapter's `provider` option selects Postgres *SQL-dialect* behavior (e.g., `ON CONFLICT` syntax, quoting rules) for the Drizzle query builder — it operates against the `db` instance you pass in, regardless of which underlying driver (`postgres`/postgres.js, `pg`, Neon serverless, etc.) built that instance. The `pg` peer listed in `better-auth`'s package.json is one of several *optional* driver peers (also lists `mysql2`, `better-sqlite3`, `mongodb`) for users who chose that specific driver — none are required.
**How to avoid:** Pass the project's existing `drizzle-orm/postgres-js` `db` instance (from `src/lib/db/client.ts`) unchanged into `drizzleAdapter(db, { provider: "pg" })`. No new driver package install needed. [ASSUMED — reasoned from adapter architecture + peer-dependency structure, not explicitly confirmed against postgres.js in official docs; flagged in Assumptions Log as A1, verify in an early plan task before broader implementation.]

## Code Examples

Verified patterns from official sources (also embedded above in Architecture Patterns 1-6):

### Generating and applying the auth schema migration
```bash
# Source: better-auth.com/docs/adapters/drizzle (CLI command name substituted
# for the pinned, clean-verdict @better-auth/cli package — see Package
# Legitimacy Audit — rather than the docs' `npx auth@latest generate`)
npx @better-auth/cli generate
npx drizzle-kit generate
npx drizzle-kit push   # or `migrate`, matching however complaints' migration was applied
```

### Required environment variables
```bash
# Source: better-auth.com/docs/installation, better-auth.com/docs/authentication/google
BETTER_AUTH_SECRET=   # openssl rand -base64 32 (32+ chars, high entropy)
BETTER_AUTH_URL=      # http://localhost:3000 in dev; production domain in Vercel
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Auth.js / NextAuth v5 (`next-auth` beta channel) as the default recommendation for new Next.js App Router projects | Better Auth (`better-auth`), with Auth.js in maintenance mode | September 2025 — official merger announcement, "Auth.js is now part of Better Auth" [CITED: better-auth.com/blog/authjs-joins-better-auth] | `.claude/CLAUDE.md`'s Auth section (Auth.js v5 recommendation) predates or didn't account for this and is now stale for *new* integrations. Existing Auth.js apps aren't broken (security patches continue) but no new features ship, and the Auth.js v5 beta label persists indefinitely — this project has zero prior Auth.js code, so there is no migration cost to starting on Better Auth directly. |
| `next-auth`'s default JWT-encrypted session cookie | Better Auth's default DB-backed session with a short-lived signed cookie-cache in front of it | Baseline Better Auth architecture, not a recent change | Both patterns satisfy "survives refresh" (AUTH-03); the DB-backed default additionally allows server-side session revocation, which a pure-JWT scheme doesn't provide without extra denylist machinery. |

**Deprecated/outdated:**
- Treating "Auth.js v5" as the safe, default choice for a brand-new Next.js 15 integration: still functional, but the ecosystem's own center of gravity (and the library's own maintainers) has moved to Better Auth. CLAUDE.md's Auth section should be updated to reflect this after this phase ships (see Open Questions).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `drizzleAdapter(db, { provider: "pg" })` works unmodified with a `drizzle-orm/postgres-js` (`postgres` npm package) instance, not just `node-postgres` (`pg`) — the `provider` option only selects SQL-dialect behavior, not a required driver package | Pitfall 7, Pattern 1 | If wrong, the adapter throws at startup or silently emits wrong SQL — would require either installing `pg` as a second driver (undesirable, doubles the DB-connection surface) or filing/finding an issue upstream. Verify via a small early task: instantiate `betterAuth()` with the existing `db` client and run one `auth.api.getSession()`/sign-up round-trip locally before building the rest of the phase on top of it. |
| A2 | Better Auth's cookie defaults (`httpOnly: true`, `secure: true` in production, `sameSite: "lax"`) match the security posture already established by `kya_device_id` in Phase 1 | Standard Stack, Don't Hand-Roll | If Better Auth's actual defaults differ (e.g., `sameSite: "strict"` breaking the OAuth redirect round-trip, which requires at least `"lax"` since it's a top-level cross-site redirect), the Google sign-in flow could fail to set the session cookie after the callback. Low risk (this is Better Auth's most-used flow) but not independently confirmed against docs in this session — verify by inspecting the `Set-Cookie` header during the first local OAuth test. |
| A3 | `usePlural: true` (renaming Better Auth's default `user`/`session`/`account`/`verification` tables to `users`/`sessions`/`accounts`/`verifications` to match the project's `complaints` plural convention) is safe for the core adapter, despite a reported bug with plugin-added tables | Architecture Patterns (implicit — recommended default is to NOT enable this and keep singular names) | Low risk since this research recommends the safer default (keep singular, accept the minor naming inconsistency) precisely because of this open bug report — only relevant if the planner chooses to override that recommendation. |

**If this table is empty:** N/A — three assumptions logged above, all MEDIUM-or-lower risk with a stated verification path.

## Open Questions

1. **Should `/login` redirect an already-authenticated visitor away, rather than re-showing the sign-in button?**
   - What we know: CONTEXT.md's Specific Ideas note says "no app-specific UX styling requirements... Standard Google OAuth consent flow is acceptable" — this detail wasn't discussed.
   - What's unclear: whether a logged-in user manually navigating to `/login` should bounce to `/` (or their `callbackUrl`) or just see the button again (harmless either way, since re-clicking it just re-authenticates).
   - Recommendation: leave as planner's discretion — not a phase-blocking decision; default to letting it render (simplest, no extra check needed) unless the planner wants the small polish of an early redirect.

2. **Should `.claude/CLAUDE.md`'s Auth section be updated after this phase ships to reflect the Better Auth pivot?**
   - What we know: this research deviates from CLAUDE.md's literal Auth.js v5 text, with CLAUDE.md's own hedge language explicitly inviting re-verification.
   - What's unclear: whether updating CLAUDE.md is in scope for this phase's plans or a separate docs task.
   - Recommendation: flag for the planner/user — likely a small out-of-band doc update once Phase 2 ships, not a phase task itself.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Better Auth, Next.js runtime | ✓ | v24.17.0 | — |
| npm | Package install, `@better-auth/cli` | ✓ | 11.13.0 | — |
| openssl | Generating `BETTER_AUTH_SECRET` | ✓ | LibreSSL 3.3.6 | `crypto.randomBytes(32).toString("base64")` via Node one-liner if unavailable elsewhere |
| Google Cloud Console OAuth client (Client ID/Secret) | AUTH-01 | ✗ — must be created by a human before this phase can be exercised end-to-end | — | None — this is a required `checkpoint:human-verify` / `user_setup` task, same category as Phase 1's R2 CORS production-origin change |
| Postgres (Supabase-hosted) | Session/user/account storage | ✓ (already provisioned per Phase 1) | — | — |

**Missing dependencies with no fallback:**
- Google Cloud Console OAuth client credentials (Client ID + Secret) — must be created via the Google Cloud Console UI by a human before local dev or production testing of the sign-in flow is possible. Include a `checkpoint:human-verify` task for this, mirroring how Phase 1 handled the R2 CORS production-origin change.

**Missing dependencies with fallback:**
- None beyond the openssl note above (trivial Node fallback exists).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit) + Playwright 1.61.1 (e2e) |
| Config file | `vitest.config.ts` (unit, `tests/unit/**/*.test.ts`), `playwright.config.ts` (e2e, `tests/e2e/`) |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm test` (runs `test:unit` then `test:e2e`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Anonymous visitor at `/capture` is redirected to `/login`; authenticated visitor at `/capture` sees the capture UI | e2e | `npx playwright test tests/e2e/auth-gate.spec.ts` | ❌ Wave 0 |
| AUTH-01 | Google OAuth callback correctly upserts one `user` row per distinct Google `sub`, even across repeat logins | unit/integration | `npx vitest run tests/unit/auth-user-mapping.test.ts` | ❌ Wave 0 (or verify via manual/e2e if a real DB round-trip is simpler than mocking Better Auth internals) |
| AUTH-03 | Session persists after a simulated browser refresh (reload the page, session cookie still valid) | e2e | `npx playwright test tests/e2e/auth-gate.spec.ts -g "persists"` | ❌ Wave 0 |
| AUTH-04 | `/`, `/c/[id]`, `/api/feed` remain reachable with zero session/cookie present | e2e | existing `tests/e2e/feed.spec.ts`, `permalink.spec.ts` already exercise this implicitly (no auth fixture used) — add an explicit assertion that no redirect occurs | ✅ (extend existing) |
| — | `submitComplaint` Server Action rejects when no session present | unit | `npx vitest run tests/unit/submit-complaint-sanitization.test.ts` (extend existing file) | ✅ (extend existing) |
| — | `/api/upload-url` returns 401 when no session present | unit or e2e | new test alongside existing upload-url coverage (none currently exists per the codebase scan — verify at plan time) | ❌ Wave 0 |
| — | Existing capture e2e flow (`capture.spec.ts`, 5 tests) still passes once authenticated via the new session-seeding fixture | e2e | `npx playwright test tests/e2e/capture.spec.ts` | ⚠️ Exists but requires the Pitfall 1 fixture fix first — will fail until then |

### Sampling Rate
- **Per task commit:** `npm run test:unit`
- **Per wave merge:** `npm test` (unit + e2e)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/fixtures.ts` (or a new `tests/e2e/auth-fixtures.ts`) — session-seeding helper (Pitfall 1): create `user`/`account`/`session` rows directly and set the resulting session cookie via `context.addCookies()`, bypassing the real Google OAuth redirect (cannot run headlessly in CI).
- [ ] `tests/e2e/auth-gate.spec.ts` — covers AUTH-01 (redirect-when-anonymous, render-when-authed) and AUTH-03 (survives refresh).
- [ ] `tests/unit/submit-complaint-sanitization.test.ts` — update the existing `vi.mock("@/lib/device-id", ...)` to mock the new session-reading path instead (Pitfall 2), and add a case for "no session → rejects."
- [ ] Confirm whether any existing test covers `/api/upload-url` — none found in this session's codebase scan; add 401-when-unauthenticated coverage if genuinely absent.
- [ ] Framework install: none — Vitest and Playwright are already fully configured; no new test framework needed for this phase.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Google OAuth via Better Auth `socialProviders.google` — no password storage, no custom credential handling this phase (D-01). |
| V3 Session Management | yes | Better Auth DB-backed sessions: HMAC-signed session token, `httpOnly`/`secure`(prod)/`sameSite=lax` cookie (Assumption A2), server-side revocability via the `session` table, default 7-day `expiresIn` with 1-day `updateAge` rolling refresh. |
| V4 Access Control | yes | The `/capture` Server Component gate + Server Action/Route Handler defense-in-depth checks (Patterns 3, 5, 6) are the access-control enforcement points for this phase's two write surfaces. |
| V5 Input Validation | yes (unchanged from Phase 1) | `zod` already validates `submissionSchema`; no new user-controlled input surface is introduced by auth itself beyond what Better Auth validates internally (OAuth state/PKCE). |
| V6 Cryptography | yes | `BETTER_AUTH_SECRET` must be generated via `openssl rand -base64 32` (CSPRNG, 32+ bytes) — never a predictable value — consistent with the project's existing V6 discipline from Phase 1 (`crypto.randomUUID()` for `kya_device_id`, never `Math.random()`). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| OAuth redirect URI hijack / open redirect via a manipulated `callbackUrl` param | Spoofing / Tampering | Better Auth validates `callbackURL` against configured trusted origins; do not pass an unvalidated user-controlled URL directly — the `/login?callbackUrl=/capture` pattern here only ever originates from this app's own redirect (Pattern 3), never from arbitrary user input, so no additional allowlist logic is needed for this phase's single hardcoded callback target. |
| Session fixation / cookie forgery | Spoofing | Never trust `getSessionCookie()` (cookie-presence-only) as an authorization decision — always call `auth.api.getSession()` for a real DB-backed validation, exactly as Pattern 3/5/6 do (see Anti-Patterns). |
| CSRF against the OAuth callback | Tampering | Handled internally by Better Auth's OAuth state-param verification — no custom CSRF token needed for the auth flow itself; the existing write endpoints (`submitComplaint`, `/api/upload-url`) are same-origin Server Actions/fetches, consistent with Phase 1's threat model. |
| Bypassing the route-level gate by calling write endpoints directly | Elevation of Privilege | This is exactly Pitfall 3 — mitigated by Patterns 5 and 6 (independent session checks in `submitComplaint` and `/api/upload-url`, not reliance on the `/capture` page gate alone). |

## Sources

### Primary (HIGH confidence)
- `npm view better-auth version/peerDependencies/exports/engines` — version 1.6.25, peer ranges, subpath exports (`./adapters/drizzle`, `./next-js`) [VERIFIED: npm registry]
- `npm view next-auth dist-tags/time` — confirms `5.0.0-beta.32` is still the `beta` tag, never promoted to `latest`; `4.24.15` remains the `latest` tag as of 2026-07-20 [VERIFIED: npm registry]
- `npm view @better-auth/cli / auth` — CLI package versions and bin names [VERIFIED: npm registry]
- Direct codebase reads: `src/lib/device-id.ts`, `src/actions/submit-complaint.ts`, `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/app/capture/page.tsx`, `src/app/api/upload-url/route.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/capture.spec.ts`, `tests/unit/submit-schema.test.ts`, `playwright.config.ts`, `vitest.config.ts`, `package.json` [VERIFIED: direct file read]
- `grep -rn "getOrCreateDeviceId|kya_device_id"` across `src`/`tests` — confirms exactly one caller and one test mock [VERIFIED: direct search]

### Secondary (MEDIUM confidence)
- better-auth.com/docs/installation, /docs/integrations/next, /docs/authentication/google, /docs/adapters/drizzle, /docs/concepts/session-management — fetched via WebFetch, official docs [CITED]
- better-auth.com/blog/authjs-joins-better-auth; GitHub `nextauthjs/next-auth` Discussion #13252 ("Auth.js is now part of Better Auth") and #13382 ("How many more years of beta releases for v5?") — [CITED, cross-referenced across WebSearch results]

### Tertiary (LOW confidence)
- nelsonlai.dev/blog/e2e-testing-with-better-auth; GitHub Discussion #2125 ("Is it possible to manually create a session in Better Auth?") — e2e session-seeding pattern, WebSearch-summarized only, not independently fetched/verified in full — flagged for the planner to re-confirm the exact API shape (`internalAdapter.createSession`) against current Better Auth internals before implementing Pitfall 1's fix, since internal (non-public) APIs are more prone to breaking across versions than the public `authClient`/`auth.api` surface.
- `usePlural` bug reports (GitHub Issue #3069, Answer Overflow threads) — WebSearch-summarized only; informs the recommendation to avoid enabling `usePlural` rather than a hard requirement.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH — Better Auth's core APIs, peer dependencies, and exports are npm-registry-verified; the recommendation to switch away from CLAUDE.md's Auth.js v5 is well-sourced but represents a deviation the planner/user should be aware is happening, not silently absorbed.
- Architecture: HIGH — the Server Component gating pattern is directly sourced from Better Auth's own Next.js integration docs and matches this codebase's existing App Router conventions (async Server Component + client child, same shape already used elsewhere in the app per STATE.md's LocationRequester precedent).
- Pitfalls: HIGH — Pitfalls 1-3 and 7 are grounded in direct codebase reads (grep results, file contents), not speculation; Pitfalls 4-6 are CITED from official/aggregated docs.

**Research date:** 2026-07-28
**Valid until:** 14 days (Better Auth's weekly release cadence and the still-unsettled Auth.js-merger fallout make this a fast-moving area relative to the project's other, more stable dependencies — CLAUDE.md's own 30-day default is likely too long here).
