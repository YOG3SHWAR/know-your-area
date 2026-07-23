import { test as base, expect } from "@playwright/test";

// Bengaluru default coordinate — grants geolocation permission and seeds a
// deterministic fake position so location-dependent E2E specs (feed sort,
// capture GPS attach) don't depend on the real machine's location
// (RESEARCH.md Wave 0 Gaps; playwright.dev/docs/emulation).
const BENGALURU = { latitude: 12.9716, longitude: 77.5946, accuracy: 20 };

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.grantPermissions(["geolocation", "camera"]);
    await context.setGeolocation(BENGALURU);
    await use(context);
  },
});

export { expect };
