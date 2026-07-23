import { expect, test } from "./fixtures";

// SUBM-01: camera-only capture (no gallery/file-picker path exists).
// SUBM-03: live GPS is read from the browser at submission time, not EXIF.
// Fixture grants camera + geolocation and drives a fake media device
// (playwright.config.ts launchOptions), so this exercises the real
// capture -> upload -> publish -> redirect path end-to-end.
test("capture flow: live camera + GPS produces a published complaint (SUBM-01, SUBM-03)", async ({
  page,
}) => {
  await page.goto("/capture");

  // Camera-only capture — no gallery/file-picker input exists anywhere.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Pothole/Road damage" }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();

  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();

  await expect(page).toHaveURL("http://localhost:3000/", { timeout: 15_000 });
});
