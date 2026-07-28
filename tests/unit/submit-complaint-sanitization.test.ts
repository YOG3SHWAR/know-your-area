import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors tests/unit/feed-route-logging.test.ts's mock-then-dynamic-import
// shape: submit-complaint.ts imports @/lib/r2, @/lib/device-id, and
// @/lib/db/client, each of which would otherwise require live env vars
// (R2 credentials, DATABASE_URL) to instantiate. Mock all three so importing
// the Server Action never touches that chain.
const RAW_MARKER = "RAW_DRIVER_LEAK: connection terminated unexpectedly";
const SANITIZED_PUBLISH_MESSAGE =
  "Couldn't publish your report. Check your connection and try again.";

const validPayload = {
  category: "pothole" as const,
  lat: 12.9716,
  lng: 77.5946,
  accuracy: 15,
  photoKey: "complaints/KYA-7F3XABC.jpg",
};

vi.mock("@/lib/r2", () => ({
  photoExists: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/device-id", () => ({
  getOrCreateDeviceId: vi.fn().mockResolvedValue("test-device"),
}));

vi.mock("@/lib/db/client", () => {
  // Not a unique-violation error (no .code), so the retry loop must not
  // continue — it should throw on the first attempt.
  const rawErr = new Error(RAW_MARKER);
  return {
    db: {
      insert: () => ({
        values: () => ({
          returning: () => Promise.reject(rawErr),
        }),
      }),
    },
  };
});

describe("submitComplaint sanitization (G-01-CR-01)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("rejects with only the sanitized publish message, logging the raw detail server-side", async () => {
    const { submitComplaint } = await import("@/actions/submit-complaint");

    await expect(submitComplaint(validPayload)).rejects.toThrow(SANITIZED_PUBLISH_MESSAGE);

    // Excludes the raw marker from the rejection.
    try {
      await submitComplaint(validPayload);
      expect.unreachable("submitComplaint should have rejected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(RAW_MARKER);
      expect(message).toBe(SANITIZED_PUBLISH_MESSAGE);
    }

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls
      .map((call: unknown[]) => call.map((arg: unknown) => String(arg)).join(" "))
      .join(" ");
    expect(loggedArgs).toContain(RAW_MARKER);
  });
});
