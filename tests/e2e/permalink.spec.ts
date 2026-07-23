import { expect, test } from "./fixtures";

// FEED-04: each complaint has a shareable, crawlable permalink at /c/{id}.
// Publishes via the real capture flow, follows the feed card's link (the
// discovery path from feed -> permalink) to learn the real ID, then
// confirms the permalink renders the correct complaint.
test("permalink page: renders the correct complaint at /c/{id} (FEED-04)", async ({ page }) => {
  await page.goto("/capture");
  await page.getByRole("button", { name: "Streetlight/Electrical" }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();
  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/, { timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });

  await page.getByRole("link").filter({ hasText: "Streetlight/Electrical" }).first().click();
  await expect(page).toHaveURL(/\/c\/[A-Z0-9-]+(\?.*)?$/, { timeout: 10_000 });

  await expect(page.getByText("Streetlight/Electrical")).toBeVisible();
  await expect(page.getByText("Reported by a nearby resident")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to feed" })).toBeVisible();
});

// A malformed/nonexistent id renders the dedicated not-found state — never
// a generic 500/crash — and returns a real 404 so the permalink doesn't
// masquerade as a valid page to crawlers or to SearchById's existence check.
test("permalink page: an unknown ID renders the not-found state, not a crash (FEED-04)", async ({
  page,
}) => {
  const response = await page.goto("/c/KYA-BOGUS0");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByText("This report doesn't exist or may have been removed."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to feed" })).toBeVisible();
});
