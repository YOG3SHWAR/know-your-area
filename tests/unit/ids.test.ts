import { describe, expect, it } from "vitest";
import { generatePublicId } from "@/lib/ids";

describe("generatePublicId", () => {
  it("matches the KYA- + 7-char ambiguity-free-alphabet shape", () => {
    const id = generatePublicId();
    expect(id).toMatch(/^KYA-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/);
  });

  it("never contains ambiguous characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 1000; i++) {
      const id = generatePublicId();
      expect(id).not.toMatch(/[0O1IL]/);
    }
  });

  it("is unique across 10,000 generations", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(generatePublicId());
    }
    expect(ids.size).toBe(10_000);
  });
});
