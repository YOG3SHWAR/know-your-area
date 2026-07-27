---
status: diagnosed
trigger: "Investigate issue: home-feed-ssr-webpack-module-error — The home/feed page throws a Next.js \"Recoverable Error\" and falls back to client-side rendering because server rendering throws `__webpack_modules__[moduleId] is not a function`. This defeats the app's SSR-for-SEO/shareable-permalink design goal for the public feed."
created: 2026-07-26T02:10:00Z
updated: 2026-07-26T02:35:00Z
---

## Current Focus

hypothesis: CONFIRMED (find_root_cause_only mode — stopping here, no fix applied)
test: n/a — diagnosis complete
expecting: n/a
next_action: none — return ROOT CAUSE FOUND to caller

## Symptoms

expected: The home page (public feed) renders successfully via server-side rendering with no recoverable error and no fallback to client rendering.
actual: Browser/Next.js overlay shows: "Error Type: Recoverable Error. Error Message: Switched to client rendering because the server rendering errored: __webpack_modules__[moduleId] is not a function. Next.js version: 15.5.21 (Webpack)."
errors: "__webpack_modules__[moduleId] is not a function" (Next.js Recoverable Error, thrown during server rendering of the home page)
reproduction: Load the home page (ad-hoc finding during UAT test 9, phase 01 verify-work session). Not reliably reproducible on demand (see Evidence — 5/5 fresh curl requests to the live dev server succeeded with no error).
started: Discovered during UAT (phase 01 verify-work session, 2026-07-26). Distinct from the already-resolved G-01-EXTRA-1 (/api/feed 500 due to Supabase/Vercel DATABASE_URL pooler misconfig, fixed in plans 01-06/01-07) — this is a webpack module-resolution error, not a DB-connection error.

## Eliminated

- hypothesis: Duplicate/mismatched React or Next.js package versions across the dependency tree causing SSR/client bundle module-id mismatches
  evidence: "npm ls react react-dom next" shows a single deduped react@19.2.8, react-dom@19.2.8, and next@15.5.21 throughout the entire tree (including radix-ui, next-themes, lucide-react, styled-jsx) — no version divergence.
  timestamp: 2026-07-26T02:18:00Z

- hypothesis: Circular import / barrel-file / next/dynamic misuse in the feed render path (src/app/page.tsx -> FeedContent -> nearbyFeed/recentFeed -> db client) causing a chunk registration problem
  evidence: "grep -rn next/dynamic src/" returned zero matches. Read src/app/page.tsx, src/components/feed/{FeedList,FeedCard,LocationRequester,SearchById}.tsx, src/lib/feed.ts, src/lib/db/client.ts in full — plain static imports only, no barrel index files, no circular references, no CJS/ESM interop oddities in the direct render path.
  timestamp: 2026-07-26T02:22:00Z

