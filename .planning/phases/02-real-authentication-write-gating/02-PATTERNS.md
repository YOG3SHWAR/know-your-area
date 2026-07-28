# Phase 2: Real Authentication & Write-Gating - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 12 (new + modified)
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/lib/auth.ts` | config/provider | request-response | `src/lib/db/client.ts` | role-match (env-driven singleton config module) |
| `src/lib/auth-client.ts` | provider/utility | request-response | `src/lib/geolocation.ts` (client-side browser API wrapper) | partial match |
| `src/app/api/auth/[...all]/route.ts` | route (Route Handler) | request-response | `src/app/api/upload-url/route.ts` | role-match |
| `src/app/capture/page.tsx` (converted to Server Component gate) | route/controller | request-response | none existing (first async Server Component gate in codebase) | no analog — see below |
| `src/components/capture/CaptureClient.tsx` (moved body) | component | event-driven | `src/app/capture/page.tsx` (current client body, pre-move) | exact (verbatim move) |
| `src/app/login/page.tsx` | component/route | request-response | `src/app/capture/page.tsx` (current client component shape) | role-match |
| `src/actions/submit-complaint.ts` (modified) | service (Server Action) | CRUD | itself (existing file, in-place edit) | exact — modify in place |
| `src/app/api/upload-url/route.ts` (modified) | route (Route Handler) | request-response | itself (existing file, in-place edit) | exact — modify in place |
| `src/lib/db/schema.ts` (extended with auth tables) | model | CRUD | itself (existing `complaints` table definition) | exact — same file, additive |
| `src/lib/device-id.ts` | (deleted) | — | — | n/a — deletion, not creation |
| `tests/e2e/auth-fixtures.ts` (new) | test | request-response | `tests/e2e/fixtures.ts` | exact |
| `tests/e2e/auth-gate.spec.ts` (new) | test | request-response | `tests/e2e/capture.spec.ts` | exact |
| `tests/unit/submit-complaint-sanitization.test.ts` (modified) | test | CRUD | itself (existing file, in-place edit) | exact — modify in place |

## Pattern Assignments

### `src/lib/auth.ts` (config, new file)

**Analog:** `src/lib/db/client.ts` and `src/lib/env.ts`

**Env-var-driven singleton pattern** (`src/lib/db/client.ts` lines 1-35, `src/lib/env.ts` full file):
```typescript
// src/lib/env.ts — fail-fast required-env-var helper. Reuse this for
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / BETTER_AUTH_SECRET so a missing
// var throws a clear error at module load, not a cryptic downstream error.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
```
```typescript
// src/lib/db/client.ts lines 32-35 — the "one singleton client instance,
// exported once, imported everywhere" shape auth.ts should mirror exactly
// (Better Auth's `auth` export plays the same role `db` does here).
const databaseUrl = requireEnv("DATABASE_URL");
const queryClient = postgres(databaseUrl, buildClientOptions(databaseUrl));
export const db = drizzle(queryClient, { schema });
```

**Apply to `auth.ts`:** use `requireEnv("GOOGLE_CLIENT_ID")` / `requireEnv("GOOGLE_CLIENT_SECRET")` (not raw `process.env.X as string`, despite RESEARCH.md's example casting) to match this codebase's established fail-fast convention, and import the existing `db` from `@/lib/db/client` unchanged into `drizzleAdapter(db, { provider: "pg" })` (RESEARCH.md Pattern 1 + Pitfall 7 / Assumption A1).

---

### `src/app/api/auth/[...all]/route.ts` (route, new file)

**Analog:** `src/app/api/upload-url/route.ts`

**Route Handler shape** (`src/app/api/upload-url/route.ts` lines 1-14):
```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePublicId } from "@/lib/ids";
import { presignPhotoUpload } from "@/lib/r2";
```
This file establishes the codebase's Route Handler import-and-export convention (named `POST`/`GET` exports, `NextResponse.json` responses). Better Auth's catch-all handler differs structurally (`export const { GET, POST } = toNextJsHandler(auth)` per RESEARCH.md Pattern 2) but should still live in the same `src/app/api/<segment>/route.ts` directory convention this file demonstrates.

---

### `src/app/api/upload-url/route.ts` (modified — add auth gate)

**Analog:** itself, extended per RESEARCH.md Pattern 6

**Current file in full** (`src/app/api/upload-url/route.ts` lines 1-34):
```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePublicId } from "@/lib/ids";
import { presignPhotoUpload } from "@/lib/r2";

