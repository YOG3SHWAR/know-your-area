import { expect, test } from "@playwright/test";

// A1 + schema-push smoke test (Phase 02 Plan 01, Task 3): proves the Better
// Auth Drizzle adapter round-trips against the real Postgres database
// through the real dev server. An unauthenticated request to the session
// endpoint returning 200 (with a null session) — rather than a 500 —
// confirms two things at once:
//   (a) the four Better Auth tables (user/session/account/verification)
//       actually exist in Postgres (the endpoint does a session DB read),
//       not just declared in schema.ts (RESEARCH.md schema-gate).
//   (b) drizzleAdapter(db, { provider: "pg" }) speaks the correct SQL
//       dialect against the existing postgres-js `db` instance with no
//       driver/dialect mismatch (RESEARCH.md Pitfall 7 / Assumption A1).
// Uses the plain @playwright/test request context — no auth fixture — the
// point is the unauthenticated path.
test("Better Auth session endpoint answers cleanly through the real server + Postgres (A1)", async ({
  request,
}) => {
  const response = await request.get("/api/auth/get-session");

  expect(response.status()).toBe(200);

  const body = await response.json();
  // No session cookie was sent, so Better Auth must report a null session —
  // not throw a dialect/driver error trying to read one.
  expect(body).toBeNull();
});
