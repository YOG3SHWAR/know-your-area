import path from "node:path";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { test as base, expect } from "./fixtures";
// Relative import (not `@/lib/db/schema`): Playwright's TS loader is not
// guaranteed to resolve the tsconfig `@/*` path alias the same way Next.js's
// bundler does — 02-02-PLAN.md's explicit fallback instruction, applied here
// too since schema.ts has no further `@/`-aliased imports to chase.
import * as schema from "../../src/lib/db/schema";

// The Playwright test runner is a separate Node process from the Next.js dev
// server (which loads .env.local itself via Next's own env loader) — this
// file needs DATABASE_URL/BETTER_AUTH_SECRET/BETTER_AUTH_URL directly in
// *this* process to seed a real session, so load .env.local here too.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch {
    // CI (or another environment) may already inject these vars directly.
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Mirrors src/lib/db/client.ts's buildClientOptions (duplicated, not
// imported, to avoid pulling that file's `@/lib/env` aliased import into
// Playwright's module graph — see the relative-import note above).
function buildClientOptions(url: string): { prepare: false; ssl: false | "require" } {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { prepare: false, ssl: "require" };
  }
  return { prepare: false, ssl: LOCAL_HOSTS.has(hostname) ? false : "require" };
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set — tests/e2e/auth-fixtures.ts needs it (via process.env or .env.local) to seed a Better Auth session for e2e tests.",
  );
}

const queryClient = postgres(databaseUrl, buildClientOptions(databaseUrl));
const db = drizzle(queryClient, { schema });

// A SEPARATE, test-only Better Auth instance — never imported into
// production code (src/lib/auth.ts is untouched by this plan). Better
// Auth's own `testUtils` plugin docstring recommends exactly this: "Prefer
// including it in a test-only auth instance... instead of a production auth
// config," since the plugin exposes privileged session-creation helpers.
// This instance points at the SAME Postgres database and — because `secret`
// is left unset — auto-reads the SAME BETTER_AUTH_SECRET env var Better
// Auth's `betterAuth()` always falls back to (RESEARCH.md Pitfall 1), so a
// session/cookie minted here is a real, validly HMAC-signed session the
// app's own auth.api.getSession() (src/lib/auth.ts) accepts — never a
// hand-signed cookie.
const testAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: [testUtils()],
});

export const test = base.extend<{ seededUserId: string }>({
  // Auto fixture: every test importing `test` from this file gets a seeded,
  // real DB-backed Better Auth session set on its browser context BEFORE
  // the test body runs (and therefore before any page.goto()) — composed
  // with (not replacing) fixtures.ts's camera/geolocation grants, since
  // capture.spec.ts needs both.
  seededUserId: [
    async ({ context }, use) => {
      const ctx = await testAuth.$context;
      const testHelpers = ctx.test;
      if (!testHelpers) {
        throw new Error(
          "better-auth testUtils plugin did not attach ctx.test — check the plugin registration in tests/e2e/auth-fixtures.ts.",
        );
      }

      const user = testHelpers.createUser({
        email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
        name: "E2E Test User",
      });
      const savedUser = await testHelpers.saveUser(user);
      const { cookies } = await testHelpers.login({ userId: savedUser.id });
      await context.addCookies(cookies);

      await use(savedUser.id);

      // Cleanup: session/account rows cascade-delete via the `user_id`
      // foreign key (onDelete: "cascade", src/lib/db/schema.ts), so the
      // shared live DB does not accumulate test users across e2e runs
      // (STATE.md's cross-run-data discipline for e2e).
      await testHelpers.deleteUser(savedUser.id);
    },
    { auto: true },
  ],
});

export { expect };
