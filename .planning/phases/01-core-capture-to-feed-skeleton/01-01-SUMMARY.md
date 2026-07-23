---
phase: 01-core-capture-to-feed-skeleton
plan: 01
subsystem: infra
tags: [nextjs, react, typescript, drizzle-orm, postgis, supabase, zod, nanoid, shadcn, tailwindcss, vitest, playwright]

# Dependency graph
requires: []
provides:
  - Next.js 15.5.21 App Router scaffold (TypeScript, Tailwind v4, src/ dir, @/* alias)
  - shadcn design system (style=new-york, baseColor=neutral, cssVariables) with button/card/badge/input/skeleton/alert/sonner + Geist Sans/Mono fonts
  - docker-compose.yml (postgis/postgis local dev service) + .env.example
  - Live Postgres 15 + PostGIS 3.3.7 `complaints` table (Supabase-hosted) with geometry(point,4326) location column, GiST index, public_id UNIQUE constraint
  - src/lib/db/schema.ts, src/lib/db/client.ts (drizzle-orm/postgres-js singleton)
  - src/lib/ids.ts generatePublicId() (nanoid customAlphabet, KYA-XXXXXXX, 7-char ambiguity-free alphabet)
  - src/types/complaint.ts shared contract (CATEGORIES, Category, submissionSchema, FeedItem)
  - Vitest unit harness (10 passing tests) + Playwright E2E harness with fake camera/geolocation and 4 fixme spec stubs
affects: [01-02, 01-03, 01-04]

# Tech tracking
tech-stack:
  added: [next@15.5.21, react@19.2.8, react-dom@19.2.8, drizzle-orm@0.45.2, drizzle-kit@0.31.10, postgres@3.4.9, nanoid@6.0.0, zod@4.4.3, sharp@0.35.3, "@aws-sdk/client-s3@3.1093.0", "@aws-sdk/s3-request-presigner@3.1093.0", shadcn (new-york/neutral preset), clsx, tailwind-merge, class-variance-authority, lucide-react, vitest@4.1.10, "@playwright/test@1.61.1"]
  patterns:
    - "PostGIS geometry(point,4326) + GiST index via Drizzle, with a documented workaround for drizzle-kit's SRID-dropping bug on both generate and push"
    - "Opaque public_id (KYA- + 7-char nanoid customAlphabet over a 32-symbol ambiguity-free alphabet), DB UNIQUE constraint is the correctness guarantee"
    - "Server-side zod re-validation contract (category enum, India bounding box, nonnegative accuracy, photoKey shape) shared via src/types/complaint.ts"

key-files:
  created:
    - src/lib/db/schema.ts
    - src/lib/db/client.ts
    - src/lib/ids.ts
    - src/types/complaint.ts
    - drizzle.config.ts
    - drizzle/0000_next_pete_wisdom.sql
    - docker-compose.yml
    - .env.example
    - components.json
    - vitest.config.ts
    - playwright.config.ts
    - tests/e2e/fixtures.ts
    - tests/unit/ids.test.ts
    - tests/unit/submit-schema.test.ts
  modified:
    - .gitignore
    - eslint.config.mjs
    - src/app/layout.tsx
    - src/app/globals.css

key-decisions:
  - "Hosted Supabase Postgres+PostGIS (project ref wocsrqmqcgxbulbjapfl, ap-south-1) used for the schema push instead of local docker-compose, because Docker is not installed on this execution machine -- docker-compose.yml was still authored per the plan's user_setup for contributors who do have Docker"
  - "shadcn CLI has undergone a breaking rewrite since RESEARCH.md was written: the classic `--style`/`--base-color` init flags no longer exist (replaced by a named-preset system). Reconstructed the equivalent new-york/neutral output manually: components.json hand-verified against an older CLI's schema, full oklch theme + cn() helper hand-written, then `shadcn add` (current CLI) used for the component files themselves"
  - "drizzle-kit 0.31.10 confirmed to drop the geometry column's SRID on both `generate` and `push` (RESEARCH Assumption A3) -- fixed the live DB via a manual ALTER TABLE ... USING ST_SetSRID and documented the workaround as a durable in-code comment in schema.ts since any future push will silently re-break it"

requirements-completed: [SUBM-06, SUBM-02]

coverage:
  - id: D1
    description: "Next.js 15 app builds clean end-to-end (tsc, lint, production build)"
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npm run lint && npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "shadcn design system (new-york/neutral tokens, Geist Sans + Geist Mono) installed with button/card/badge/input/skeleton/alert/sonner"
    verification: []
    human_judgment: true
    rationale: "Plan's own must-have marks this a backstop truth requiring a real-device visual check at end-of-phase review -- font/token rendering isn't verifiable by an automated check."
  - id: D3
    description: "complaints table live in hosted Postgres with geometry(point,4326) location column, GiST index, and public_id UNIQUE constraint"
    verification:
      - kind: integration
        ref: "live query against information_schema.columns / pg_indexes / pg_constraint / geometry_columns (srid=4326 confirmed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "generatePublicId() produces KYA- + 7-char opaque IDs from the ambiguity-free alphabet, unique across 10,000 generations"
    requirement: SUBM-06
    verification:
      - kind: unit
        ref: "tests/unit/ids.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "submissionSchema validates the 5 fixed categories, rejects a 6th, enforces India bounding box, rejects negative accuracy, validates photoKey shape"
    requirement: SUBM-02
    verification:
      - kind: unit
        ref: "tests/unit/submit-schema.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Vitest + Playwright harness configured with fake camera/geolocation; 4 e2e fixme stubs enumerate cleanly"
    verification:
      - kind: other
        ref: "npx playwright test --list"
        status: pass
    human_judgment: false

duration: ~40min (across a human-action checkpoint pause for hosted-DB provisioning)
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 1: Scaffold, Data Layer, Type Contract & Test Harness Summary

**Next.js 15.5.21 + shadcn (new-york/neutral) scaffold wired to a live PostGIS `complaints` table (geometry+GiST, opaque nanoid IDs) via Drizzle, plus the Vitest/Playwright harness with fake camera+geolocation for the phase's E2E specs.**

## Performance

- **Duration:** ~40 min of active execution (plus a human-action checkpoint pause while the coordinator provisioned a hosted Supabase project, since Docker is not installed on this machine)
- **Started:** 2026-07-23 (resumed after checkpoint) ~12:31 IST
- **Completed:** 2026-07-23T07:19:26Z
- **Tasks:** 3/3
- **Files modified:** 34 (27 in Task 1, 11 in Task 2, 7 in Task 3, with `eslint.config.mjs` touched in both Task 1 and Task 3)

## Accomplishments
- Scaffolded a building Next.js 15 App Router project (TypeScript, Tailwind v4, `src/`, `@/*` alias) pinned to CLAUDE.md's locked 15.x + React 19 stack, with all Phase 1 runtime/dev dependencies installed
- Reconstructed the shadcn new-york/neutral design system by hand after discovering the shadcn CLI's classic init flags no longer exist upstream — `components.json`, the full oklch CSS-variable theme, and the `cn()` helper are all in place, with button/card/badge/input/skeleton/alert/sonner components installed
- Migrated and pushed the `complaints` table to a live, hosted Postgres+PostGIS instance (Supabase), including a manual fix for a confirmed drizzle-kit SRID-dropping bug so the geometry column is genuinely SRID 4326, not defaulted
- Built the shared submission/feed type contract (`src/types/complaint.ts`) and the opaque-ID generator (`src/lib/ids.ts`), both covered by 10 passing unit tests
- Stood up the Vitest + Playwright test harness (fake camera/geolocation launch args, deterministic Bengaluru fixture) with the phase's 4 E2E specs scaffolded as visible `test.fixme()` stubs naming their requirement IDs

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js 15 app, design system, and local PostGIS** — `84975c5` (feat)
2. **Task 2: Data layer, shared type contract, opaque IDs, and schema push** — `15c31bd` (feat)
3. **Task 3: End-to-end test harness (Wave 0)** — `7a1eeb5` (test)

_No separate metadata commit yet — this repo is running sequential/non-worktree mode; STATE.md/ROADMAP.md/REQUIREMENTS.md updates are committed as part of the final-commit step below._

## Files Created/Modified
- `package.json`, `package-lock.json` — Next.js 15.5.21/React 19.2.8-pinned scaffold + all Phase 1 deps; `test:unit`/`test:e2e`/`test` scripts
- `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` — standard Next.js 15 App Router config
- `eslint.config.mjs` — rewritten to the FlatCompat pattern (the scaffolded flat-config-native template didn't match the pinned `eslint-config-next@15.5.21`'s legacy export shape); later scoped `react-hooks/rules-of-hooks` off for `tests/e2e/**` (Playwright fixture `use` param false-positive)
- `components.json`, `src/app/globals.css`, `src/lib/utils.ts` — shadcn new-york/neutral theme + `cn()` helper, hand-completed after the CLI's init flow broke partway through (see Deviations)
- `src/components/ui/{button,card,badge,input,skeleton,alert,sonner}.tsx` — shadcn blocks per UI-SPEC Registry Safety table
- `src/app/layout.tsx` — Geist Sans/Mono fonts wired, project-specific metadata title/description
- `docker-compose.yml`, `.env.example` — local PostGIS dev service + env template (DATABASE_URL + 5 R2_* vars)
- `.gitignore` — added `next-env.d.ts`, `.vercel`, `supabase/.temp/`, test-artifact directories
- `src/lib/db/schema.ts` — `complaints` Drizzle table (serial id internal-only, public_id UNIQUE, submitter_id, category, geometry(point,4326) + GiST index, accuracy_m, photo_key, created_at) with an in-code warning documenting the drizzle-kit SRID bug
- `src/lib/db/client.ts` — postgres-js + drizzle client singleton
- `src/lib/ids.ts` — `generatePublicId()` opaque ID generator
- `src/types/complaint.ts` — `CATEGORIES`, `Category`, `submissionSchema`, `FeedItem`
- `drizzle.config.ts` — points at `src/lib/db/schema.ts`; `extensionsFilters: ["postgis"]` to stop PostGIS catalog tables (e.g. `spatial_ref_sys`) from triggering a spurious rename-resolution prompt
- `drizzle/0000_next_pete_wisdom.sql`, `drizzle/meta/*.json` — generated migration, hand-fixed to declare `geometry(point, 4326)`
- `vitest.config.ts` — `@/*` alias resolution, scoped to `tests/unit/**` (created in Task 2 since Task 2's own verify step needed it; Task 3 builds the Playwright half on top)
- `playwright.config.ts` — Chromium project with fake-media-stream launch args, `webServer` running `npm run dev`
- `tests/unit/ids.test.ts`, `tests/unit/submit-schema.test.ts` — 10 passing unit tests
- `tests/e2e/fixtures.ts` — grants geolocation/camera, seeds Bengaluru (12.9716, 77.5946) fake position
- `tests/e2e/{capture,feed,search,permalink}.spec.ts` — `test.fixme()` stubs naming SUBM-01/SUBM-03, FEED-01, FEED-03, FEED-04

## Decisions Made
- Used the hosted Supabase Postgres+PostGIS instance (provided via `.env.local`'s `DATABASE_URL`, not committed) for the `[BLOCKING]` schema push, since Docker is unavailable on this machine — `docker-compose.yml` was still authored as planned so contributors with Docker have the documented local path.
- Kept `generatePublicId()` synchronous (nanoid's `customAlphabet()` is synchronous) rather than PATTERNS.md's `async` example — functionally equivalent, simpler.
- Named the accuracy field `accuracyM` in TypeScript (mapped to the `accuracy_m` column) for naming consistency with `publicId`/`submitterId`/`photoKey`, rather than PATTERNS.md's literal `accuracy` field name — no functional difference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI's classic init flags removed upstream; hand-completed the design system**
- **Found during:** Task 1
- **Issue:** `npx shadcn@latest init --style new-york --base-color neutral --css-variables` failed (`unknown option '--style'`) — the current shadcn CLI (v4.14.0) replaced the classic style/baseColor flags with a named-preset system (Nova, Vega, Maia, …) not documented in RESEARCH.md/UI-SPEC.md. An older CLI (`shadcn@2.10.0`) still exposed `--base-color`, wrote a correct `components.json` (`style: "new-york"`, `baseColor: "neutral"`, `cssVariables: true`), but then failed mid-init on a registry-shape mismatch (old client vs. current registry API) before writing `src/lib/utils.ts` or the CSS variables.
- **Fix:** Kept the `components.json` written by the old CLI (it's correct), hand-authored `src/lib/utils.ts` (`cn()` via `clsx`+`tailwind-merge`) and the full canonical new-york/neutral oklch theme in `globals.css` (verified against every added component's class usage — no chart-*/sidebar-* tokens were strictly required by button/card/badge/input/skeleton/alert/sonner, but included for forward-compat with later phases' `shadcn add` calls), then used the current CLI's `shadcn add` (works fine against the existing `components.json`) to fetch the actual component source files. Installed the missing transitive deps (`clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`) that `shadcn add` didn't auto-add since `utils.ts` didn't exist yet when it ran.
- **Files modified:** `components.json`, `src/lib/utils.ts`, `src/app/globals.css`, `package.json`
- **Verification:** `npx tsc --noEmit && npm run build` clean; all 7 shadcn components compile and render without missing-module errors.
- **Committed in:** `84975c5` (Task 1 commit)

**2. [Rule 1 - Bug] eslint.config.mjs template mismatched the pinned eslint-config-next version**
- **Found during:** Task 1
- **Issue:** `create-next-app`'s scaffolded `eslint.config.mjs` imports `eslint-config-next/core-web-vitals` (extensionless, flat-config-native export shape from `eslint-config-next@16.x`). Pinning to `eslint-config-next@15.5.21` (to honor CLAUDE.md's 15.x lock) broke this — that version ships CommonJS `.eslintrc`-style exports (`core-web-vitals.js`, `extends: [...]`), not iterable flat-config arrays, causing both a module-resolution error and then a `nextVitals is not iterable` crash.
- **Fix:** Rewrote `eslint.config.mjs` to the `FlatCompat` bridge pattern (the standard Next.js 15.x scaffold shape for this exact eslint-config-next version), using `compat.extends("next/core-web-vitals", "next/typescript")`.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` exits 0.
- **Committed in:** `84975c5` (Task 1 commit)

**3. [Rule 1 - Bug] drizzle-kit drops the geometry column's SRID on generate AND push**
- **Found during:** Task 2
- **Issue:** RESEARCH.md's Assumption A3 flagged a third-party-reported bug where `drizzle-kit generate` emits `geometry(point)` instead of `geometry(point, 4326)` despite `srid: 4326` in `schema.ts`. Confirmed true for `drizzle-kit@0.31.10` — and worse, the *live* `drizzle-kit push` has the same bug independently of the generated `.sql` file: it pushed the column as `srid=0` even after I'd hand-fixed the migration file's text, and re-running `push` a second time actively reverted a manually-corrected live column back to `srid=0` (`ALTER TABLE ... SET DATA TYPE geometry(point)`).
- **Fix:** Hand-fixed the generated `.sql` file and its `meta/0000_snapshot.json` for consistency, then fixed the *live* database directly via `ALTER TABLE complaints ALTER COLUMN location TYPE geometry(Point, 4326) USING ST_SetSRID(location, 4326)` and verified `srid=4326` via `geometry_columns`. Documented the bug as a prominent in-code comment directly above the `location` column definition in `schema.ts` warning that any future `drizzle-kit push` will silently re-break it and must be re-fixed the same way.
- **Files modified:** `drizzle/0000_next_pete_wisdom.sql`, `drizzle/meta/0000_snapshot.json`, `src/lib/db/schema.ts`, live database
- **Verification:** `SELECT srid FROM geometry_columns WHERE f_table_name='complaints'` returns `4326`; GiST index and `public_id` UNIQUE constraint confirmed via `pg_indexes`/`pg_constraint`.
- **Committed in:** `15c31bd` (Task 2 commit)

**4. [Rule 3 - Blocking] drizzle-kit push prompted an interactive rename-resolution TTY error against PostGIS catalog tables**
- **Found during:** Task 2
- **Issue:** `npx drizzle-kit push` hung on a "Pulling schema from database" spinner then crashed with `Interactive prompts require a TTY terminal` — PostGIS's `spatial_ref_sys` catalog table (installed alongside the extension) was visible to drizzle-kit's introspection and triggered its create-vs-rename ambiguity resolver, which has no non-interactive bypass flag.
- **Fix:** Added `extensionsFilters: ["postgis"]` to `drizzle.config.ts` (a documented drizzle-kit option that excludes PostGIS-managed tables from introspection).
- **Files modified:** `drizzle.config.ts`
- **Verification:** `npx drizzle-kit push` completes non-interactively (`[✓] Changes applied`).
- **Committed in:** `15c31bd` (Task 2 commit)

**5. [Rule 1 - Bug] Playwright fixture's `use` parameter false-positives against react-hooks/rules-of-hooks**
- **Found during:** Task 3
- **Issue:** `npm run lint` failed on `tests/e2e/fixtures.ts` — the Playwright fixture API's `use` callback parameter name collides with eslint-plugin-react-hooks' naming heuristic for React hooks (`useXxx`), which doesn't distinguish test-fixture files from React component files.
- **Fix:** Scoped `react-hooks/rules-of-hooks: "off"` to `files: ["tests/e2e/**/*.ts"]` in `eslint.config.mjs`.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` exits 0.
- **Committed in:** `7a1eeb5` (Task 3 commit)

