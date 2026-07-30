import type { Page } from "@playwright/test";

import { expect, test } from "./auth-fixtures";

// Bengaluru fixture center — matches tests/e2e/fixtures.ts's default so the
// "viewer" position below is unambiguous.
const VIEWER = { latitude: 12.9716, longitude: 77.5946, accuracy: 20 };
// ~55m north of the viewer (0.0005 deg lat ~= 55m at this latitude).
const NEAR = { latitude: 12.9716 + 0.0005, longitude: 77.5946, accuracy: 20 };
// ~2.2km north of the viewer (0.02 deg lat ~= 2.2km).
const FAR = { latitude: 12.9716 + 0.02, longitude: 77.5946, accuracy: 20 };

// Publishes a complaint at the given coordinates and returns its opaque
// public_id — learned by following the just-published card's link (it's the
// very first card when viewed from that same location: distance ~0, and the
// created_at DESC tie-break puts the newest insert first among ties).
// Identifying the complaint by its own id (rather than its category label)
// keeps the ordering assertion correct even when other e2e specs have
// published same-category complaints at other distances against the same
// live, shared, cross-run-accumulating DB.
async function publishAndGetId(
  page: Page,
  coords: { latitude: number; longitude: number; accuracy: number },
  categoryName: string,
): Promise<string> {
  await page.context().setGeolocation(coords);
  await page.goto("/capture");
  await page.getByRole("button", { name: categoryName }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();
  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();
  // Match the feed root with or without the ?lat=&lng= query —
  // LocationRequester may have already attached it by the time this check
  // runs, so asserting the exact bare "/" is racy against that client effect.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/, { timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });

  await page.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/c\/([A-Z0-9-]+)(\?.*)?$/, { timeout: 10_000 });
  const match = page.url().match(/\/c\/([A-Z0-9-]+)/);
  return match![1];
}

// Paginates /api/feed to completion and returns every publicId in server
// order. The live DB accumulates complaints across every e2e run in this
// phase (including many at effectively the same viewer coordinate, which
// tie-break-sort ahead of any real offset), so a fixed-size single page can
// no longer be trusted to contain a given complaint — walking the full
// cursor chain is what actually verifies nearbyFeed's ordering rather than
// an artifact of how much unrelated data happens to exist.
async function fetchAllFeedIds(
  page: Page,
  viewer: { latitude: number; longitude: number },
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({
      lat: String(viewer.latitude),
      lng: String(viewer.longitude),
      limit: "50",
    });
    if (cursor) params.set("cursor", cursor);
    const res = await page.request.get(`/api/feed?${params.toString()}`);
    const body: { items: { publicId: string }[]; nextCursor: string | null } = await res.json();
    ids.push(...body.items.map((item) => item.publicId));
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }
  return ids;
}

// FEED-01: landing page shows a feed of complaints near the visitor's
// current location, distance-sorted nearest-first. Publishes a far and a
// near complaint (real capture flow, live R2/DB), then confirms the near
// one's permalink card appears before the far one's once the client-side
// LocationRequester attaches the viewer's lat/lng and the proximity query
// re-runs.
test("feed page: nearest complaint ranks above a farther one, sorted by proximity (FEED-01)", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const farId = await publishAndGetId(page, FAR, "Traffic lights");
  const nearId = await publishAndGetId(page, NEAR, "Water/Drainage");

  await page.context().setGeolocation(VIEWER);
  await page.goto("/");
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });
  // UI smoke check: the feed actually renders distance-labeled cards.
  await expect(page.getByText(/ away$/).first()).toBeVisible();

  // Deterministic ordering check via the same nearbyFeed/route.ts code path
  // the UI calls, walked to completion so accumulated cross-run test data
  // can't push either complaint out of a single fixed-size page.
  const ids = await fetchAllFeedIds(page, VIEWER);
  const nearIndex = ids.indexOf(nearId);
  const farIndex = ids.indexOf(farId);
  expect(nearIndex, "near complaint should appear in the feed").toBeGreaterThanOrEqual(0);
  expect(farIndex, "far complaint should appear in the feed").toBeGreaterThanOrEqual(0);
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
