import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";

// Google is the ONLY social provider this phase ships (D-01). Do NOT add a
// username/password provider, an SMS-code field, or any second provider —
// even as an unwired placeholder. SMS sign-in is a formally deferred future
// phase.
export const auth = betterAuth({
  // Explicit requireEnv fail-fast, matching the Google credentials below.
  // Better Auth's own internal fallback only hard-fails on a missing secret
  // when NODE_ENV==="production" — outside that it silently falls back to a
  // well-known public default string, which would let session cookies be
  // forged. Still reads the same BETTER_AUTH_SECRET env var
  // tests/e2e/auth-fixtures.ts's test-only auth instance relies on via its
  // own (unexplicit) fallback, so seeded e2e sessions remain valid.
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    google: {
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    },
  },
  // A failed OAuth callback redirects to /login with a machine-readable
  // `?error=` query param (Better Auth's `onAPIError.errorURL` — confirmed
  // against the installed better-auth/dist source: oauth2/errors.mjs always
  // appends `error`/`error_description` search params before redirecting).
  // Plan 02's /login reads this `?error=` param to render inline error copy.
  onAPIError: {
    errorURL: "/login",
  },
  // nextCookies() must be the LAST plugin — it auto-sets cookies for
  // Server Action-driven auth calls (source: better-auth.com/docs/integrations/next).
  plugins: [nextCookies()],
});
