import { describe, expect, it } from "vitest";

import { formatOverlayText, wrapOverlayLines } from "@/lib/overlay";

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

// Minimal stub context: measureText returns a width proportional to
// character count, so maxWidth below is expressed "in characters" for
// deterministic, dependency-free assertions (no real canvas needed).
function stubCtx() {
  return {
    measureText: (t: string) => ({ width: t.length }),
  } as unknown as CanvasRenderingContext2D;
}

describe("wrapOverlayLines", () => {
  it("retains the trailing timestamp on the last line (CR-01 regression)", () => {
    // Old `=== OVERLAY_MAX_LINES - 1` break condition dropped every word
    // after the second line started accumulating, silently discarding the
    // burned-in timestamp — the D-02 anti-fraud proof. This must fail
    // against the old break condition and pass against the fix.
    const overlayText = "12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03";
    const lines = wrapOverlayLines(stubCtx(), overlayText, 23);

    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("14:03");
    expect(lastLine).toContain("2026");
  });

  it("caps wrapped output at OVERLAY_MAX_LINES (2) even for longer text", () => {
    const text = "aaaa bbbb cccc dddd eeee ffff";
    const lines = wrapOverlayLines(stubCtx(), text, 9);

    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("ellipsizes a single unbreakable word that overflows maxWidth", () => {
    const longWord = "a".repeat(40);
    const lines = wrapOverlayLines(stubCtx(), longWord, 20);

    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith("…")).toBe(true);
    expect(stubCtx().measureText(lines[0]).width).toBeLessThanOrEqual(20);
  });
});