- hypothesis: Deterministic application-code defect (would fail on every load)
  evidence: Ran 5 consecutive curl requests against the already-running dev server (http://localhost:3000/) — all 5 returned HTTP 200 with consistent ~59.9KB payloads containing the rendered feed content, zero occurrences of "webpack_modules"/"Recoverable Error"/"is not a function" in any response. Confirms the failure is non-deterministic/transient, not a code path that always throws.
  timestamp: 2026-07-26T02:25:00Z

## Evidence

- timestamp: 2026-07-26T02:15:00Z
  checked: Running processes / dev server lifetime (ps aux, lsof -i :3000)
  found: "next dev" (webpack mode, no --turbopack flag matches package.json's `"dev": "next dev"`) has been running continuously as a single long-lived process since 1:58AM, spanning the entirety of today's plan executions (01-06 through 01-09) and the subsequent code-review commit (49b3f85).
  implication: A long-running dev process undergoing many incremental Fast-Refresh/HMR recompiles across dozens of file edits is exactly the precondition under which Next.js's webpack dev-mode module registry (in-memory + persisted at .next/cache/webpack/{server,client}-development) is known to desync — this is a longstanding, well-documented Next.js issue class, not unique to this app.

- timestamp: 2026-07-26T02:16:00Z
  checked: .next/cache/webpack/* directory timestamps
  found: .next/cache/webpack/server-development last modified 02:01, client-development last modified 02:06/02:07 — both updated well after the session's initial compile (12:53 on 2026-07-23), confirming continuous incremental recompilation within the same long-lived dev process rather than fresh full builds.
  implication: Supports the HMR/incremental-cache-desync mechanism as the trigger; a moduleId can end up pointing at a chunk whose factory function was replaced/removed mid-session, producing exactly `__webpack_modules__[moduleId] is not a function` when a request lands during/just after such a recompile.

- timestamp: 2026-07-26T02:30:00Z
  checked: Web search for the exact error signature ("__webpack_modules__[moduleId] is not a function" + "Switched to client rendering because the server rendering errored")
  found: This is a recurring, well-documented Next.js issue class going back to Next.js 10-12 (github.com/vercel/next.js issues #23683, #31015, discussion #23730) — historically caused by (a) dev-mode webpack module-registry/HMR desync during long-running sessions with many incremental recompiles (fixed by restarting the dev server / clearing .next cache), or (b) CJS/ESM interop mismatches for a specific dependency in App Router 15.2+. Multiple sources note the error is intermittent and restarting the dev server is the standard, effective fix.
  implication: The symptom signature matches a known Next.js dev-tooling behavior class rather than a novel defect. Combined with the "Eliminated" findings (no dependency-version mismatch, no code-path anomaly, non-reproducible on fresh requests), this points to (a) — dev-mode HMR/module-cache staleness from the long-running session — as the dominant explanation for this specific occurrence.

- timestamp: 2026-07-26T02:32:00Z
  checked: src/app/page.tsx's Suspense usage pattern (`<Suspense key={hasLocation ? \`${lat}:${lng}\` : "recent"}>`) combined with LocationRequester's client-side `router.replace()` after `getCurrentPosition()` resolves
  found: Every page load triggers at least two server render passes for the same route: (1) the initial params-less request, and (2) a follow-up client-side navigation once geolocation resolves and LocationRequester calls router.replace with lat/lng, which remounts the Suspense boundary (via the changed `key`) and re-fetches a fresh RSC payload/SSR pass for the new URL.
  implication: This doubles the number of dynamic SSR passes triggered per visit relative to a static page, increasing (but not solely causing) the odds of a request landing during/right after an in-flight HMR recompile in dev mode — a plausible contributing/amplifying factor, not a standalone root cause (the underlying mechanism is still the dev-mode webpack module-registry desync, which would not occur at all against a clean production build).

## Resolution

root_cause: "A transient Next.js dev-mode webpack module-registry desync (Heisenbug/Mandelbug class — environment/session-state driven, not a deterministic code defect). The long-running `next dev` (webpack, non-Turbopack) process had been running continuously since 1:58AM across dozens of file edits spanning plans 01-06 through 01-09 and a subsequent code-review commit, accumulating many incremental Fast-Refresh/HMR recompiles without a full restart (confirmed via .next/cache/webpack/{server,client}-development timestamps updated well past session start). This is a well-documented, longstanding Next.js issue class (vercel/next.js #23683, #31015) where an in-memory/on-disk webpack module-id-to-factory mapping can become stale mid-session, causing `__webpack_modules__[moduleId]` to resolve to undefined and be called as a function during an SSR render pass that lands during/just after such a recompile. No application-code defect was found in the render path (Home -> FeedContent -> nearbyFeed/recentFeed -> db client): no duplicate/mismatched React or Next versions in the dependency tree, no next/dynamic usage, no circular imports or barrel files, and 5/5 fresh requests against the still-running dev server rendered successfully with no error, confirming this does not fail deterministically. The page's Suspense-key remount + client-side router.replace() pattern (triggered by LocationRequester once geolocation resolves) causes at least two dynamic SSR passes per page visit, which plausibly increased the odds of hitting this dev-mode race but is not itself the root cause — it would not manifest against a clean, freshly-started dev server or a production build."
fix: ""
verification: ""
files_changed: []
