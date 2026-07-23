# Walking Skeleton — Know Your Area

**Phase:** 1
**Generated:** 2026-07-23

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A visitor can capture a live camera photo, have their live GPS attached, publish it, and then see that exact complaint appear in a proximity-sorted feed served by the running app — proving browser capture → presigned R2 upload → Server Action insert of a PostGIS geometry row with an opaque ID → SSR feed read, all wired end-to-end.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15.5.x App Router + React 19 + TypeScript 5 | CLAUDE.md-locked stack; one deployable serves the SSR public feed and the authenticated-later write actions. Pinned to latest **stable 15.x** (not 16.x) to honor the locked "15.x + React 19" decision (RESEARCH State-of-the-Art drift note). |
| Data layer | PostgreSQL + PostGIS (`geometry(point, 4326)`) via Drizzle ORM + `postgres` driver | PostGIS is the open-source standard for the proximity/dedup queries; Drizzle is the only ORM with native `geometry` support (Prisma cannot type spatial columns). Distance queries cast `::geography` inline for meter units (RESEARCH Pattern 2). |
| Object storage | Cloudflare R2 (S3-compatible) via `@aws-sdk/client-s3` presigned PUT | Photo bytes flow browser → R2 directly (never proxied) — Vercel's hard 4.5MB body limit makes proxy uploads non-viable (RESEARCH Pitfall 1). Zero egress fees for a public photo feed. |
| Identity (Phase 1) | Anonymous per-browser `device_id` cookie (`crypto.randomUUID`, httpOnly, SameSite=Lax) written to a generic `submitter_id` column | Stub identity (D-05) that Phase 2 promotes to a real OAuth/OTP `user_id` in the **same** `submitter_id` field with no data migration. |
| Opaque IDs | `nanoid` `customAlphabet` (32-symbol, ambiguity-free), 7 chars, `KYA-` prefix, DB `UNIQUE` + retry-on-conflict | Non-guessable, non-sequential, readable/typeable (D-11). 7 chars (not D-11's 5-char example) per RESEARCH collision math; correctness comes from the unique constraint + retry, never ID-space size alone. |
| Deployment target | Local full-stack run (`docker compose up` PostGIS + `npm run dev`) is the Phase-1 exercise; Vercel preview optional | Contributors self-serve a dev environment with no cloud account (CLAUDE.md OSS constraint); R2 is the one hard external prerequisite. |
| Directory layout | `src/app` (routes), `src/actions` (Server Actions), `src/lib` (db, r2, ids, device-id, geolocation), `src/components/{capture,feed}`, `src/types` | RESEARCH Recommended Project Structure — every later phase inherits this. |
| Design system | shadcn (`style=new-york, baseColor=neutral, cssVariables`), Geist Sans + Geist Mono (IDs), lucide-react, amber-500 civic accent | UI-SPEC design contract; established once in Wave 0 so all phases share tokens. |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 15 App Router, TypeScript, ESLint, Tailwind v4, shadcn, Vitest, Playwright)
- [x] Routing — real routes: `/` (feed), `/capture` (submit), `/c/[id]` (permalink), `/api/upload-url` (presign)
- [x] Database — one real write (`submit-complaint` inserts a geometry row) AND one real read (`nearbyFeed` distance query)
- [x] UI — interactive live camera capture + GPS wired to the presign route and the submit Server Action
- [x] Deployment — documented local full-stack run command exercises capture → R2 → DB → feed end-to-end

## Out of Scope (Deferred to Later Slices)

> Explicit so future phases do not re-litigate Phase 1's minimalism.

- Real accounts / login (Google OAuth + phone OTP) — Phase 2 (AUTH-01..04). Phase 1 is stub `device_id` only.
- Reverse geocoding to locality/ward/pincode — Phase 3 (SUBM-04). Phase 1 shows raw distance only.
- Duplicate detection / threading + confirmation counts — Phase 3 (DEDUP-01..03).
- Face/plate blur, AI category/location/genuineness verification, rate limiting — Phase 4 (SUBM-05, VERIFY-01..05).
- Upvotes, comments, report affordance, ranked feed (recency+engagement blend) — Phase 5 (FEED-02, ENGAGE-01..03).
- Takedown workflow, legal scaffolding, polished empty-state CTA — Phase 6 (ENGAGE-04).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: Real authentication (Google OAuth + phone OTP) normalized to one `user_id`; gate writes, keep browse anonymous.
- Phase 3: Async location pipeline — reverse-geocode + thread same-category-within-200m duplicates onto the original.
- Phase 4: Pre-publish trust layer — blur, AI verification gate, submission rate-limiting.
- Phase 5: Social layer — upvote/comment/report + moderation queue + ranked feed.
- Phase 6: Compliance-and-launch gate — takedown workflow, IT Rules 2021 scaffolding, non-empty first-run.
