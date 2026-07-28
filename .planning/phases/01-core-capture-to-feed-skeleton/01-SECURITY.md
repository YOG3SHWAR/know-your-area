---
phase: 01
slug: core-capture-to-feed-skeleton
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-28
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail. Register assembled from all 12 plan-time `<threat_model>` blocks (`register_authored_at_plan_time: true` for every plan in this phase) plus `01-12-SUMMARY.md`'s Threat Flags. ASVS L1 / block_on: high — short-circuit path taken (threats_open: 0, register authored at plan time, ASVS L1).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| app code → Postgres | Schema/migrations and query parameters cross into the DB | geometry, unique constraints |
| browser → /api/upload-url | Untrusted client requests a presigned URL | ext enum only; key/content-type server-derived |
| browser → R2 (direct PUT) | Photo bytes bypass the app server entirely | image bytes, protected by presign constraints + bucket CORS |
| browser → submit Server Action | Untrusted `{category, lat, lng, accuracy, photoKey}` | re-validated server-side before DB insert |
| browser → device-id cookie | De-facto stub identity for Phase 1 | CSPRNG UUID, httpOnly |
| browser → /api/feed | Untrusted lat/lng + cursor | visitor location, used transiently only |
| browser → /c/{id} | Public permalink | opaque public_id only, no enumeration |
| Vercel serverless function → Supabase Postgres | DB credentials + query traffic | TLS-protected in transit |
| API routes → HTTP client | Error responses | must not leak DB/server internals |
| operator → Vercel/Supabase secrets | DATABASE_URL credential | env-store only, never committed |
| Server Action → client (submitComplaint → capture/page) | Thrown Error message | must never carry raw DB/driver text |
| R2 photo request → permalink UI | 404/missing photo | must degrade to category tile, not a broken-image box |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information Disclosure | `complaints.id` vs `public_id` | high | mitigate | Opaque `public_id` used in all external queries/URLs; serial `id` and `submitter_id` never selected into any external payload — confirmed via grep (`feed.ts:62`) and fresh re-read in 01-VERIFICATION.md | closed |
| T-01-02 | Tampering | `/api/upload-url` presigned PUT | high | mitigate | `Content-Type` pinned server-side via `CONTENT_TYPE_BY_EXT`; confirmed in `src/app/api/upload-url/route.ts` | closed |
| T-01-03 | Tampering | R2 object key | high | mitigate | Key generated server-side (`complaints/${generatePublicId()}.${ext}`); client-supplied key/contentType body fields ignored — confirmed in same route | closed |
| T-01-04 | Spoofing | GPS coordinate source | medium | mitigate | Live `watchPosition` best-fix only; EXIF never read — confirmed in `src/lib/geolocation.ts`. Residual GPS spoofing beyond bounds-check explicitly accepted for Phase 1 (real anti-spoof is Phase 4 VERIFY-02) | closed |
| T-01-05 | Information Disclosure | visitor location on `/api/feed` | medium | mitigate | lat/lng used only to compute request's ORDER BY, never persisted/logged — confirmed via direct read of `src/app/api/feed/route.ts` | closed |
| T-01-06a | Information Disclosure | poster identity on feed/permalink | medium | mitigate | Generic "Reported by a nearby resident" label rendered; `submitter_id` excluded from external queries — confirmed in `FeedCard.tsx:82`, `c/[id]/page.tsx:86` | closed |
| T-01-06b | Spoofing / Elevation | client permission hard-block | low | accept | UX/anti-abuse gate, not a security control; real gate is server-side `submitComplaint` re-validation (category enum + live-GPS requirement), unweakened | closed (accepted) |
| T-01-07a | Tampering | `submissionSchema` (category enum, coord bounds) | high | mitigate | Server-side zod re-validation of 5-value enum + India coord bounds — confirmed in `src/actions/submit-complaint.ts` | closed |
| T-01-07b | Information Disclosure | `CameraCapture.tsx` permission-denial error text | low | mitigate | Raw `NotAllowedError` text no longer rendered; denial routes through `PermissionGate`'s shared hard-block state (Plan 01-05) — re-verified via `tests/e2e/capture.spec.ts` denial specs and 01-VERIFICATION.md | closed |
| T-01-08a | Spoofing | device-id cookie | medium | mitigate | `crypto.randomUUID()` (CSPRNG), `httpOnly`, `sameSite: "lax"`, `secure` in production — confirmed in `src/lib/device-id.ts` | closed |
| T-01-08b | Information Disclosure / Tampering | postgres.js connection | high | mitigate | `ssl: "require"` forced for hosted DB hosts — confirmed in `src/lib/db/client.ts` | closed |
| T-01-09 | Information Disclosure | feed route error response | medium | mitigate | Full error detail logged server-side only via `sanitizeError`; client response stays a fixed generic message — confirmed in `src/app/api/feed/route.ts` | closed |
| T-01-10a | Information Disclosure | `DATABASE_URL` secret | medium | mitigate | Set only via Vercel's encrypted env store (Production scope); never committed — infra practice, confirmed no secret present in repo | closed |
| T-01-10b | Repudiation | `wrapOverlayLines` burned-in overlay evidence completeness | medium | mitigate | Full-timestamp rendering restored + visible "…" truncation guarantee, with regression tests (Plans 01-08, 01-09) — the burned-in geotag+timestamp is D-02's tamper-evident capture proof | closed |
| T-01-11a | Tampering / Repudiation | captured-photo preview vs. uploaded bytes | low | accept | Preview `<img>` is a read-back of the same canvas whose Blob is uploaded — cannot show one image while uploading another; no server trust decision depends on the client preview | closed (accepted) |
| T-01-11b | Information Disclosure | preview `<img>` data URL | low | accept | Generated in-page from the user's own capture, never persisted or sent anywhere new | closed (accepted) |
| T-01-11-01 | Tampering / Elevation of Privilege | R2 bucket CORS `AllowedOrigins` | high | mitigate | Explicit production origin(s) only (`https://knowyourarea.in` + known Vercel preview origins), never a wildcard — documented in README + Plan 01-11 user_setup; user confirmed applied to production 2026-07-28, verified end-to-end via live real-device capture during this UAT session | closed |
| T-01-11-02 | Information Disclosure | `CameraCapture.tsx` upload catch block | low | mitigate | Raw `err.message` replaced with one fixed sanitized message — confirmed via `sanitize-error.ts` + capture.spec.ts forced-failure test | closed |
| T-01-12-01 | Information Disclosure | `submitComplaint` insert/exhausted-ids catch + `capture/page.tsx` render | high | mitigate | Both throws routed through shared `sanitizeError`; client sink no longer reads thrown message — independently re-verified in 01-VERIFICATION.md (direct file reads + `submit-complaint-sanitization.test.ts` run) | closed |
| T-01-12-02 | Information Disclosure | `CameraCapture` camera/geolocation/upload catches + feed API route | medium | mitigate | All four ad-hoc raw-error handlers unified behind `sanitizeError`; exact fixed messages preserved — confirmed via direct file reads | closed |
| T-01-12-03 | Information Disclosure | permalink `/c/[id]` photo request | low | mitigate | 404/missing photo renders `ComplaintPhoto`'s category-tile fallback (`data-testid="photo-fallback"`) instead of a broken-image box — confirmed via direct read + `tests/e2e/permalink.spec.ts` run in 01-VERIFICATION.md | closed |
| T-01-SC | Tampering | npm/pip/cargo installs (all 12 plans) | high (Plan 01-01) / low or n-a (later plans) | mitigate / accept | Plan 01-01's RESEARCH.md Package Legitimacy Audit vetted all 6 initial packages ([SUS]-flagged ones cross-verified and approved); every subsequent plan (02–12) added zero new package-manager dependencies, so no further supply-chain surface was introduced | closed |
| T-01-DoS | Denial of Service | submit via resettable stub identity (`/api/upload-url`, `submitComplaint`) | low | accept | Explicit, documented Phase-1 scope gap (WR-07) — rate limiting deferred to Phase 4 (VERIFY-04); zod validation still blocks malformed payloads in the interim. Confirmed as an accepted, not forgotten, gap via UAT test 8 (sign-off) | closed (accepted) |

