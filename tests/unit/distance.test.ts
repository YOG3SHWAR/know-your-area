import { describe, expect, it } from "vitest";

import { formatDistance, formatRelativeTime } from "@/lib/distance";

describe("formatDistance", () => {
  it("formats sub-1km distances in meters", () => {
    expect(formatDistance(450)).toBe("450 m away");
  });

  it("rounds fractional meters", () => {
    expect(formatDistance(449.6)).toBe("450 m away");
  });

  it("formats 1km+ distances in km with one decimal", () => {
    expect(formatDistance(2300)).toBe("2.3 km away");
  });

  it("formats exactly 1000m as km, not meters", () => {
    expect(formatDistance(1000)).toBe("1.0 km away");
  });
});

describe("formatRelativeTime", () => {
  it("formats minutes", () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe("5m ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime(new Date(Date.now() - 2 * 60 * 60_000))).toBe("2h ago");
  });

  it("formats days", () => {
    expect(formatRelativeTime(new Date(Date.now() - 3 * 24 * 60 * 60_000))).toBe("3d ago");
  });

  it("accepts an ISO date string", () => {
    const iso = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("10m ago");
  });
});