**6. [Rule 2 - Missing Critical] .gitignore missing standard Next.js/test-tooling entries**
- **Found during:** Task 1 and Task 3
- **Issue:** The pre-existing `.gitignore` didn't cover `next-env.d.ts`, `.vercel`, Supabase CLI's `.temp/` metadata, or Vitest/Playwright artifact directories (`coverage/`, `test-results/`, `playwright-report/`, `blob-report/`) — leaving generated/regenerable files at risk of being accidentally committed.
- **Fix:** Added the missing entries.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` after scaffolding shows no untracked generated files.
- **Committed in:** `84975c5` (Task 1 commit)

---

**Total deviations:** 6 auto-fixed (2 Rule 1 - bug, 3 Rule 3 - blocking, 1 Rule 2 - missing critical)
**Impact on plan:** All auto-fixes were necessary to make the plan's own verification commands pass (build, lint, `drizzle-kit push`, `playwright test --list`) or to correct silent data-correctness defects (SRID). No scope creep — no new features or architecture were added beyond what Task 1-3 already specified.

## Issues Encountered

- **Precondition gate (resolved via checkpoint):** Docker is not installed on this execution machine and no `DATABASE_URL` was configured at plan start. Task 1's precondition ("Node 20+ and Docker are available") was unmet, so execution halted before any file changes with a `checkpoint:human-action`. The coordinator resolved this by provisioning a hosted Supabase Postgres+PostGIS project and placing `DATABASE_URL` in a gitignored `.env.local`; execution resumed from Task 1 per the coordinator's explicit instruction. `docker-compose.yml` was still authored (never executed, since Docker remains absent) so the local-Docker path documented in the plan's `user_setup` block works for contributors who have it.
- **create-next-app refused to scaffold in a non-empty directory** (`.env.local`, `.planning/`, `graphify-out/`, `supabase/` already present at repo root). Worked around by scaffolding into a scratch temp directory and copying only the relevant generated files (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/*`, `public/*.svg`) into the repo root — explicitly excluded the scaffold's auto-generated root `CLAUDE.md`/`AGENTS.md` (Next.js 16-specific agent guidance, irrelevant/misleading since the project is pinned to 15.x, and would have collided with the project's actual `.claude/CLAUDE.md`).

