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

  // Capture now runs its own GPS wait-for-fix window (for the burned-in
  // overlay, D-02) before uploading, and Publish runs a second wait-for-fix
  // window (for the stored accuracy_m, D-04) before the actual insert — so
  // both waits are generously bounded here.
  await expect(page.getByRole("button", { name: "Publish Report" })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Publish Report" }).click();

  // The feed page's LocationRequester (added in Plan 01-04) appends
  // ?lat=&lng= shortly after mount, so match the bare path with an optional
  // query string rather than an exact "/" — same pattern used throughout
  // feed.spec.ts, search.spec.ts, and permalink.spec.ts.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/, { timeout: 20_000 });
});

// D-03: a proactively-denied camera or location permission hard-blocks the
// entire capture flow with the exact UI-SPEC guidance copy and no
// degraded/alternative submission path (RESEARCH.md Pitfall 5 — once denied,
// the browser never re-prompts, so the app must detect this via the
// Permissions API rather than waiting for a failed capture attempt).
test("capture flow: denied camera permission hard-blocks with no submission path (D-03)", async ({
  page,
}) => {
  // Playwright's `context.grantPermissions` can only grant (or leave the
  // permission at "prompt") — there is no supported Playwright/Chromium API
  // to force a permission into the "denied" state deterministically. Instead,
  // override `navigator.permissions.query` via an injected init script so
  // PermissionGate's proactive Permissions API check is exercised
  // deterministically, independent of real browser permission-prompt UI.
  await page.addInitScript(() => {
    navigator.permissions.query = (async (descriptor: PermissionDescriptor) => {
      const state = descriptor.name === "camera" ? "denied" : "granted";
      return { state, onchange: null } as PermissionStatus;
    }) as typeof navigator.permissions.query;
  });

  await page.goto("/capture");

  await expect(page.getByTestId("permission-hard-block")).toContainText("Camera access is off");
  await expect(page.getByRole("button", { name: "Capture Photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish Report" })).toHaveCount(0);
});

test("capture flow: denied location permission hard-blocks with no submission path (D-03)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.permissions.query = (async (descriptor: PermissionDescriptor) => {
      const state = descriptor.name === "geolocation" ? "denied" : "granted";
      return { state, onchange: null } as PermissionStatus;
    }) as typeof navigator.permissions.query;
  });

  await page.goto("/capture");

  await expect(page.getByTestId("permission-hard-block")).toContainText("Location access is off");
  await expect(page.getByRole("button", { name: "Capture Photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish Report" })).toHaveCount(0);
});

// G-01-4: the category picker must render as a uniform grid — the previous
// `flex flex-wrap` container sized each chip to its intrinsic label width,
// so the longest label ("Pothole/Road damage") wrapped alone while shorter
// labels paired up. A fixed 2-column grid gives every chip an equal-width
// cell regardless of label length.
test("category picker renders uniform-width chips (G-01-4)", async ({ page }) => {
  await page.goto("/capture");

  const grid = page.getByTestId("category-picker");
  await expect(grid).toHaveCSS("display", "grid");

  const buttons = grid.locator("button");
  await expect(buttons).toHaveCount(5);

  const widths: number[] = [];
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    if (!box) throw new Error("Expected category chip to have a bounding box");
    widths.push(box.width);
  }

  const [first, ...rest] = widths;
  for (const width of rest) {
    expect(Math.abs(width - first)).toBeLessThanOrEqual(2);
  }
});

// G-01-3: on a browser whose Permissions API does not proactively report
// `denied` up front (Safari never does for "camera"; every browser reports
// "prompt" on a first visit), PermissionGate's proactive check alone cannot
// catch the denial — the real getUserMedia/geolocation rejection must be
// routed back into the same hard-block. These tests simulate that
// "prompt"-then-reject sequence rather than the proactive "denied" state
// already covered above.
test("capture flow: camera denial via getUserMedia rejection escalates to hard-block (G-01-3)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.permissions.query = (async () => {
      return { state: "prompt", onchange: null } as PermissionStatus;
    }) as typeof navigator.permissions.query;

    navigator.mediaDevices.getUserMedia = (async () => {
      throw new DOMException("denied", "NotAllowedError");
    }) as typeof navigator.mediaDevices.getUserMedia;
  });

  await page.goto("/capture");

  await expect(page.getByTestId("permission-hard-block")).toContainText("Camera access is off");
  await expect(page.getByRole("button", { name: "Capture Photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish Report" })).toHaveCount(0);
});

test("capture flow: location denial via geolocation code 1 escalates to hard-block (G-01-3)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.permissions.query = (async () => {
      return { state: "prompt", onchange: null } as PermissionStatus;
    }) as typeof navigator.permissions.query;

    navigator.geolocation.watchPosition = ((
      _success: PositionCallback,
      error?: PositionErrorCallback | null,
    ) => {
      setTimeout(() => {
        error?.({
          code: 1,
          message: "denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      }, 0);
      return 1;
    }) as typeof navigator.geolocation.watchPosition;
  });

  await page.goto("/capture");

  await page.getByRole("button", { name: "Pothole/Road damage" }).click();
  await page.getByRole("button", { name: "Capture Photo" }).click();

  await expect(page.getByTestId("permission-hard-block")).toContainText("Location access is off");
});
