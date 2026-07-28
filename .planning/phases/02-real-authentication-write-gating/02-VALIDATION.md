---
phase: 2
slug: real-authentication-write-gating
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit, `tests/unit/**/*.test.ts`) + Playwright 1.61.1 (e2e, `tests/e2e/`) — both already configured, no framework install this phase |
| **Config file** | `vitest.config.ts` (unit; include glob `tests/unit/**/*.test.ts`, node env), `playwright.config.ts` (e2e; `webServer: npm run dev`, fake media device) |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm test` (runs `test:unit` then `test:e2e`) |
| **Estimated runtime** | ~15s unit; ~60-120s e2e (boots the dev server against the live Supabase Postgres) |

**Note:** e2e specs boot the real dev server, which loads `src/lib/auth.ts` at startup — `requireEnv` throws if `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`/`DATABASE_URL` are unset. Any non-empty Google values satisfy boot; real values are only needed for the end-of-phase real-login human check.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit` (and the task's targeted `npx playwright test <spec>` for e2e-verified tasks)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite (`npm test`) must be green
- **Max feedback latency:** ~120 seconds (e2e wave run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-01 | T-02-SC | [SUS] package install human-gated before install | checkpoint | (blocking-human checkpoint — no automated command) | n/a | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTH-01 | T-02-07 | Google secret server-only; Google-only provider (D-01) | typecheck | `npx tsc --noEmit` | ❌ W0 (auth.ts) | ⬜ pending |
| 02-01-03 | 01 | 1 | AUTH-01 | T-02-01 / T-02-08 | Schema pushed to live DB; adapter round-trips (A1) | e2e | `npx drizzle-kit push && npx playwright test tests/e2e/auth-adapter.spec.ts` | ❌ W0 (auth-adapter.spec) | ⬜ pending |
| 02-02-01 | 02 | 2 | AUTH-01 | T-02-01 | Server Component gate redirects anon before client paint (D-04/D-05) | e2e | `npx playwright test tests/e2e/auth-gate.spec.ts -g "anonymous"` | ❌ W0 (auth-gate.spec) | ⬜ pending |
| 02-02-02 | 02 | 2 | AUTH-01, AUTH-03 | T-02-01 | Authed render + survives refresh; capture suite green under gate | e2e | `npx playwright test tests/e2e/auth-gate.spec.ts tests/e2e/capture.spec.ts` | ❌ W0 (auth-fixtures) | ⬜ pending |
| 02-03-01 | 03 | 3 | AUTH-01 | T-02-03 / T-02-10 | submitComplaint rejects w/o session; device-id deleted, no fallback | unit | `npx vitest run tests/unit/submit-complaint-sanitization.test.ts` | ✅ (extend existing) | ⬜ pending |
| 02-03-02 | 03 | 3 | AUTH-01, AUTH-04 | T-02-03 / T-02-12 | /api/upload-url 401 w/o session; feed/permalink not redirected | unit + e2e | `npx vitest run tests/unit/upload-url-auth.test.ts && npx playwright test tests/e2e/feed.spec.ts tests/e2e/permalink.spec.ts` | ❌ W0 (upload-url-auth) / ✅ (extend feed+permalink) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** No 3 consecutive tasks without an automated verify — the only non-automated task is the 02-01-01 legitimacy checkpoint (a mandatory human gate), immediately followed by two automated tasks.

---

## Wave 0 Requirements

These test files/scaffolds are created inside the plan that verifies against them (they test that plan's own output, which cannot pre-exist the auth core):

- [ ] `tests/e2e/auth-adapter.spec.ts` — A1 + schema-push smoke test (Plan 01 Task 3). Asserts the Better Auth session endpoint returns 200 for an unauthenticated request through the real server/DB.
- [ ] `tests/e2e/auth-fixtures.ts` — session-seeding fixture (Plan 02 Task 2, RESEARCH.md Pitfall 1): creates `user`/`session` rows via Better Auth's own server-side session-creation API and sets the signed cookie via `context.addCookies()`, composed with the existing geolocation/camera grants.
- [ ] `tests/e2e/auth-gate.spec.ts` — AUTH-01 (anonymous redirect + authed render) and AUTH-03 (survives refresh) (Plan 02 Task 2).
- [ ] `tests/unit/upload-url-auth.test.ts` — `/api/upload-url` returns 401 without a session (Plan 03 Task 2).
- [ ] `tests/unit/submit-complaint-sanitization.test.ts` — re-point the `vi.mock("@/lib/device-id")` to `@/lib/auth` + `next/headers` and add a "no session → rejects" case (Plan 03 Task 1, RESEARCH.md Pitfall 2).
- [ ] `tests/e2e/capture.spec.ts` — switch its fixture import to `./auth-fixtures` so the 5 Phase 1 tests pass through the new gate (Plan 02 Task 2, RESEARCH.md Pitfall 1).

Framework install: none — Vitest + Playwright already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Google OAuth round-trip (consent screen → callback → authenticated) | AUTH-01 | The real Google consent flow cannot run headlessly in CI and needs a real Google Cloud OAuth client + human consent; automated e2e uses a seeded session instead | With real `GOOGLE_CLIENT_ID`/`SECRET` set and redirect URIs registered (user_setup), open `/capture` while logged out → land on `/login` → click "Sign in with Google" → complete Google consent → confirm return to `/capture` with the camera UI. Then refresh and confirm still authenticated (AUTH-03). |
| OAuth failure surfaces the inline error | AUTH-01 (UI-SPEC error state) | Requires triggering a real provider/consent failure | Deny consent on the Google screen (or use a mismatched redirect URI) → confirm return to `/login` shows "Something went wrong signing you in. Please try again." with the button still clickable, never a raw 500/blank page. |
| Google redirect-URI registration (dev + prod) | AUTH-01 | Google Cloud Console dashboard action; no CLI | Confirm both `http://localhost:3000/api/auth/callback/google` and the prod `https://knowyourarea.in/api/auth/callback/google` are registered (RESEARCH.md Pitfall 5). |

**Spike (blocking for Phase 4, per ROADMAP.md notes / STATE.md):** AI provider cost benchmarking with real phone-camera-resolution images. This is NOT an auth behavior and is not covered by Phase 2 tests — it is a standalone research spike to run within this phase's window so results are ready before Phase 4 provider selection. Track separately; it is not a Phase 2 acceptance gate.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (only the legitimacy checkpoint is human-gated by design)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (all commands are `vitest run` / `playwright test`, non-watch)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-28