## User Setup Required

None further — the hosted Supabase `DATABASE_URL` is already in place in `.env.local` (gitignored, not committed). R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`) are still unset — not needed until Plan 03 (capture/upload slice) wires `src/lib/r2.ts` and the presigned-upload route.

## Next Phase Readiness

- Plans 02 (tracer), 03 (capture), and 04 (feed) can now build directly on: the `complaints` table (live, correctly SRID-4326), `src/lib/db/client.ts`, `src/lib/ids.ts`, `src/types/complaint.ts`'s shared contract, and the shadcn component set.
- The plan's prohibition ("MUST NOT expose the internal serial `complaints.id` in any URL/API/feed payload") has no surface to violate yet — no route, Server Action, or query selects from `complaints` outside this plan's own verification scripts. Remains `status: unverified` until Plans 02-04 add the first real read/write paths; flagging for those plans' own verification, not a gap in this plan.
- The must-have backstop truth (shadcn new-york/neutral tokens + Geist fonts rendering correctly on a real mobile device, no visual regression) is unverified until an actual UI screen exists — tracked for end-of-phase review per the plan's own `verification: backstop` tag, not a Phase 1 Plan 01 gap.
- `docker-compose.yml` has never been run (no Docker on this machine) — untested that it actually brings up a working local PostGIS stack. Low risk (standard `postgis/postgis` image + standard compose syntax) but worth a quick `docker compose up -d` sanity check by any contributor who does have Docker.

## Self-Check: PASSED

All 18 claimed files verified present on disk; all 3 claimed commit hashes verified present in `git log --oneline --all`.

---
*Phase: 01-core-capture-to-feed-skeleton*
*Completed: 2026-07-23*
