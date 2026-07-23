import { describe, expect, it } from "vitest";

import { formatOverlayText } from "@/lib/overlay";

// Fixed timestamp with an explicit IST offset so the formatted output is
// deterministic regardless of the test runner's local timezone.
const CAPTURE_DATE = new Date("2026-07-23T14:03:00+05:30");

describe("formatOverlayText", () => {
  it("formats coordinates, accuracy, and India-locale timestamp", () => {
    const text = formatOverlayText({ lat: 12.9716, lng: 77.5946 }, 18, CAPTURE_DATE);
    expect(text).toBe("12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03");
  });

  it("rounds a fractional accuracy to the nearest metre", () => {
    const text = formatOverlayText({ lat: 12.9716, lng: 77.5946 }, 17.6, CAPTURE_DATE);
    expect(text).toContain("±18m");
  });

  it("handles a very long/imprecise accuracy value without throwing", () => {
    const text = formatOverlayText({ lat: 12.9716, lng: 77.5946 }, 123456.7, CAPTURE_DATE);
    expect(text).toContain("±123457m");
  });

  it("clamps a defensively-negative accuracy to zero rather than rendering a negative distance", () => {
    const text = formatOverlayText({ lat: 12.9716, lng: 77.5946 }, -5, CAPTURE_DATE);
    expect(text).toContain("±0m");
  });

  it("falls back to zero for a non-finite accuracy (NaN/Infinity) instead of throwing", () => {
    expect(formatOverlayText({ lat: 12.9716, lng: 77.5946 }, NaN, CAPTURE_DATE)).toContain(
      "±0m",
    );
    expect(formatOverlayText({ lat: 12.9716, lng: 77.5946 }, Infinity, CAPTURE_DATE)).toContain(
      "±0m",
    );
  });

  it("formats negative lat/lng to 4 decimal places", () => {
    const text = formatOverlayText({ lat: -12.9716, lng: -77.5946 }, 10, CAPTURE_DATE);
    expect(text.startsWith("-12.9716, -77.5946")).toBe(true);
  });
});
