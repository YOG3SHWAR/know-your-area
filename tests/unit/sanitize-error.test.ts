import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sanitizeError } from "@/lib/sanitize-error";

const FALLBACK = "Couldn't do the thing. Try again.";

describe("sanitizeError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns the fixed fallback for a plain Error, never the error's own message", () => {
    const err = new Error("raw driver failure detail");
    const result = sanitizeError(err, FALLBACK, "test context");

    expect(result).toBe(FALLBACK);
    expect(result).not.toContain("raw driver failure detail");
  });

  it("returns the fixed fallback for an Error with a .code, never the error's own message", () => {
    const err = new Error("raw coded failure detail") as Error & { code: string };
    err.code = "23505";
    const result = sanitizeError(err, FALLBACK, "test context");

    expect(result).toBe(FALLBACK);
    expect(result).not.toContain("raw coded failure detail");
  });

  it("returns the fixed fallback for a non-Error value, never any stringified detail", () => {
    const result = sanitizeError("a plain string throw", FALLBACK, "test context");

    expect(result).toBe(FALLBACK);
  });

  it("logs the context label plus name/message/code for an Error-with-code input", () => {
    const err = new Error("raw coded failure detail") as Error & { code: string };
    err.name = "SanitizeTestError";
    err.code = "23505";

    sanitizeError(err, FALLBACK, "test context");

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls
      .map((call: unknown[]) => call.map((arg: unknown) => String(arg)).join(" "))
      .join(" ");

    expect(loggedArgs).toContain("test context");
    expect(loggedArgs).toContain("SanitizeTestError");
    expect(loggedArgs).toContain("raw coded failure detail");
    expect(loggedArgs).toContain("23505");
  });

  it("logs the context label plus the stringified value for a non-Error input", () => {
    sanitizeError("a plain string throw", FALLBACK, "test context");

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls
      .map((call: unknown[]) => call.map((arg: unknown) => String(arg)).join(" "))
      .join(" ");

    expect(loggedArgs).toContain("test context");
    expect(loggedArgs).toContain("a plain string throw");
  });
});
