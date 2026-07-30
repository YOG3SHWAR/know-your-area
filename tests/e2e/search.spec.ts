import { expect, test } from "./auth-fixtures";

async function publishAndGetId(page: import("@playwright/test").Page, categoryName: string) {
  await page.goto("/capture");
  await page.getByRole("button", { name: categoryName }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();
  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/, { timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]lat=/, { timeout: 15_000 });

  await page.getByRole("link").filter({ hasText: categoryName }).first().click();
  await expect(page).toHaveURL(/\/c\/([A-Z0-9-]+)(\?.*)?$/, { timeout: 10_000 });
  const match = page.url().match(/\/c\/([A-Z0-9-]+)/);
  return match![1];
}

// FEED-03: user can search for a complaint by its opaque ID and jump
// straight to its permalink.
test("search by ID: a known ID navigates to its permalink (FEED-03)", async ({ page }) => {
  const id = await publishAndGetId(page, "Water/Drainage");

  await page.goto("/");
  await page.getByLabel("Search by report ID").fill(id);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${id}(\\?.*)?$`), { timeout: 10_000 });
  await expect(page.getByText("Water/Drainage")).toBeVisible();
});

// D-13/UI-SPEC long-text: pasting a full permalink URL extracts the {id}
// segment and searches using that instead of the raw pasted string.
test("search by ID: a full permalink URL is extracted and searched (FEED-03)", async ({
  page,
}) => {
  const id = await publishAndGetId(page, "Traffic lights");

  await page.goto("/");
  await page.getByLabel("Search by report ID").fill(`https://example.com/c/${id}?ref=share`);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${id}(\\?.*)?$`), { timeout: 10_000 });
});

// Unknown id shows the inline not-found message and stays on the page
// rather than navigating into a dead permalink.
test("search by ID: an unknown ID shows the not-found message and stays on the page (FEED-03)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search by report ID").fill("KYA-NOPE000");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(
    page.getByText("We couldn't find a report with that ID. Check the code and try again."),
  ).toBeVisible({ timeout: 10_000 });
  // Stays on the feed root — LocationRequester may have already attached
  // ?lat=&lng=, but crucially there's no navigation into /c/{id}.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/);
});
