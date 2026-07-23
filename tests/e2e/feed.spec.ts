import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Bengaluru fixture center — matches tests/e2e/fixtures.ts's default so the
// "viewer" position below is unambiguous.
const VIEWER = { latitude: 12.9716, longitude: 77.5946, accuracy: 20 };
// ~55m north of the viewer (0.0005 deg lat ~= 55m at this latitude).
const NEAR = { latitude: 12.9716 + 0.0005, longitude: 77.5946, accuracy: 20 };
// ~2.2km north of the viewer (0.02 deg lat ~= 2.2km).
const FAR = { latitude: 12.9716 + 0.02, longitude: 77.5946, accuracy: 20 };

async function publishAt(
  page: Page,
  coords: { latitude: number; longitude: number; accuracy: number },
  categoryName: string,
) {
  await page.context().setGeolocation(coords);
  await page.goto("/capture");
  await page.getByRole("button", { name: categoryName }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();
  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();
  // Match the bare feed root with or without the ?lat=&lng= query
  // LocationRequester may have already attached by the time this check
  // runs — asserting the exact bare "/" is racy against that client effect.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/, { timeout: 20_000 });
}

// FEED-01: landing page shows a feed of complaints near the visitor's
// current location, distance-sorted nearest-first. Publishes a far and a
// near complaint (real capture flow, live R2/DB), then confirms the near
// one's category label appears before the far one's once the client-side
// LocationRequester attaches the viewer's lat/lng and the proximity query
// re-runs. Uses relative DOM-order rather than absolute list position so
// the assertion isn't broken by complaints accumulated from other e2e runs.
test("feed page: nearest complaint ranks above a farther one, sorted by proximity (FEED-01)", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await publishAt(page, FAR, "Traffic lights");
  await publishAt(page, NEAR, "Water/Drainage");

  await page.context().setGeolocation(VIEWER);
  await page.goto("/");
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });
  await expect(page.getByText(/ away$/).first()).toBeVisible();

  const bodyText = await page.locator("body").innerText();
  const nearIndex = bodyText.indexOf("Water/Drainage");
  const farIndex = bodyText.indexOf("Traffic lights");
  expect(nearIndex, "near complaint's category label should be present").toBeGreaterThanOrEqual(0);
  expect(farIndex, "far complaint's category label should be present").toBeGreaterThanOrEqual(0);
  expect(nearIndex).toBeLessThan(farIndex);
});

// D-07: when the visitor denies/lacks location, the feed still renders
// (recency order, distance hidden) rather than blocking browsing. Overrides
// getCurrentPosition directly (not just Permissions API state) since
// LocationRequester calls it unconditionally and the app has no proactive
// permission gate on the feed page (unlike /capture's PermissionGate).
test("feed page: location denied falls back to recency without blocking (D-07)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = ((
      _success: PositionCallback,
      error?: PositionErrorCallback,
    ) => {
      error?.({
        code: 1,
        message: "User denied Geolocation",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    }) as typeof navigator.geolocation.getCurrentPosition;
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Know Your Area" })).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]lat=/);
  await expect(page.getByText("Couldn't load reports")).toHaveCount(0);
  await expect(page.getByText(/ away$/)).toHaveCount(0);
});