*Status: open · closed · open — below block_on threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `high` (workflow.security_block_on) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-01 | T-01-06b | Client-side permission hard-block is a UX/anti-abuse gate, not a security boundary — a determined user can bypass client JS, but `submitComplaint` re-validates category + live-GPS requirement server-side regardless | Plan 01-05 (design-time) | 2026-07-24 |
| AR-02 | T-01-04 (residual) | Residual GPS spoofing beyond the India-bounds server check is accepted for Phase 1; dedicated anti-spoof verification (VERIFY-02) is scoped to Phase 4 | Plan 01-02 (design-time) | 2026-07-23 |
| AR-03 | T-01-11a, T-01-11b | Capture preview is a same-canvas read-back with no new server trust decision and no new persistence — accepted as non-risk | Plan 01-10 (design-time) | 2026-07-26 |
| AR-04 | T-01-DoS | No rate limiting on submit/upload-url endpoints in Phase 1 — explicit, documented scope gap (WR-07), deferred to Phase 4 (VERIFY-04); confirmed still-intentional via 01-UAT.md test 8 sign-off | Plan 01-02 (design-time), re-confirmed UAT 2026-07-28 | 2026-07-28 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-28 | 23 | 23 | 0 | /gsd-secure-phase (orchestrator, grep-depth L1 verification against all 12 plan threat_model blocks + live re-check of T-01-11-01 following user's production R2 CORS change) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-28
