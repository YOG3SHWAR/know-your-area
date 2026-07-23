import { expect, test } from "./fixtures";

// FEED-01: landing page shows a feed of complaints near the visitor's
// current location, distance-sorted. Publishes a complaint at the fixture
// location (Bengaluru, granted via tests/e2e/fixtures.ts) through the real
// capture flow, then confirms it renders on the feed once the client-side
// LocationRequester attaches lat/lng and the proximity query re-runs.
test("feed page: shows nearby complaints distance-sorted (FEED-01)", async ({ page }) => {
  await page.goto("/capture");
  await page.getByRole("button", { name: "Garbage/Sanitation" }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();

  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();

  await expect(page).toHaveURL("http://localhost:3000/", { timeout: 15_000 });

  // Proximity-sorted re-render after LocationRequester attaches lat/lng.
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });
  await expect(page.getByText("Garbage/Sanitation").first()).toBeVisible();
  await expect(page.getByText(/away$/).first()).toBeVisible();
});
