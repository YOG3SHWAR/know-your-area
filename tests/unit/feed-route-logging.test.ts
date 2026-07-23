import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route imports @/lib/feed, which imports @/lib/db/client (requires a
// live DATABASE_URL to instantiate the postgres.js client). Mock @/lib/feed
// so importing the route never touches that chain.
const ERROR_NAME = "FeedTestPgError";
const ERROR_MESSAGE = "feed-test-boom";
const ERROR_CODE = "FEEDTESTCODE08006";

vi.mock("@/lib/feed", () => ({
  recentFeed: vi.fn(() => {
    const err = new Error(ERROR_MESSAGE) as Error & { code: string };
    err.name = ERROR_NAME;
    err.code = ERROR_CODE;
    return Promise.reject(err);
  }),
  nearbyFeed: vi.fn(),
}));

describe("GET /api/feed error logging", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logs name/message/code server-side while returning only the generic message", async () => {
    const { GET } = await import("@/app/api/feed/route");

    const res = await GET(new Request("http://localhost/api/feed"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Couldn't load reports." });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls
      .map((call: unknown[]) => call.map((arg: unknown) => String(arg)).join(" "))
      .join(" ");

    expect(loggedArgs).toContain(ERROR_NAME);
    expect(loggedArgs).toContain(ERROR_MESSAGE);
    expect(loggedArgs).toContain(ERROR_CODE);
  });
});
