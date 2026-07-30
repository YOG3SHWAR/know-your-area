import { expect as authedExpect, test as authedTest } from "./auth-fixtures";
import { expect, test } from "./fixtures";

// AUTH-01: an anonymous visitor (no session fixture applied — imported from
// `./fixtures`, not `./auth-fixtures`) hitting /capture is redirected by the
// Server Component gate (src/app/capture/page.tsx) to /login before any
// client paint — this is also the tracer's verify target (02-02-PLAN.md
// Task 1). The camera UI must never appear for this visitor (D-04).
test("anonymous visitor is redirected from /capture to /login (AUTH-01)", async ({ page }) => {
  await page.goto("/capture");

  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcapture|\/login\?callbackUrl=\/capture/);
  await expect(page.getByRole("button", { name: "Capture Photo" })).toHaveCount(0);
});

// AUTH-01: with a valid, real DB-backed Better Auth session seeded by
// auth-fixtures.ts (never a hand-signed cookie), /capture renders
// CaptureClient — the gate does not redirect an authenticated visitor.
authedTest("authenticated visitor sees the capture UI at /capture (AUTH-01)", async ({ page }) => {
  await page.goto("/capture");

  await authedExpect(page).not.toHaveURL(/\/login/);
  await authedExpect(
    page.getByRole("button", { name: "Pothole/Road damage" }),
  ).toBeVisible();
});

// AUTH-03: the DB-backed session cookie survives a full browser refresh —
// no re-login required, no redirect to /login after reload.
authedTest("session survives a full page refresh (AUTH-03)", async ({ page }) => {
  await page.goto("/capture");
  await authedExpect(
    page.getByRole("button", { name: "Pothole/Road damage" }),
  ).toBeVisible();

  await page.reload();

  await authedExpect(page).not.toHaveURL(/\/login/);
  await authedExpect(
    page.getByRole("button", { name: "Pothole/Road damage" }),
  ).toBeVisible();
});