const CONTENT_TYPE_BY_EXT = {
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;

const bodySchema = z.object({
  ext: z.enum(["jpg", "webp"]),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid ext" }, { status: 400 });
  }

  const { ext } = parsed.data;
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  const key = `complaints/${generatePublicId()}.${ext}`;
  const url = await presignPhotoUpload(key, contentType);

  return NextResponse.json({ url, key });
}
```

**Pattern to apply:** insert the session check (RESEARCH.md Pattern 6) as the first statement inside `POST`, before the body-parsing logic, following this file's existing `NextResponse.json({ error }, { status })` error-response convention (matches the `{ error: "invalid ext" }` / 400 shape already used two lines below):
```typescript
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
```

---

### `src/actions/submit-complaint.ts` (modified — swap device-id for session)

**Analog:** itself (existing file, targeted edit)

**Imports pattern** (lines 1-11) — replace line 5 (`import { getOrCreateDeviceId } from "@/lib/device-id";`) with the session import, keep everything else:
```typescript
"use server";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { complaints } from "@/lib/db/schema";
import { generatePublicId } from "@/lib/ids";
import { photoExists } from "@/lib/r2";
import { sanitizeError } from "@/lib/sanitize-error";
import { submissionSchema, type SubmissionInput } from "@/types/complaint";
```

**Existing error-throw convention to match** (line 45): plain `throw new Error("...")` for a user-facing pre-DB validation failure (not routed through `sanitizeError`, since the message itself is already safe to show) — RESEARCH.md Pattern 5's `throw new Error("You must be signed in to submit a report.")` should follow this exact same convention, placed as the first check in the function body (before or alongside the existing `photoExists` check at line 44):
```typescript
if (!(await photoExists(parsed.photoKey))) {
  throw new Error("Photo not found — please retake and upload the photo before submitting.");
}
```

**Line to replace** (line 48):
```typescript
const submitterId = await getOrCreateDeviceId();
```
becomes (per RESEARCH.md Pattern 5):
```typescript
const session = await auth.api.getSession({ headers: await headers() });
if (!session) {
  throw new Error("You must be signed in to submit a report.");
}
const submitterId = session.user.id;
```

**Error-sanitization convention to preserve unchanged** (lines 20-27, 72-86): the `isUniqueViolation` helper and the `sanitizeError`-wrapped catch/retry loop are untouched by this phase — only the identity-source line changes, per RESEARCH.md's Anti-Patterns ("no fallback to device-id post-login").

---

### `src/lib/db/schema.ts` (extended — add Better Auth tables)

**Analog:** itself, `complaints` table as the existing Drizzle convention to match

**Existing table-definition convention** (lines 14-42):
```typescript
export const complaints = pgTable(
  "complaints",
  {
    id: serial("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    submitterId: text("submitter_id").notNull(),
    // ...
  },
  (t) => [index("complaints_location_gist").using("gist", t.location)],
);
```
**Apply to new tables:** Better Auth's `user`/`session`/`account`/`verification` tables are typically generated via `npx @better-auth/cli generate` (RESEARCH.md Code Examples) rather than hand-written — but if hand-adjusted, follow this file's snake_case-column / camelCase-key convention (`text("public_id")` → `publicId`) and the IDOR-mitigation discipline noted in CONTEXT.md ("internal serial `id` never exposed, only opaque `publicId`" — extend this discipline to any new `users.id` if ever referenced client-side). RESEARCH.md Assumption A3 recommends **keeping Better Auth's default singular table names** (`user`, `session`, `account`) rather than forcing `usePlural: true` to match `complaints`' plural convention, due to a known plugin-table bug — accept the minor naming inconsistency.

**Note on `submitterId` FK decision:** CONTEXT.md leaves "whether to formalize `submitterId` as a FK" to planner discretion — no existing FK relationship exists elsewhere in `schema.ts` to pattern-match against (this is the first FK the schema would introduce, if chosen).

---

### `src/app/capture/page.tsx` (converted to async Server Component gate)

**No existing analog** — this is the first async Server Component auth-gate in the codebase. RESEARCH.md Pattern 3 is the sourced reference (from Better Auth's own Next.js integration docs), not a codebase analog:
```typescript
// src/app/capture/page.tsx — becomes a Server Component (drop "use client")
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

**What moves verbatim to `src/components/capture/CaptureClient.tsx`:** the entire current body of `src/app/capture/page.tsx` (all 100+ lines: `"use client"` directive, `useState`/`useRouter` hooks, `handlePublish`, the `noFix` early-return JSX, the main render) — RESEARCH.md's Recommended Project Structure states this move is "unchanged internals," i.e. a pure file move/rename, not a rewrite. Keep the existing `sanitizeError` usage (already reviewed above) exactly as-is; keep the existing comments referencing D-03/D-04/SUBM-01/SUBM-02 since those requirement IDs still apply post-move.

---

### `src/app/login/page.tsx` (new file)

**Analog:** `src/app/capture/page.tsx` (current, pre-move client-component shape) for "use client" + hooks conventions; RESEARCH.md Pattern 4 for the actual sign-in call.

**Client-component + `next/navigation` hook convention to match** (from current `capture/page.tsx` lines 1-9):
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
```
This establishes the codebase convention of importing Next.js navigation hooks directly and destructuring at top. `/login/page.tsx` should use `useSearchParams` the same way, per RESEARCH.md Pattern 4:
```typescript
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

**UI component convention to match:** use the existing `Button` component from `@/components/ui/button` (imported in current `capture/page.tsx` line 8: `import { Button } from "@/components/ui/button";`) rather than a bare `<button>`, to match the rest of the app's UI-component discipline.

---

### `tests/e2e/auth-fixtures.ts` (new file)

**Analog:** `tests/e2e/fixtures.ts` (full file, 18 lines)

**Fixture-extension pattern to copy exactly:**
```typescript
import { test as base, expect } from "@playwright/test";

const BENGALURU = { latitude: 12.9716, longitude: 77.5946, accuracy: 20 };

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.grantPermissions(["geolocation", "camera"]);
    await context.setGeolocation(BENGALURU);
    await use(context);
  },
});

export { expect };
```
**Apply this shape** to add a session-seeding fixture (RESEARCH.md Pitfall 1): extend `test.extend({...})` with a `page` or `context` fixture that inserts `user`/`account`/`session` rows via Drizzle and calls `context.addCookies()` with the resulting session token, following this file's `base.extend` + `export { expect }` structure. Consider composing with (not replacing) the existing `tests/e2e/fixtures.ts` geolocation/camera grants, since `capture.spec.ts` needs both.

---

### `tests/e2e/auth-gate.spec.ts` (new file)

**Analog:** `tests/e2e/capture.spec.ts` (imports + `test`/`expect` usage, lines 1-30)

**Import and structure convention:**
```typescript
import { expect, test } from "./fixtures";

test("capture flow: live camera + GPS produces a published complaint (SUBM-01, SUBM-03)", async ({
  page,
}) => {
  await page.goto("/capture");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  // ...
});
```
**Apply to `auth-gate.spec.ts`:** import from `./auth-fixtures` (or `./fixtures` for the anonymous-redirect case where no session should be seeded), assert the anonymous case redirects to `/login?callbackUrl=/capture` via `expect(page).toHaveURL(...)`, and the authenticated case renders the capture UI (reuse `capture.spec.ts`'s `page.getByRole("button", { name: "Pothole/Road damage" })` visibility check as the "gate passed" signal).

---

### `tests/unit/submit-complaint-sanitization.test.ts` (modified)

**Analog:** itself (existing file, targeted edit) — full file already read (76 lines)

**Existing mock-then-dynamic-import pattern to preserve** (lines 20-26, comment on lines 3-7):
```typescript
vi.mock("@/lib/r2", () => ({
  photoExists: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/device-id", () => ({
  getOrCreateDeviceId: vi.fn().mockResolvedValue("test-device"),
}));
```
**Required change (RESEARCH.md Pitfall 2):** replace the `@/lib/device-id` mock with a mock of the session-reading path, e.g.:
```typescript
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue({ user: { id: "test-user" } }) } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
```
**Add a new test case** for "no session → rejects" (mock `getSession` to resolve `null`/`undefined` and assert `submitComplaint` throws "You must be signed in to submit a report."), following this file's existing `describe`/`it` + `expect(...).rejects.toThrow(...)` structure (line 54-57) and the `beforeEach`/`afterEach` `consoleErrorSpy` setup (lines 44-52) — note the new "no session" rejection is a pre-DB-insert throw, so it will NOT hit `sanitizeError`/`console.error`, unlike the existing test's DB-failure case; a new `it` block should assert this distinctly (no `consoleErrorSpy` expectation for that case).

---

## Shared Patterns

### Env-var fail-fast convention
**Source:** `src/lib/env.ts` (`requireEnv`)
**Apply to:** `src/lib/auth.ts` — use `requireEnv("GOOGLE_CLIENT_ID")`, `requireEnv("GOOGLE_CLIENT_SECRET")`, and (if not handled internally by Better Auth) `requireEnv("BETTER_AUTH_SECRET")` instead of raw `process.env.X as string` casts, for consistency with the DB client's existing convention.

### Sanitized error messages for user-facing failures
**Source:** `src/lib/sanitize-error.ts` (full file, already the single shared utility)
**Apply to:** Any new auth-related error path that surfaces a message from an unpredictable/external source (e.g., an unexpected Better Auth internal error) should route through `sanitizeError(err, fallback, context)`. Direct, intentional, developer-authored messages (like "You must be signed in...") do NOT need `sanitizeError` — follow the existing `photoExists` check's plain-`throw new Error(...)` precedent in `submit-complaint.ts` line 45, since that message is inherently safe (no external error content interpolated).

### `NextResponse.json({ error }, { status })` for Route Handler auth failures
**Source:** `src/app/api/upload-url/route.ts` line 25 (`{ error: "invalid ext" }`, status 400)
**Apply to:** the new 401 unauthorized response in the same file — `NextResponse.json({ error: "unauthorized" }, { status: 401 })` — matches the existing error-shape convention exactly (flat `{ error: string }` object, no nested envelope).

### Server Action defense-in-depth via `headers()` + `auth.api.getSession()`
**Source:** RESEARCH.md Pattern 5 (no codebase precedent yet — this is the first Server Action requiring session awareness)
**Apply to:** `submit-complaint.ts` and any future write-performing Server Action. Always call `auth.api.getSession({ headers: await headers() })` and reject before any DB mutation — never rely solely on the `/capture` route-level gate (RESEARCH.md Anti-Patterns / Pitfall 3).

### IDOR mitigation — internal id vs. public id
**Source:** `src/lib/db/schema.ts` lines 11-13 comment + `publicId`/`id` split on `complaints`
**Apply to:** the new `user` table — never expose Better Auth's internal `user.id` (or session token) in any client-visible payload beyond what Better Auth itself already manages via its signed cookie; if a public-facing user identifier is ever needed later (e.g., displaying an author), it should follow the same opaque-id discipline, though CONTEXT.md's D-06 ("no fake username shown," Phase 1) suggests this isn't yet needed in Phase 2.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/app/capture/page.tsx` (Server Component gate version) | route/controller | request-response | First async Server Component auth-gate in the codebase — no prior server-side redirect-before-render pattern exists. Use RESEARCH.md Pattern 3 (sourced from Better Auth's own docs) directly. |
| `src/lib/auth-client.ts` | provider/utility | request-response | No prior "browser-side SDK client instance" pattern exists (closest conceptual analog, `src/lib/geolocation.ts`, wraps a native browser API, not a third-party SDK) — use RESEARCH.md's `createAuthClient()` pattern directly from Better Auth docs. |

## Metadata

**Analog search scope:** `src/lib/`, `src/app/`, `src/actions/`, `src/components/capture/`, `tests/unit/`, `tests/e2e/`
**Files scanned:** `src/lib/device-id.ts`, `src/actions/submit-complaint.ts`, `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/env.ts`, `src/lib/sanitize-error.ts`, `src/app/api/upload-url/route.ts`, `src/app/api/feed/route.ts`, `src/app/capture/page.tsx`, `src/types/complaint.ts`, `tests/unit/submit-complaint-sanitization.test.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/capture.spec.ts`
**Pattern extraction date:** 2026-07-28
